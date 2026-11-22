import os

import pytest

from collector_server.production.builtin import build_registry
from collector_server.production.pieces import VideoData
from collector_server.production.registry import StageRegistry
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.runner import PassRunner
from collector_server.production.schema import ensure_schema
from collector_server.production.stage_api import StageError, StageStep
from collector_server.production.worker import LocalWorker
from tests.production.helpers import FakePipelines, FakeStage, make_clip, requires_ffmpeg

NOW = "2026-11-17T10:00:00+00:00"
JOIN = ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]


class Env:
    def __init__(self, db, tmp_path, registry=None):
        ensure_schema(db)
        self.batches, self.passes, self.logs = BatchRepository(db), PassRepository(db), LogRepository(db)
        self.runner = PassRunner(self.batches, self.passes, self.logs, registry or build_registry(), FakePipelines(), lambda: NOW)
        self.root = tmp_path
        self.inbox = tmp_path / "in"
        self.inbox.mkdir()

    def queue(self, keys=JOIN, settings=None, name="Coach Saturdays", overrides=None):
        settings = settings or {}
        steps = [StageStep(key=k, settings=settings.get(k, {})) for k in keys]
        batch = self.batches.create(name, str(self.inbox), None, steps, "any", str(self.root / "out"), NOW)
        return self.passes.create(batch.id, NOW, overrides=overrides)

    def run(self, queued):
        self.runner.run(queued.id, LocalWorker())
        return self.passes.get(queued.id)


@pytest.fixture
def env(db, tmp_path):
    return Env(db, tmp_path)


def two_clips(env, seconds=2):
    make_clip(env.inbox / "a.mp4", seconds=seconds)
    make_clip(env.inbox / "b.mp4", seconds=seconds, audio=False)


SMALL = {"join_pieces": {"width": 160, "height": 284}, "render_output": {"maxSizeMb": 5}}


@requires_ffmpeg
def test_join_pipeline_ends_in_review_with_output_file(env):
    two_clips(env)
    done = env.run(env.queue(settings=SMALL))
    assert done.status == "review" and done.error is None
    assert os.path.exists(done.output.path) and done.output.size_bytes <= 5_000_000
    assert abs(done.output.duration - 4.0) < 0.4
    assert done.started_at == NOW and done.finished_at == NOW


@pytest.mark.full
@pytest.mark.full
@requires_ffmpeg
def test_pipeline_log_records_each_stage_and_ffmpeg_log_has_lines(env):
    two_clips(env)
    done = env.run(env.queue(settings=SMALL))
    log = env.logs.for_pass(done.id, "pipeline")
    for title in ["Scan folder", "Order clips", "Limit length", "Join in order", "Render"]:
        assert f"{title} started" in log and f"{title} done" in log
    assert env.logs.for_pass(done.id, "ffmpeg")


@requires_ffmpeg
def test_over_length_blocks_with_choices_then_override_resolves_it(env):
    two_clips(env, seconds=3)
    settings = {**SMALL, "limit_length": {"maxSeconds": 4}}
    blocked = env.run(env.queue(settings=settings))
    assert blocked.status == "blocked" and blocked.stage_key == "limit_length"
    assert blocked.blocked_choices == ["drop_shortest", "keep_first"] and "over" in blocked.blocked_reason
    env.passes.update(blocked.id, status="queued", overrides={"limit_length": {"choice": "keep_first"}})
    done = env.run(blocked)
    assert done.status == "review" and done.blocked_reason is None and done.blocked_choices == []
    assert abs(done.output.duration - 4.0) < 0.4


@pytest.mark.full
@pytest.mark.full
@requires_ffmpeg
def test_empty_folder_fails_plainly(env):
    failed = env.run(env.queue(settings=SMALL))
    assert failed.status == "failed" and failed.error.startswith("No clips found")


