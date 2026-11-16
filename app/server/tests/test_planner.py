from datetime import datetime

import pytest

from collector_server.planner import TransferPlanner
from tests.conftest import LONDON
from tests.helpers import config_for, make_clip

SAT_14 = datetime(2026, 11, 14, 18, 40, tzinfo=LONDON)
SAT_07 = datetime(2026, 11, 7, 10, 0, tzinfo=LONDON)


@pytest.fixture
def dirs(tmp_path):
    source, output = tmp_path / "in", tmp_path / "out"
    source.mkdir()
    output.mkdir()
    return source, output


def plan_for(collectors, clock, source, output, **overrides):
    record = collectors.add_with_config(config_for(source, output, **overrides))
    return TransferPlanner(clock).plan(record)


def test_groups_clips_by_day_with_the_template(collectors, clock, dirs):
    source, output = dirs
    make_clip(source / "b.mp4", SAT_14)
    make_clip(source / "a.mp4", SAT_14)
    make_clip(source / "c.mov", SAT_07)
    plan = plan_for(collectors, clock, source, output)
    assert [g.folder for g in plan.groups] == ["2026-11-07_Sat_coach", "2026-11-14_Sat_coach"]
    assert [f.name for f in plan.groups[1].files] == ["a.mp4", "b.mp4"]
    assert plan.groups[1].files[0].destination == str(output / "2026-11-14_Sat_coach" / "a.mp4")
    assert (plan.total_files, plan.folder_count) == (3, 2)
    assert "modified time" in plan.notes[-1]


def test_collects_non_video_files_but_ignores_hidden_and_output_folder_files(collectors, clock, dirs):
    source, output = dirs
    inner_out = source / "collected"
    inner_out.mkdir()
    make_clip(source / "keep.MP4", SAT_14)
    make_clip(source / "notes.txt", SAT_14)
    make_clip(source / ".hidden.mp4", SAT_14)
    make_clip(source / ".cache" / "x.mp4", SAT_14)
    make_clip(inner_out / "already.mp4", SAT_14)
    plan = plan_for(collectors, clock, source, inner_out)
    assert sorted(f.name for g in plan.groups for f in g.files) == ["keep.MP4", "notes.txt"]


def test_scans_subfolders_and_renames_duplicate_names(collectors, clock, dirs):
    source, output = dirs
    make_clip(source / "one" / "GX01.mp4", SAT_14)
    make_clip(source / "two" / "GX01.mp4", SAT_14)
    plan = plan_for(collectors, clock, source, output)
    assert sorted(f.name for f in plan.groups[0].files) == ["GX01-2.mp4", "GX01.mp4"]


def test_existing_folders_get_a_numbered_suffix(collectors, clock, dirs):
    source, output = dirs
    make_clip(source / "a.mp4", SAT_14)
    (output / "2026-11-14_Sat_coach").mkdir()
    plan = plan_for(collectors, clock, source, output)
    assert plan.groups[0].folder == "2026-11-14_Sat_coach-2"
    assert plan.groups[0].renamed is True
    assert "already exists" in plan.notes[0]
    (output / "2026-11-14_Sat_coach-2").mkdir()
    assert plan_for(collectors, clock, source, output).groups[0].folder == "2026-11-14_Sat_coach-3"


def test_week_month_and_none_grouping(collectors, clock, dirs):
    source, output = dirs
    make_clip(source / "a.mp4", datetime(2026, 11, 12, 9, 0, tzinfo=LONDON))
    make_clip(source / "b.mp4", datetime(2026, 11, 14, 9, 0, tzinfo=LONDON))
    week = plan_for(collectors, clock, source, output, group_by="week", folder_template="{date}")
    assert [g.folder for g in week.groups] == ["2026-11-09"]
    month = plan_for(collectors, clock, source, output, group_by="month", folder_template="{date:YYYY-MM}")
    assert [g.folder for g in month.groups] == ["2026-11"]
    none = plan_for(collectors, clock, source, output, group_by="none", folder_template="all_{date}")
    assert [g.folder for g in none.groups] == ["all_2026-11-16"]


def test_empty_source_has_a_note(collectors, clock, dirs):
    source, output = dirs
    plan = plan_for(collectors, clock, source, output)
    assert plan.total_files == 0
    assert plan.notes == ["No files found in the input folder."]


@pytest.mark.parametrize(
    "overrides,error,message",
    [
        ({"source_type": "ssh", "host": "nas"}, ValueError, "SSH"),
        ({"output_folder": ""}, ValueError, "Output folder"),
        ({"folder_template": "{window:name}"}, ValueError, "window"),
        ({"folder_template": "{suffix}", "suffix": ""}, ValueError, "empty name"),
    ],
)
def test_unsupported_or_invalid_configs_raise(collectors, clock, dirs, overrides, error, message):
    source, output = dirs
    make_clip(source / "a.mp4", SAT_14)
    config = config_for(source, output, **overrides)
    record = collectors.add_with_config(config)
    with pytest.raises(error, match=message):
        TransferPlanner(clock).plan(record)


def test_missing_input_folder_raises(collectors, clock, tmp_path):
    record = collectors.add_with_config(config_for(tmp_path / "missing", tmp_path / "out"))
    with pytest.raises(FileNotFoundError, match="Input folder not found"):
        TransferPlanner(clock).plan(record)
