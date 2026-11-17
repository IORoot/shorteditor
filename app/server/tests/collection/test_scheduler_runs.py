import pytest
import threading

from collector_server.collection.models import ScheduleDraft
from collector_server.collection.scheduler import Scheduler
from collector_server.collection.service import CollectorService
from tests.conftest import FakeChecker, FakeMover


class GatedMover:
    def __init__(self):
        self.started = threading.Event()
        self.release = threading.Event()

    def move(self, collector, run_id, progress):  # noqa: ANN001
        progress("Moving 1 of 2…")
        self.started.set()
        self.release.wait(5)
        return "Moved 2 clips into 1 folder"


def wait_until_done(runs, run_id):
    for _ in range(100):
        if runs.get(run_id).status != "running":
            return
        threading.Event().wait(0.05)
    raise AssertionError("run did not finish")


def make(collectors, runs, clock, mover, **kw):
    record = collectors.add("Coach", "/src")
    CollectorService(collectors, runs, clock).save_schedule(record.id, ScheduleDraft(enabled=True, kind="daily", time="23:00"))
    return collectors.get(record.id), Scheduler(collectors, runs, FakeChecker(), mover, clock, **kw)


def test_background_run_is_visible_as_running_with_progress_then_done(collectors, runs, clock):
    mover = GatedMover()
    record, scheduler = make(collectors, runs, clock, mover, undoable=lambda _id: True)
    started = scheduler.start(record, "manual", background=True)
    assert started.status == "running"
    assert mover.started.wait(5)
    assert runs.get(started.id).outcome == "Moving 1 of 2…"
    mover.release.set()
    wait_until_done(runs, started.id)
    final = runs.get(started.id)
    assert (final.status, final.outcome, final.can_undo) == ("done", "Moved 2 clips into 1 folder", True)


@pytest.mark.full
@pytest.mark.full
def test_a_second_start_while_running_is_skipped(collectors, runs, clock):
    mover = GatedMover()
    record, scheduler = make(collectors, runs, clock, mover)
    first = scheduler.start(record, "manual", background=True)
    assert mover.started.wait(5)
    second = scheduler.start(record, "manual", background=True)
    assert second.status == "skipped"
    mover.release.set()
    wait_until_done(runs, first.id)


@pytest.mark.full
@pytest.mark.full
def test_the_collector_can_run_again_after_a_failure(collectors, runs, clock):
    record, scheduler = make(collectors, runs, clock, FakeMover(error=RuntimeError("boom")))
    assert scheduler.run(record, "manual").status == "failed"
    assert scheduler.run(record, "manual").outcome == "Run failed: boom"


@pytest.mark.full
@pytest.mark.full
def test_can_undo_defaults_to_false_without_an_undoable_check(collectors, runs, clock):
    record, scheduler = make(collectors, runs, clock, FakeMover())
    assert scheduler.run(record, "manual").can_undo is False


@pytest.mark.full
@pytest.mark.full
def test_run_repository_update_changes_only_the_given_fields(collectors, runs, clock):
    record = collectors.add("A", "/a")
    run = runs.add(record.id, clock.now(), "manual", "running", "Starting…")
    runs.update(run.id, outcome="Moving 1 of 3…")
    assert (runs.get(run.id).status, runs.get(run.id).outcome) == ("running", "Moving 1 of 3…")
    runs.update(run.id)
    assert runs.get(run.id).outcome == "Moving 1 of 3…"
    assert runs.get(999) is None
