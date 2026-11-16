from __future__ import annotations

import fnmatch
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time

from .models import FilterGroup, FilterRule


@dataclass(frozen=True)
class ClipFacts:
    name: str
    when: datetime


Predicate = Callable[[ClipFacts], bool]


def _parse_time(text: str, label: str) -> time:
    try:
        return time.fromisoformat(text) if len(text) == 5 and text[2] == ":" else _bad(label)
    except ValueError:
        return _bad(label)


def _bad(label: str):
    raise ValueError(f"{label} must be HH:MM")


def _parse_date(text: str, label: str) -> date | None:
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError as error:
        raise ValueError(f"{label} must be YYYY-MM-DD") from error


def _weekday(when: datetime) -> int:
    return (when.weekday() + 1) % 7


def _checked_days(days: list[int]) -> frozenset[int]:
    if not days:
        raise ValueError("Pick at least one weekday")
    if any(day < 0 or day > 6 for day in days):
        raise ValueError("Weekdays must be between 0 (Sunday) and 6 (Saturday)")
    return frozenset(days)


def _text_predicate(rule: FilterRule) -> Predicate:
    value = rule.value.strip()
    if not value:
        raise ValueError("A name, glob or regex rule needs a value")
    if rule.kind == "regex":
        try:
            compiled = re.compile(value, 0 if rule.case_sensitive else re.IGNORECASE)
        except re.error as error:
            raise ValueError(f"Invalid regex '{value}': {error}") from error
        return lambda facts: compiled.search(facts.name) is not None
    fold = (lambda text: text) if rule.case_sensitive else str.lower
    needle = fold(value)
    if rule.kind == "name":
        return lambda facts: needle in fold(facts.name)
    return lambda facts: fnmatch.fnmatchcase(fold(facts.name), needle)


def _date_range_predicate(rule: FilterRule) -> Predicate:
    start, end = _parse_date(rule.date_from, "From date"), _parse_date(rule.date_to, "To date")
    if start is None and end is None:
        raise ValueError("A date range needs a from or to date")
    if start and end and start > end:
        raise ValueError("The from date must not be after the to date")
    return lambda facts: (start is None or facts.when.date() >= start) and (end is None or facts.when.date() <= end)


def _window_predicate(rule: FilterRule) -> Predicate:
    days = _checked_days(rule.days)
    start, end = _parse_time(rule.start, "Window start"), _parse_time(rule.end, "Window end")
    if end <= start:
        raise ValueError("Window end must be after the start")
    return lambda facts: _weekday(facts.when) in days and start <= facts.when.time().replace(second=0, microsecond=0) < end


def build_predicate(rule: FilterRule) -> Predicate:
    if rule.kind in ("name", "glob", "regex"):
        return _text_predicate(rule)
    if rule.kind == "date_range":
        return _date_range_predicate(rule)
    if rule.kind == "weekday":
        days = _checked_days(rule.days)
        return lambda facts: _weekday(facts.when) in days
    return _window_predicate(rule)


class FilterEngine:
    def __init__(self, groups: list[FilterGroup]) -> None:
        self._groups: list[list[tuple[Predicate, bool]]] = []
        for group in groups:
            rules = [(build_predicate(rule), rule.exclude) for rule in group.rules]
            if rules:
                self._groups.append(rules)

    @property
    def active(self) -> bool:
        return bool(self._groups)

    def accepts(self, facts: ClipFacts) -> bool:
        if not self._groups:
            return True
        return any(all(predicate(facts) != exclude for predicate, exclude in rules) for rules in self._groups)