@pytest.mark.full
@pytest.mark.full
@requires_ffmpeg
def test_work_folder_is_removed_and_output_stays(env):
    two_clips(env)
    done = env.run(env.queue(settings=SMALL))
    folder = os.path.dirname(done.output.path)
    assert sorted(f for f in os.listdir(folder) if f != ".short-editor-pass") == ["output.mp4"]


@pytest.mark.full
@pytest.mark.full
def test_work_folder_is_removed_after_a_failure(env):
    failed = env.run(env.queue())
    assert failed.status == "failed"
    out = env.root / "out"
    assert [p for p in out.rglob("work")] == []


@pytest.mark.full
@pytest.mark.full
def test_batch_name_cannot_put_files_outside_the_output_root(env):
    env.run(env.queue(name="../../evil"))
    assert not (env.root.parent / "evil").exists()
    assert all(str(p).startswith(str(env.root / "out")) for p in (env.root / "out").rglob("*"))


class Probe(FakeStage):
    def __init__(self, seen):
        super().__init__("probe", "Probe", {"none": "video"})
        self.seen = seen

    def run(self, data, settings, ctx):
        self.seen["pass"] = self.seen["passes"].get(self.seen["id"])
        return VideoData(path="/x.mp4", duration=1, size_bytes=1)


class Explodes(FakeStage):
    def __init__(self, error):
        super().__init__("boom", "Boom", {"none": "video"})
        self.error = error

    def run(self, data, settings, ctx):
        ctx.log("about to fail")
        raise self.error


def env_with(db, tmp_path, *stages):
    registry = StageRegistry()
    for stage in stages:
        registry.register(stage)
    return Env(db, tmp_path, registry)


@pytest.mark.full
@pytest.mark.full
def test_status_is_running_and_stage_is_known_while_a_stage_runs(db, tmp_path):
    seen = {}
    env = env_with(db, tmp_path, Probe(seen))
    queued = env.queue(keys=["probe"])
    seen.update(passes=env.passes, id=queued.id)
    done = env.run(queued)
    assert (seen["pass"].status, seen["pass"].stage_key, seen["pass"].stage_index) == ("running", "probe", 0)
    assert done.status == "review"


@pytest.mark.full
@pytest.mark.full
def test_unexpected_error_fails_without_a_traceback_in_the_status(db, tmp_path):
    env = env_with(db, tmp_path, Explodes(RuntimeError("secret detail")))
    failed = env.run(env.queue(keys=["boom"]))
    assert failed.status == "failed" and failed.error == "Something went wrong: RuntimeError"
    assert "secret detail" not in failed.error
    log = "\n".join(env.logs.for_pass(failed.id, "pipeline"))
    assert "about to fail" in log and "secret detail" in log and "Traceback" in log


@pytest.mark.full
@pytest.mark.full
def test_stage_error_message_is_shown_as_it_is(db, tmp_path):
    env = env_with(db, tmp_path, Explodes(StageError("Plain words")))
    assert env.run(env.queue(keys=["boom"])).error == "Plain words"


@pytest.mark.full
@pytest.mark.full
def test_invalid_settings_fail_plainly(db, tmp_path):
    env = Env(db, tmp_path)
    failed = env.run(env.queue(settings={"limit_length": {"maxSeconds": -5}}))
    assert failed.status == "failed" and "settings for Limit length" in failed.error
    assert failed.stage_key == ""  # nothing ran


@pytest.mark.full
@pytest.mark.full
def test_unknown_stage_fails_plainly(db, tmp_path):
    env = Env(db, tmp_path)
    failed = env.run(env.queue(keys=["scan_folder", "gone"]))
    assert failed.status == "failed" and "gone" in failed.error


def test_pipeline_that_does_not_end_in_a_video_fails_plainly(db, tmp_path):
    env = Env(db, tmp_path)
    make_clip(env.inbox / "a.mp4")
    failed = env.run(env.queue(keys=["scan_folder"]))
    assert failed.status == "failed" and "video" in failed.error


