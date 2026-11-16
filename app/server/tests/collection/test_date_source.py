import os
from datetime import datetime

import pytest

from collector_server.collection.date_source import DateRule, compile_pattern, read_times
from tests.conftest import LONDON
from tests.helpers import make_clip

MTIME = datetime(2026, 1, 2, 3, 4, tzinfo=LONDON)


def test_modified_time_is_read_in_the_local_zone(tmp_path):
    clip = make_clip(tmp_path / "a.mp4", MTIME)
    times = read_times(str(clip), LONDON)
    assert times.modified == MTIME and times.modified.tzinfo == LONDON


def test_created_time_comes_from_the_file_birth_time_when_available(tmp_path):
    clip = make_clip(tmp_path / "a.mp4", MTIME)
    stat = os.stat(clip)
    expected = getattr(stat, "st_birthtime", stat.st_mtime)
    assert read_times(str(clip), LONDON).created.timestamp() == pytest.approx(expected)


def test_rule_picks_the_chosen_source(tmp_path):
    clip = make_clip(tmp_path / "a.mp4", MTIME)
    times = read_times(str(clip), LONDON)
    assert DateRule("modified").pick("a.mp4", times) == times.modified
    assert DateRule("created").pick("a.mp4", times) == times.created


def test_filename_source_reads_the_date_from_the_name(tmp_path):
    clip = make_clip(tmp_path / "GX_20261114_184000.mp4", MTIME)
    rule = DateRule("filename", "GX_YYYYMMDD_HHmmss")
    assert rule.pick("GX_20261114_184000.mp4", read_times(str(clip), LONDON)) == datetime(2026, 11, 14, 18, 40, tzinfo=LONDON)


def test_filename_source_without_a_match_gives_no_date(tmp_path):
    clip = make_clip(tmp_path / "holiday.mp4", MTIME)
    assert DateRule("filename", "GX_YYYYMMDD").pick("holiday.mp4", read_times(str(clip), LONDON)) is None


def test_filename_source_with_an_impossible_date_gives_no_date(tmp_path):
    clip = make_clip(tmp_path / "GX_20261399.mp4", MTIME)
    assert DateRule("filename", "GX_YYYYMMDD").pick("GX_20261399.mp4", read_times(str(clip), LONDON)) is None


def test_pattern_must_have_year_month_and_day_and_unique_tokens():
    assert compile_pattern("clip-YYYY-MM-DD").search("clip-2026-11-14")
    with pytest.raises(ValueError, match="YYYY, MM and DD"):
        compile_pattern("GX_YYYY")
    with pytest.raises(ValueError, match="only once"):
        compile_pattern("YYYY_MM_DD_YYYY")


@pytest.mark.parametrize("source", ["metadata", "mtime", ""])
def test_unknown_sources_are_rejected(source):
    with pytest.raises(ValueError, match="modified, created or filename"):
        DateRule(source)
