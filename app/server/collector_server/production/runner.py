from __future__ import annotations

import contextlib
import os
import traceback
from collections.abc import Callable

from .ffmpeg import FfmpegError, FfmpegRunner
from .log_sink import LogSink
from .models import Batch, Pass
from .output_paths import OutputFolderError, claim_root, output_paths, remove_inside
from .pieces import VideoData
from .registry import StageRegistry
from .repositories import BatchRepository, LogRepository, PassRepository
from collector_server.shared.pipeline import PipelineSource

from .stage_api import DEFAULT_AI_MODEL, BlockedError, StageContext, StageError, StageStep
from .validation import build_settings, validate_pipeline
from .worker import Worker

_FFMPEG_BATCH = 50
_FFMPEG_LINES_KEPT = 3000


class PassRunner:
    def __init__(self, batches: BatchRepository, passes: PassRepository, logs: LogRepository, registry: StageRegistry, pipelines: PipelineSource,
                 now: Callable[[], str], ai_key: Callable[[], str | None] = lambda: None,
                 ai_model: Callable[[], str] = lambda: DEFAULT_AI_MODEL) -> None:
        self._batches, self._passes, self._logs, self._registry, self._pipelines, self._now = batches, passes, logs, registry, pipelines, now
        self._ai_key = ai_key  # read at the start of each pass, so a key saved in Settings is used by the next pass
        self._ai_model = ai_model

    def run(self, pass_id: int, worker: Worker) -> None:
        claimed = self._passes.update(
            pass_id, only_if_status="queued", status="running", started_at=self._now(), finished_at=None,
            error=None, blocked_reason=None, blocked_choices=[], blocked_items=[], output=None, stage_index=0, stage_key="", stages=[],
        )
        if claimed is None:
            return  # someone else took it, or it is not waiting any more
        self._logs.clear(pass_id)  # a pass run again starts with a clean log
        pipeline = LogSink(self._logs, pass_id, "pipeline", self._now)  # every line at once: it is the live progress
        ffmpeg = LogSink(self._logs, pass_id, "ffmpeg", self._now, batch=_FFMPEG_BATCH, keep=_FFMPEG_LINES_KEPT)
        root = output_dir = work_dir = made_dir = None
        try:
            batch = self._batches.get(claimed.batch_id)
            if batch is None:
                raise StageError("The batch no longer exists")
            root = batch.output_root
            steps = self._steps_for(batch)
            self._passes.update(pass_id, steps_used=[step.model_dump() for step in steps])  # kept with the pass, whatever changes later
            output_dir, work_dir = output_paths(batch, pass_id, claimed.number)
            self._prepare(root, output_dir, work_dir)
            made_dir = output_dir  # only now is the result folder this run's own
            ctx = StageContext(claimed.folder or batch.input_folder, work_dir, output_dir, FfmpegRunner(worker, ffmpeg), pipeline, cache_root=os.path.join(root, ".detect-cache"), ai_key=self._ai_key(), ai_model=self._ai_model())
            self._finish(pass_id, "review", pipeline, output=self._execute(claimed, steps, ctx))
        except BlockedError as blocked:
            pipeline(f"Blocked: {blocked.reason}")
            self._discard(root, made_dir)
            self._finish(pass_id, "blocked", pipeline, blocked_reason=blocked.reason, blocked_choices=blocked.choices, blocked_items=blocked.items, finished_at=None)
        except FfmpegError as error:
            pipeline(f"Failed: {error}")
            self._discard(root, made_dir)
            self._finish(pass_id, "failed", pipeline, error=f"FFmpeg stopped (code {error.code}). The log has the details.")
        except StageError as error:
            pipeline(f"Failed: {error}")
            self._discard(root, made_dir)
            self._finish(pass_id, "failed", pipeline, error=str(error))
        except Exception as error:  # noqa: BLE001 - anything else is a bug; keep it in the log, not on screen
            for line in traceback.format_exc().splitlines():
                pipeline(line)
            self._discard(root, made_dir)
            self._finish(pass_id, "failed", pipeline, error=f"Something went wrong: {type(error).__name__}")
        finally:
            if root:
                remove_inside(root, work_dir)
            with contextlib.suppress(Exception):  # a log that cannot be written must not hide the result
                pipeline.flush()
                ffmpeg.flush()

    @staticmethod
    def _prepare(root: str, output_dir: str, work_dir: str) -> None:
        try:
            claim_root(root)  # refuses a folder that holds someone else's files
            if os.path.isdir(output_dir) and os.listdir(output_dir):
                # Passes that did not finish clear their folder, so this is a finished video, for example
                # from before a database reset started the ids again. Never wipe it.
                raise StageError(f"{output_dir} already holds files from an earlier run")
            os.makedirs(work_dir, exist_ok=True)
        except (OutputFolderError, OSError) as error:
            raise StageError(f"Cannot write to the output folder: {getattr(error, 'strerror', None) or error}") from error

    @staticmethod
    def _discard(root: str | None, output_dir: str | None) -> None:
        """A pass that did not finish leaves no half-made files behind."""
        if root:
            remove_inside(root, output_dir)

    def _finish(self, pass_id: int, status: str, pipeline: LogSink, **fields) -> None:  # noqa: ANN003
        saved = self._passes.update(pass_id, only_if_status="running", status=status, **{"finished_at": self._now(), **fields})
        if saved is None:
            pipeline("Result not saved: the pass was changed while it ran")

    def _steps_for(self, batch: Batch) -> list[StageStep]:
        """A pipeline batch runs the pipeline's steps as they are when the pass starts. The switch is checked here."""
        if batch.pipeline_id is None:
            return batch.steps
        ref = self._pipelines.get_pipeline(batch.pipeline_id)
        if ref is None:
            raise StageError("The pipeline of this batch no longer exists")
        if not ref.enabled:
            raise StageError(f"Pipeline '{ref.name}' is off. Switch it on, then run again.")
        return ref.steps

    def _execute(self, current: Pass, steps: list[StageStep], ctx: StageContext) -> VideoData:
        errors = validate_pipeline(self._registry, steps)
        if errors:
            raise StageError(". ".join(errors))
        plan = []  # check every stage's settings first, so a typo does not surface after a long scan
        for step in (s for s in steps if s.enabled):
            stage = self._registry.get(step.key)
            plan.append((step, stage, build_settings(stage, {**step.settings, **current.overrides.get(step.key, {})})))
        data = None
        stages: list[dict] = []  # saved after every change, so the review screen shows where the pass is
        for index, (step, stage, settings) in enumerate(plan):  # the index counts enabled stages only
            stages.append({"key": step.key, "title": stage.title, "status": "running", "started_at": self._now(), "finished_at": None})
            self._passes.update(current.id, stage_index=index, stage_key=step.key, stages=stages)
            ctx.log(f"{stage.title} started")
            try:
                data = stage.run(data, settings, ctx)
            except BlockedError:
                stages[-1].update(status="blocked", finished_at=self._now())
                self._passes.update(current.id, stages=stages)
                raise
            except Exception:
                stages[-1].update(status="failed", finished_at=self._now())
                self._passes.update(current.id, stages=stages)
                raise
            stages[-1].update(status="done", finished_at=self._now())
            self._passes.update(current.id, stages=stages)
            ctx.log(f"{stage.title} done")
        if not isinstance(data, VideoData):
            raise StageError("The pipeline did not make a video")
        return data
