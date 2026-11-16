from __future__ import annotations

import os
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime, timedelta

from .clock import Clock
from .date_source import ClipDateResolver
from .domain import CollectorRecord
from .filter_engine import ClipFacts, FilterEngine
from .random_selector import RandomSelector
from .token_template import ClipContext, FolderTemplate
from .transfer_plan import PlannedFile, PlannedGroup, TransferPlan

VIDEO_EXTENSIONS = frozenset({".mp4", ".mov", ".mkv", ".m4v", ".avi", ".mts", ".mxf"})
_SOURCE_LABEL = {"metadata": "video metadata", "filename": "filename", "mtime": "modified time"}


@dataclass(frozen=True)
class Clip:
    path: str
    size: int
    when: datetime


class TransferPlanner:
    def __init__(self, clock: Clock) -> None:
        self._clock = clock

    def validate(self, collector: CollectorRecord) -> None:
        if collector.source_type == "ssh":
            raise ValueError("SSH sources can't be scanned yet")
        if collector.group_by == "window":
            raise ValueError("Window grouping isn't built yet")
        if not collector.output_folder.strip():
            raise ValueError("Output folder is required")
        if FolderTemplate(collector.folder_template).uses_window():
            raise ValueError("{window:...} tokens aren't supported yet")
        FilterEngine(collector.filters)
        RandomSelector(collector.random_selection)
        ClipDateResolver(collector.date_sources, collector.filename_pattern, None)

    def plan(self, collector: CollectorRecord) -> TransferPlan:
        self.validate(collector)
        if not os.path.isdir(collector.source):
            raise FileNotFoundError(f"Input folder not found: {collector.source}")
        now = self._clock.now()
        clips, sources = self._read_clips(collector, now)
        engine, selector = FilterEngine(collector.filters), RandomSelector(collector.random_selection)
        matched = [c for c in clips if engine.accepts(ClipFacts(os.path.basename(c.path), c.when))]
        unmatched = self._without(clips, matched)
        left_out: list[Clip] = []
        if selector.overall:
            kept = selector.pick(matched, "overall")
            left_out, matched = self._without(matched, kept), kept
        buckets = self._bucket(matched, collector, now)
        if selector.per_folder:
            for relative, items in buckets.items():
                kept = selector.pick(items, relative)
                left_out += self._without(items, kept)
                buckets[relative] = kept
        plan = self._build(collector.output_folder, buckets)
        plan.unmatched = self._names(unmatched, collector.source)
        plan.not_selected = self._names(left_out, collector.source)
        if clips:
            plan.notes.append(self._date_note(sources, collector.date_sources))
        if not plan.total_files:
            plan.notes.append("No video files found in the input folder." if not clips else "No clips matched the filters.")
        return plan

    def _read_clips(self, collector: CollectorRecord, now: datetime) -> tuple[list[Clip], Counter]:
        resolver = ClipDateResolver(collector.date_sources, collector.filename_pattern, now.tzinfo)
        sources: Counter = Counter()
        clips: list[Clip] = []
        for path, size in self._scan(collector.source, collector.output_folder):
            when, kind = resolver.resolve(path)
            sources[kind] += 1
            clips.append(Clip(path, size, when))
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
    def _without(clips: list[Clip], kept: list[Clip]) -> list[Clip]:
        keep = {clip.path for clip in kept}
        return [clip for clip in clips if clip.path not in keep]

    @staticmethod
    def _names(clips: list[Clip], source: str) -> list[str]:
        return [os.path.relpath(clip.path, source) for clip in clips]

    @staticmethod
    def _date_note(counts: Counter, configured: list[str]) -> str:
        if not counts or set(counts) == {"mtime"} and configured == ["mtime"]:
            return "Dates come from file modified time."
        parts = [f"{_SOURCE_LABEL[kind]} for {counts[kind]}" for kind in ("metadata", "filename", "mtime") if counts[kind]]
        return "Dates come from " + ", ".join(parts) + "."

    @staticmethod
    def _scan(source: str, output: str) -> Iterator[tuple[str, int]]:
        skip = os.path.realpath(output) + os.sep if output else None
        for root, dirs, names in os.walk(source, followlinks=False):
            dirs[:] = [d for d in dirs if not d.startswith(".") and not (skip and (os.path.realpath(os.path.join(root, d)) + os.sep).startswith(skip))]
            for name in names:
                if name.startswith(".") or os.path.splitext(name)[1].lower() not in VIDEO_EXTENSIONS:
                    continue
                path = os.path.join(root, name)
                yield path, os.stat(path).st_size

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
