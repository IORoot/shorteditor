from __future__ import annotations

from collections.abc import Callable

from collector_server.shared.errors import InvalidInputError, NotFoundError
from collector_server.shared.pipeline import OffImpact, PipelineUsage, StageCatalog, StageInfo, StageStep

from .models import Pipeline, PipelineSave
from .repository import PipelineRepository
from .templates import TEMPLATE_KEYS, defaults_from_schema

MAX_NAME = 120
MAX_DESCRIPTION = 300


def _plain(text: str) -> bool:
    return not any(ord(c) < 32 for c in text)


class PipelineService:
    def __init__(self, repo: PipelineRepository, catalog: StageCatalog, usage: PipelineUsage, now: Callable[[], str]) -> None:
        self._repo = repo
        self._catalog = catalog
        self._usage = usage
        self._now = now

    def template(self) -> list[StageStep]:
        known = {info.key: info for info in self._catalog.stages()}
        return [StageStep(key=key, settings=defaults_from_schema(known[key].settings_schema)) for key in TEMPLATE_KEYS if key in known]

    def stages(self) -> list[StageInfo]:
        return self._catalog.stages()

    def check(self, steps: list[StageStep]) -> list[str]:
        return self._catalog.check_pipeline(steps)

    def create(self, request: PipelineSave) -> Pipeline:
        name, description = self._validate(request, None)
        return self._repo.create(name, description, request.steps, self._now())

    def save(self, pipeline_id: int, request: PipelineSave) -> Pipeline:
        self._need(pipeline_id)
        name, description = self._validate(request, pipeline_id)
        self._repo.update(pipeline_id, name, description, request.steps, self._now())
        return self._need(pipeline_id)

    def duplicate(self, pipeline_id: int) -> Pipeline:
        original = self._need(pipeline_id)
        taken = self._taken_names(None)
        number = 1
        while True:
            suffix = " copy" if number == 1 else f" copy {number}"
            name = original.name[: MAX_NAME - len(suffix)].rstrip() + suffix
            if name.casefold() not in taken:
                break
            number += 1
        return self._repo.create(name, original.description, original.steps, self._now())

    def set_enabled(self, pipeline_id: int, enabled: bool) -> Pipeline:
        self._need(pipeline_id)
        self._repo.set_enabled(pipeline_id, enabled)
        return self._need(pipeline_id)

    def _validate(self, request: PipelineSave, own_id: int | None) -> tuple[str, str]:
        name, description = request.name.strip(), request.description.strip()
        if not name or len(name) > MAX_NAME or not _plain(name):
            raise InvalidInputError("The pipeline needs a name of up to 120 characters")
        if name.casefold() in self._taken_names(own_id):
            raise InvalidInputError(f"There is already a pipeline called {name}")
        if len(description) > MAX_DESCRIPTION or not _plain(description):
            raise InvalidInputError("The description can be up to 300 characters")
        errors = self._catalog.check_pipeline(request.steps)
        if errors:
            raise InvalidInputError(". ".join(errors))
        return name, description

    def _taken_names(self, own_id: int | None) -> set[str]:
        return {p.name.strip().casefold() for p in self._repo.list() if p.id != own_id}

    def _need(self, pipeline_id: int) -> Pipeline:
        found = self._repo.get(pipeline_id)
        if found is None:
            raise NotFoundError(f"There is no pipeline {pipeline_id}")
        return found
