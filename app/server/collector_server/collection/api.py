from __future__ import annotations

from fastapi import APIRouter, FastAPI, HTTPException

from .browser import FolderBrowser
from .models import ActiveRequest, BrowseResult, Collector, CollectorConfig, CollectorCreate, FilterPreviewResult, FolderPreview, FolderPreviewRequest, PlanResult, Run, ScheduleDraft
from .presenters import present_plan, present_run
from .run_service import RunService
from .service import CollectorService


def build_router(service: CollectorService, browser: FolderBrowser, runs: RunService | None = None) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/collectors", response_model=list[Collector])
    def list_collectors() -> list[Collector]:
        return service.list_collectors()

    @router.post("/collectors", response_model=Collector, status_code=201)
    def create_collector(request: CollectorCreate) -> Collector:
        try:
            return service.create_collector(request)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @router.put("/collectors/{collector_id}/active", response_model=Collector)
    def set_active(collector_id: int, request: ActiveRequest) -> Collector:
        collector = service.set_active(collector_id, request.active)
        if collector is None:
            raise HTTPException(status_code=404, detail="Collector not found")
        return collector

    @router.post("/collectors/{collector_id}/duplicate", response_model=Collector, status_code=201)
    def duplicate_collector(collector_id: int) -> Collector:
        collector = service.duplicate_collector(collector_id)
        if collector is None:
            raise HTTPException(status_code=404, detail="Collector not found")
        return collector

    @router.delete("/collectors/{collector_id}", status_code=204)
    def delete_collector(collector_id: int) -> None:
        try:
            deleted = service.delete_collector(collector_id)
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        if deleted is None:
            raise HTTPException(status_code=404, detail="Collector not found")

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

    @router.post("/preview/filters", response_model=FilterPreviewResult)
    def preview_filters(config: CollectorConfig) -> FilterPreviewResult:
        try:
            return service.preview_filters(config)
        except (ValueError, FileNotFoundError) as error:
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

    if runs is not None:
        _add_run_routes(router, runs)
    return router


def _add_run_routes(router: APIRouter, runs: RunService) -> None:
    @router.post("/collectors/{collector_id}/dry-run", response_model=PlanResult)
    def dry_run(collector_id: int) -> PlanResult:
        try:
            result = runs.dry_run(collector_id)
        except (ValueError, FileNotFoundError) as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        if result is None:
            raise HTTPException(status_code=404, detail="Collector not found")
        record, plan = result
        return present_plan(plan, record.transfer)

    @router.post("/collectors/{collector_id}/run", response_model=Run, status_code=202)
    def start_run(collector_id: int) -> Run:
        try:
            run = runs.start_run(collector_id)
        except (ValueError, FileNotFoundError) as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        if run is None:
            raise HTTPException(status_code=404, detail="Collector not found")
        return present_run(run)

    @router.post("/runs/{run_id}/undo", response_model=Run)
    def undo_run(run_id: int) -> Run:
        try:
            return present_run(runs.undo(run_id))
        except LookupError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error


def create_app(service: CollectorService, browser: FolderBrowser | None = None, runs: RunService | None = None) -> FastAPI:
    app = FastAPI(title="Short Editor")
    app.include_router(build_router(service, browser or FolderBrowser(), runs))
    return app
