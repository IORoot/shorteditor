from __future__ import annotations

import logging
import os
import threading
from collections.abc import Callable
from datetime import datetime, timezone

from collector_server.shared.pipeline import PipelineRef

from .errors import InvalidInputError
from .folder_scan import scan_parent
from .models import Batch
from .pattern import compile_pattern, render_name
from .service import NotFoundError, ProductionService
from .watch_models import CheckResult, Watch, WatchCreate, WatchView
from .watch_repository import WatchRepository

_log = logging.getLogger(__name__)


class WatchService:
    """Watches a parent folder and makes a batch for each new matching folder, once it has stopped changing."""

    def __init__(self, watches: WatchRepository, service: ProductionService, clock: Callable[[], float]) -> None:
        self._watches, self._service, self._clock = watches, service, clock
        self._locks: dict[int, threading.Lock] = {}
        self._guard = threading.Lock()

    # ---- managing watches
    def create(self, data: WatchCreate) -> WatchView:
        compiled = self._validate(data)
        # Saved switched off, so the timer cannot check it before its baseline is in place.
        watch = self._watches.create(data.model_copy(update={"enabled": False}), self._stamp())
        try:
            with self._lock_for(watch.id):
                self._baseline(watch, compiled, data.include_existing)
            if data.enabled:
                self._watches.set_enabled(watch.id, True)
        except Exception:
            self._watches.delete(watch.id)  # never leave a half-made watch behind
            raise
        return self.get(watch.id)

    def update(self, watch_id: int, data: WatchCreate) -> WatchView:
        old = self._need(watch_id)
        compiled = self._validate(data)
        with self._lock_for(watch_id):
            self._watches.update(watch_id, data)
            if (old.parent_folder, old.pattern) != (data.parent_folder, data.pattern):
                # a different place or a wider net: what was handled before says nothing about it, so start again
                self._watches.clear_seen(watch_id)
                self._baseline(self._need(watch_id), compiled, data.include_existing)
        return self.get(watch_id)

    def _baseline(self, watch: Watch, compiled, include_existing: bool) -> None:  # noqa: ANN001
        """With include_existing the folders already there are checked like any other; otherwise the ones that
        have settled are marked handled. Folders still being copied, or without videos yet, stay eligible."""
        if include_existing:
            self._check(self._need(watch.id))
            return
        scan = scan_parent(watch.parent_folder, compiled)
        settled = [c.path for c in scan.matches if c.clip_count > 0 and not c.incomplete and self._settled(c, watch)]
        self._watches.mark_seen(watch.id, settled, self._stamp())

    def _settled(self, candidate, watch: Watch) -> bool:  # noqa: ANN001
        return candidate.newest_change is None or self._clock() - candidate.newest_change >= watch.settle_minutes * 60

    def delete(self, watch_id: int) -> None:
        self._need(watch_id)
        self._watches.delete(watch_id)
        with self._guard:
            self._locks.pop(watch_id, None)

    def set_enabled(self, watch_id: int, enabled: bool) -> WatchView:
        self._need(watch_id)
        self._watches.set_enabled(watch_id, enabled)
        return self.get(watch_id)

    def get(self, watch_id: int) -> WatchView:
        return self._view(self._need(watch_id))

    def list(self) -> list[WatchView]:
        return [self._view(watch) for watch in self._watches.list()]

    # ---- checking
    def check(self, watch_id: int) -> CheckResult:
        self._need(watch_id)
        with self._lock_for(watch_id):
            return self._check(self._need(watch_id))

    def _check(self, watch: Watch) -> CheckResult:
        if self._pipeline_off(watch):
            return CheckResult(created=[], waiting=[])  # paused until its pipeline is switched on; nothing is recorded
        created: list[Batch] = []
        waiting: list[str] = []
        problems: list[str] = []
        error: str | None = None
        try:
            scan = scan_parent(watch.parent_folder, compile_pattern(watch.pattern))
            with self._service.lock:  # the decision and the creation are one step, shared with bulk create
                seen = self._watches.seen(watch.id)
                taken = self._service.taken_folders()
                for c in scan.matches:
                    if c.path in seen:
                        continue
                    if os.path.realpath(c.path) in taken:
                        self._watches.mark_seen(watch.id, [c.path], self._stamp())  # someone already made a batch for it
                        continue
                    if c.incomplete:
                        waiting.append(c.name)
                    elif c.clip_count == 0:
                        continue
                    elif not self._settled(c, watch):
                        waiting.append(c.name)
                    elif len(created) < watch.max_per_check:
                        try:
                            batch = self._service.create_batch(render_name(watch.name_template, c.match, c.name), c.path, watch.pipeline_id,
                                                               watch.run_on, watch.output_root or self._service.default_output_for(watch.parent_folder), steps=watch.steps)
                        except (InvalidInputError, OSError) as problem:  # one bad folder must not starve the rest
                            problems.append(f"{c.name}: {str(problem).rstrip('.')}")
                            continue
                        created.append(batch)
                        self._watches.mark_seen(watch.id, [c.path], self._stamp())
            if problems:
                error = "; ".join(problems[:2]) + (f" (and {len(problems) - 2} more)" if len(problems) > 2 else "")
        except (InvalidInputError, OSError) as problem:
            error = str(problem).rstrip(".")
        except Exception as problem:  # noqa: BLE001 - recorded on the watch; the other watches carry on
            _log.exception("checking watch %s failed", watch.id)
            error = f"Something went wrong: {type(problem).__name__}"
        self._watches.record_check(watch.id, self._stamp(), error, waiting, len(created))
        return CheckResult(created=created, waiting=waiting, error=error)

    # ---- helpers
    def _validate(self, data: WatchCreate):  # noqa: ANN202
        return self._service.check_folder_settings(data.parent_folder, data.pattern, data.name_template, data.pipeline_id, data.run_on, data.output_root)

    def _pipeline_off(self, watch: Watch) -> bool:
        ref = self._service.pipeline_ref(watch.pipeline_id) if watch.pipeline_id is not None else None
        return watch.pipeline_id is not None and (ref is None or not ref.enabled)

    def _need(self, watch_id: int) -> Watch:
        watch = self._watches.get(watch_id)
        if watch is None:
            raise NotFoundError(f"There is no watch {watch_id}")
        return watch

    def _lock_for(self, watch_id: int) -> threading.Lock:
        with self._guard:
            return self._locks.setdefault(watch_id, threading.Lock())

    def _stamp(self) -> str:
        return datetime.fromtimestamp(self._clock(), tz=timezone.utc).isoformat()

    def _view(self, watch: Watch) -> WatchView:
        ref: PipelineRef | None = self._service.pipeline_ref(watch.pipeline_id)
        off = self._pipeline_off(watch)
        status = "paused" if not watch.enabled or off else "problem" if watch.last_error else "waiting" if watch.waiting else "watching"
        line = self._pipeline_line(ref) if watch.enabled and off else self._line(watch, status)
        return WatchView(**watch.model_dump(), status=status, status_line=line, pipeline_name=ref.name if ref else None)

    @staticmethod
    def _pipeline_line(ref: PipelineRef | None) -> str:
        if ref is None:
            return "Paused · its pipeline no longer exists"
        return f"Paused · pipeline '{ref.name}' is off. Checks resume by themselves when it is switched on"

    def _line(self, watch: Watch, status: str) -> str:
        total = f"created {watch.created_total} {'batch' if watch.created_total == 1 else 'batches'} in total"
        checked = self._local_time(watch.last_checked_at)
        if status == "problem":
            return f"Problem: {str(watch.last_error).rstrip('.')}. Checking again in {watch.interval_minutes} minutes."
        if status == "waiting":
            names = ", ".join(watch.waiting[:2]) + (f" and {len(watch.waiting) - 2} more" if len(watch.waiting) > 2 else "")
            return f"Waiting for {names} to settle: files are still changing. It needs {watch.settle_minutes} quiet minutes."
        if watch.last_checked_at is None:
            return "Paused · not checked yet" if status == "paused" else "Not checked yet"
        if status == "paused":
            problem = f" · last problem: {str(watch.last_error).rstrip('.')}" if watch.last_error else ""
            return f"Paused · last checked {checked} · {total}{problem}"
        elapsed = max(0.0, (self._clock() - datetime.fromisoformat(watch.last_checked_at).timestamp()) / 60)  # a clock that jumped back
        due = max(0, round(watch.interval_minutes - elapsed))
        return f"Last checked {checked} · {total} · next check in {due} minute{'' if due == 1 else 's'}"

    @staticmethod
    def _local_time(stamp: str | None) -> str:
        if not stamp:
            return ""
        then = datetime.fromisoformat(stamp).astimezone()
        return then.strftime("%H:%M") if then.date() == datetime.now().astimezone().date() else then.strftime("%d %b %H:%M")