@pytest.mark.full
@pytest.mark.full
@requires_ffmpeg
def test_running_a_pass_again_starts_its_logs_afresh(env):
    two_clips(env, seconds=3)
    blocked = env.run(env.queue(settings={**SMALL, "limit_length": {"maxSeconds": 4}}))
    assert any("Blocked" in line for line in env.logs.for_pass(blocked.id, "pipeline"))
    env.passes.update(blocked.id, status="queued", overrides={"limit_length": {"choice": "keep_first"}})
    done = env.run(blocked)
    log = env.logs.for_pass(done.id, "pipeline")
    assert log[0] == "Scan folder started" and not any("Blocked" in line for line in log)


@pytest.mark.full
@pytest.mark.full
def test_a_folder_that_already_holds_files_is_never_wiped(env):
    """A reset database starts its ids again, so the same folder name can belong to an old, approved video."""
    from collector_server.production.output_paths import claim_root, folder_name

    queued = env.queue()
    claim_root(str(env.root / "out"))
    old = env.root / "out" / folder_name(env.batches.get(queued.batch_id)) / "pass-1"
    old.mkdir(parents=True)
    (old / "output.mp4").write_bytes(b"old approved video")
    failed = env.run(queued)
    assert failed.status == "failed" and "already holds files" in failed.error
    assert (old / "output.mp4").read_bytes() == b"old approved video"


@pytest.mark.full
@pytest.mark.full
def test_an_unusable_output_folder_gives_a_plain_message(db, tmp_path):
    env = Env(db, tmp_path)
    (tmp_path / "out").write_text("i am a file")
    failed = env.run(env.queue())
    assert failed.status == "failed" and failed.error.startswith("Cannot write to the output folder")


@pytest.mark.full
@pytest.mark.full
@requires_ffmpeg
def test_blocked_run_keeps_its_folder_and_leaves_no_partial_files(env):
    two_clips(env, seconds=3)
    blocked = env.run(env.queue(settings={**SMALL, "limit_length": {"maxSeconds": 4}}))
    assert blocked.status == "blocked"
    assert [p.name for p in (env.root / "out").rglob("*") if p.is_file() and p.name != ".short-editor-pass"] == [".short-editor-output"]


@pytest.mark.full
@pytest.mark.full
def test_a_pass_whose_batch_vanished_fails_instead_of_staying_running(db, tmp_path):
    env = Env(db, tmp_path)
    queued = env.queue()
    db.execute("PRAGMA foreign_keys = OFF")
    db.execute("DELETE FROM production_batches")
    db.execute("PRAGMA foreign_keys = ON")
    failed = env.run(queued)
    assert failed.status == "failed" and failed.error


@pytest.mark.full
@pytest.mark.full
def test_pipeline_lines_are_stored_as_they_happen(db, tmp_path):
    seen = {}

    class Peek(Probe):
        def run(self, data, settings, ctx):
            ctx.log("halfway")
            seen["lines"] = seen["logs"].for_pass(seen["id"], "pipeline")
            return super().run(data, settings, ctx)

    peek = Peek(seen)
    env = env_with(db, tmp_path, peek)
    queued = env.queue(keys=["probe"])
    seen.update(passes=env.passes, id=queued.id, logs=env.logs)
    env.run(queued)
    assert "halfway" in seen["lines"]


@pytest.mark.full
@pytest.mark.full
def test_a_ffmpeg_failure_shows_a_short_message_and_logs_the_details(db, tmp_path):
    from collector_server.production.ffmpeg import FfmpegError

    env = env_with(db, tmp_path, Explodes(FfmpegError(1, ["/secret/path: No such file"])))
    failed = env.run(env.queue(keys=["boom"]))
    assert failed.error == "FFmpeg stopped (code 1). The log has the details."
    assert any("/secret/path" in line for line in env.logs.for_pass(failed.id, "pipeline"))


