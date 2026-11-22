from __future__ import annotations

import os
import re
import threading
import time
from collections.abc import Callable

from collector_server.shared.handoff import HandoffClip, HandoffFolder, StageHandoff

from collector_server.shared.errors import InvalidInputError, NotFoundError, StateError
from collector_server.shared.pipeline import PipelineRef, PipelineSource
from .catalog import StageLibrary
from .output_paths import OutputFolderError, check_folder_template, check_root
from .folder_scan import Candidate, scan_parent
from .models import DEFAULT_FOLDER_TEMPLATE, ActionResult, Batch, BatchCard, TrimBody, BatchListItem, BulkCreate, BulkResult, Defaults, ExportRecord, FolderPreview, LogKind, Pass, PipelineChoice, PreviewItem, Run, WorkerInfo
from .pattern import check_template, compile_pattern, render_name
from .export_repository import ExportRepository
from .stage_api import POST_IT, TRY_AGAIN
from .repositories import BatchRepository, LogRepository, PassRepository, RunRepository
from .stage_api import StageStep
from . import stills
from .thumbnail import first_clip, make_thumbnail

_WITH_STAGE = {"running", "blocked", "failed"}


_MAX_TEXT = 1000
# which card statuses each action applies to, and how the action reads in a message
_ACTS_ON = {
    "queued": ("pause", "stop"),
    "held": ("resume", "stop"),
    "running": ("pause", "stop"),
    "paused": ("resume", "stop"),
    "stopped": ("resume",),
    "blocked": ("stop",),
}
_PAST = {"pause": "paused", "resume": "resumed", "stop": "stopped", "rerun": "run again", "delete": "deleted"}
# the card's fields back to a fresh queued card; its folder, choices and output folder stay
_FRESH = {"stage_index": 0, "stage_key": "", "stages": [], "blocked_reason": None, "blocked_choices": [], "blocked_items": [],
          "error": None, "output": None, "started_at": None, "finished_at": None}


def _inherited(overrides: dict[str, dict]) -> dict[str, dict]:
    """What a card's folder keeps into a new run: its choices, except picks (for one run's clips) and an export's approval and caption."""
    kept = {}
    for stage, setting in overrides.items():
        if "picks" in setting:
            continue
        if "caption_override" in setting or setting.get("choice") in (POST_IT, TRY_AGAIN):
            setting = {name: value for name, value in setting.items() if name not in ("choice", "caption_override")}
        if setting:
            kept[stage] = setting
    return kept


