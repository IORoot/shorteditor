from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

_RANGES = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)]


def _parse_field(text: str, low: int, high: int) -> frozenset[int]:
    values: set[int] = set()
    for part in text.split(","):
        base, _, step_text = part.partition("/")
        step = int(step_text) if step_text else 1
        if step < 1:
            raise ValueError(f"Invalid step in '{part}'")
        if base == "*":
            start, end = low, high
        elif "-" in base:
            first, _, last = base.partition("-")
            start, end = int(first), int(last)
        else:
            start = int(base)
            end = high if step_text else start
        if start < low or end > high or start > end:
            raise ValueError(f"Value out of range in '{part}'")
        values.update(range(start, end + 1, step))
    return frozenset(values)


@dataclass(frozen=True)
class CronExpression:
    minutes: frozenset[int]
    hours: frozenset[int]
    days: frozenset[int]
    months: frozenset[int]
    weekdays: frozenset[int]
    days_restricted: bool
    weekdays_restricted: bool

    @classmethod
    def parse(cls, text: str) -> "CronExpression":
        fields = text.split()
        if len(fields) != 5:
            raise ValueError(f"Cron needs 5 fields, got {len(fields)}")
        try:
            sets = [_parse_field(f, lo, hi) for f, (lo, hi) in zip(fields, _RANGES)]
        except ValueError as error:
            raise ValueError(str(error) or "Invalid cron field") from error
        weekdays = frozenset(0 if d == 7 else d for d in sets[4])
        return cls(sets[0], sets[1], sets[2], sets[3], weekdays, fields[2] != "*", fields[4] != "*")

    def matches(self, when: datetime) -> bool:
        if when.minute not in self.minutes or when.hour not in self.hours or when.month not in self.months:
            return False
        day_ok = when.day in self.days
        weekday_ok = (when.weekday() + 1) % 7 in self.weekdays
        if self.days_restricted and self.weekdays_restricted:
            return day_ok or weekday_ok
        return day_ok and weekday_ok

    def next_after(self, when: datetime, limit_days: int = 366) -> datetime | None:
        candidate = when.replace(second=0, microsecond=0) + timedelta(minutes=1)
        for _ in range(limit_days * 24 * 60):
            if self.matches(candidate):
                return candidate
            candidate += timedelta(minutes=1)
        return None