@pytest.mark.full
@pytest.mark.full
def test_stage_index_counts_enabled_stages_only(db, tmp_path):
    seen = {}
    env = env_with(db, tmp_path, FakeStage("a", "A", {"none": "pieces"}), Probe2(seen))
    steps = [StageStep(key="a"), StageStep(key="a", enabled=False), StageStep(key="probe2")]
    batch = env.batches.create("B", str(env.inbox), None, steps, "any", str(env.root / "out"), NOW)
    queued = env.passes.create(batch.id, NOW)
    seen.update(passes=env.passes, id=queued.id)
    env.run(queued)
    assert seen["index"] == 1


class Probe2(Probe):
    def __init__(self, seen):
        FakeStage.__init__(self, "probe2", "Probe two", {"pieces": "video"})
        self.seen = seen

    def run(self, data, settings, ctx):
        self.seen["index"] = self.seen["passes"].get(self.seen["id"]).stage_index
        return VideoData(path="/x.mp4", duration=1, size_bytes=1)


@pytest.mark.full
@pytest.mark.full
def test_a_finish_that_lost_the_race_does_not_overwrite_the_newer_status(db, tmp_path):
    env = env_with(db, tmp_path, Probe({}))
    queued = env.queue(keys=["probe"])

    class Cancelling(Probe):
        def run(self, data, settings, ctx):
            env.passes.update(queued.id, status="failed", error="Stopped by the user")
            return super().run(data, settings, ctx)

    env.runner._registry = StageRegistry()
    env.runner._registry.register(Cancelling({"passes": env.passes, "id": queued.id}))
    env.run(queued)
    assert env.passes.get(queued.id).error == "Stopped by the user"


@pytest.mark.full
@pytest.mark.full
def test_a_run_never_deletes_files_it_did_not_make(db, tmp_path):
    env = Env(db, tmp_path)
    precious = tmp_path / "out" / "Coach-Saturdays-1" / "pass-1"
    precious.mkdir(parents=True)
    (precious / "precious.txt").write_text("mine")
    (tmp_path / "out" / ".work" / "1").mkdir(parents=True)
    (tmp_path / "out" / ".work" / "1" / "also-mine.txt").write_text("mine")
    failed = env.run(env.queue())
    assert failed.status == "failed" and "other files" in failed.error
    assert (precious / "precious.txt").exists() and (tmp_path / "out" / ".work" / "1" / "also-mine.txt").exists()



@pytest.mark.full
def test_a_failing_stage_is_recorded_with_its_start_and_end_and_the_reason(db, tmp_path):
    """The review screen reads these: the stage that failed keeps its place, with an end time, and the pass says why."""
    env = env_with(db, tmp_path, Explodes(StageError("Nothing to join")))
    done = env.run(env.queue(keys=["boom"]))
    assert done.status == "failed" and done.error == "Nothing to join"
    [stage] = done.stages
    assert (stage.key, stage.status) == ("boom", "failed")
    assert stage.started_at and stage.finished_at


def test_stage_context_has_labels_card_and_postiz(db, tmp_path):
    seen = {}

    class Probe:
        key, title, settings_model, transitions, position = "probe", "Probe", FakeStage("x", "x", {}).settings_model, {"none": "video"}, "any"

        def run(self, data, settings, ctx):
            seen.update(labels=dict(ctx.labels), card_id=ctx.card_id, client=ctx.postiz(), exports=ctx.exports)
            return VideoData(path=str(tmp_path / "x.mp4"), duration=1.0, size_bytes=1)

    registry = StageRegistry()
    registry.register(Probe())
    env = Env(db, tmp_path, registry)
    sentinel_client, sentinel_exports = object(), object()
    env.runner = PassRunner(env.batches, env.passes, env.logs, registry, FakePipelines(), lambda: NOW, postiz=lambda: sentinel_client, exports=sentinel_exports)
    card = env.queue(["probe"], name="Saturday class")
    env.run(card)
    batch = env.batches.get(card.batch_id)
    assert seen["labels"] == {"name": "Saturday class", "id": str(batch.id), "date": "2026-11-17"}
    assert seen["card_id"] == card.id and seen["client"] is sentinel_client and seen["exports"] is sentinel_exports
