import pytest

from collector_server.production.models import DEFAULT_FOLDER_TEMPLATE, Batch
from collector_server.production.output_paths import OutputFolderError, check_folder_template, folder_name, output_paths


def batch(name, id=7):
    return Batch(id=id, name=name, input_folder="/in", steps=[], output_root="/out", created_at="x")


@pytest.mark.full
@pytest.mark.full
@pytest.mark.parametrize(
    "name, expected",
    [("Coach Saturdays", "Coach-Saturdays-7"), ("../../evil", "evil-7"), ("", "batch-7"), ("..", "batch-7"), ("日本語", "batch-7"), ("x" * 90, "x" * 40 + "-7")],
)
def test_folder_name_is_safe_and_ends_with_the_id(name, expected):
    assert folder_name(batch(name)) == expected


@pytest.mark.full
@pytest.mark.full
def test_output_and_work_folders():
    out, work = output_paths(batch("Coach Saturdays"), pass_id=12, number=3)
    assert out == "/out/Coach-Saturdays-7/pass-3"
    assert work == "/out/.work/12"


from collector_server.production.output_paths import MARKER, OutputFolderError, check_root, claim_root, remove_inside


@pytest.mark.full
@pytest.mark.full
def test_a_new_folder_is_claimed_and_marked(tmp_path):
    claim_root(str(tmp_path / "out"))
    assert (tmp_path / "out" / MARKER).exists()
    claim_root(str(tmp_path / "out"))  # claiming again is fine


@pytest.mark.full
@pytest.mark.full
def test_an_empty_existing_folder_is_usable(tmp_path):
    (tmp_path / "empty").mkdir()
    claim_root(str(tmp_path / "empty"))


def _foreign(tmp_path):
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "precious.txt").write_text("x")
    return str(tmp_path / "docs")


def _inside_file(tmp_path):
    return _file(tmp_path) + "/deeper"


def _file(tmp_path):
    (tmp_path / "f").write_text("x")
    return str(tmp_path / "f")


def test_unsafe_folders_are_refused(tmp_path):
    for make in [_foreign, _file, _inside_file, lambda tmp: "out", lambda tmp: "/"]:  # foreign files, a file, inside a file, relative, top of disk
        with pytest.raises(OutputFolderError):
            check_root(make(tmp_path))


@pytest.mark.full
@pytest.mark.full
def test_new_folders_can_be_nested_to_any_depth(tmp_path):
    deep = tmp_path / "no" / "such" / "deeper"
    claim_root(str(deep))
    assert (deep / MARKER).exists()


@pytest.mark.full
@pytest.mark.full
def test_a_folder_we_made_stays_usable_even_when_full(tmp_path):
    claim_root(str(tmp_path / "out"))
    (tmp_path / "out" / "x-1").mkdir()
    check_root(str(tmp_path / "out"))


@pytest.mark.full
def test_remove_inside_deletes_only_inside_a_marked_root(tmp_path):
    root = tmp_path / "out"
    claim_root(str(root))
    mine = root / "x-1" / "pass-1"
    mine.mkdir(parents=True)
    (mine / "a.mp4").write_text("x")
    remove_inside(str(root), str(mine))
    assert not mine.exists()


@pytest.mark.full
@pytest.mark.full
def test_remove_inside_refuses_unmarked_roots_outsiders_and_links(tmp_path):
    unmarked = tmp_path / "plain"
    (unmarked / "x-1").mkdir(parents=True)
    remove_inside(str(unmarked), str(unmarked / "x-1"))
    assert (unmarked / "x-1").exists()

    root, outside = tmp_path / "out", tmp_path / "victim"
    claim_root(str(root))
    outside.mkdir()
    (outside / "keep.txt").write_text("x")
    remove_inside(str(root), str(outside))
    assert (outside / "keep.txt").exists()
    (root / "link").symlink_to(outside)
    remove_inside(str(root), str(root / "link"))
    assert (outside / "keep.txt").exists()
    remove_inside(str(root), str(root / ".." / "victim"))
    assert (outside / "keep.txt").exists()


def batch_with(template, name="Coach Saturdays", id=7, created_at="2026-11-20T18:12:12+00:00"):
    return Batch(id=id, name=name, input_folder="/in", steps=[], output_root="/out", created_at=created_at, folder_template=template)


@pytest.mark.parametrize(
    "template, expected",
    [
        ("{{name}}-{{id}}", "Coach-Saturdays-7"),
        ("{{ name }}_{{id}}", "Coach-Saturdays_7"),
        ("{{date}}-{{id}}", "2026-11-20-7"),
        ("class-{{id}}", "class-7"),
        ("{{name}}/{{id}}", None),  # slashes are not allowed in a folder name
    ],
)
def test_templates_render_their_tags(template, expected):
    if expected is None:
        with pytest.raises(OutputFolderError):
            check_folder_template(template)
        return
    check_folder_template(template)
    assert folder_name(batch_with(template)) == expected


@pytest.mark.parametrize(
    "template",
    ["", "{{name}}", "{{nope}}-{{id}}", "{{id}}{", "{{name}} {{id}}", "x" * 101],
)
def test_bad_templates_are_refused(template):
    with pytest.raises(OutputFolderError):
        check_folder_template(template)


def test_the_default_template_gives_the_old_folder_names():
    assert folder_name(batch_with(DEFAULT_FOLDER_TEMPLATE, name="../../evil", id=7)) == "evil-7"
    assert folder_name(batch_with(DEFAULT_FOLDER_TEMPLATE, name="", id=7)) == "batch-7"
    assert folder_name(batch_with(DEFAULT_FOLDER_TEMPLATE, name="x" * 90, id=7)) == "x" * 40 + "-7"
