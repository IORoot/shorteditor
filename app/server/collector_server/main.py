from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .collection.api import build_router
from .collection.browser import FolderBrowser
from .shared.clock import SystemClock
from .collection.collector_repository import CollectorRepository
from .shared.database import Database
from .collection.executor import TransferExecutor
from .collection.file_transfer import FileTransfer
from .collection.local_mover import LocalMover
from .collection.move_repository import MoveRepository
from .collection.planner import TransferPlanner
from .collection.run_repository import RunRepository
from .collection.run_service import RunService
from .collection.scheduler import Scheduler
from .collection.seed import seed_demo
from .collection.service import CollectorService
from .collection.source_checker import LocalSourceChecker
from .collection.undo import UndoService
from .pipeline.wiring import build_pipeline
from .settings.app_settings import OPENROUTER_KEY, OPENROUTER_MODEL, AppSettings, build_settings_router
from .production.postiz_client import PostizClient
from .production.stage_api import DEFAULT_AI_MODEL
from .settings.postiz_settings import POSTIZ_KEY, POSTIZ_URL, build_postiz_router
from .production.wiring import build_library, build_production, build_usage

TICK_SECONDS = 30
PRODUCTION_TICK_SECONDS = 2


def create_default_app() -> FastAPI:
    db_path = os.environ.get("SHORT_EDITOR_DB", "short_editor.db")
    db = Database(db_path)
    clock = SystemClock()
    collectors = CollectorRepository(db)
    runs = RunRepository(db)
    moves = MoveRepository(db)
    files = FileTransfer()
    planner = TransferPlanner(clock)
    mover = LocalMover(planner, TransferExecutor(files, moves))
    scheduler = Scheduler(
        collectors, runs, LocalSourceChecker(), mover, clock, undoable=lambda run_id: moves.count(run_id) > 0
    )
    service = CollectorService(collectors, runs, clock)
    run_service = RunService(collectors, planner, scheduler, UndoService(moves, runs, files))
    seed_demo(collectors, service.save_schedule)
    output_root = os.environ.get("SHORT_EDITOR_OUTPUT") or os.path.join(os.path.dirname(os.path.abspath(db_path)), "production_output")
    library = build_library()
    pipeline = build_pipeline(db, library, build_usage(db))  # Pipeline reads production's usage and stage library
    app_settings = AppSettings(db)

    def postiz_client() -> PostizClient | None:
        url, key = app_settings.get(POSTIZ_URL), app_settings.get(POSTIZ_KEY)
        return PostizClient(url, key) if url and key else None  # read when a card starts, so a saved change applies to the next card

    production = build_production(db, output_root, library, pipeline.service, ai_key=lambda: app_settings.get(OPENROUTER_KEY), ai_model=lambda: app_settings.get(OPENROUTER_MODEL) or DEFAULT_AI_MODEL, postiz=postiz_client)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        production.queue.recover()  # nothing can still be running now; one server process only
        async def loop() -> None:
            while True:
                await asyncio.to_thread(scheduler.tick)
                await asyncio.sleep(TICK_SECONDS)

        async def production_loop(tick) -> None:  # noqa: ANN001
            while True:
                await asyncio.to_thread(tick)
                await asyncio.sleep(PRODUCTION_TICK_SECONDS)

        tasks = [
            asyncio.create_task(loop()),
            asyncio.create_task(production_loop(production.tick_queue)),
            asyncio.create_task(production_loop(production.tick_watches)),  # its own thread: a slow scan must not delay the queue
        ]
        yield
        for task in tasks:
            task.cancel()

    app = FastAPI(title="Short Editor", lifespan=lifespan)
    app.include_router(build_router(service, FolderBrowser(), run_service))
    app.include_router(pipeline.router)
    app.include_router(production.router)
    app.include_router(build_settings_router(app_settings))
    app.include_router(build_postiz_router(app_settings))
    return app


app = create_default_app()
