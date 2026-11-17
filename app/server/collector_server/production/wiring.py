from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import APIRouter

from collector_server.shared.database import Database

from .api import build_router
from .builtin import build_registry
from .queue import JobQueue
from .repositories import BatchRepository, LogRepository, PassRepository
from .runner import PassRunner
from .schema import ensure_schema
from .service import ProductionService
from .worker import LocalWorker


@dataclass
class Production:
    router: APIRouter
    queue: JobQueue

    def tick(self) -> None:
        """Start whatever can start. One failing tick must not stop production for good."""
        try:
            self.queue.tick()
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
    queue = JobQueue(passes, batches, PassRunner(batches, passes, logs, registry, _now), workers, _now)
    service = ProductionService(batches, passes, logs, registry, _now, default_output_root, list(workers))
    return Production(build_router(service), queue)
