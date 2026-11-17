from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path
from fastapi.responses import FileResponse

from collector_server.shared.handoff import StageHandoff

from .models import Batch, Defaults, BatchCard, BatchCreate, BatchDetail, LogKind, LogLines, Pass, Resolve, RunAgain, StageInfo, ValidateRequest, ValidateResult
from .service import InvalidInputError, NotFoundError, ProductionService, StateError


Id = Annotated[int, Path(ge=1, le=2**63 - 1)]


def build_router(service: ProductionService) -> APIRouter:
    router = APIRouter(prefix="/api/production")

    def guarded(call):  # noqa: ANN001, ANN202 - turn the service's errors into HTTP answers
        try:
            return call()
        except NotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except StateError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except InvalidInputError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @router.get("/defaults", response_model=Defaults)
    def defaults() -> Defaults:
        return service.defaults()

    @router.get("/passes/{pass_id}/output")
    def output(pass_id: Id) -> FileResponse:
        return FileResponse(guarded(lambda: service.output_path(pass_id)), media_type="video/mp4")

    @router.get("/stages", response_model=list[StageInfo])
    def stages() -> list[StageInfo]:
        return service.stages()

    @router.post("/pipelines/validate", response_model=ValidateResult)
    def validate(request: ValidateRequest) -> ValidateResult:
        return ValidateResult(errors=service.check_pipeline(request.steps))

    @router.get("/batches", response_model=list[BatchCard])
    def cards() -> list[BatchCard]:
        return service.cards()

    @router.post("/batches", response_model=Batch, status_code=201)
    def create(request: BatchCreate) -> Batch:
        return guarded(lambda: service.create_batch(request.name, request.input_folder, request.steps, request.run_on, request.output_root))

    @router.get("/batches/{batch_id}", response_model=BatchDetail)
    def detail(batch_id: Id) -> BatchDetail:
        batch, passes = guarded(lambda: service.detail(batch_id))
        return BatchDetail(batch=batch, passes=passes)

    @router.post("/batches/{batch_id}/passes", response_model=Pass, status_code=201)
    def run_again(batch_id: Id, request: RunAgain) -> Pass:
        return guarded(lambda: service.run_again(batch_id, request.steps))

    @router.post("/passes/{pass_id}/resolve", response_model=Pass)
    def resolve(pass_id: Id, request: Resolve) -> Pass:
        return guarded(lambda: service.resolve_block(pass_id, request.choice))

    @router.post("/passes/{pass_id}/approve", response_model=StageHandoff)
    def approve(pass_id: Id) -> StageHandoff:
        return guarded(lambda: service.approve(pass_id))

    @router.get("/passes/{pass_id}/logs", response_model=LogLines)
    def logs(pass_id: Id, kind: LogKind) -> LogLines:
        return LogLines(lines=guarded(lambda: service.logs(pass_id, kind)))

    return router
