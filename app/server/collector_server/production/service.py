from __future__ import annotations

import json
import os
import threading
from collections.abc import Callable

from collector_server.shared.handoff import HandoffClip, HandoffFolder, StageHandoff

from .output_paths import OutputFolderError, check_root
from .models import Batch, BatchCard, LogKind, Pass, StageInfo
from .registry import StageRegistry
from .repositories import BatchRepository, LogRepository, PassRepository
from .stage_api import StageError, StageStep
from .validation import build_settings, validate_pipeline

_WITH_STAGE = {"running", "blocked", "failed"}


class NotFoundError(Exception):
    pass


class StateError(Exception):
    """The action does not fit the pass's current status."""


class InvalidInputError(ValueError):
    """The request cannot be accepted, in words the user can act on."""


_MAX_STEPS = 30
_MAX_SETTINGS_JSON = 4000
_MAX_TEXT = 1000


class ProductionService:
    def __init__(self, batches: BatchRepository, passes: PassRepository, logs: LogRepository, registry: StageRegistry,
                 now: Callable[[], str], default_output_root: str, worker_ids: list[str]) -> None:
        self._batches, self._passes, self._logs, self._registry, self._now = batches, passes, logs, registry, now
        self._default_root, self._workers = default_output_root, worker_ids
        self._lock = threading.RLock()  # two clicks at once must not make two passes

    def stages(self) -> list[StageInfo]:
        return [
            StageInfo(key=s.key, title=s.title, transitions=dict(s.transitions), position=s.position, settings_schema=s.settings_model.model_json_schema(by_alias=True))
            for s in self._registry.all()
        ]

    def check_pipeline(self, steps: list[StageStep]) -> list[str]:
        if len(steps) > _MAX_STEPS:
            return [f"A pipeline can have at most {_MAX_STEPS} steps"]
        for step in steps:  # disabled steps are stored too, so they are held to the same limits
            if len(step.key) > 100 or len(json.dumps(step.settings)) > _MAX_SETTINGS_JSON:
                return [f"The settings of {step.key[:40]} are too large"]
            if not step.enabled and not self._known(step.key):
                return [f"There is no stage called {step.key[:40]}"]
        errors = validate_pipeline(self._registry, steps)
        if errors:
            return errors
        for step in (s for s in steps if s.enabled):
            try:
                build_settings(self._registry.get(step.key), step.settings)
            except StageError as error:
                errors.append(str(error))
        return errors

    def create_batch(self, name: str, input_folder: str, steps: list[StageStep], run_on: str, output_root: str | None) -> Batch:
        name = name.strip()
        if not name or len(name) > 120 or any(ord(c) < 32 for c in name):
            raise InvalidInputError("The batch needs a name of up to 120 characters")
        root = output_root or self._default_root
        if max(len(input_folder), len(root), len(run_on)) > _MAX_TEXT:
            raise InvalidInputError("A path or worker name is too long")
        if not os.path.isabs(input_folder):
            raise InvalidInputError("The input folder must be an absolute path")
        if not os.path.isdir(input_folder):
            raise InvalidInputError(f"The folder {input_folder} does not exist")
        try:
            check_root(root)
        except OutputFolderError as error:
            raise InvalidInputError(str(error)) from error
        source, target = os.path.realpath(input_folder), os.path.realpath(root)
        if source == os.sep:
            raise InvalidInputError("The input folder cannot be the top of the disk")
        if source == target or target.startswith(source + os.sep) or source.startswith(target + os.sep):
            raise InvalidInputError("The output folder and the input folder must not overlap")
        if run_on != "any" and run_on not in self._workers:
            raise InvalidInputError(f"There is no worker called {run_on}")
        self._require_valid(steps)
        with self._lock:
            batch = self._batches.create(name, input_folder, steps, run_on, root, self._now())
            self._passes.create(batch.id, self._now())
        return batch

    def run_again(self, batch_id: int, steps: list[StageStep] | None) -> Pass:
        with self._lock:
            batch = self._need_batch(batch_id)
            passes = self._passes.for_batch(batch_id)
            latest = passes[-1] if passes else None  # a batch left without a pass can start again
            if latest and latest.status in ("queued", "running"):
                raise StateError("This batch is already waiting or running")
            if latest and latest.status == "blocked":
                raise StateError("This batch is blocked. Choose what to do about it first")
            if steps is not None:
                self._require_valid(steps)
                self._batches.update_steps(batch.id, steps)
            return self._passes.create(batch_id, self._now(), overrides=latest.overrides if latest else None)

    def resolve_block(self, pass_id: int, choice: str) -> Pass:
        with self._lock:
            current = self._need_pass(pass_id)
            self._need_newest(current)
            if current.status != "blocked":
                raise StateError("Only a blocked pass can be resolved")
            if choice not in current.blocked_choices:
                raise InvalidInputError(f"{choice} is not one of the choices: {', '.join(current.blocked_choices)}")
            overrides = {**current.overrides, current.stage_key: {"choice": choice}}
            updated = self._passes.update(pass_id, only_if_status="blocked", status="queued", overrides=overrides, blocked_reason=None, blocked_choices=[])
            if updated is None:
                raise StateError("The pass changed while you were choosing")
            return updated

    def approve(self, pass_id: int) -> StageHandoff:
        with self._lock:
            current = self._need_pass(pass_id)
            self._need_newest(current)
            if current.status != "review" or current.output is None:
                raise StateError("Only a pass that is ready to review can be approved")
            if self._passes.update(pass_id, only_if_status="review", status="approved") is None:
                raise StateError("The pass changed while you were approving it")
        folder = os.path.dirname(current.output.path)
        clip = HandoffClip(name=os.path.basename(current.output.path), size_bytes=current.output.size_bytes)
        return StageHandoff(run_id=pass_id, stage="production", folders=[HandoffFolder(path=folder, clips=[clip])])

    def detail(self, batch_id: int) -> tuple[Batch, list[Pass]]:
        return self._need_batch(batch_id), self._passes.for_batch(batch_id)

    def logs(self, pass_id: int, kind: LogKind) -> list[str]:
        self._need_pass(pass_id)
        return self._logs.for_pass(pass_id, kind)

    def cards(self) -> list[BatchCard]:
        waiting = [p.id for p in self._passes.queued()]
        cards = []
        for batch in reversed(self._batches.list()):
            passes = self._passes.for_batch(batch.id)
            if not passes:
                continue  # a half-made batch must not break the whole board
            latest = passes[-1]
            active = [s for s in batch.steps if s.enabled]
            titles = [self._registry.get(s.key).title if self._known(s.key) else s.key for s in active]
            at_stage = latest.status in _WITH_STAGE and bool(latest.stage_key)
            cards.append(BatchCard(
                batch_id=batch.id, pass_id=latest.id, run_on=batch.run_on, started_at=latest.started_at, name=batch.name, input_folder=batch.input_folder, pipeline=titles, status=latest.status,
                stage_title=titles[latest.stage_index] if at_stage and latest.stage_index < len(titles) else "",
                stage_position=latest.stage_index + 1 if at_stage else (len(titles) if latest.status in ("review", "approved") else 0),
                stage_count=len(titles), pass_number=latest.number,
                queue_position=waiting.index(latest.id) if latest.id in waiting else None,
                blocked_reason=latest.blocked_reason, blocked_choices=latest.blocked_choices, error=latest.error, output=latest.output,
            ))
        return cards

    def _known(self, key: str) -> bool:
        try:
            self._registry.get(key)
            return True
        except KeyError:
            return False

    def _require_valid(self, steps: list[StageStep]) -> None:
        errors = self.check_pipeline(steps)
        if errors:
            raise InvalidInputError(". ".join(errors))

    def _need_batch(self, batch_id: int) -> Batch:
        batch = self._batches.get(batch_id)
        if batch is None:
            raise NotFoundError(f"There is no batch {batch_id}")
        return batch

    def _need_pass(self, pass_id: int) -> Pass:
        found = self._passes.get(pass_id)
        if found is None:
            raise NotFoundError(f"There is no pass {pass_id}")
        return found

    def _need_newest(self, current: Pass) -> None:
        if self._passes.for_batch(current.batch_id)[-1].id != current.id:
            raise StateError("A newer pass exists for this batch. Act on the newest pass")
