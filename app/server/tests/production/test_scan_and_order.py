import os
import time

import pytest

from collector_server.production.pieces import Piece, PiecesData
from collector_server.production.stage_api import StageError
from collector_server.production.stages.order_clips import STAGE as ORDER
from collector_server.production.stages.scan_folder import STAGE as SCAN
from tests.production.helpers import FakeWorker, make_clip, make_ctx, requires_ffmpeg

pytestmark = requires_ffmpeg


def scan(tmp_path, **settings):
    log = []
    ctx = make_ctx(tmp_path, log=log)
    data = SCAN.run(None, SCAN.settings_model(**settings), ctx)
    return data, log


def names(data):
    return [piece.clip.rsplit("/", 1)[-1] for piece in data.items]


@pytest.fixture
def folder(tmp_path):
    (tmp_path / "in" / "sub").mkdir(parents=True)
    return tmp_path / "in"


def test_scan_finds_clips_in_subfolders(tmp_path, folder):
    make_clip(folder / "a.mp4")
    make_clip(folder / "sub" / "b.mp4")
    data, _ = scan(tmp_path)
    assert names(data) == ["a.mp4", "b.mp4"]
    assert all(p.start == 0 and p.end is None and p.clip.startswith("/") for p in data.items)


def test_scan_name_filter_keeps_matching_names_and_empty_matches_all(tmp_path, folder):
    make_clip(folder / "coach_1.mp4")
    make_clip(folder / "other.mp4")
    data, _ = scan(tmp_path, name_contains="COACH")
    assert names(data) == ["coach_1.mp4"]
    data, _ = scan(tmp_path, name_contains="coach", name_mode="not_contains")
    assert names(data) == ["other.mp4"]
    data, _ = scan(tmp_path, name_contains="")
    assert names(data) == ["coach_1.mp4", "other.mp4"]


def test_scan_skips_a_second_clip_with_the_same_name(tmp_path, folder):
    make_clip(folder / "a.mp4")
    make_clip(folder / "sub" / "a.mp4")
    data, log = scan(tmp_path)
    assert len(data.items) == 1
    assert any("name already used" in line for line in log)


@pytest.mark.full
@pytest.mark.full
def test_scan_can_skip_subfolders(tmp_path, folder):
    make_clip(folder / "a.mp4")
    make_clip(folder / "sub" / "b.mp4")
    data, _ = scan(tmp_path, include_subfolders=False)
    assert names(data) == ["a.mp4"]


@pytest.mark.full
@pytest.mark.full
def test_scan_ignores_other_extensions_and_is_case_insensitive(tmp_path, folder):
    make_clip(folder / "a.mp4")
    make_clip(folder / "B.MOV")
    (folder / "notes.txt").write_text("hi")
    data, _ = scan(tmp_path)
    assert names(data) == ["B.MOV", "a.mp4"]


@pytest.mark.full
@pytest.mark.full
def test_scan_skips_clips_shorter_than_minimum_and_says_so(tmp_path, folder):
    make_clip(folder / "long.mp4", seconds=2)
    make_clip(folder / "short.mp4", seconds=0.5)
    data, log = scan(tmp_path, min_length=1.0)
    assert names(data) == ["long.mp4"]
    assert any("1 clip" in line and "short" in line for line in log)


@pytest.mark.full
@pytest.mark.full
def test_scan_skips_unreadable_clips_and_reports_them(tmp_path, folder):
    make_clip(folder / "good.mp4")
    (folder / "broken.mp4").write_bytes(b"not a video")
    data, log = scan(tmp_path)
    assert names(data) == ["good.mp4"]
    assert any("broken.mp4" in line for line in log)


@pytest.mark.full
@pytest.mark.full
def test_scan_empty_folder_fails_plainly(tmp_path, folder):
    with pytest.raises(StageError, match="^No clips found"):
        scan(tmp_path)


@pytest.mark.full
@pytest.mark.full
def test_scan_handles_odd_file_names(tmp_path, folder):
    make_clip(folder / "it's a \"clip\" é -x.mp4")
    data, _ = scan(tmp_path)
    assert len(data.items) == 1


def clips(*specs):
    return PiecesData(items=[Piece(clip=name, clip_duration=d) for name, d in specs])


def order(tmp_path, data, **settings):
    return ORDER.run(data, ORDER.settings_model(**settings), make_ctx(tmp_path))


@pytest.mark.full
@pytest.mark.full
def test_order_by_name(tmp_path):
    data = order(tmp_path, clips(("/x/b.mp4", 1), ("/x/a.mp4", 1)), order_by="name")
    assert [p.clip for p in data.items] == ["/x/a.mp4", "/x/b.mp4"]


