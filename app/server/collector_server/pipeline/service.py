from __future__ import annotations

import threading
from collections.abc import Callable

from collector_server.shared.errors import InvalidInputError, NotFoundError, StateError
from collector_server.shared.pipeline import OffImpact, PipelineRef, PipelineUsage, StageCatalog, StageInfo, StageStep, UsageItem

from .models import Pipeline, PipelineDetail, PipelineSave, PipelineSummary
from .repository import PipelineRepository
from .templates import TEMPLATE_KEYS, defaults_from_schema

MAX_NAME = 120
MAX_DESCRIPTION = 300
SEED_MARKER = "seeded"
SEED_NAME = "Join clips"
SEED_DESCRIPTION = ""


def _plain(text: str) -> bool:
    return not any(ord(c) < 32 for c in text)


class PipelineService:
    def __init__(self, repo: PipelineRepository, catalog: StageCatalog, usage: PipelineUsage, now: Callable[[], str]) -> None:
        self._repo = repo
        self._catalog = catalog
        self._usage = usage
        self._now = now
        self._write = threading.RLock()  # the name check and the write must be one step

    def template(self) -> list[StageStep]:
        known = {info.key: info for info in self._catalog.stages()}
        return [StageStep(key=key, settings=defaults_from_schema(known[key].settings_schema)) for key in TEMPLATE_KEYS if key in known]

    def stages(self) -> list[StageInfo]:
        return self._catalog.stages()

    def check(self, steps: list[StageStep]) -> list[str]:
        return self._catalog.check_pipeline(steps)

    def create(self, request: PipelineSave) -> Pipeline:
        with self._write:
            name, description = self._validate(request, None)
            return self._repo.create(name, description, request.steps, self._now())

    def save(self, pipeline_id: int, request: PipelineSave) -> Pipeline:
        with self._write:
            self._need(pipeline_id)
            name, description = self._validate(request, pipeline_id)
            self._repo.update(pipeline_id, name, description, request.steps, self._now())
            return self._need(pipeline_id)

    def duplicate(self, pipeline_id: int) -> Pipeline:
        with self._write:
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

    def list(self) -> list[PipelineSummary]:
        defaults = {info.key: defaults_from_schema(info.settings_schema) for info in self._catalog.stages()}
        return [self._summary(p, defaults) for p in self._repo.list()]

    def detail(self, pipeline_id: int) -> PipelineDetail:
        found = self._need(pipeline_id)
        users = self._usage.users_of(pipeline_id)
        recent = [u for u in users if u.kind == "batch"][:5]
        return PipelineDetail(**found.model_dump(), used_by=users, recent_batches=recent)

    def off_impact(self, pipeline_id: int) -> OffImpact:
        self._need(pipeline_id)
        return self._usage.off_impact(pipeline_id)

    def delete(self, pipeline_id: int) -> None:
        found = self._need(pipeline_id)
        users = self._usage.users_of(pipeline_id)
        if users:
            raise StateError(f"{found.name} is used by {_describe(users)}. Switch it off instead")
        self._repo.delete(pipeline_id)

    def seed(self) -> None:
        """Give a new install one working pipeline, once. Deleting it is final."""
        if self._repo.get_meta(SEED_MARKER) is not None:
            return
        steps = self.template()
        if self._catalog.check_pipeline(steps):
            return
        self._repo.create(SEED_NAME, SEED_DESCRIPTION, steps, self._now())
        self._repo.set_meta(SEED_MARKER, "1")

    def get_pipeline(self, pipeline_id: int) -> PipelineRef | None:
        found = self._repo.get(pipeline_id)
        return self._ref(found) if found else None

    def enabled_pipelines(self) -> list[PipelineRef]:
        return [self._ref(p) for p in self._repo.list() if p.enabled]

    @staticmethod
    def _ref(p: Pipeline) -> PipelineRef:
        return PipelineRef(id=p.id, name=p.name, enabled=p.enabled, steps=p.steps)

    def _summary(self, p: Pipeline, defaults: dict[str, dict]) -> PipelineSummary:
        def setting(stage: str, name: str) -> float | None:
            step = next((s for s in p.steps if s.key == stage and s.enabled), None)
            if step is None:
                return None
            value = step.settings.get(name, defaults.get(stage, {}).get(name))
            return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None

        return PipelineSummary(
            id=p.id, name=p.name, description=p.description, enabled=p.enabled,
            stage_count=sum(1 for s in p.steps if s.enabled),
            max_seconds=setting("limit_length", "maxSeconds"), max_size_mb=setting("render_output", "maxSizeMb"),
            used_by=len(self._usage.users_of(p.id)), updated_at=p.updated_at,
        )

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


def _describe(users: list[UsageItem]) -> str:
    shown = ", ".join(f"{u.kind} {u.name}" for u in users[:5])
    return shown + (f" and {len(users) - 5} more" if len(users) > 5 else "")
