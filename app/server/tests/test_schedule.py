import pytest

from collector_server.models import ScheduleDraft
from collector_server.schedule import ScheduleRule


def draft(**overrides) -> ScheduleDraft:
    base = dict(enabled=True, kind="daily", time="02:00", weekdays=[], day_of_month=1, cron="")
    base.update(overrides)
    return ScheduleDraft(**base)


def test_daily_builds_cron_and_summary():
    rule = ScheduleRule(draft(kind="daily", time="23:00"))
    assert rule.cron == "0 23 * * *"
    assert rule.summary() == "Every day at 23:00"


def test_weekly_sorts_weekdays_and_names_them():
    rule = ScheduleRule(draft(kind="weekly", weekdays=[6, 0]))
    assert rule.cron == "0 2 * * 0,6"
    assert rule.summary() == "Every Sunday, Saturday at 02:00"


def test_weekly_requires_a_weekday():
    with pytest.raises(ValueError, match="weekday"):
        ScheduleRule(draft(kind="weekly", weekdays=[]))


def test_weekly_rejects_invalid_weekday():
    with pytest.raises(ValueError, match="between 0"):
        ScheduleRule(draft(kind="weekly", weekdays=[7]))


def test_monthly_uses_the_day_of_month():
    rule = ScheduleRule(draft(kind="monthly", day_of_month=15, time="03:30"))
    assert rule.cron == "30 3 15 * *"
    assert rule.summary() == "On day 15 of each month at 03:30"


def test_cron_kind_normalises_whitespace_and_validates():
    rule = ScheduleRule(draft(kind="cron", cron="  0   */6 * * * "))
    assert rule.cron == "0 */6 * * *"
    assert rule.summary() == "Cron 0 */6 * * *"
    with pytest.raises(ValueError):
        ScheduleRule(draft(kind="cron", cron="nope"))


@pytest.mark.parametrize("time", ["24:00", "12:60"])
def test_invalid_time_is_rejected(time):
    with pytest.raises(ValueError, match="HH:MM"):
        ScheduleRule(draft(time=time))


def test_expression_matches_the_cron():
    rule = ScheduleRule(draft(kind="daily", time="05:10"))
    assert rule.expression().minutes == frozenset({10})
