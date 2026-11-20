from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query
from fastapi.responses import FileResponse

from collector_server.shared.handoff import StageHandoff

from .models import TrimsSave, ActionRequest, ActionResults, Batch, BatchesDelete, BatchesDeleted, BatchListItem, BatchUpdate, BulkCreate, BulkResult, Defaults, FolderPreview, FolderPreviewRequest, BatchCard, BatchCreate, BatchDetail, LogEntry, LogKind, LogLines, Pass, PipelineChoice, Resolve, RunAgain
from collector_server.shared.errors import guarded

from .service import ProductionService
from .watch_models import CheckResult, Enabled, WatchCreate, WatchView
from .watch_service import WatchService


Id = Annotated[int, Path(ge=1, le=2**63 - 1)]


def build_router(service: ProductionService, watch_service: WatchService | None = None) -> APIRouter:
    router = APIRouter(prefix="/api/production")

    @router.get("/defaults", response_model=Defaults)
    def defaults() -> Defaults:
        return service.defaults()

    @router.get("/passes/{pass_id}/still")
    def still(pass_id: Id, clip: Annotated[str, Query(min_length=1, max_length=260)], at: Annotated[float, Query(ge=0, allow_inf_nan=False)]) -> FileResponse:
        return FileResponse(guarded(lambda: service.still_path(pass_id, clip, at)), media_type="image/jpeg")

    @router.put("/passes/{pass_id}/trims", response_model=Pass)
    def save_trims(pass_id: Id, body: TrimsSave) -> Pass:
        return guarded(lambda: service.save_trims(pass_id, body.clip, body.trims))

    @router.delete("/passes/{pass_id}/trims/{clip}", response_model=Pass)
    def reset_trims(pass_id: Id, clip: Annotated[str, Path(min_length=1, max_length=260)]) -> Pass:
        return guarded(lambda: service.reset_trims(pass_id, clip))

    @router.get("/passes/{pass_id}/clip")
    def clip(pass_id: Id, clip: Annotated[str, Query(min_length=1, max_length=260)]) -> FileResponse:
        return FileResponse(guarded(lambda: service.clip_path(pass_id, clip)), media_type="video/mp4")

    @router.get("/passes/{pass_id}/output")
    def output(pass_id: Id) -> FileResponse:
        return FileResponse(guarded(lambda: service.output_path(pass_id)), media_type="video/mp4")

    @router.get("/passes/{pass_id}/thumbnail")
    def card_thumbnail(pass_id: Id) -> FileResponse:
        return FileResponse(guarded(lambda: service.card_thumbnail_path(pass_id)), media_type="image/jpeg")

    @router.get("/batches/{batch_id}/thumbnail")
    def thumbnail(batch_id: Id) -> FileResponse:
        return FileResponse(guarded(lambda: service.thumbnail_path(batch_id)), media_type="image/jpeg")

    @router.get("/pipelines", response_model=list[PipelineChoice])
    def pipelines() -> list[PipelineChoice]:
        return service.pipelines_for_choice()

    @router.get("/batches", response_model=list[BatchCard])
    def cards() -> list[BatchCard]:
        return service.cards()

    @router.get("/batch-list", response_model=list[BatchListItem])
    def batch_list() -> list[BatchListItem]:
        return service.batch_list()

    @router.patch("/batches/{batch_id}", response_model=Batch)
    def update_batch(batch_id: Id, request: BatchUpdate) -> Batch:
        return guarded(lambda: service.update_batch(batch_id, request.name, request.output_root, request.auto_run, request.folder_template))

    @router.post("/batches/delete", response_model=BatchesDeleted)
    def delete_batches(request: BatchesDelete) -> BatchesDeleted:
        return BatchesDeleted(deleted=guarded(lambda: service.delete_batches(request.batch_ids)))

    @router.post("/batches", response_model=Batch, status_code=201)
    def create(request: BatchCreate) -> Batch:
        return guarded(lambda: service.create_batch(request.name, request.input_folder, request.pipeline_id, request.run_on, request.output_root, auto_run=request.auto_run, folder_template=request.folder_template))

    @router.post("/folders/preview", response_model=FolderPreview)
    def preview_folders(request: FolderPreviewRequest) -> FolderPreview:
        return guarded(lambda: service.preview_folders(request.parent_folder, request.pattern, request.output_root))

    @router.post("/batches/bulk", response_model=BulkResult, status_code=201)
    def create_bulk(request: BulkCreate) -> BulkResult:
        return guarded(lambda: service.create_batches(request))

    @router.get("/batches/{batch_id}", response_model=BatchDetail)
    def detail(batch_id: Id) -> BatchDetail:
        batch, passes = guarded(lambda: service.detail(batch_id))
        return BatchDetail(batch=batch, passes=passes)

    @router.post("/batches/{batch_id}/runs", response_model=BatchDetail, status_code=201)
    def run_again(batch_id: Id, request: RunAgain) -> BatchDetail:
        guarded(lambda: service.run_again(batch_id, request.pipeline_id))
        batch, cards = guarded(lambda: service.detail(batch_id))
        return BatchDetail(batch=batch, passes=cards)

    @router.post("/batches/actions", response_model=ActionResults)
    def batch_actions(request: ActionRequest) -> ActionResults:
        return ActionResults(results=service.batch_actions(request.ids, request.action))

    @router.post("/passes/actions", response_model=ActionResults)
    def card_actions(request: ActionRequest) -> ActionResults:
        return ActionResults(results=service.card_actions(request.ids, request.action))

    @router.post("/passes/{pass_id}/resolve", response_model=Pass)
    def resolve(pass_id: Id, request: Resolve) -> Pass:
        return guarded(lambda: service.resolve_block(pass_id, request.choice, request.picks))

    @router.post("/passes/{pass_id}/approve", response_model=StageHandoff)
    def approve(pass_id: Id) -> StageHandoff:
        return guarded(lambda: service.approve(pass_id))

    @router.get("/passes/{pass_id}/logs", response_model=LogLines)
    def logs(pass_id: Id, kind: LogKind) -> LogLines:
        entries = guarded(lambda: service.log_entries(pass_id, kind))
        return LogLines(lines=[text for _, text in entries], entries=[LogEntry(at=at, text=text) for at, text in entries])

    if watch_service is not None:
        _watch_routes(router, watch_service, guarded)
    return router


def _watch_routes(router: APIRouter, watches: WatchService, guarded) -> None:  # noqa: ANN001
    @router.get("/watches", response_model=list[WatchView])
    def list_watches() -> list[WatchView]:
        return watches.list()

    @router.post("/watches", response_model=WatchView, status_code=201)
    def create_watch(request: WatchCreate) -> WatchView:
        return guarded(lambda: watches.create(request))

    @router.put("/watches/{watch_id}", response_model=WatchView)
    def update_watch(watch_id: Id, request: WatchCreate) -> WatchView:
        return guarded(lambda: watches.update(watch_id, request))

    @router.delete("/watches/{watch_id}", status_code=204)
    def delete_watch(watch_id: Id) -> None:
        guarded(lambda: watches.delete(watch_id))

    @router.post("/watches/{watch_id}/enabled", response_model=WatchView)
    def set_enabled(watch_id: Id, request: Enabled) -> WatchView:
        return guarded(lambda: watches.set_enabled(watch_id, request.enabled))

    @router.post("/watches/{watch_id}/check", response_model=CheckResult)
    def check_watch(watch_id: Id) -> CheckResult:
        return guarded(lambda: watches.check(watch_id))