class ProductionService:
    def __init__(self, batches: BatchRepository, passes: PassRepository, logs: LogRepository, library: StageLibrary, pipelines: PipelineSource,
                 now: Callable[[], str], default_output_root: str, worker_ids: list[str], worker_labels: dict[str, str] | None = None,
                 runs: RunRepository | None = None, exports: ExportRepository | None = None, clock: Callable[[], float] = time.time) -> None:
        self._clock = clock  # epoch seconds, for how long a new folder has been quiet
        self._batches, self._passes, self._logs, self._library, self._pipelines, self._now = batches, passes, logs, library, pipelines, now
        self._runs = runs or RunRepository(passes.db)
        self._exports = exports or ExportRepository(passes.db, now)
        self._default_root, self._workers, self._labels = default_output_root, worker_ids, worker_labels or {}
        self._lock = threading.RLock()  # two clicks at once must not make two passes

    def exports(self) -> list[ExportRecord]:
        return self._exports.list_all()

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

    def thumbnail_path(self, batch_id: int) -> str:
        """A still from the first clip of a batch, made once and kept in the batch's output folder."""
        batch = self._need_batch(batch_id)
        target = os.path.join(batch.output_root, ".thumbnails", f"batch-{batch.id}.jpg")
        if os.path.isfile(target):
            return target
        clip = first_clip(batch.input_folder)
        if clip is None or not make_thumbnail(clip, target):
            raise NotFoundError("There is no picture for this batch yet")
        return target

    def still_path(self, pass_id: int, clip: str, at: float) -> str:
        """A picture of one clip of the card at a time in it. Only clips the scan found are allowed; the file is made once and kept."""
        card = self._need_pass(pass_id)
        batch = self._need_batch(card.batch_id)
        found = self._scanned_clip(card, clip)
        if not 0 <= at < found["length"]:
            raise InvalidInputError(f"{clip} is {found['length']:.1f} s long. Pick a time inside it")
        source = stills.find_clip(card.folder or batch.input_folder, clip)
        if source is None:
            raise NotFoundError(f"{clip} is no longer in the card's folder")
        target = stills.still_path(batch.output_root, pass_id, clip, at)
        if os.path.isfile(target):
            return target
        if not stills.make_still(source, at, target):
            raise NotFoundError("There is no picture at this time")
        return target

    def clip_path(self, pass_id: int, clip: str) -> str:
        """The file of one clip of the card, for playing it in the editor. Only clips the scan found are served."""
        card = self._need_pass(pass_id)
        batch = self._need_batch(card.batch_id)
        self._scanned_clip(card, clip)
        source = stills.find_clip(card.folder or batch.input_folder, clip)
        if source is None:
            raise NotFoundError(f"{clip} is no longer in the card's folder")
        return source

    def save_trims(self, pass_id: int, clip: str, trims: list[TrimBody]) -> Pass:
        """Replaces this clip's own trims on the card. They are checked against the clip's length and each other."""
        with self._lock:
            current = self._need_pass(pass_id)
            self._need_newest(current)
            if current.status == "running":
                raise StateError("Wait for the card to stop before you change its trims")
            length = self._scanned_clip(current, clip)["length"]
            ranges = sorted(((t.start, t.end) for t in trims), key=lambda r: r[0])
            for start, end in ranges:
                if not 0 <= start < end <= length:
                    raise InvalidInputError(f"A trim of {clip} must start and end inside the {length:.1f} s clip, and end after it starts")
            for (_, first_end), (second_start, _) in zip(ranges, ranges[1:]):
                if second_start < first_end:
                    raise InvalidInputError(f"Two trims of {clip} overlap. Make them separate")
            return self._write_trims(current, clip, [{"start": s, "end": e} for s, e in ranges])

    def reset_trims(self, pass_id: int, clip: str) -> Pass:
        """Drops this clip's own trims, so the render uses the AI's parts for it again."""
        with self._lock:
            current = self._need_pass(pass_id)
            self._need_newest(current)
            if current.status == "running":
                raise StateError("Wait for the card to stop before you change its trims")
            self._scanned_clip(current, clip)
            return self._write_trims(current, clip, None)

    def _write_trims(self, current: Pass, clip: str, ranges: list[dict] | None) -> Pass:
        overrides = {key: dict(value) for key, value in current.overrides.items()}
        kept = dict((overrides.get("apply_trims") or {}).get("trims", {}))
        if ranges:
            kept[clip] = ranges
        else:
            kept.pop(clip, None)
        if kept:
            overrides["apply_trims"] = {"trims": kept}
        else:
            overrides.pop("apply_trims", None)
        updated = self._passes.update(current.id, overrides=overrides)
        if updated is None:
            raise StateError("The card changed while you were saving. Try again")
        return updated

    @staticmethod
    def _scanned_clip(card: Pass, clip: str) -> dict:
        """The scan's entry for one clip of the card, or NotFoundError when the card has no such clip."""
        scan = next((stage for stage in card.stages if stage.key == "scan_folder"), None)
        listed = (scan.details or {}).get("clips", []) if scan else []
        found = next((item for item in listed if item["name"] == clip), None)
        if found is None:
            raise NotFoundError(f"{clip} is not a clip of this card")
        return found

    def card_thumbnail_path(self, pass_id: int) -> str:
        """A still from the first clip in the card's own folder, made once and kept in the batch's output folder."""
        card = self._need_pass(pass_id)
        batch = self._need_batch(card.batch_id)
        target = os.path.join(batch.output_root, ".thumbnails", f"card-{card.id}.jpg")
        if os.path.isfile(target):
            return target
        clip = first_clip(card.folder or batch.input_folder)
        if clip is None or not make_thumbnail(clip, target):
            raise NotFoundError("There is no picture for this card yet")
        return target

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
                     steps: list[StageStep] | None = None, folders: list[str] | None = None, folder_pattern: str | None = None,
                     auto_run: bool = True, folder_template: str | None = None, ignore_subfolders: bool = False,
                     watching: bool = False, watch_interval_minutes: int = 5, watch_settle_minutes: int = 10, watch_max_per_check: int = 20) -> Batch:
        steps, pipeline_id = self._resolve(pipeline_id, steps)
        name = name.strip()
        if not name or len(name) > 120 or any(ord(c) < 32 for c in name):
            raise InvalidInputError("The batch needs a name of up to 120 characters")
        template = self._checked_template(folder_template)
        root = self._check_settings(steps, run_on, output_root, input_folder)
        if not os.path.isabs(input_folder):
            raise InvalidInputError("The input folder must be an absolute path")
        if not os.path.isdir(input_folder):
            raise InvalidInputError(f"The folder {input_folder} does not exist")
        self._check_apart(input_folder, root)
        if folders is None:
            folders = self._card_folders(input_folder)  # the scan is slow, so it is done before the lock is taken
        with self._lock:
            stored = [] if pipeline_id is not None else steps  # a pipeline batch reads its steps from the pipeline
            batch = self._batches.create(name, input_folder, pipeline_id, stored, run_on, root, self._now(), folder_pattern, auto_run, template, ignore_subfolders,
                                         watching, watch_interval_minutes, watch_settle_minutes, watch_max_per_check)
            try:
                self._start_run(batch, folders)
            except Exception:
                self._batches.delete(batch.id)  # never leave a batch that has no card
                raise
        return batch

    @staticmethod
    def _folders_with_videos(scan) -> list[str]:  # noqa: ANN001
        """Each folder that has videos and could be read fully, once even when two links point at it."""
        seen: set[str] = set()
        folders: list[str] = []
        for c in scan.matches:
            real = os.path.realpath(c.path)
            if c.clip_count == 0 or c.incomplete or c.name.startswith(".") or real in seen:
                continue
            seen.add(real)
            folders.append(c.path)
        return folders

    @classmethod
    def _card_folders(cls, input_folder: str) -> list[str]:
        """One card per sub-folder that holds videos. A folder with no such sub-folder is one card itself."""
        folders = cls._folders_with_videos(scan_parent(input_folder, re.compile(".*")))
        return folders or [input_folder]

    def _batch_folders(self, batch: Batch) -> list[str]:
        """A batch made from many folders runs the folders its pattern matches now; any other batch runs its sub-folders."""
        if batch.ignore_subfolders:
            return [batch.input_folder]
        if batch.folder_pattern is None:
            return self._card_folders(batch.input_folder)
        folders = self._folders_with_videos(scan_parent(batch.input_folder, compile_pattern(batch.folder_pattern)))
        if not folders:
            raise InvalidInputError("No folder matches this batch's pattern any more, so there is nothing to run")
        return folders

    def _start_run(self, batch: Batch, folders: list[str], overrides: dict[str, dict[str, dict]] | None = None) -> Run:
        """A new run with one card per folder: queued when the batch runs by itself, held until started when not.
        The batch's older runs are removed; their output files stay on disk. Call with the lock held."""
        run = self._runs.create(batch.id, self._now())
        status = "queued" if batch.auto_run else "held"
        for folder in folders:
            self._passes.create(batch.id, self._now(), (overrides or {}).get(folder), run_id=run.id, folder=folder, status=status)
        self._runs.delete_except(batch.id, run.id)
        return run

    @staticmethod
    def _checked_template(folder_template: str | None) -> str:
        """The folder name template to store: the default when none is given, otherwise one that passes the checks."""
        template = (folder_template or "").strip() or DEFAULT_FOLDER_TEMPLATE  # empty means the default, as for the output folder
        try:
            check_folder_template(template)
        except OutputFolderError as error:
            raise InvalidInputError(str(error)) from error
        return template

    def _check_settings(self, steps: list[StageStep], run_on: str, output_root: str | None, *paths: str) -> str:
        """The checks every new batch needs, before anything is created. Returns the output folder to use."""
        root = output_root or (self.default_output_for(paths[0]) if paths else self._default_root)
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

    def default_output_for(self, input_folder: str) -> str:
        """Where output goes when none is chosen: an "output" folder beside the input folder, never inside it."""
        parent = os.path.dirname(os.path.normpath(input_folder))
        return os.path.join(parent, "output") if parent and parent != os.sep else self._default_root

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
        return FolderPreview(matches=[self._item(c, taken, self._parent_batched(parent, taken)) for c in scan.matches],
                             not_matching=scan.not_matching, truncated=scan.truncated)

    @staticmethod
    def _check_parent(parent: str) -> None:
        if not os.path.isabs(parent):
            raise InvalidInputError("The parent folder must be an absolute path")

    def create_batches(self, request: BulkCreate) -> BulkResult:
        # One batch for the parent folder. Each folder the pattern matches that has videos is a card.
        # Ignoring subfolders makes the parent folder the one card, and the pattern is not used.
        pattern = "^.+$" if request.ignore_subfolders else request.pattern
        if request.watching:
            self._check_watch(request.ignore_subfolders, request.watch_interval_minutes, request.watch_settle_minutes, request.watch_max_per_check)
        compiled = self.check_folder_settings(request.parent_folder, pattern, request.name_template, request.pipeline_id, request.run_on, request.output_root)
        check_template(request.name_template, re.compile(""))  # the batch is named once, from the parent folder, so only {name} can be used
        scan = None if request.ignore_subfolders else scan_parent(request.parent_folder, compiled)  # the slow part, done before the lock is taken
        folders = [request.parent_folder] if scan is None else self._folders_with_videos(scan)
        parent_name = os.path.basename(os.path.normpath(request.parent_folder))
        name = request.name.strip() if request.name and request.name.strip() else render_name(request.name_template, re.match("", ""), parent_name)
        with self._lock:  # the check and the creation are one step, so two requests never make the same batch
            taken = self.taken_folders()
            if self._parent_batched(request.parent_folder, taken):
                raise InvalidInputError("This folder already has a batch. Run that batch again to pick up new folders")
            folders = [f for f in folders if os.path.realpath(f) not in taken]  # a folder already in a batch stays in that batch
            if request.watching and not request.watch_existing:
                folders = []  # the folders already there are skipped for good; only ones that appear later become cards
            elif not folders:
                raise InvalidInputError("Nothing to create: no folder that matches the pattern has videos or is not already batched")
            batch = self.create_batch(name, request.parent_folder, request.pipeline_id, request.run_on, request.output_root,
                                      folders=folders, folder_pattern=None if request.ignore_subfolders else request.pattern, auto_run=request.auto_run,
                                      folder_template=request.folder_template, ignore_subfolders=request.ignore_subfolders, watching=request.watching,
                                      watch_interval_minutes=request.watch_interval_minutes, watch_settle_minutes=request.watch_settle_minutes,
                                      watch_max_per_check=request.watch_max_per_check)
            if request.watching:
                self._batches.mark_seen(batch.id, folders, self._now())  # a card deleted later is not added again by the watch
                if not request.watch_existing and scan is not None:
                    self._skip_settled(batch, scan)
        if scan is None:
            return BulkResult(created=[batch], skipped=[])
        chosen = set(folders)
        skipped = [self._item(c, taken, batched=False) for c in scan.matches if c.path not in chosen]
        return BulkResult(created=[batch], skipped=skipped)

    def _check_watch(self, ignore_subfolders: bool, interval: int | None, settle: int | None, per_check: int | None) -> None:
        if ignore_subfolders:
            raise InvalidInputError("Only a batch made from subfolders can keep watching")
        for value, low, high, what in ((interval, 1, 1440, "The check interval"), (settle, 0, 1440, "The settle time"), (per_check, 1, 100, "The most folders per check")):
            if value is not None and not low <= value <= high:
                raise InvalidInputError(f"{what} must be between {low} and {high}")

    def _skip_settled(self, batch: Batch, scan) -> None:  # noqa: ANN001
        """The folders already there, and settled, are not for the watch to add later. Ones still being copied stay eligible."""
        settled = [c.path for c in scan.matches if c.clip_count > 0 and not c.incomplete and (c.newest_change is None or self._clock() - c.newest_change >= batch.watch_settle_minutes * 60)]
        self._batches.mark_seen(batch.id, settled, self._now())

    def add_cards(self, batch_id: int, folders: list[str]) -> int:
        """New cards in the batch's newest run, queued when the batch runs by itself and held when not. Used by a batch's watch."""
        with self._lock:
            batch = self._need_batch(batch_id)
            run = self._runs.latest(batch_id) or self._runs.create(batch_id, self._now())
            status = "queued" if batch.auto_run else "held"
            for folder in folders:
                self._passes.create(batch.id, self._now(), None, run_id=run.id, folder=folder, status=status)
            self._batches.mark_seen(batch_id, folders, self._now())
            return len(folders)

    def taken_folders(self) -> set[str]:
        """Every folder a batch already covers: each batch's input folder and each card's folder."""
        folders = {os.path.realpath(batch.input_folder) for batch in self._batches.list()}
        return folders | {os.path.realpath(folder) for folder in self._passes.folders()}

    @staticmethod
    def _parent_batched(parent: str, taken: set[str]) -> bool:
        return os.path.realpath(parent) in taken

    @staticmethod
    def _item(candidate: Candidate, taken: set[str], batched: bool) -> PreviewItem:
        if candidate.incomplete:
            status = "unreadable"
        elif candidate.clip_count == 0:
            status = "no_videos"
        elif batched or os.path.realpath(candidate.path) in taken:
            status = "already_batched"
        else:
            status = "will_create"
        return PreviewItem(name=candidate.name, path=candidate.path, clip_count=candidate.clip_count, status=status)

    def run_again(self, batch_id: int, pipeline_id: int | None) -> Run:
        with self._lock:
            batch = self._need_batch(batch_id)
            latest = self._runs.latest(batch_id)  # a batch left without a run can start again
            cards = self._passes.for_run(latest.id) if latest else []
            if any(c.status in ("queued", "running") for c in cards):
                raise StateError("This batch is waiting or running. Pause or stop it first")
            if pipeline_id is not None:
                self._usable(pipeline_id)
                self._batches.set_pipeline(batch.id, pipeline_id)
            elif batch.pipeline_id is None:
                raise InvalidInputError("Choose a pipeline for this batch first")
            # Each card keeps its folder's choices, except picks, which were for one run's clips.
            inherited = {c.folder: _inherited(c.overrides) for c in cards}
            return self._start_run(batch, self._batch_folders(batch), inherited)

    def resolve_block(self, pass_id: int, choice: str, picks: list[int] | None = None, caption: str | None = None) -> Pass:
        with self._lock:
            current = self._need_pass(pass_id)
            self._need_newest(current)
            if current.status != "blocked":
                raise StateError("Only a blocked pass can be resolved")
            if choice not in current.blocked_choices:
                raise InvalidInputError(f"{choice} is not one of the choices: {', '.join(current.blocked_choices)}")
            if picks is not None and (not picks or not all(0 <= i < len(current.blocked_items) for i in picks)):
                raise InvalidInputError("Pick clips from the list shown")
            setting = {"picks": sorted(set(picks))} if picks is not None else {"choice": choice}
            if caption is not None:
                setting["caption_override"] = caption
            overrides = {**current.overrides, current.stage_key: {**current.overrides.get(current.stage_key, {}), **setting}}  # a caption edited earlier stays
            updated = self._passes.update(pass_id, only_if_status="blocked", status="queued", overrides=overrides, blocked_reason=None, blocked_choices=[], blocked_items=[])
            if updated is None:
                raise StateError("The pass changed while you were choosing")
            if choice == TRY_AGAIN:
                self._exports.mark_checked(pass_id)
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
        """The batch and the cards of its newest run."""
        batch = self._need_batch(batch_id)
        latest = self._runs.latest(batch_id)
        return batch, self._passes.for_run(latest.id) if latest else []

    def logs(self, pass_id: int, kind: LogKind) -> list[str]:
        self._need_pass(pass_id)
        return self._logs.for_pass(pass_id, kind)

    def log_entries(self, pass_id: int, kind: LogKind) -> list[tuple[str, str]]:
        self._need_pass(pass_id)
        return self._logs.entries(pass_id, kind)

    def update_batch(self, batch_id: int, name: str | None, output_root: str | None, auto_run: bool | None = None,
                     folder_template: str | None = None, pipeline_id: int | None = None, run_on: str | None = None,
                     watching: bool | None = None, watch_interval_minutes: int | None = None, watch_settle_minutes: int | None = None,
                     watch_max_per_check: int | None = None) -> Batch:
        """Everything a batch is set up with changes at once, except its input folder. The pipeline and worker change only while no card
        is waiting or running, and take effect on the next run. The output folder and folder name can change only while no card
        has a finished video, so every video that is kept can still be served from the folder it was made in."""
        with self._lock:
            batch = self._need_batch(batch_id)
            fields: dict[str, str] = {}
            if name is not None:
                name = name.strip()
                if not name or len(name) > 120 or any(ord(c) < 32 for c in name):
                    raise InvalidInputError("The batch needs a name of up to 120 characters")
                fields["name"] = name
            template = self._checked_template(folder_template) if folder_template is not None else None
            template_changes = template is not None and template != batch.folder_template
            root_changes = output_root is not None and output_root != batch.output_root
            if root_changes:
                try:
                    check_root(output_root)
                except OutputFolderError as error:
                    raise InvalidInputError(str(error)) from error
                self._check_apart(batch.input_folder, output_root)
            if root_changes or template_changes:
                if any(c.output is not None for c in self._passes.for_batch(batch_id)):
                    raise StateError("The output folder or folder name cannot change after a card has a finished video. Start a new batch for a new output folder")
            changes_how_it_runs = (pipeline_id is not None and pipeline_id != batch.pipeline_id) or (run_on is not None and run_on != batch.run_on)
            if changes_how_it_runs and any(c.status in ("queued", "running") for c in self._passes.for_batch(batch_id)):
                raise StateError("This batch is waiting or running. Pause or stop it before changing its pipeline or worker")
            if run_on is not None:
                if run_on != "any" and run_on not in self._workers:
                    raise InvalidInputError(f"There is no worker called {run_on}")
                fields["run_on"] = run_on
            if pipeline_id is not None:
                self._usable(pipeline_id)
            if watching or any(v is not None for v in (watch_interval_minutes, watch_settle_minutes, watch_max_per_check)):
                self._check_watch(batch.ignore_subfolders or batch.folder_pattern is None, watch_interval_minutes, watch_settle_minutes, watch_max_per_check)
            if watching is not None:
                fields["watching"] = int(watching)
            for name, value in (("watch_interval_minutes", watch_interval_minutes), ("watch_settle_minutes", watch_settle_minutes), ("watch_max_per_check", watch_max_per_check)):
                if value is not None:
                    fields[name] = value
            if root_changes:
                fields["output_root"] = output_root
            if template_changes:
                fields["folder_template"] = template
            if auto_run is not None:
                fields["auto_run"] = int(auto_run)
                if auto_run:  # turning it on starts what is waiting
                    run = self._runs.latest(batch_id)
                    for card in self._passes.for_run(run.id) if run else []:
                        self._passes.update(card.id, only_if_status="held", status="queued")
            if fields:
                self._batches.update(batch_id, **fields)
            if watching and not batch.watching and batch.folder_pattern is not None:  # from now on: what is there already is not the watch's to add
                self._skip_settled(self._need_batch(batch_id), scan_parent(batch.input_folder, compile_pattern(batch.folder_pattern)))
            if pipeline_id is not None and pipeline_id != batch.pipeline_id:
                self._batches.set_pipeline(batch_id, pipeline_id)
            return self._need_batch(batch_id)

    # ---- pause, resume, stop, rerun, delete: one card, one batch, or many at once
    def card_action(self, pass_id: int, action: str) -> str:
        with self._lock:
            card = self._need_pass(pass_id)
            self._need_newest(card)
            return self._apply(card, action)

    def batch_action(self, batch_id: int, action: str) -> str:
        with self._lock:
            self._need_batch(batch_id)
            if action == "rerun":
                self.run_again(batch_id, None)
                return "Started a new run"
            if action == "delete":
                self.delete_batches([batch_id])
                return "Deleted"
            latest = self._runs.latest(batch_id)
            cards = [c for c in (self._passes.for_run(latest.id) if latest else []) if action in _ACTS_ON.get(c.status, ())]
            if not cards:
                raise StateError(f"Nothing in this batch can be {_PAST[action]}")
            for card in cards:
                self._apply(card, action)
            return f"{_PAST[action].capitalize()} {len(cards)} {'card' if len(cards) == 1 else 'cards'}"

    def card_actions(self, pass_ids: list[int], action: str) -> list[ActionResult]:
        return [self._one(pass_id, lambda pid=pass_id: self.card_action(pid, action)) for pass_id in pass_ids]

    def batch_actions(self, batch_ids: list[int], action: str) -> list[ActionResult]:
        return [self._one(batch_id, lambda bid=batch_id: self.batch_action(bid, action)) for batch_id in batch_ids]

    @staticmethod
    def _one(item_id: int, act) -> ActionResult:  # noqa: ANN001
        try:
            return ActionResult(id=item_id, ok=True, message=act())
        except (NotFoundError, StateError, InvalidInputError) as problem:
            return ActionResult(id=item_id, ok=False, message=str(problem))

    def _apply(self, card: Pass, action: str) -> str:
        """Call with the lock held. A running card is changed here and its runner stops before its next stage."""
        status = card.status
        if action not in _ACTS_ON.get(status, ()) and action not in ("rerun", "delete"):
            raise StateError(f"A {status} card cannot be {_PAST[action]}")
        if action == "rerun":
            if status in ("queued", "running"):
                raise StateError("This card is already waiting or running. Pause or stop it first")
            updated = self._passes.update(card.id, only_if_status=status, status="queued", **_FRESH)
        elif action == "delete":
            if status == "running":
                raise StateError("A running card cannot be deleted. Stop it first")
            self._passes.delete(card.id)
            return "Deleted"
        else:
            target = {"pause": "paused", "resume": "queued", "stop": "stopped"}[action]
            updated = self._passes.update(card.id, only_if_status=status, status=target)
        if updated is None:
            raise StateError("The card changed while you acted on it. Try again")
        return _PAST[action].capitalize()

    def delete_batches(self, batch_ids: list[int]) -> int:
        """Removes batches with their passes and logs. Output videos on disk are kept. Refuses the whole request
        when any of them has a pass that is waiting or running, so nothing is half deleted."""
        with self._lock:
            for batch_id in batch_ids:
                self._need_batch(batch_id)
                if any(p.status in ("queued", "running") for p in self._passes.for_batch(batch_id)):
                    raise StateError("A batch that is waiting or running cannot be deleted. Wait for it to finish, then delete it")
            for batch_id in batch_ids:
                self._batches.delete(batch_id)
            return len(batch_ids)

    def cards(self) -> list[BatchCard]:
        """Every card of every batch's newest run, for the board."""
        waiting = [p.id for p in self._passes.queued()]
        cards = []
        for batch in reversed(self._batches.list()):
            run = self._runs.latest(batch.id)
            if run is None:
                continue  # a half-made batch must not break the whole board
            ref = self._pipelines.get_pipeline(batch.pipeline_id) if batch.pipeline_id is not None else None
            for latest in self._passes.for_run(run.id):
                steps = latest.steps_used or (ref.steps if ref else batch.steps)
                active = [s for s in steps if s.enabled]
                titles = [self._library.registry.get(s.key).title if self._library.known(s.key) else s.key for s in active]
                at_stage = latest.status in _WITH_STAGE and bool(latest.stage_key)
                cards.append(BatchCard(
                    batch_id=batch.id, pass_id=latest.id, folder=latest.folder, pipeline_id=batch.pipeline_id, run_on=batch.run_on, started_at=latest.started_at, name=batch.name, input_folder=batch.input_folder,
                    pipeline_name=ref.name if ref else None, pipeline=titles, status=latest.status,
                    stage_title=titles[latest.stage_index] if at_stage and latest.stage_index < len(titles) else "",
                    stage_position=latest.stage_index + 1 if at_stage else (len(titles) if latest.status in ("review", "approved") else 0),
                    stage_count=len(titles), pass_number=latest.number,
                    queue_position=waiting.index(latest.id) if latest.id in waiting else None,
                    blocked_reason=latest.blocked_reason, blocked_choices=latest.blocked_choices, blocked_items=latest.blocked_items, error=latest.error, output=latest.output,
                ))
        return cards

    def batch_list(self) -> list[BatchListItem]:
        """Every batch with the status of its newest run, for the batch list."""
        items = []
        for batch in reversed(self._batches.list()):
            run = self._runs.latest(batch.id)
            cards = self._passes.for_run(run.id) if run else []
            ref = self._pipelines.get_pipeline(batch.pipeline_id) if batch.pipeline_id is not None else None
            items.append(BatchListItem(
                id=batch.id, name=batch.name, input_folder=batch.input_folder, pipeline_name=ref.name if ref else None,
                run_number=run.number if run else None, run_at=run.created_at if run else None, folder_count=len(cards),
                approved_count=sum(c.status == "approved" for c in cards), failed_count=sum(c.status == "failed" for c in cards),
                status=_batch_status(cards), watching=batch.watching, watch_line=_watch_line(batch) if batch.watching else None,
            ))
        return items

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
        latest = self._runs.latest(current.batch_id)
        if latest is None or current.run_id != latest.id:
            raise StateError("A newer run exists for this batch. Act on the newest run")


def _watch_line(batch: Batch) -> str:
    """How a batch's watch is doing, in a few words."""
    if batch.watch_last_error:
        return f"Watching · problem: {batch.watch_last_error}"
    if batch.watch_waiting:
        names = ", ".join(batch.watch_waiting[:2]) + (f" and {len(batch.watch_waiting) - 2} more" if len(batch.watch_waiting) > 2 else "")
        return f"Watching · waiting for {names} to settle"
    if batch.watch_last_checked_at is None:
        return "Watching · not checked yet"
    return f"Watching · checks every {batch.watch_interval_minutes} min"


def _batch_status(cards: list[Pass]) -> str:
    """Derived from the cards of the newest run: approved when all are, failed when any is, then the busiest stage."""
    if not cards:
        return "empty"
    statuses = {c.status for c in cards}
    if statuses == {"approved"}:
        return "approved"
    if "failed" in statuses:
        return "failed"
    if "running" in statuses:
        return "running"
    if "queued" in statuses:
        return "queued"
    if "held" in statuses:
        return "held"
    if "paused" in statuses:
        return "paused"
    if "stopped" in statuses:
        return "stopped"
    return "review"
