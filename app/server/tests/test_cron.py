from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from collector_server.cron import CronExpression

LONDON = ZoneInfo("Europe/London")


def at(day: int, hour: int, minute: int = 0, month: int = 11) -> datetime:
    return datetime(2026, month, day, hour, minute, tzinfo=LONDON)


def test_parse_requires_five_fields():
    with pytest.raises(ValueError, match="5 fields"):
        CronExpression.parse("0 2 * *")


@pytest.mark.parametrize("text", ["60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 8", "*/0 * * * *", "5-1 * * * *"])
def test_parse_rejects_out_of_range_values(text):
    with pytest.raises(ValueError):
        CronExpression.parse(text)


def test_matches_exact_time():
    expression = CronExpression.parse("30 2 * * *")
    assert expression.matches(at(16, 2, 30))
    assert not expression.matches(at(16, 2, 31))


def test_sunday_is_zero_and_seven():
    for text in ("0 2 * * 0", "0 2 * * 7"):
        expression = CronExpression.parse(text)
        assert expression.matches(at(15, 2))  # Sunday 15 Nov 2026
        assert not expression.matches(at(16, 2))


def test_lists_ranges_and_steps():
    expression = CronExpression.parse("0,30 9-17/4 * * *")
    assert expression.hours == frozenset({9, 13, 17})
    assert expression.minutes == frozenset({0, 30})


def test_step_over_wildcard():
    assert CronExpression.parse("*/15 * * * *").minutes == frozenset({0, 15, 30, 45})


def test_day_of_month_and_weekday_are_ored_when_both_restricted():
    expression = CronExpression.parse("0 0 1 * 1")
    assert expression.matches(at(1, 0))  # 1 Nov is a Sunday: day-of-month matches
    assert expression.matches(at(16, 0))  # Monday matches
    assert not expression.matches(at(17, 0))


def test_next_after_is_strictly_later():
    expression = CronExpression.parse("0 2 * * *")
    assert expression.next_after(at(16, 2, 0)) == at(17, 2, 0)
    assert expression.next_after(at(16, 1, 59)) == at(16, 2, 0)


def test_next_after_weekly_finds_the_next_sunday():
    expression = CronExpression.parse("0 2 * * 0")
    assert expression.next_after(at(16, 12)) == at(22, 2)


def test_next_after_returns_none_when_it_never_matches():
    assert CronExpression.parse("0 0 31 2 *").next_after(at(16, 12)) is None
