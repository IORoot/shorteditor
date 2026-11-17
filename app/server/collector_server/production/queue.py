from __future__ import annotations

import threading
from collections.abc import Callable
from typing import Protocol

from .output_paths import output_paths, remove_inside
from .repositories import BatchRepository, PassRepository
from .worker import Worker


class _Runner(Protocol):
    def run(self, pass_id: int, worker: Worker) -> None: ...


class JobQueue:
    """Starts waiting passes in the order they were queued, one job per worker."""

    def __init__(self, passes: PassRepository, batches: BatchRepository, runner: _Runner, workers: dict[str, Worker], now: Callable[[], str]) -> None:
        self._passes, self._batches, self._runner, self._workers, self._now = passes, batches, runner, workers, now
        self._lock = threading.Lock()
        self._busy: dict[str, tuple[int, threading.Thread]] = {}  # worker id -> (pass id, its thread)

    def tick(self) -> list[int]:
        """Start whatever can start now. Returns the ids of the passes started."""
        started: list[int] = []
        with self._lock:
            self._forget_finished()
            if len(self._busy) >= len(self._workers):
                return started  # every worker is busy, so there is nothing to look for
            active = {pass_id for pass_id, _ in self._busy.values()}
            for waiting in self._passes.queued():
                if waiting.id in active:
                    continue
                worker_id = self._free_worker(self._batches.get(waiting.batch_id).run_on)
                if worker_id is None:
                    continue
                thread = threading.Thread(target=self._run, args=(waiting.id, self._workers[worker_id]), daemon=True)
                self._busy[worker_id] = (waiting.id, thread)
                thread.start()
                started.append(waiting.id)
        return started

    def wait_idle(self, timeout: float = 30) -> None:
        with self._lock:
            threads = [thread for _, thread in self._busy.values()]
        for thread in threads:
            thread.join(timeout)

    def recover(self) -> int:
        """After a restart nothing can still be running, so passes left Running are failed."""
        stale = self._passes.running()
        for running in stale:
            self._passes.update(running.id, only_if_status="running", status="failed", error="Interrupted by a restart", finished_at=self._now())
            batch = self._batches.get(running.batch_id)
            if batch is not None:  # the dead run's half-made files
                output_dir, work_dir = output_paths(batch, running.id, running.number)
                remove_inside(batch.output_root, work_dir)
                remove_inside(batch.output_root, output_dir)
        return len(stale)

    def _free_worker(self, run_on: str) -> str | None:
        candidates = list(self._workers) if run_on == "any" else [run_on] if run_on in self._workers else []
        return next((worker_id for worker_id in candidates if worker_id not in self._busy), None)

    def _forget_finished(self) -> None:
        self._busy = {worker_id: item for worker_id, item in self._busy.items() if item[1].is_alive()}

    def _run(self, pass_id: int, worker: Worker) -> None:
        try:
            self._runner.run(pass_id, worker)
        except Exception as error:  # noqa: BLE001 - the runner reports its own failures; this is the last resort
            self._passes.update(pass_id, only_if_status="running", status="failed", error=f"Something went wrong: {type(error).__name__}", finished_at=self._now())
