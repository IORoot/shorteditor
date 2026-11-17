from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Response

from collector_server.shared.errors import guarded
from collector_server.shared.pipeline import OffImpact, StageInfo

from .models import CheckRequest, CheckResult, Enabled, Pipeline, PipelineDetail, PipelineSave, PipelineSummary, Template
from .service import PipelineService

Id = Annotated[int, Path(ge=1, le=2**63 - 1)]


def build_router(service: PipelineService) -> APIRouter:
    router = APIRouter(prefix="/api/pipeline")

    @router.get("/pipelines", response_model=list[PipelineSummary])
    def list_pipelines() -> list[PipelineSummary]:
        return service.list()

    @router.post("/pipelines", response_model=Pipeline, status_code=201)
    def create(request: PipelineSave) -> Pipeline:
        return guarded(lambda: service.create(request))

    @router.get("/pipelines/{pipeline_id}", response_model=PipelineDetail)
    def detail(pipeline_id: Id) -> PipelineDetail:
        return guarded(lambda: service.detail(pipeline_id))

    @router.put("/pipelines/{pipeline_id}", response_model=Pipeline)
    def save(pipeline_id: Id, request: PipelineSave) -> Pipeline:
        return guarded(lambda: service.save(pipeline_id, request))

    @router.post("/pipelines/{pipeline_id}/enabled", response_model=Pipeline)
    def set_enabled(pipeline_id: Id, request: Enabled) -> Pipeline:
        return guarded(lambda: service.set_enabled(pipeline_id, request.enabled))

    @router.get("/pipelines/{pipeline_id}/impact", response_model=OffImpact)
    def impact(pipeline_id: Id) -> OffImpact:
        return guarded(lambda: service.off_impact(pipeline_id))

    @router.post("/pipelines/{pipeline_id}/duplicate", response_model=Pipeline, status_code=201)
    def duplicate(pipeline_id: Id) -> Pipeline:
        return guarded(lambda: service.duplicate(pipeline_id))

    @router.delete("/pipelines/{pipeline_id}", status_code=204)
    def delete(pipeline_id: Id) -> Response:
        guarded(lambda: service.delete(pipeline_id))
        return Response(status_code=204)

    @router.get("/template", response_model=Template)
    def template() -> Template:
        return Template(steps=service.template())

    @router.get("/stages", response_model=list[StageInfo])
    def stages() -> list[StageInfo]:
        return service.stages()

    @router.post("/check", response_model=CheckResult)
    def check(request: CheckRequest) -> CheckResult:
        return CheckResult(errors=service.check(request.steps))

    return router
