from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import APIRouter

from collector_server.shared.database import Database
from collector_server.shared.pipeline import StageCatalog

from .api import build_router
from .builtin import build_registry
from .queue import JobQueue
from .repositories import BatchRepository, LogRepository, PassRepository
from .runner import PassRunner
from .schema import ensure_schema
from .service import ProductionService
from .watch_repository import WatchRepository
from .watch_scheduler import WatchScheduler
from .watch_service import WatchService
from .worker import LocalWorker


@dataclass
class Production:
    router: APIRouter
    queue: JobQueue
    scheduler: WatchScheduler | None = None
    catalog: StageCatalog | None = None

    def tick(self) -> None:
        """Check the watches and start whatever can start."""
        self.tick_watches()
        self.tick_queue()

    def tick_queue(self) -> None:
        self._guarded(self.queue)

    def tick_watches(self) -> None:
        """Scanning folders can be slow on a network drive, so the server runs this on its own thread."""
        self._guarded(self.scheduler)

    @staticmethod
    def _guarded(part) -> None:  # noqa: ANN001
        """One failing part must not stop production for good."""
        if part is None:
            return
        try:
            part.tick()
        except Exception:  # noqa: BLE001
            logging.getLogger(__name__).exception("production tick failed")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def build_production(db: Database, default_output_root: str) -> Production:
    """Everything production needs, connected. Starts with one worker: this computer."""
    ensure_schema(db)
    batches, passes, logs = BatchRepository(db), PassRepository(db), LogRepository(db)
    registry = build_registry()
    workers = {"local": LocalWorker("local")}
    labels = {"local": "This computer"}
    queue = JobQueue(passes, batches, PassRunner(batches, passes, logs, registry, _now), workers, _now)
    service = ProductionService(batches, passes, logs, registry, _now, default_output_root, list(workers), labels)
    watches = WatchRepository(db)
    watch_service = WatchService(watches, service, time.time)
    return Production(build_router(service, watch_service), queue, WatchScheduler(watches, watch_service, time.time), service)
