from __future__ import annotations

import os
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta

from ..shared.clock import Clock
from .date_source import ClipTimes, DateRule, read_times
from .domain import CollectorRecord
from .filter_engine import ClipFacts, FilterEngine
from .folder_lister import walk_files
from .token_template import ClipContext, FolderTemplate
from .transfer_plan import PlannedFile, PlannedGroup, TransferPlan

_SOURCE_LABEL = {"modified": "modified time", "created": "created time", "filename": "filename"}


@dataclass(frozen=True)
class Clip:
    path: str
    size: int
    when: datetime  # the folder date for this clip
    times: ClipTimes  # what the filter rules read from


@dataclass
class Selection:
    buckets: dict[str, list[Clip]]
    unmatched: list[Clip]
    left_out: list[Clip]


class TransferPlanner:
    def __init__(self, clock: Clock) -> None:
        self._clock = clock

    def validate(self, collector: CollectorRecord) -> None:
        if collector.source_type == "ssh":
            raise ValueError("SSH sources can't be scanned yet")
        if not collector.output_folder.strip():
            raise ValueError("Output folder is required")
        if FolderTemplate(collector.folder_template).uses_window():
            raise ValueError("{window:...} tokens aren't supported yet")
        FilterEngine(collector.filters)
        DateRule(collector.date_source, collector.filename_pattern)

    def plan(self, collector: CollectorRecord) -> TransferPlan:
        self.validate(collector)
        if not os.path.isdir(collector.source):
            raise FileNotFoundError(f"Input folder not found: {collector.source}")
        now = self._clock.now()
        clips, sources = self.read_clips(collector, now)
        selection = self.select(collector, clips, now)
        buckets, unmatched, left_out = selection.buckets, selection.unmatched, selection.left_out
        plan = self._build(collector.output_folder, buckets)
        plan.unmatched = self._names(unmatched, collector.source)
        plan.not_selected = self._names(left_out, collector.source)
        if clips:
            plan.notes.append(self._date_note(sources, collector.date_source))
        if not plan.total_files:
            plan.notes.append("No files found in the input folder." if not clips else "No clips matched the filters.")
        return plan

    def select(self, collector: CollectorRecord, clips: list[Clip], now: datetime) -> Selection:
        """Filters and random rules: the one place that decides which clips are collected."""
        engine, template = FilterEngine(collector.filters), FolderTemplate(collector.folder_template)

        def folder_of(clip: Clip) -> str:
            return template.render(ClipContext(when=self._group_date(collector.group_by, clip.when, now), suffix=collector.suffix))

        result = engine.select(clips, lambda clip: ClipFacts(os.path.basename(clip.path), clip.times), folder_of)
        matched = [clips[i] for i in sorted(result.accepted)]
        unmatched = [clip for i, clip in enumerate(clips) if i not in result.candidates]
        left_out = [clip for i, clip in enumerate(clips) if i in result.candidates and i not in result.accepted]
        return Selection(self._bucket(matched, collector, now), unmatched, left_out)

    def read_clips(self, collector: CollectorRecord, now: datetime) -> tuple[list[Clip], Counter]:
        folder_date = DateRule(collector.date_source, collector.filename_pattern)
        sources: Counter = Counter()
        clips: list[Clip] = []
        for path, size in walk_files(collector.source, collector.output_folder):
            times = read_times(path, now.tzinfo)
            when = folder_date.pick(os.path.basename(path), times)
            if when is None:
                when, kind = times.modified, "fallback"
            else:
                kind = collector.date_source
            sources[kind] += 1
            clips.append(Clip(path, size, when, times))
        return sorted(clips, key=lambda clip: clip.path), sources

    def _bucket(self, clips: list[Clip], collector: CollectorRecord, now: datetime) -> dict[str, list[Clip]]:
        template = FolderTemplate(collector.folder_template)
        buckets: dict[str, list[Clip]] = {}
        for clip in clips:
            context = ClipContext(when=self._group_date(collector.group_by, clip.when, now), suffix=collector.suffix)
            relative = template.render(context)
            if not relative:
                raise ValueError("Folder structure renders to an empty name")
            buckets.setdefault(relative, []).append(clip)
        return buckets

    def _build(self, output: str, buckets: dict[str, list[Clip]]) -> TransferPlan:
        plan = TransferPlan()
        for relative in sorted(buckets):
            if not buckets[relative]:
                continue
            folder = self._free_folder(output, relative)
            group = PlannedGroup(folder=folder, path=os.path.join(output, folder), renamed=folder != relative)
            used: set[str] = set()
            for clip in buckets[relative]:
                name = self._unique_name(os.path.basename(clip.path), used)
                group.files.append(PlannedFile(source=clip.path, destination=os.path.join(group.path, name), size=clip.size))
            plan.groups.append(group)
            if group.renamed:
                plan.notes.append(f"{relative} already exists, so new clips go to {folder}.")
        return plan

    @staticmethod
    def _names(clips: list[Clip], source: str) -> list[str]:
        return [os.path.relpath(clip.path, source) for clip in clips]

    @staticmethod
    def _date_note(counts: Counter, source: str) -> str:
        parts = [f"{_SOURCE_LABEL[kind]} for {counts[kind]}" for kind in ("modified", "created", "filename") if counts[kind]]
        if counts["fallback"]:
            parts.append(f"modified time for {counts['fallback']} with no readable date")
        return "Folder dates come from " + ", ".join(parts) + "."

    @staticmethod
    def _group_date(group_by: str, when: datetime, now: datetime) -> datetime:
        midnight = when.replace(hour=0, minute=0, second=0, microsecond=0)
        if group_by == "day":
            return midnight
        if group_by == "week":
            return midnight - timedelta(days=when.weekday())
        if group_by == "month":
            return midnight.replace(day=1)
        return now

    @staticmethod
    def _free_folder(output: str, relative: str) -> str:
        candidate, number = relative, 2
        while os.path.exists(os.path.join(output, candidate)):
            candidate = f"{relative}-{number}"
            number += 1
        return candidate

    @staticmethod
    def _unique_name(name: str, used: set[str]) -> str:
        stem, extension = os.path.splitext(name)
        candidate, number = name, 2
        while candidate in used:
            candidate = f"{stem}-{number}{extension}"
            number += 1
        used.add(candidate)
        return candidate
