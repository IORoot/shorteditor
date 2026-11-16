from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api import build_router
from .browser import FolderBrowser
from .clock import SystemClock
from .collector_repository import CollectorRepository
from .database import Database
from .mover import UnavailableMover
from .run_repository import RunRepository
from .scheduler import Scheduler
from .seed import seed_demo
from .service import CollectorService
from .source_checker import LocalSourceChecker

TICK_SECONDS = 30


def create_default_app() -> FastAPI:
    db = Database(os.environ.get("SHORT_EDITOR_DB", "short_editor.db"))
    clock = SystemClock()
    collectors = CollectorRepository(db)
    runs = RunRepository(db)
    service = CollectorService(collectors, runs, clock)
    seed_demo(collectors, service.save_schedule)
    scheduler = Scheduler(collectors, runs, LocalSourceChecker(), UnavailableMover(), clock)

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
    app.include_router(build_router(service, FolderBrowser()))
    return app


app = create_default_app()
