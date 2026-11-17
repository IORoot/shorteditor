from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import APIRouter

from collector_server.shared.database import Database
from collector_server.shared.pipeline import PipelineUsage, StageCatalog

from .api import build_router
from .repository import PipelineRepository
from .schema import ensure_schema
from .service import PipelineService
from .usage import NoUsage


@dataclass
class PipelineStage:
    router: APIRouter
    service: PipelineService


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def build_pipeline(db: Database, catalog: StageCatalog, usage: PipelineUsage | None = None) -> PipelineStage:
    """Everything the pipeline stage needs, connected, with the first pipeline seeded."""
    ensure_schema(db)
    service = PipelineService(PipelineRepository(db), catalog, usage or NoUsage(), _now)
    service.seed()
    return PipelineStage(build_router(service), service)
