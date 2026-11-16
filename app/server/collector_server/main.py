from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .collection.api import build_router
from .collection.browser import FolderBrowser
from .collection.clock import SystemClock
from .collection.collector_repository import CollectorRepository
from .collection.database import Database
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

TICK_SECONDS = 30


def create_default_app() -> FastAPI:
    db = Database(os.environ.get("SHORT_EDITOR_DB", "short_editor.db"))
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

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        async def loop() -> None:
            while True:
                await asyncio.to_thread(scheduler.tick)
                await asyncio.sleep(TICK_SECONDS)

        task = asyncio.create_task(loop())
        yield
        task.cancel()

    app = FastAPI(title="Short Editor", lifespan=lifespan)
    app.include_router(build_router(service, FolderBrowser(), run_service))
    return app


app = create_default_app()
