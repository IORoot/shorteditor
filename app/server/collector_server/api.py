from __future__ import annotations

from fastapi import APIRouter, FastAPI, HTTPException

from .browser import FolderBrowser
from .models import BrowseResult, Collector, CollectorConfig, FolderPreview, FolderPreviewRequest, Run, ScheduleDraft
from .service import CollectorService


def build_router(service: CollectorService, browser: FolderBrowser) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/collectors", response_model=list[Collector])
    def list_collectors() -> list[Collector]:
        return service.list_collectors()

    @router.get("/collectors/{collector_id}", response_model=Collector)
    def get_collector(collector_id: int) -> Collector:
        collector = service.get_collector(collector_id)
        if collector is None:
            raise HTTPException(status_code=404, detail="Collector not found")
        return collector

    @router.put("/collectors/{collector_id}", response_model=Collector)
    def update_config(collector_id: int, config: CollectorConfig) -> Collector:
        try:
            collector = service.update_config(collector_id, config)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        if collector is None:
            raise HTTPException(status_code=404, detail="Collector not found")
        return collector

    @router.get("/collectors/{collector_id}/runs", response_model=list[Run])
    def list_runs(collector_id: int) -> list[Run]:
        runs = service.list_runs(collector_id)
        if runs is None:
            raise HTTPException(status_code=404, detail="Collector not found")
        return runs

    @router.put("/collectors/{collector_id}/schedule", response_model=Collector)
    def save_schedule(collector_id: int, draft: ScheduleDraft) -> Collector:
        try:
            collector = service.save_schedule(collector_id, draft)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        if collector is None:
            raise HTTPException(status_code=404, detail="Collector not found")
        return collector

    @router.post("/preview/folder", response_model=FolderPreview)
    def preview_folder(request: FolderPreviewRequest) -> FolderPreview:
        try:
            return service.preview_folder(request)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @router.get("/fs/browse", response_model=BrowseResult)
    def browse(path: str | None = None) -> BrowseResult:
        try:
            return browser.list(path)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except FileNotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except PermissionError as error:
            raise HTTPException(status_code=403, detail="Permission denied") from error

    return router


def create_app(service: CollectorService, browser: FolderBrowser | None = None) -> FastAPI:
    app = FastAPI(title="Short Editor")
    app.include_router(build_router(service, browser or FolderBrowser()))
    return app
