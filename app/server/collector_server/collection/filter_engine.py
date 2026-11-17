from __future__ import annotations

import fnmatch
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time
from typing import TypeVar

from .date_source import ClipTimes, DateRule
from .models import FilterGroup, FilterRule
from .random_selector import RandomSelector

T = TypeVar("T")


@dataclass(frozen=True)
class ClipFacts:
    name: str
    times: ClipTimes


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


def _dated(rule: FilterRule, check: Callable[[datetime], bool]) -> Predicate:
    """A rule that reads the clip date from the source chosen on that rule. No readable date means no match."""
    date_rule = DateRule(rule.date_source, rule.filename_pattern)

    def predicate(facts: ClipFacts) -> bool:
        when = date_rule.pick(facts.name, facts.times)
        return when is not None and check(when)

    return predicate


def _date_range_predicate(rule: FilterRule) -> Predicate:
    start, end = _parse_date(rule.date_from, "From date"), _parse_date(rule.date_to, "To date")
    if start is None and end is None:
        raise ValueError("A date range needs a from or to date")
    if start and end and start > end:
        raise ValueError("The from date must not be after the to date")
    return _dated(rule, lambda when: (start is None or when.date() >= start) and (end is None or when.date() <= end))


def _window_predicate(rule: FilterRule) -> Predicate:
    days = _checked_days(rule.days)
    start, end = _parse_time(rule.start, "Window start"), _parse_time(rule.end, "Window end")
    if end <= start:
        raise ValueError("Window end must be after the start")
    return _dated(rule, lambda when: _weekday(when) in days and start <= when.time().replace(second=0, microsecond=0) < end)


def build_predicate(rule: FilterRule) -> Predicate:
    if rule.kind in ("name", "glob", "regex"):
        return _text_predicate(rule)
    if rule.kind == "date_range":
        return _date_range_predicate(rule)
    if rule.kind == "weekday":
        days = _checked_days(rule.days)
        return _dated(rule, lambda when: _weekday(when) in days)
    return _window_predicate(rule)


@dataclass(frozen=True)
class Selection:
    accepted: set[int]  # indexes of clips the filters collect
    candidates: set[int]  # indexes of clips that passed a group's rules before any random pick


class FilterEngine:
    """Groups are ORed. Inside a group, rules are ANDed; a random rule samples what the other rules matched."""

    def __init__(self, groups: list[FilterGroup]) -> None:
        self._groups: list[tuple[list[tuple[Predicate, bool]], list[tuple[RandomSelector, str]]]] = []
        for group in groups:
            predicates: list[tuple[Predicate, bool]] = []
            randoms: list[tuple[RandomSelector, str]] = []
            for rule in group.rules:
                if rule.kind == "random":
                    randoms.append((RandomSelector(rule.random), rule.random.scope))
                else:
                    predicates.append((build_predicate(rule), rule.exclude))
            if predicates or randoms:
                self._groups.append((predicates, randoms))

    @property
    def active(self) -> bool:
        return bool(self._groups)

    def accepts(self, facts: ClipFacts) -> bool:
        """Per-clip view that ignores random rules. select() is the real decision."""
        if not self._groups:
            return True
        return any(all(predicate(facts) != exclude for predicate, exclude in predicates) for predicates, _ in self._groups)

    def select(self, items: Sequence[T], facts: Callable[[T], ClipFacts], folder: Callable[[T], str]) -> Selection:
        """Applies every group to the items. Random rules pick from the group's matches, per folder when their scope says so."""
        if not self._groups:
            everything = set(range(len(items)))
            return Selection(accepted=everything, candidates=everything)
        facts_of = [facts(item) for item in items]
        accepted: set[int] = set()
        candidates_all: set[int] = set()
        for group_index, (predicates, randoms) in enumerate(self._groups):
            matched = [i for i in range(len(items)) if all(predicate(facts_of[i]) != exclude for predicate, exclude in predicates)]
            candidates_all.update(matched)
            chosen = matched
            for rule_index, (selector, scope) in enumerate(randoms):
                salt = f"{group_index}:{rule_index}"
                if scope == "folder":
                    chosen = self._per_folder(chosen, selector, salt, folder, items)
                else:
                    chosen = selector.pick(chosen, salt)
            accepted.update(chosen)
        return Selection(accepted=accepted, candidates=candidates_all)

    @staticmethod
    def _per_folder(indexes: list[int], selector: RandomSelector, salt: str, folder: Callable[[T], str], items: Sequence[T]) -> list[int]:
        by_folder: dict[str, list[int]] = {}
        for index in indexes:
            by_folder.setdefault(folder(items[index]), []).append(index)
        picked: list[int] = []
        for key in sorted(by_folder):
            picked += selector.pick(by_folder[key], f"{salt}:{key}")
        return sorted(picked)