@pytest.mark.full
@pytest.mark.full
def test_order_by_duration(tmp_path):
    data = order(tmp_path, clips(("/x/a.mp4", 5), ("/x/b.mp4", 2)), order_by="duration")
    assert [p.clip for p in data.items] == ["/x/b.mp4", "/x/a.mp4"]


@pytest.mark.full
@pytest.mark.full
def test_order_by_capture_time_uses_tag(tmp_path):
    a = make_clip(tmp_path / "a.mp4", creation_time="2026-11-10T09:00:00Z")
    b = make_clip(tmp_path / "b.mp4", creation_time="2026-11-10T07:00:00Z")
    data = order(tmp_path, clips((a, 2), (b, 2)))
    assert [p.clip for p in data.items] == [b, a]


@pytest.mark.full
@pytest.mark.full
def test_order_capture_time_falls_back_to_file_time(tmp_path):
    a = make_clip(tmp_path / "a.mp4")
    b = make_clip(tmp_path / "b.mp4")
    os.utime(a, (2000, 2000))
    os.utime(b, (1000, 1000))
    data = order(tmp_path, clips((a, 2), (b, 2)))
    assert [p.clip for p in data.items] == [b, a]


@pytest.mark.full
def test_order_fallback_name_ignores_file_times_when_no_capture_time(tmp_path):
    a = make_clip(tmp_path / "a.mp4")
    b = make_clip(tmp_path / "b.mp4")
    os.utime(a, (2000, 2000))
    os.utime(b, (1000, 1000))
    data = order(tmp_path, clips((a, 2), (b, 2)), fallback="name")
    assert [p.clip for p in data.items] == [a, b]


@pytest.mark.full
@pytest.mark.full
def test_order_newest_first(tmp_path):
    data = order(tmp_path, clips(("/x/a.mp4", 1), ("/x/b.mp4", 1)), order_by="name", direction="newest_first")
    assert [p.clip for p in data.items] == ["/x/b.mp4", "/x/a.mp4"]


@pytest.mark.full
@pytest.mark.full
def test_order_random_same_seed_same_order(tmp_path):
    data = clips(*[(f"/x/{n:02d}.mp4", 1) for n in range(12)])
    first = order(tmp_path, data, order_by="random", seed=7)
    again = order(tmp_path, data, order_by="random", seed=7)
    assert [p.clip for p in first.items] == [p.clip for p in again.items]


@pytest.mark.full
@pytest.mark.full
def test_order_random_different_seed_differs(tmp_path):
    data = clips(*[(f"/x/{n:02d}.mp4", 1) for n in range(12)])
    one = order(tmp_path, data, order_by="random", seed=1)
    two = order(tmp_path, data, order_by="random", seed=2)
    assert [p.clip for p in one.items] != [p.clip for p in two.items]


@pytest.mark.full
@pytest.mark.full
def test_scan_missing_folder_fails_plainly(tmp_path):
    with pytest.raises(StageError, match="does not exist"):
        scan(tmp_path)


@pytest.mark.full
@pytest.mark.full
def test_order_by_created_follows_file_creation(tmp_path):
    first = make_clip(tmp_path / "z_first.mp4")
    time.sleep(0.05)
    second = make_clip(tmp_path / "a_second.mp4")
    data = order(tmp_path, clips((second, 2), (first, 2)), order_by="created")
    assert [p.clip for p in data.items] == [first, second]


@pytest.mark.full
@pytest.mark.full
def test_both_stages_pass_registry_shape_checks():
    from collector_server.production.registry import StageRegistry

    registry = StageRegistry()
    registry.register(SCAN)
    registry.register(ORDER)


@pytest.mark.full
@pytest.mark.full
def test_scan_reports_a_missing_ffmpeg_instead_of_no_clips(tmp_path, folder):
    (folder / "a.mp4").write_bytes(b"x")
    ctx = make_ctx(tmp_path, worker=FakeWorker(error=FileNotFoundError()))
    with pytest.raises(StageError, match="FFmpeg is not installed"):
        SCAN.run(None, SCAN.settings_model(), ctx)


@pytest.mark.full
@pytest.mark.full
def test_scan_says_why_a_clip_could_not_be_read(tmp_path, folder):
    make_clip(folder / "good.mp4")
    (folder / "broken.mp4").write_bytes(b"not a video")
    _, log = scan(tmp_path)
    assert any("broken.mp4" in line and "Invalid data" in line for line in log)


@pytest.mark.full
@pytest.mark.full
def test_scan_ignores_hidden_files_and_folders_quietly(tmp_path, folder):
    make_clip(folder / "real.mp4")
    (folder / "._real.mp4").write_bytes(b"apple double")
    (folder / ".hidden").mkdir()
    make_clip(folder / ".hidden" / "b.mp4")
    data, log = scan(tmp_path)
    assert names(data) == ["real.mp4"]
    assert not any("Skipped" in line for line in log)


