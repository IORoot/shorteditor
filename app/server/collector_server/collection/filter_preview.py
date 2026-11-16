from __future__ import annotations

import os

from ..shared.clock import Clock
from .domain import CollectorRecord
from .models import ClipVerdict, CollectorConfig, FilterPreviewResult
from .planner import Clip, TransferPlanner

NO_MATCH = "Doesn't match the filters"
NOT_PICKED = "Not picked by random selection"
SELECTED = "Collected"
MAX_ROWS = 500  # shortcut: the list shows the newest 500 files; counts still cover the whole folder.


class FilterPreviewer:
    """Lists every file in the input folder and says what the planner would do with each one."""

    def __init__(self, planner: TransferPlanner, clock: Clock) -> None:
        self._planner = planner
        self._clock = clock

    def preview(self, config: CollectorConfig) -> FilterPreviewResult:
        record = CollectorRecord.from_config(config)
        if record.source_type == "ssh":
            raise ValueError("SSH sources can't be previewed yet")
        if not record.source.strip():
            raise ValueError("Pick an input folder to see its files")
        if not os.path.isdir(record.source):
            raise FileNotFoundError(f"Input folder not found: {record.source}")
        now = self._clock.now()
        files, _ = self._planner.read_clips(record, now)
        selection = self._planner.select(record, files, now)
        kept = {clip.path for items in selection.buckets.values() for clip in items}
        not_picked = {clip.path for clip in selection.left_out}
        unmatched = {clip.path for clip in selection.unmatched}
        ordered = sorted(files, key=lambda clip: clip.when, reverse=True)
        rows = [self._verdict(clip, record.source, clip.path in kept, self._reason(clip.path, kept, not_picked, unmatched)) for clip in ordered[:MAX_ROWS]]
        return FilterPreviewResult(clips=rows, selected_count=len(kept), total=len(files), truncated=len(files) > MAX_ROWS)

    @staticmethod
    def _reason(path: str, kept: set[str], not_picked: set[str], unmatched: set[str]) -> str:
        if path in kept:
            return SELECTED
        return NO_MATCH if path in unmatched else NOT_PICKED

    @staticmethod
    def _verdict(clip: Clip, source: str, picked: bool, reason: str) -> ClipVerdict:
        when = clip.when
        label = f"{when:%a} {when.day} {when:%b} · {when:%H:%M}"
        return ClipVerdict(name=os.path.relpath(clip.path, source), when=when.isoformat(), label=label, selected=picked, reason=reason)
