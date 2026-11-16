from datetime import datetime

import pytest

from collector_server.date_source import ClipTimes
from collector_server.filter_engine import ClipFacts, FilterEngine
from collector_server.models import FilterGroup, FilterRule, RandomSelection
from tests.conftest import LONDON

SAT_0930 = datetime(2026, 11, 14, 9, 30, tzinfo=LONDON)
MON_1800 = datetime(2026, 11, 16, 18, 0, tzinfo=LONDON)


def rule(kind, **kw) -> FilterRule:
    return FilterRule(kind=kind, **kw)


def engine(*groups: list[FilterRule]) -> FilterEngine:
    return FilterEngine([FilterGroup(rules=list(g)) for g in groups])


def accepts(e: FilterEngine, name: str, when: datetime = SAT_0930) -> bool:
    return e.accepts(ClipFacts(name, ClipTimes(modified=when, created=when)))


def test_no_groups_accepts_everything():
    assert accepts(engine(), "anything.mp4")
    assert accepts(engine([]), "anything.mp4")
    assert not engine().active


def test_name_rule_is_a_case_insensitive_substring():
    e = engine([rule("name", value="Coach")])
    assert accepts(e, "my-coach-clip.mp4") and not accepts(e, "other.mp4")


def test_glob_rule_matches_the_whole_name_case_insensitively():
    e = engine([rule("glob", value="gx01*.mp4")])
    assert accepts(e, "GX011234.MP4") and not accepts(e, "proxy_GX011234.MP4")


def test_name_rule_matches_case_when_case_sensitive_is_on():
    e = engine([rule("name", value="Coach", case_sensitive=True)])
    assert accepts(e, "my-Coach-clip.mp4") and not accepts(e, "my-coach-clip.mp4")


def test_glob_rule_matches_case_when_case_sensitive_is_on():
    e = engine([rule("glob", value="GX01*.mp4", case_sensitive=True)])
    assert accepts(e, "GX011234.mp4") and not accepts(e, "GX011234.MP4")


def test_regex_rule_is_case_sensitive_only_when_asked():
    loose = engine([rule("regex", value="^gx")])
    strict = engine([rule("regex", value="^gx", case_sensitive=True)])
    assert accepts(loose, "GX1.mp4") and not accepts(strict, "GX1.mp4") and accepts(strict, "gx1.mp4")


def test_regex_rule_searches_the_name():
    e = engine([rule("regex", value=r"^GX\d{4}")])
    assert accepts(e, "GX1234_a.mp4") and not accepts(e, "xGX1234.mp4")


def test_date_range_is_inclusive_on_both_ends_and_can_be_open_ended():
    e = engine([rule("date_range", date_from="2026-11-14", date_to="2026-11-14")])
    assert accepts(e, "a.mp4", SAT_0930) and not accepts(e, "a.mp4", MON_1800)
    assert accepts(engine([rule("date_range", date_from="2026-11-15")]), "a.mp4", MON_1800)
    assert accepts(engine([rule("date_range", date_to="2026-11-14")]), "a.mp4", SAT_0930)
    assert not accepts(engine([rule("date_range", date_to="2026-11-13")]), "a.mp4", SAT_0930)


def test_weekday_rule_uses_sunday_as_zero():
    assert accepts(engine([rule("weekday", days=[6])]), "a.mp4", SAT_0930)
    assert not accepts(engine([rule("weekday", days=[0, 1])]), "a.mp4", SAT_0930)
    assert accepts(engine([rule("weekday", days=[1])]), "a.mp4", MON_1800)


def test_window_is_start_inclusive_and_end_exclusive():
    e = engine([rule("window", days=[6], start="09:30", end="10:30")])
    assert accepts(e, "a.mp4", datetime(2026, 11, 14, 9, 30, tzinfo=LONDON))
    assert accepts(e, "a.mp4", datetime(2026, 11, 14, 10, 29, 59, tzinfo=LONDON))
    assert not accepts(e, "a.mp4", datetime(2026, 11, 14, 10, 30, tzinfo=LONDON))
    assert not accepts(e, "a.mp4", datetime(2026, 11, 14, 9, 29, tzinfo=LONDON))
    assert not accepts(e, "a.mp4", datetime(2026, 11, 15, 9, 45, tzinfo=LONDON))


def test_exclude_inverts_a_rule():
    e = engine([rule("name", value="proxy", exclude=True)])
    assert accepts(e, "clip.mp4") and not accepts(e, "proxy_clip.mp4")


def test_rules_in_a_group_are_anded():
    e = engine([rule("glob", value="*.mp4"), rule("weekday", days=[6]), rule("name", value="proxy", exclude=True)])
    assert accepts(e, "a.mp4", SAT_0930)
    assert not accepts(e, "a.mp4", MON_1800)
    assert not accepts(e, "proxy_a.mp4", SAT_0930)
    assert not accepts(e, "a.mov", SAT_0930)