@pytest.mark.full
@pytest.mark.full
def test_scan_follows_file_links_but_not_folder_links(tmp_path, folder):
    real = make_clip(tmp_path / "elsewhere.mp4")
    os.symlink(real, folder / "linked.mp4")
    (tmp_path / "other").mkdir()
    make_clip(tmp_path / "other" / "inside.mp4")
    os.symlink(tmp_path / "other", folder / "linked_dir")
    data, _ = scan(tmp_path)
    assert names(data) == ["linked.mp4"]


@pytest.mark.full
@pytest.mark.full
def test_scan_logs_a_folder_it_cannot_open(tmp_path, folder):
    make_clip(folder / "a.mp4")
    locked = folder / "locked"
    locked.mkdir()
    locked.chmod(0)
    try:
        data, log = scan(tmp_path)
    finally:
        locked.chmod(0o755)
    assert names(data) == ["a.mp4"]
    assert any("locked" in line for line in log)


@pytest.mark.full
@pytest.mark.full
def test_scan_shortens_the_list_of_skipped_clips(tmp_path, folder):
    make_clip(folder / "ok.mp4", seconds=2)
    for n in range(8):
        make_clip(folder / f"s{n}.mp4", seconds=0.3)
    _, log = scan(tmp_path)
    line = next(line for line in log if "shorter than" in line)
    assert "and 3 more" in line


@pytest.mark.full
@pytest.mark.full
def test_scan_rejects_a_negative_minimum_length():
    with pytest.raises(ValueError):
        SCAN.settings_model(min_length=-1)


@pytest.mark.full
@pytest.mark.full
def test_order_by_name_uses_file_name_ignoring_case_and_folders(tmp_path):
    data = order(tmp_path, clips(("/x/sub/b.mp4", 1), ("/x/Z.mp4", 1), ("/x/a.mp4", 1)), order_by="name")
    assert [os.path.basename(p.clip) for p in data.items] == ["a.mp4", "b.mp4", "Z.mp4"]


@pytest.mark.full
@pytest.mark.full
def test_equal_clips_keep_path_order_in_both_directions(tmp_path):
    data = clips(("/x/c.mp4", 5), ("/x/a.mp4", 5), ("/x/b.mp4", 5))
    oldest = order(tmp_path, data, order_by="duration")
    newest = order(tmp_path, data, order_by="duration", direction="newest_first")
    assert [p.clip for p in oldest.items] == ["/x/a.mp4", "/x/b.mp4", "/x/c.mp4"]
    assert [p.clip for p in newest.items] == ["/x/a.mp4", "/x/b.mp4", "/x/c.mp4"]


@pytest.mark.full
@pytest.mark.full
def test_order_reports_a_clip_that_vanished(tmp_path):
    with pytest.raises(StageError, match="no longer there"):
        order(tmp_path, clips(("/gone/a.mp4", 1)))


@pytest.mark.full
@pytest.mark.full
@pytest.mark.parametrize("extensions", [["mp4"] * 21, ["../x"], ["mp4\n"], [""], ["*"], ["a" * 20]])
def test_scan_rejects_odd_extension_lists(extensions):
    with pytest.raises(ValueError):
        SCAN.settings_model(extensions=extensions)


@pytest.mark.full
@pytest.mark.full
def test_scan_accepts_ordinary_extensions():
    assert SCAN.settings_model(extensions=["mp4", ".MOV", "m4v", "mkv"]).extensions[1] == ".MOV"


@pytest.mark.full
@pytest.mark.full
def test_scan_refuses_a_folder_with_far_too_many_files(tmp_path, folder):
    for n in range(5):
        (folder / f"f{n}.txt").write_text("x")
    with pytest.raises(StageError, match="more than 3 files"):
        scan(tmp_path, max_files=3)


@pytest.mark.full
@pytest.mark.full
def test_scan_file_limit_has_bounds():
    for bad in (0, 100_001):
        with pytest.raises(ValueError):
            SCAN.settings_model(max_files=bad)


def test_newest_first_keeps_clips_without_capture_time_after_the_dated_ones(tmp_path):
    early = make_clip(tmp_path / "early.mp4", creation_time="2026-11-10T07:00:00Z")
    late = make_clip(tmp_path / "late.mp4", creation_time="2026-11-10T09:00:00Z")
    undated = make_clip(tmp_path / "undated.mp4")
    data = order(tmp_path, clips((early, 2), (late, 2), (undated, 2)), direction="newest_first", fallback="name")
    assert [os.path.basename(p.clip) for p in data.items] == ["late.mp4", "early.mp4", "undated.mp4"]
