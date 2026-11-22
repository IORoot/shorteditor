import pytest

from collector_server.collection.models import ScheduleDraft
from collector_server.collection.scheduler import Scheduler
from collector_server.collection.service import CollectorService
from tests.conftest import FakeChecker, FakeMover


class FakeProbe:
    """What the source holds: a listing that changes when the files do, and how many clips the filters would collect."""

    def __init__(self) -> None:
        self.listing: tuple = ("a.mp4",)
        self.matching = 2

    def snapshot(self, collector):  # noqa: ANN001, ANN201
        return self.listing

    def waiting(self, collector):  # noqa: ANN001, ANN201
        return self.matching


def auto(poll=60, settle=120, **more):
    return ScheduleDraft(enabled=False, kind="daily", time="02:00", mode="auto", poll_seconds=poll, settle_seconds=settle, **more)


@pytest.fixture
def setup(collectors, runs, clock):
    service = CollectorService(collectors, runs, clock)
    record = collectors.add("Coach", "/Volumes/Coach")
    service.save_schedule(record.id, auto())
    checker, mover, probe = FakeChecker(), FakeMover(), FakeProbe()
    scheduler = Scheduler(collectors, runs, checker, mover, clock, undoable=lambda _id: True, probe=probe)

    def poll(seconds=60):
        clock.advance(seconds=seconds)
        return scheduler.tick()

    return scheduler, checker, mover, probe, record.id, poll, service


def test_waits_for_the_folder_to_settle_then_runs_as_watched(setup, runs):
    scheduler, _, mover, _, collector_id, poll, _ = setup
    assert poll() == []  # first look: nothing to compare with
    assert poll() == []  # same listing, but only 60s of calm
    (run,) = poll()      # 120s of calm
    assert (run.trigger, run.status) == ("watched", "done")
    assert mover.calls == 1
    assert [r.trigger for r in runs.recent(collector_id)] == ["watched"]


def test_a_changing_folder_keeps_waiting(setup):
    _, _, mover, probe, _, poll, _ = setup
    for count in range(5):
        probe.listing = ("a.mp4",) * (count + 1)  # a clip is still being written
        assert poll() == []
    assert mover.calls == 0


def test_nothing_waiting_writes_no_run(setup, runs):
    _, _, mover, probe, collector_id, poll, _ = setup
    probe.matching = 0
    for _ in range(6):
        assert poll() == []
    assert mover.calls == 0 and runs.recent(collector_id) == []


def test_polls_no_faster_than_the_interval(setup):
    _, checker, _, _, _, poll, _ = setup
    poll(30)
    poll(30)  # only 30s since the last look
    assert len(checker.checked) == 1


def test_an_unreachable_source_is_skipped_without_a_run(setup, runs):
    scheduler, checker, mover, _, collector_id, poll, _ = setup
    checker.reachable = False
    for _ in range(4):
        assert poll() == []
    assert mover.calls == 0 and runs.recent(collector_id) == []
    assert scheduler.watch_info(collector_id).unreachable is True


def test_a_restart_starts_unsettled(setup, collectors, runs, clock):
    _, checker, mover, probe, _, poll, _ = setup
    poll(); poll()
    fresh = Scheduler(collectors, runs, checker, mover, clock, probe=probe)  # a new server process has no memory of the folder
    clock.advance(seconds=60)
    assert fresh.tick() == []
    assert mover.calls == 0


def test_a_run_in_progress_is_skipped_quietly(setup, runs):
    scheduler, _, mover, _, collector_id, poll, _ = setup
    poll(); poll()
    scheduler._running.add(collector_id)
    assert poll() == []
    assert mover.calls == 0 and runs.recent(collector_id) == []


def test_schedule_mode_collectors_are_not_polled(setup, collectors, clock):
    scheduler, checker, _, _, collector_id, poll, service = setup
    service.save_schedule(collector_id, ScheduleDraft(enabled=True, kind="daily", time="23:00"))
    poll(); poll(); poll()
    assert checker.checked == []


def test_a_collector_turned_off_is_not_polled(setup):
    _, checker, _, _, collector_id, poll, service = setup
    service.set_active(collector_id, False)
    poll(); poll(); poll()
    assert checker.checked == []