def test_groups_are_ored():
    e = engine([rule("weekday", days=[6])], [rule("name", value="keep")])
    assert accepts(e, "a.mp4", SAT_0930)
    assert accepts(e, "keep.mp4", MON_1800)
    assert not accepts(e, "a.mp4", MON_1800)


def test_empty_groups_are_ignored_not_treated_as_match_none():
    e = engine([], [rule("name", value="keep")])
    assert accepts(e, "keep.mp4") and not accepts(e, "other.mp4")


@pytest.mark.parametrize(
    "bad,message",
    [
        (rule("name", value="  "), "needs a value"),
        (rule("regex", value="("), "Invalid regex"),
        (rule("date_range"), "from or to"),
        (rule("date_range", date_from="14/11/2026"), "YYYY-MM-DD"),
        (rule("date_range", date_from="2026-11-15", date_to="2026-11-14"), "not be after"),
        (rule("weekday"), "at least one weekday"),
        (rule("weekday", days=[7]), "between 0"),
        (rule("window", days=[1], start="9:00", end="10:00"), "HH:MM"),
        (rule("window", days=[1], start="25:00", end="26:00"), "HH:MM"),
        (rule("window", days=[1], start="10:00", end="09:00"), "after the start"),
    ],
)
def test_invalid_rules_raise_clear_errors(bad, message):
    with pytest.raises(ValueError, match=message):
        engine([bad])


def test_each_date_rule_reads_its_own_source():
    modified = datetime(2026, 11, 14, 9, 0, tzinfo=LONDON)  # Saturday
    created = datetime(2026, 11, 16, 9, 0, tzinfo=LONDON)  # Monday
    facts = ClipFacts("GX_20261114_090000.mp4", ClipTimes(modified=modified, created=created))
    assert FilterEngine([FilterGroup(rules=[rule("weekday", days=[6], date_source="modified")])]).accepts(facts)
    assert not FilterEngine([FilterGroup(rules=[rule("weekday", days=[6], date_source="created")])]).accepts(facts)
    assert FilterEngine([FilterGroup(rules=[rule("weekday", days=[6], date_source="filename", filename_pattern="GX_YYYYMMDD")])]).accepts(facts)


def test_unreadable_date_is_never_matched_so_an_exclude_rule_keeps_the_clip():
    facts = ClipFacts("holiday.mp4", ClipTimes(modified=SAT_0930, created=SAT_0930))
    dated = FilterRule(kind="weekday", days=[6], date_source="filename", filename_pattern="GX_YYYYMMDD")
    assert not FilterEngine([FilterGroup(rules=[dated])]).accepts(facts)
    excluded = FilterRule(kind="weekday", days=[6], exclude=True, date_source="filename", filename_pattern="GX_YYYYMMDD")
    assert FilterEngine([FilterGroup(rules=[excluded])]).accepts(facts)


def sample_rule(**overrides) -> FilterRule:
    return FilterRule(kind="random", random=RandomSelection(**{"enabled": True, "mode": "count", "value": 1, "scope": "overall", "seed": 3, **overrides}))


def select(groups, names, folders=None):
    items = list(names)
    facts = lambda name: ClipFacts(name, ClipTimes(modified=SAT_0930, created=SAT_0930))
    folder = lambda name: (folders or {}).get(name, "all")
    return FilterEngine([FilterGroup(rules=list(g)) for g in groups]).select(items, facts, folder)


def test_random_rule_only_samples_its_own_groups_matches():
    result = select([[rule("name", value="keep"), sample_rule(value=2)]], ["keep1", "keep2", "keep3", "skip1"])
    assert len(result.accepted) == 2 and result.candidates == {0, 1, 2}


def test_exclude_rules_apply_before_the_random_pick():
    result = select([[rule("name", value="keep"), rule("name", value="keep2", exclude=True), sample_rule(value=10)]], ["keep1", "keep2", "keep3"])
    assert result.accepted == {0, 2}


def test_groups_are_ored_and_each_group_samples_separately():
    groups = [[rule("name", value="a"), sample_rule(value=1)], [rule("name", value="b"), sample_rule(value=1)]]
    result = select(groups, ["a1", "a2", "b1", "b2", "c1"])
    assert len(result.accepted) == 2 and result.candidates == {0, 1, 2, 3}


def test_folder_scope_picks_within_each_folder():
    folders = {"a1": "day1", "a2": "day1", "b1": "day2", "b2": "day2"}
    result = select([[sample_rule(value=1, scope="folder")]], ["a1", "a2", "b1", "b2"], folders)
    assert len(result.accepted & {0, 1}) == 1 and len(result.accepted & {2, 3}) == 1
