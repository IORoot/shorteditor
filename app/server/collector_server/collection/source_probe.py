from __future__ import annotations

import os
from typing import Any

from .domain import CollectorRecord
from .folder_lister import walk_files
from .planner import TransferPlanner


class PlannerProbe:
    """Looks at a local source for auto-collect, using the planner so the filters are the collector's own."""

    def __init__(self, planner: TransferPlanner) -> None:
        self._planner = planner

    def snapshot(self, collector: CollectorRecord) -> Any:
        """Names, sizes and modified times. It changes whenever a file arrives, grows or goes."""
        try:
            return tuple(sorted((path, size, os.stat(path).st_mtime_ns) for path, size in walk_files(collector.source, collector.output_folder)))
        except OSError:
            return object()  # a file vanished mid-listing: never equal to the last look, so the folder counts as changing

    def waiting(self, collector: CollectorRecord) -> int:
        """How many clips the collector would take, counting those a cap leaves for later."""
        try:
            plan = self._planner.plan(collector)
        except (ValueError, OSError):
            return 0  # a collector that cannot plan has nothing to collect yet; saving its config reports the reason
        return plan.total_files + plan.held_back