def test_a_failed_run_does_not_stop_later_polls(setup):
    _, _, mover, probe, _, poll, _ = setup
    mover.error = RuntimeError("disk full")
    poll(); poll()
    (failed,) = poll()
    assert failed.status == "failed"
    mover.error = None
    probe.listing = ("b.mp4",)
    poll(); poll()
    assert [r.status for r in poll()] == ["done"]


def test_last_checked_is_remembered_for_the_list(setup, clock):
    scheduler, _, _, _, collector_id, poll, _ = setup
    assert scheduler.watch_info(collector_id) is None
    poll()
    assert scheduler.watch_info(collector_id).last_checked == clock.now()


# the planner and the real probe, over real files

from datetime import datetime

from collector_server.collection.planner import TransferPlanner
from collector_server.collection.source_probe import PlannerProbe
from tests.conftest import LONDON
from tests.helpers import config_for, make_clip

SAT = datetime(2026, 11, 14, 18, 40, tzinfo=LONDON)


@pytest.fixture
def folders(tmp_path):
    source, output = tmp_path / "in", tmp_path / "out"
    source.mkdir()
    output.mkdir()
    for name in "abcde":
        make_clip(source / f"{name}.mp4", SAT)
    return source, output


def saved(collectors, clock, folders, draft):
    source, output = folders
    record = collectors.add_with_config(config_for(source, output))
    CollectorService(collectors, None, clock).save_schedule(record.id, draft)
    return collectors.get(record.id)


def test_an_auto_run_takes_at_most_the_cap_and_leaves_the_rest_for_later(collectors, clock, folders):
    record = saved(collectors, clock, folders, auto(max_files=2))
    plan = TransferPlanner(clock).plan(record)
    assert plan.total_files == 2 and plan.held_back == 3
    assert [f.name for g in plan.groups for f in g.files] == ["a.mp4", "b.mp4"]


def test_a_scheduled_collector_is_never_capped(collectors, clock, folders):
    record = saved(collectors, clock, folders, ScheduleDraft(enabled=False, kind="daily", time="02:00", max_files=2))
    assert TransferPlanner(clock).plan(record).total_files == 5


def test_the_probe_counts_everything_waiting_even_past_the_cap(collectors, clock, folders):
    record = saved(collectors, clock, folders, auto(max_files=2))
    assert PlannerProbe(TransferPlanner(clock)).waiting(record) == 5


def test_the_probe_listing_changes_with_a_file_size_or_a_new_file(collectors, clock, folders):
    source, _ = folders
    record = saved(collectors, clock, folders, auto())
    probe = PlannerProbe(TransferPlanner(clock))
    before = probe.snapshot(record)
    assert probe.snapshot(record) == before
    (source / "a.mp4").write_bytes(b"more bytes than before")
    grown = probe.snapshot(record)
    assert grown != before
    make_clip(source / "f.mp4", SAT)
    assert probe.snapshot(record) != grown


def test_a_settled_folder_with_nothing_to_collect_is_not_planned_again_until_it_changes(setup):
    _, _, _, probe, _, poll, _ = setup
    asked = []
    original = probe.waiting
    probe.waiting = lambda collector: (asked.append(1), original(collector))[1]
    probe.matching = 0
    for _ in range(8):
        poll()
    assert len(asked) == 1
    probe.listing = ("a.mp4", "b.mp4")
    probe.matching = 1
    poll(); poll()
    assert [r.status for r in poll()] == ["done"]


def test_a_run_that_fails_is_not_repeated_until_the_folder_changes(setup, runs):
    _, _, mover, probe, collector_id, poll, _ = setup
    mover.error = RuntimeError("disk full")
    poll(); poll()
    assert [r.status for r in poll()] == ["failed"]
    for _ in range(8):
        assert poll() == []
    assert len(runs.recent(collector_id)) == 1
    mover.error = None
    probe.listing = ("b.mp4",)
    poll(); poll()
    assert [r.status for r in poll()] == ["done"]


def test_a_copy_of_an_auto_collecting_collector_starts_on_a_schedule_not_auto_collecting(collectors, runs, clock):
    service = CollectorService(collectors, runs, clock)
    record = collectors.add("Coach", "/Volumes/Coach")
    service.save_schedule(record.id, auto())
    copy = service.duplicate_collector(record.id)
    assert (copy.schedule.mode, copy.schedule.enabled) == ("schedule", False)
