from datetime import timedelta

import pytest

from collector_server.models import ScheduleDraft
from collector_server.scheduler import OVERLAP_MESSAGE, UNREACHABLE_MESSAGE, Scheduler
from collector_server.service import CollectorService
from tests.conftest import FakeChecker, FakeMover


@pytest.fixture
def setup(collectors, runs, clock):
    service = CollectorService(collectors, runs, clock)
    record = collectors.add("Coach", "/Volumes/Coach")
    service.save_schedule(record.id, ScheduleDraft(enabled=True, kind="daily", time="23:00"))
    checker, mover = FakeChecker(), FakeMover()
    scheduler = Scheduler(collectors, runs, checker, mover, clock, undoable=lambda _id: True)
    return scheduler, checker, mover, record.id


def test_nothing_runs_before_the_slot(setup, clock):
    scheduler, _, mover, _ = setup
    assert scheduler.tick() == []
    assert mover.calls == 0


def test_runs_at_the_slot_as_scheduled(setup, clock, runs):
    scheduler, _, mover, collector_id = setup
    clock.advance(hours=11)
    results = scheduler.tick()
    assert [r.status for r in results] == ["done"]
    assert results[0].trigger == "scheduled"
    assert results[0].can_undo is True
    assert mover.calls == 1
    assert runs.recent(collector_id)[0].outcome == "Moved 3 clips"


def test_does_not_run_twice_for_the_same_slot(setup, clock):
    scheduler, _, mover, _ = setup
    clock.advance(hours=11)
    scheduler.tick()
    clock.advance(minutes=1)
    assert scheduler.tick() == []
    assert mover.calls == 1


def test_missed_slots_run_once_as_caught_up(setup, clock):
    scheduler, _, mover, _ = setup
    clock.advance(days=4)
    results = scheduler.tick()
    assert [r.trigger for r in results] == ["caught_up"]
    assert mover.calls == 1
    clock.advance(minutes=1)
    assert scheduler.tick() == []


def test_turned_off_collectors_never_run(setup, clock, collectors, runs):
    scheduler, _, mover, collector_id = setup
    CollectorService(collectors, runs, clock).set_active(collector_id, False)
    clock.advance(hours=11)
    assert scheduler.tick() == []
    assert mover.calls == 0


def test_turning_on_does_not_catch_up_missed_slots(setup, clock, collectors, runs):
    scheduler, _, mover, collector_id = setup
    service = CollectorService(collectors, runs, clock)
    service.set_active(collector_id, False)
    clock.advance(days=4)
    service.set_active(collector_id, True)
    assert scheduler.tick() == []
    clock.advance(days=1)
    assert len(scheduler.tick()) == 1
    assert mover.calls == 1


def test_disabled_collectors_never_run(collectors, runs, clock):
    service = CollectorService(collectors, runs, clock)
    record = collectors.add("Off", "/off")
    service.save_schedule(record.id, ScheduleDraft(enabled=False, kind="daily", time="23:00"))
    mover = FakeMover()
    scheduler = Scheduler(collectors, runs, FakeChecker(), mover, clock)
    clock.advance(days=3)
    assert scheduler.tick() == []
    assert mover.calls == 0


def test_unreachable_source_fails_without_moving_anything(setup, clock):
    scheduler, checker, mover, _ = setup
    checker.reachable = False
    clock.advance(hours=11)
    results = scheduler.tick()
    assert [(r.status, r.outcome) for r in results] == [("failed", UNREACHABLE_MESSAGE)]
    assert mover.calls == 0


def test_mover_errors_are_logged_as_failed_runs(collectors, runs, clock, setup):
    scheduler, checker, _, _ = setup
    failing = Scheduler(collectors, runs, checker, FakeMover(error=RuntimeError("disk full")), clock)
    clock.advance(hours=11)
    result = failing.tick()[0]
    assert result.status == "failed"
    assert "disk full" in result.outcome
    assert result.can_undo is False


def test_overlapping_runs_are_skipped_and_logged(collectors, runs, clock):
    service = CollectorService(collectors, runs, clock)
    record = collectors.add("Busy", "/busy")
    service.save_schedule(record.id, ScheduleDraft(enabled=True, kind="daily", time="23:00"))
    holder: dict = {}

    class ReentrantMover:
        def move(self, collector, run_id, progress):  # noqa: ANN001
            holder["inner"] = holder["scheduler"].run(collector, "manual")
            return "outer finished"

    scheduler = Scheduler(collectors, runs, FakeChecker(), ReentrantMover(), clock)
    holder["scheduler"] = scheduler
    outer = scheduler.run(collectors.get(record.id), "scheduled")
    assert outer.status == "done"
    assert holder["inner"].status == "skipped"
    assert holder["inner"].outcome == OVERLAP_MESSAGE
    assert scheduler.run(collectors.get(record.id), "manual").status == "done"


def test_checker_receives_the_collector_source(setup, clock):
    scheduler, checker, _, _ = setup
    clock.advance(hours=11)
    scheduler.tick()
    assert checker.checked == ["/Volumes/Coach"]


def test_due_slot_is_none_without_a_last_slot(collectors, runs, clock):
    record = collectors.add("New", "/new")
    scheduler = Scheduler(collectors, runs, FakeChecker(), FakeMover(), clock)
    assert scheduler.due_slot(record, clock.now() + timedelta(days=5)) is None
