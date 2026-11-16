from datetime import datetime, timezone

import pytest

from collector_server.collection.models import FilterGroup, FilterRule, RandomSelection
from collector_server.collection.planner import TransferPlanner
from tests.conftest import LONDON
from tests.helpers import config_for, make_clip, make_mp4

SAT = datetime(2026, 11, 14, 9, 30, tzinfo=LONDON)
MON = datetime(2026, 11, 16, 18, 0, tzinfo=LONDON)


@pytest.fixture
def dirs(tmp_path):
    source, output = tmp_path / "in", tmp_path / "out"
    source.mkdir()
    output.mkdir()
    return source, output


def plan_for(collectors, clock, dirs, **overrides):
    record = collectors.add_with_config(config_for(*dirs, **overrides))
    return TransferPlanner(clock).plan(record)


def group(*rules: FilterRule) -> FilterGroup:
    return FilterGroup(rules=list(rules))


def names(plan):
    return sorted(f.name for g in plan.groups for f in g.files)


def test_filters_decide_what_is_collected_and_what_stays(collectors, clock, dirs):
    source, _ = dirs
    make_clip(source / "GX01.mp4", SAT)
    make_clip(source / "GX02.mp4", MON)
    make_clip(source / "proxy_GX03.mp4", SAT)
    filters = [group(FilterRule(kind="weekday", days=[6]), FilterRule(kind="name", value="proxy", exclude=True))]
    plan = plan_for(collectors, clock, dirs, filters=filters)
    assert names(plan) == ["GX01.mp4"]
    assert sorted(plan.unmatched) == ["GX02.mp4", "proxy_GX03.mp4"]
    assert plan.left_in_place == 2


def test_or_between_groups_and_unmatched_listing_with_relative_paths(collectors, clock, dirs):
    source, _ = dirs
    make_clip(source / "a" / "keep.mp4", MON)
    make_clip(source / "b" / "sat.mp4", SAT)
    make_clip(source / "b" / "drop.mp4", MON)
    filters = [group(FilterRule(kind="weekday", days=[6])), group(FilterRule(kind="name", value="keep"))]
    plan = plan_for(collectors, clock, dirs, filters=filters)
    assert names(plan) == ["keep.mp4", "sat.mp4"]
    assert plan.unmatched == ["b/drop.mp4"]


def test_no_match_gets_its_own_note(collectors, clock, dirs):
    source, _ = dirs
    make_clip(source / "a.mp4", MON)
    plan = plan_for(collectors, clock, dirs, filters=[group(FilterRule(kind="name", value="zzz"))])
    assert plan.total_files == 0 and "No clips matched the filters." in plan.notes


def sample(**overrides):
    return FilterRule(kind="random", random=RandomSelection(**{"enabled": True, "mode": "count", "value": 3, "scope": "overall", "seed": 5, **overrides}))


def test_random_rule_is_seeded_and_lists_the_rest(collectors, clock, dirs):
    source, _ = dirs
    for i in range(10):
        make_clip(source / f"c{i}.mp4", SAT)
    first = plan_for(collectors, clock, dirs, filters=[group(sample())])
    second = plan_for(collectors, clock, dirs, filters=[group(sample())])
    assert len(names(first)) == 3 and names(first) == names(second)
    assert len(first.not_selected) == 7 and not first.unmatched
    other = plan_for(collectors, clock, dirs, filters=[group(sample(seed=6))])
    assert names(other) != names(first)


def test_random_rule_per_folder_picks_in_every_folder(collectors, clock, dirs):
    source, _ = dirs
    for i in range(6):
        make_clip(source / f"sat{i}.mp4", SAT)
        make_clip(source / f"mon{i}.mp4", MON)
    plan = plan_for(collectors, clock, dirs, filters=[group(sample(value=2, scope="folder", seed=1))])
    assert [g.count for g in plan.groups] == [2, 2] and len(plan.not_selected) == 8


def test_random_rule_samples_only_what_the_rules_before_it_matched(collectors, clock, dirs):
    source, _ = dirs
    for i in range(5):
        make_clip(source / f"keep{i}.mp4", SAT)
        make_clip(source / f"skip{i}.mp4", SAT)
    plan = plan_for(collectors, clock, dirs, filters=[group(FilterRule(kind="name", value="keep"), sample(value=2, seed=3))])
    assert len(names(plan)) == 2 and all(n.startswith("keep") for n in names(plan))
    assert len(plan.unmatched) == 5 and len(plan.not_selected) == 3


def test_date_source_filename_changes_grouping_and_filter_dates(collectors, clock, dirs):
    source, _ = dirs
    make_clip(source / "GX_20261101_100000.mp4", SAT)
    plan = plan_for(collectors, clock, dirs, date_source="filename", filename_pattern="GX_YYYYMMDD_HHmmss")
    assert plan.groups[0].folder == "2026-11-01_Sun_coach"
    assert plan.notes[-1] == "Folder dates come from filename for 1."


def test_unreadable_filenames_fall_back_to_modified_time_and_are_reported(collectors, clock, dirs):
    source, _ = dirs
    make_clip(source / "GX_20261107_120000.mp4", SAT)
    make_clip(source / "holiday.mp4", SAT)
    plan = plan_for(collectors, clock, dirs, date_source="filename", filename_pattern="GX_YYYYMMDD_HHmmss")
    assert [g.folder for g in plan.groups] == ["2026-11-07_Sat_coach", "2026-11-14_Sat_coach"]
    assert plan.notes[-1] == "Folder dates come from filename for 1, modified time for 1 with no readable date."


def test_invalid_filter_configuration_is_rejected_before_scanning(collectors, clock, dirs):
    record = collectors.add_with_config(config_for(*dirs, filters=[group(FilterRule(kind="regex", value="("))]))
    with pytest.raises(ValueError, match="Invalid regex"):
        TransferPlanner(clock).plan(record)
