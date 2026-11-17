from __future__ import annotations

from .cron import CronExpression
from .models import ScheduleDraft

_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


class ScheduleRule:
    def __init__(self, draft: ScheduleDraft) -> None:
        self._draft = draft
        hour, minute = self._parse_time(draft.time)
        self._hour, self._minute = hour, minute
        if draft.kind == "weekly":
            if not draft.weekdays:
                raise ValueError("Pick at least one weekday")
            if any(day < 0 or day > 6 for day in draft.weekdays):
                raise ValueError("Weekdays must be between 0 (Sunday) and 6 (Saturday)")
        self._cron = self._build_cron()
        CronExpression.parse(self._cron)

    @staticmethod
    def _parse_time(text: str) -> tuple[int, int]:
        hour, _, minute = text.partition(":")
        if not (hour.isdigit() and minute.isdigit()) or int(hour) > 23 or int(minute) > 59:
            raise ValueError("Time must be HH:MM between 00:00 and 23:59")
        return int(hour), int(minute)

    def _build_cron(self) -> str:
        draft = self._draft
        prefix = f"{self._minute} {self._hour}"
        if draft.kind == "daily":
            return f"{prefix} * * *"
        if draft.kind == "weekly":
            days = ",".join(str(day) for day in sorted(set(draft.weekdays)))
            return f"{prefix} * * {days}"
        if draft.kind == "monthly":
            return f"{prefix} {draft.day_of_month} * *"
        return " ".join(draft.cron.split())

    @property
    def cron(self) -> str:
        return self._cron

    def expression(self) -> CronExpression:
        return CronExpression.parse(self._cron)

    def summary(self) -> str:
        draft = self._draft
        at = f"{self._hour:02d}:{self._minute:02d}"
        if draft.kind == "daily":
            return f"Every day at {at}"
        if draft.kind == "weekly":
            names = ", ".join(_DAY_NAMES[day] for day in sorted(set(draft.weekdays)))
            return f"Every {names} at {at}"
        if draft.kind == "monthly":
            return f"On day {draft.day_of_month} of each month at {at}"
        return f"Cron {self._cron}"
