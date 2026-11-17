import os
import time

import pytest

import collector_server.production.folder_scan as folder_scan
from collector_server.production.errors import InvalidInputError
from collector_server.production.folder_scan import scan_parent
from collector_server.production.pattern import compile_pattern

DATE = compile_pattern(r"^\d{4}-\d{2}-\d{2}_.+$")


def touch(path, data=b"x", when=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    if when is not None:
        os.utime(path, (when, when))
    return path


def test_matches_only_folders_that_fully_match(tmp_path):
    touch(tmp_path / "2026-11-07_Sat_coach" / "a.mp4")
    touch(tmp_path / "notes" / "a.mp4")
    touch(tmp_path / "x2026-11-07_Sat" / "a.mp4")
    result = scan_parent(str(tmp_path), DATE)
    assert [c.name for c in result.matches] == ["2026-11-07_Sat_coach"]
    assert result.not_matching == 2


def test_candidate_path_is_under_the_parent(tmp_path):
    touch(tmp_path / "2026-11-07_Sat_coach" / "a.mp4")
    [c] = scan_parent(str(tmp_path), DATE).matches
    assert c.path == str(tmp_path / "2026-11-07_Sat_coach")


def test_counts_clips_anywhere_inside_and_ignores_other_files(tmp_path):
    base = tmp_path / "2026-11-07_x"
    touch(base / "a.mp4")
    touch(base / "sub" / "b.MOV")
    touch(base / "notes.txt")
    touch(base / "c.mkv")
    [c] = scan_parent(str(tmp_path), DATE).matches
    assert c.clip_count == 2


def test_sorted_by_name(tmp_path):
    for name in ("2026-11-09_b", "2026-11-07_a", "2026-11-08_c"):
        touch(tmp_path / name / "a.mp4")
    assert [c.name for c in scan_parent(str(tmp_path), DATE).matches] == ["2026-11-07_a", "2026-11-08_c", "2026-11-09_b"]


def test_files_in_the_parent_are_ignored(tmp_path):
    touch(tmp_path / "2026-11-07_file.mp4")
    result = scan_parent(str(tmp_path), DATE)
    assert result.matches == [] and result.not_matching == 0


def test_hidden_and_symlinked_out_folders_are_skipped(tmp_path):
    parent = tmp_path / "parent"
    touch(parent / ".2026-11-07_hidden" / "a.mp4")
    outside = tmp_path / "outside" / "2026-11-07_elsewhere"
    touch(outside / "a.mp4")
    os.symlink(outside, parent / "2026-11-07_link")
    touch(parent / "2026-11-08_real" / "a.mp4")
    assert [c.name for c in scan_parent(str(parent), DATE).matches] == ["2026-11-08_real"]


def test_a_link_to_a_folder_inside_the_parent_is_allowed_to_resolve_but_files_outside_are_not_counted(tmp_path):
    base = tmp_path / "2026-11-07_x"
    touch(base / "a.mp4")
    secret = tmp_path.parent / f"{tmp_path.name}_secret.mp4"
    secret.write_bytes(b"x")
    os.symlink(secret, base / "link.mp4")
    [c] = scan_parent(str(tmp_path), DATE).matches
    assert c.clip_count == 1


def test_newest_change_is_the_latest_modification_inside(tmp_path):
    base = tmp_path / "2026-11-07_x"
    touch(base / "a.mp4", when=1_000_000)
    touch(base / "sub" / "b.mp4", when=2_000_000)
    [c] = scan_parent(str(tmp_path), DATE).matches
    assert c.newest_change >= 2_000_000


def test_empty_folder_has_zero_clips(tmp_path):
    (tmp_path / "2026-11-07_empty").mkdir()
    [c] = scan_parent(str(tmp_path), DATE).matches
    assert c.clip_count == 0 and c.newest_change is not None


def test_odd_names_work(tmp_path):
    pattern = compile_pattern(r"(?s)^.+$")
    for name in ("two words", "ünïcode", "-starts-with-dash", "line\nbreak"):
        touch(tmp_path / name / "a.mp4")
    names = {c.name for c in scan_parent(str(tmp_path), pattern).matches}
    assert names == {"two words", "ünïcode", "-starts-with-dash", "line\nbreak"}


def test_missing_parent_is_a_plain_error(tmp_path):
    with pytest.raises(InvalidInputError, match="does not exist"):
        scan_parent(str(tmp_path / "nope"), DATE)
    (tmp_path / "file").write_text("x")
    with pytest.raises(InvalidInputError, match="does not exist"):
        scan_parent(str(tmp_path / "file"), DATE)


def test_caps_hold(tmp_path, monkeypatch):
    monkeypatch.setattr(folder_scan, "MAX_FOLDERS", 5)
    monkeypatch.setattr(folder_scan, "MAX_FILES", 3)
    for n in range(8):
        touch(tmp_path / f"2026-11-0{n}_x" / "a.mp4")
    result = scan_parent(str(tmp_path), DATE)
    assert len(result.matches) == 5
    other = tmp_path / "other"
    big = other / "2026-12-01_big"
    for n in range(10):
        touch(big / f"{n}.mp4")
    result = scan_parent(str(other), compile_pattern(r"^2026-12-01_big$"))
    assert result.matches[0].clip_count == 3


def test_a_big_folder_scans_quickly(tmp_path):
    base = tmp_path / "2026-11-07_x"
    for n in range(300):
        touch(base / f"{n}.mp4")
    started = time.monotonic()
    scan_parent(str(tmp_path), DATE)
    assert time.monotonic() - started < 2


def test_an_unreadable_folder_is_reported_incomplete_not_empty(tmp_path):
    base = tmp_path / "2026-11-07_locked"
    touch(base / "sub" / "a.mp4")
    (base / "sub").chmod(0)
    try:
        [c] = scan_parent(str(tmp_path), DATE).matches
    finally:
        (base / "sub").chmod(0o755)
    assert c.incomplete is True


def test_a_folder_that_hit_the_file_cap_is_reported_incomplete(tmp_path, monkeypatch):
    monkeypatch.setattr(folder_scan, "MAX_FILES", 3)
    for n in range(10):
        touch(tmp_path / "2026-11-07_big" / f"{n}.mp4")
    [c] = scan_parent(str(tmp_path), DATE).matches
    assert c.incomplete is True and c.clip_count == 3


def test_a_normal_folder_is_complete(tmp_path):
    touch(tmp_path / "2026-11-07_ok" / "a.mp4")
    assert scan_parent(str(tmp_path), DATE).matches[0].incomplete is False


def test_two_links_to_the_same_folder_give_one_candidate(tmp_path):
    touch(tmp_path / "2026-11-07_a" / "a.mp4")
    os.symlink(tmp_path / "2026-11-07_a", tmp_path / "2026-11-08_link")
    assert [c.name for c in scan_parent(str(tmp_path), DATE).matches] == ["2026-11-07_a"]


def test_names_that_cannot_be_stored_are_skipped(tmp_path, monkeypatch):
    real = os.listdir
    monkeypatch.setattr(os, "listdir", lambda p: [*real(p), "2026-11-09_bad\udcff"])
    touch(tmp_path / "2026-11-07_ok" / "a.mp4")
    assert [c.name for c in scan_parent(str(tmp_path), DATE).matches] == ["2026-11-07_ok"]


def test_accents_match_in_either_unicode_form(tmp_path):
    import unicodedata

    touch(tmp_path / unicodedata.normalize("NFD", "2026-11-07_café") / "a.mp4")
    [c] = scan_parent(str(tmp_path), compile_pattern("^2026-11-07_café$")).matches
    assert c.name == "2026-11-07_café"


def test_a_dangling_link_is_not_a_clip(tmp_path):
    base = tmp_path / "2026-11-07_x"
    touch(base / "a.mp4")
    os.symlink(base / "missing.mp4", base / "dangling.mp4")
    assert scan_parent(str(tmp_path), DATE).matches[0].clip_count == 1


def test_the_top_of_the_disk_as_parent_does_not_crash():
    scan_parent("/", compile_pattern("^zzz-never$"))


def test_a_link_to_the_parent_itself_is_not_a_candidate(tmp_path):
    touch(tmp_path / "2026-11-07_a" / "a.mp4")
    os.symlink(tmp_path, tmp_path / "2026-11-08_loop")
    assert [c.name for c in scan_parent(str(tmp_path), DATE).matches] == ["2026-11-07_a"]


def test_a_total_entry_budget_stops_the_scan_and_says_so(tmp_path, monkeypatch):
    monkeypatch.setattr(folder_scan, "MAX_TOTAL_ENTRIES", 5)
    for n in range(4):
        for m in range(3):
            touch(tmp_path / f"2026-11-0{n}_x" / f"{m}.mp4")
    result = scan_parent(str(tmp_path), DATE)
    assert result.truncated is True
    assert any(c.incomplete for c in result.matches)
    assert [c.name for c in result.matches] == sorted(c.name for c in result.matches)


def test_a_time_budget_stops_the_scan_and_says_so(tmp_path, monkeypatch):
    monkeypatch.setattr(folder_scan, "MAX_SECONDS", 0)
    for n in range(3):
        touch(tmp_path / f"2026-11-0{n}_x" / "a.mp4")
    result = scan_parent(str(tmp_path), DATE)
    assert result.truncated is True and all(c.incomplete for c in result.matches)


def test_within_the_budget_nothing_is_marked(tmp_path):
    touch(tmp_path / "2026-11-07_a" / "a.mp4")
    result = scan_parent(str(tmp_path), DATE)
    assert result.truncated is False and result.matches[0].incomplete is False
