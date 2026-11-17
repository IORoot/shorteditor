from __future__ import annotations

import os
import threading
from collections.abc import Callable

from collector_server.shared.handoff import HandoffClip, HandoffFolder, StageHandoff

from collector_server.shared.errors import InvalidInputError, NotFoundError, StateError
from collector_server.shared.pipeline import PipelineRef, PipelineSource
from .catalog import StageLibrary
from .output_paths import OutputFolderError, check_root
from .folder_scan import Candidate, scan_parent
from .models import Batch, BatchCard, BulkCreate, BulkResult, Defaults, FolderPreview, LogKind, Pass, PipelineChoice, PreviewItem, WorkerInfo
from .pattern import check_template, compile_pattern, render_name
from .repositories import BatchRepository, LogRepository, PassRepository
from .stage_api import StageStep

_WITH_STAGE = {"running", "blocked", "failed"}


_MAX_TEXT = 1000
MAX_BULK = 200


class ProductionService:
    def __init__(self, batches: BatchRepository, passes: PassRepository, logs: LogRepository, library: StageLibrary, pipelines: PipelineSource,
                 now: Callable[[], str], default_output_root: str, worker_ids: list[str], worker_labels: dict[str, str] | None = None) -> None:
        self._batches, self._passes, self._logs, self._library, self._pipelines, self._now = batches, passes, logs, library, pipelines, now
        self._default_root, self._workers, self._labels = default_output_root, worker_ids, worker_labels or {}
        self._lock = threading.RLock()  # two clicks at once must not make two passes

    def defaults(self) -> Defaults:
        return Defaults(output_root=self._default_root, workers=[WorkerInfo(id=w, label=self._labels.get(w, w)) for w in self._workers])

    def output_path(self, pass_id: int) -> str:
        """The finished video of a pass, but only a real file inside that batch's output folder."""
        found = self._need_pass(pass_id)
        batch = self._need_batch(found.batch_id)
        real = os.path.realpath(found.output.path) if found.output else None
        if real and os.path.isfile(real) and real.startswith(os.path.realpath(batch.output_root) + os.sep):
            return real  # the checked path is the one that gets served
        raise NotFoundError("There is no video for this pass")

    def pipelines_for_choice(self) -> list[PipelineChoice]:
        """The switched-on pipelines a new batch or watch can use."""
        return [PipelineChoice(id=p.id, name=p.name, stage_count=sum(1 for s in p.steps if s.enabled)) for p in self._pipelines.enabled_pipelines()]

    def check_pipeline(self, steps: list[StageStep]) -> list[str]:
        return self._library.check_pipeline(steps)

    def pipeline_ref(self, pipeline_id: int | None) -> PipelineRef | None:
        return self._pipelines.get_pipeline(pipeline_id) if pipeline_id is not None else None

    def _usable(self, pipeline_id: int) -> PipelineRef:
        ref = self._pipelines.get_pipeline(pipeline_id)
        if ref is None:
            raise InvalidInputError("That pipeline does not exist")
        if not ref.enabled:
            raise InvalidInputError(f"Pipeline '{ref.name}' is off. Switch it on, then try again")
        return ref

    def _resolve(self, pipeline_id: int | None, steps: list[StageStep] | None) -> tuple[list[StageStep], int | None]:
        """The steps a new batch or watch runs with. Without a pipeline only old Custom watches get here, with their own steps."""
        if pipeline_id is None:
            return list(steps or []), None
        return self._usable(pipeline_id).steps, pipeline_id

    def create_batch(self, name: str, input_folder: str, pipeline_id: int | None, run_on: str, output_root: str | None,
                     steps: list[StageStep] | None = None) -> Batch:
        steps, pipeline_id = self._resolve(pipeline_id, steps)
        name = name.strip()
        if not name or len(name) > 120 or any(ord(c) < 32 for c in name):
            raise InvalidInputError("The batch needs a name of up to 120 characters")
        root = self._check_settings(steps, run_on, output_root, input_folder)
        if not os.path.isabs(input_folder):
            raise InvalidInputError("The input folder must be an absolute path")
        if not os.path.isdir(input_folder):
            raise InvalidInputError(f"The folder {input_folder} does not exist")
        self._check_apart(input_folder, root)
        with self._lock:
            stored = [] if pipeline_id is not None else steps  # a pipeline batch reads its steps from the pipeline
            batch = self._batches.create(name, input_folder, pipeline_id, stored, run_on, root, self._now())
            try:
                self._passes.create(batch.id, self._now())
            except Exception:
                self._batches.delete(batch.id)  # never leave a batch that has no pass
                raise
        return batch

    def _check_settings(self, steps: list[StageStep], run_on: str, output_root: str | None, *paths: str) -> str:
        """The checks every new batch needs, before anything is created. Returns the output folder to use."""
        root = output_root or self._default_root
        if max(len(root), len(run_on), *(len(p) for p in paths)) > _MAX_TEXT:
            raise InvalidInputError("A path or worker name is too long")
        try:
            check_root(root)
        except OutputFolderError as error:
            raise InvalidInputError(str(error)) from error
        if run_on != "any" and run_on not in self._workers:
            raise InvalidInputError(f"There is no worker called {run_on}")
        self._require_valid(steps)
        return root

    @staticmethod
    def _check_apart(input_folder: str, root: str) -> None:
        source, target = os.path.realpath(input_folder), os.path.realpath(root)
        if source == os.sep:
            raise InvalidInputError("The input folder cannot be the top of the disk")
        if source == target or target.startswith(source + os.sep) or source.startswith(target + os.sep):
            raise InvalidInputError("The output folder and the input folder must not overlap")

    @property
    def lock(self) -> threading.RLock:  # type: ignore[valid-type]
        """Held while deciding which folders get a batch, so two creators never batch the same folder."""
        return self._lock

    def check_folder_settings(self, parent: str, pattern: str, name_template: str, pipeline_id: int | None, run_on: str, output_root: str | None,
                              steps: list[StageStep] | None = None):  # noqa: ANN201
        """Everything a bulk create or a watch needs to be valid, checked before anything is saved. Returns the compiled pattern."""
        self._check_parent(parent)
        if not os.path.isdir(parent):
            raise InvalidInputError(f"The folder {parent} does not exist")
        compiled = compile_pattern(pattern)
        check_template(name_template, compiled)
        root = self._check_settings(self._resolve(pipeline_id, steps)[0], run_on, output_root, parent)
        self._check_apart(parent, root)
        return compiled

    def preview_folders(self, parent: str, pattern: str, output_root: str | None = None) -> FolderPreview:
        self._check_parent(parent)
        compiled = compile_pattern(pattern)
        if output_root:
            self._check_apart(parent, output_root)
        scan = scan_parent(parent, compiled)
        taken = self.taken_folders()
        return FolderPreview(matches=[self._item(c, taken) for c in scan.matches], not_matching=scan.not_matching, truncated=scan.truncated)

    @staticmethod
    def _check_parent(parent: str) -> None:
        if not os.path.isabs(parent):
            raise InvalidInputError("The parent folder must be an absolute path")

    def create_batches(self, request: BulkCreate) -> BulkResult:
        compiled = self.check_folder_settings(request.parent_folder, request.pattern, request.name_template, request.pipeline_id, request.run_on, request.output_root)
        scan = scan_parent(request.parent_folder, compiled)  # the slow part, done before the lock is taken
        with self._lock:  # the decision is made inside it, so two requests never create the same folder twice
            taken = self.taken_folders()
            create: list[Candidate] = []
            skipped: list[PreviewItem] = []
            for candidate in scan.matches:
                item = self._item(candidate, taken)
                if item.status == "will_create" or (item.status == "already_batched" and candidate.name in request.include):
                    create.append(candidate)
                else:
                    skipped.append(item)
            if not create:
                raise InvalidInputError("Nothing to create: every matching folder is already batched, has no videos or could not be read")
            if len(create) > MAX_BULK:
                raise InvalidInputError(f"That would create {len(create)} batches. The most at once is {MAX_BULK}; make the pattern narrower")
            created: list[Batch] = []
            try:
                for candidate in create:
                    name = render_name(request.name_template, candidate.match, candidate.name)
                    created.append(self.create_batch(name, candidate.path, request.pipeline_id, request.run_on, request.output_root))
            except Exception as error:
                raise InvalidInputError(
                    f"Created {len(created)} of {len(create)} batches, then stopped: {error}. "
                    "Run it again: folders that already have a batch are skipped"
                ) from error
        return BulkResult(created=created, skipped=skipped)

    def taken_folders(self) -> set[str]:
        return {os.path.realpath(batch.input_folder) for batch in self._batches.list()}

    @staticmethod
    def _item(candidate: Candidate, taken: set[str]) -> PreviewItem:
        if candidate.incomplete:
            status = "unreadable"
        elif candidate.clip_count == 0:
            status = "no_videos"
        else:
            status = "already_batched" if os.path.realpath(candidate.path) in taken else "will_create"
        return PreviewItem(name=candidate.name, path=candidate.path, clip_count=candidate.clip_count, status=status)

    def run_again(self, batch_id: int, pipeline_id: int | None) -> Pass:
        with self._lock:
            batch = self._need_batch(batch_id)
            passes = self._passes.for_batch(batch_id)
            latest = passes[-1] if passes else None  # a batch left without a pass can start again
            if latest and latest.status in ("queued", "running"):
                raise StateError("This batch is already waiting or running")
            if latest and latest.status == "blocked":
                raise StateError("This batch is blocked. Choose what to do about it first")
            if pipeline_id is not None:
                self._usable(pipeline_id)
                self._batches.set_pipeline(batch.id, pipeline_id)
            elif batch.pipeline_id is None:
                raise InvalidInputError("Choose a pipeline for this batch first")
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
            ref = self._pipelines.get_pipeline(batch.pipeline_id) if batch.pipeline_id is not None else None
            steps = latest.steps_used or (ref.steps if ref else batch.steps)
            active = [s for s in steps if s.enabled]
            titles = [self._library.registry.get(s.key).title if self._library.known(s.key) else s.key for s in active]
            at_stage = latest.status in _WITH_STAGE and bool(latest.stage_key)
            cards.append(BatchCard(
                batch_id=batch.id, pass_id=latest.id, pipeline_id=batch.pipeline_id, run_on=batch.run_on, started_at=latest.started_at, name=batch.name, input_folder=batch.input_folder,
                pipeline_name=ref.name if ref else None, pipeline=titles, status=latest.status,
                stage_title=titles[latest.stage_index] if at_stage and latest.stage_index < len(titles) else "",
                stage_position=latest.stage_index + 1 if at_stage else (len(titles) if latest.status in ("review", "approved") else 0),
                stage_count=len(titles), pass_number=latest.number,
                queue_position=waiting.index(latest.id) if latest.id in waiting else None,
                blocked_reason=latest.blocked_reason, blocked_choices=latest.blocked_choices, error=latest.error, output=latest.output,
            ))
        return cards

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
