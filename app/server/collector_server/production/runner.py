from __future__ import annotations

import contextlib
import os
import shutil
import traceback
from collections.abc import Callable

from .ffmpeg import FfmpegError, FfmpegRunner
from .log_sink import LogSink
from .models import Batch, Pass
from .output_paths import output_paths
from .pieces import VideoData
from .registry import StageRegistry
from .repositories import BatchRepository, LogRepository, PassRepository
from .stage_api import BlockedError, StageContext, StageError
from .validation import build_settings, validate_pipeline
from .worker import Worker

_FFMPEG_BATCH = 50
_FFMPEG_LINES_KEPT = 3000


class PassRunner:
    def __init__(self, batches: BatchRepository, passes: PassRepository, logs: LogRepository, registry: StageRegistry, now: Callable[[], str]) -> None:
        self._batches, self._passes, self._logs, self._registry, self._now = batches, passes, logs, registry, now

    def run(self, pass_id: int, worker: Worker) -> None:
        claimed = self._passes.update(
            pass_id, only_if_status="queued", status="running", started_at=self._now(), finished_at=None,
            error=None, blocked_reason=None, blocked_choices=[], output=None, stage_index=0, stage_key="",
        )
        if claimed is None:
            return  # someone else took it, or it is not waiting any more
        self._logs.clear(pass_id)  # a pass run again starts with a clean log
        pipeline = LogSink(self._logs, pass_id, "pipeline", self._now)  # every line at once: it is the live progress
        ffmpeg = LogSink(self._logs, pass_id, "ffmpeg", self._now, batch=_FFMPEG_BATCH, keep=_FFMPEG_LINES_KEPT)
        output_dir = work_dir = None
        try:
            batch = self._batches.get(claimed.batch_id)
            if batch is None:
                raise StageError("The batch no longer exists")
            output_dir, work_dir = output_paths(batch, pass_id, claimed.number)
            self._prepare(output_dir, work_dir)
            ctx = StageContext(batch.input_folder, work_dir, output_dir, FfmpegRunner(worker, ffmpeg), pipeline)
            self._finish(pass_id, "review", pipeline, output=self._execute(claimed, batch, ctx))
        except BlockedError as blocked:
            pipeline(f"Blocked: {blocked.reason}")
            self._discard(output_dir)
            self._finish(pass_id, "blocked", pipeline, blocked_reason=blocked.reason, blocked_choices=blocked.choices, finished_at=None)
        except FfmpegError as error:
            pipeline(f"Failed: {error}")
            self._discard(output_dir)
            self._finish(pass_id, "failed", pipeline, error=f"FFmpeg stopped (code {error.code}). The log has the details.")
        except StageError as error:
            pipeline(f"Failed: {error}")
            self._discard(output_dir)
            self._finish(pass_id, "failed", pipeline, error=str(error))
        except Exception as error:  # noqa: BLE001 - anything else is a bug; keep it in the log, not on screen
            for line in traceback.format_exc().splitlines():
                pipeline(line)
            self._discard(output_dir)
            self._finish(pass_id, "failed", pipeline, error=f"Something went wrong: {type(error).__name__}")
        finally:
            if work_dir:
                shutil.rmtree(work_dir, ignore_errors=True)
            with contextlib.suppress(Exception):  # a log that cannot be written must not hide the result
                pipeline.flush()
                ffmpeg.flush()

    @staticmethod
    def _prepare(output_dir: str, work_dir: str) -> None:
        shutil.rmtree(output_dir, ignore_errors=True)  # nothing from an earlier run of this pass may linger
        try:
            os.makedirs(work_dir, exist_ok=True)
        except OSError as error:
            raise StageError(f"Cannot write to the output folder: {error.strerror}") from error

    @staticmethod
    def _discard(output_dir: str | None) -> None:
        """A pass that did not finish leaves no half-made files behind."""
        if output_dir:
            shutil.rmtree(output_dir, ignore_errors=True)

    def _finish(self, pass_id: int, status: str, pipeline: LogSink, **fields) -> None:  # noqa: ANN003
        saved = self._passes.update(pass_id, only_if_status="running", status=status, **{"finished_at": self._now(), **fields})
        if saved is None:
            pipeline("Result not saved: the pass was changed while it ran")

    def _execute(self, current: Pass, batch: Batch, ctx: StageContext) -> VideoData:
        errors = validate_pipeline(self._registry, batch.steps)
        if errors:
            raise StageError(". ".join(errors))
        plan = []  # check every stage's settings first, so a typo does not surface after a long scan
        for step in (s for s in batch.steps if s.enabled):
            stage = self._registry.get(step.key)
            plan.append((step, stage, build_settings(stage, {**step.settings, **current.overrides.get(step.key, {})})))
        data = None
        for index, (step, stage, settings) in enumerate(plan):  # the index counts enabled stages only
            self._passes.update(current.id, stage_index=index, stage_key=step.key)
            ctx.log(f"{stage.title} started")
            data = stage.run(data, settings, ctx)
            ctx.log(f"{stage.title} done")
        if not isinstance(data, VideoData):
            raise StageError("The pipeline did not make a video")
        return data
