import threading

import pytest

from collector_server.production.queue import JobQueue
from collector_server.production.repositories import BatchRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.stage_api import StageStep

NOW = "2026-11-17T10:00:00+00:00"


class FakeWorker:
    def __init__(self, id):
        self.id = id


class BlockingRunner:
    """Stands in for PassRunner: claims the pass, then waits until the test lets it finish."""

    def __init__(self, passes):
        self.passes = passes
        self.started = []
        self.gates = {}
        self.fail_with = None

    def run(self, pass_id, worker):
        self.passes.update(pass_id, only_if_status="queued", status="running")
        self.started.append((pass_id, worker.id))
        gate = self.gates.setdefault(pass_id, threading.Event())
        if self.fail_with:
            raise self.fail_with
        gate.wait(5)
        self.passes.update(pass_id, status="review")

    def release(self, pass_id):
        self.gates.setdefault(pass_id, threading.Event()).set()


@pytest.fixture
def env(db):
    ensure_schema(db)
    batches, passes = BatchRepository(db), PassRepository(db)
    runner = BlockingRunner(passes)

    def build(*worker_ids):
        return JobQueue(passes, batches, runner, {w: FakeWorker(w) for w in worker_ids}, lambda: NOW)

    def add(run_on="any"):
        batch = batches.create("B", "/in", [StageStep(key="scan_folder")], run_on, "/out", NOW)
        return passes.create(batch.id, NOW).id

    return build, add, runner, passes


def wait_started(runner, count):
    for _ in range(200):
        if len(runner.started) >= count:
            return
        threading.Event().wait(0.01)
    raise AssertionError("jobs did not start")


def test_one_job_per_worker(env):
    build, add, runner, _ = env
    queue = build("local")
    first, second = add(), add()
    assert queue.tick() == [first]
    wait_started(runner, 1)
    assert queue.tick() == []
    runner.release(first)
    queue.wait_idle()
    assert queue.tick() == [second]
    runner.release(second)
    queue.wait_idle()


def test_first_in_first_out(env):
    build, add, runner, _ = env
    queue = build("local")
    ids = [add() for _ in range(3)]
    order = []
    for _ in range(3):
        started = queue.tick()
        order += started
        runner.release(started[0])
        queue.wait_idle()
    assert order == ids


def test_two_workers_run_two_jobs_at_once(env):
    build, add, runner, _ = env
    queue = build("a", "b")
    one, two, three = add(), add(), add()
    assert queue.tick() == [one, two]
    wait_started(runner, 2)
    assert sorted(w for _, w in runner.started) == ["a", "b"]
    for pass_id in (one, two):
        runner.release(pass_id)
    queue.wait_idle()
    runner.release(three)


def test_a_batch_pinned_to_a_worker_waits_for_that_worker(env):
    build, add, runner, _ = env
    queue = build("a", "b")
    first, pinned, later = add(), add(run_on="a"), add()
    assert queue.tick() == [first, later]  # the pinned one waits for a; the later one is not held up
    wait_started(runner, 2)
    assert dict((p, w) for p, w in runner.started) == {first: "a", later: "b"}
    for pass_id in (first, later, pinned):
        runner.release(pass_id)
    queue.wait_idle()
    assert queue.tick() == [pinned]
    queue.wait_idle()


def test_pass_for_an_unknown_worker_stays_queued(env):
    build, add, _, passes = env
    queue = build("local")
    ghost = add(run_on="ghost")
    assert queue.tick() == []
    assert passes.get(ghost).status == "queued"


def test_a_pass_is_not_started_twice(env):
    build, add, runner, _ = env
    queue = build("a", "b")
    only = add()
    assert queue.tick() == [only]
    assert queue.tick() == []
    runner.release(only)
    queue.wait_idle()


def test_a_crashing_runner_frees_the_worker_and_fails_the_pass(env):
    build, add, runner, passes = env
    queue = build("local")
    runner.fail_with = RuntimeError("boom")
    broken = add()
    assert queue.tick() == [broken]
    queue.wait_idle()
    failed = passes.get(broken)
    assert failed.status == "failed" and failed.error == "Something went wrong: RuntimeError"
    runner.fail_with = None
    nxt = add()
    assert queue.tick() == [nxt]
    runner.release(nxt)
    queue.wait_idle()


def test_recover_fails_running_passes_and_leaves_the_rest(env):
    build, add, _, passes = env
    queue = build("local")
    stuck, waiting = add(), add()
    passes.update(stuck, status="running")
    assert queue.recover() == 1
    assert passes.get(stuck).status == "failed" and passes.get(stuck).error == "Interrupted by a restart"
    assert passes.get(waiting).status == "queued"


def test_recover_removes_the_leftovers_of_an_interrupted_run(env, tmp_path):
    import os

    from collector_server.production.output_paths import output_paths

    build, _, _, passes = env
    queue = build("local")
    batch = queue._batches.create("B", "/in", [StageStep(key="scan_folder")], "any", str(tmp_path / "out"), NOW)
    stuck = passes.create(batch.id, NOW)
    out, work = output_paths(batch, stuck.id, stuck.number)
    for folder, name in ((work, "joined.mp4"), (out, "output.mp4")):
        os.makedirs(folder)
        open(os.path.join(folder, name), "w").close()
    passes.update(stuck.id, status="running")
    queue.recover()
    assert not os.path.exists(work) and not os.path.exists(out)
