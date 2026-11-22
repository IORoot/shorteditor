import os
import threading

import pytest

from collector_server.production.builtin import build_registry
from collector_server.production.errors import InvalidInputError
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import NotFoundError, ProductionService
from collector_server.production.catalog import StageLibrary
from tests.production.helpers import FakePipelines
from collector_server.production.stage_api import StageStep
from collector_server.production.watch_models import WatchCreate
from collector_server.production.watch_repository import WatchRepository
from collector_server.production.watch_service import WatchService

DATE = r"^\d{4}-\d{2}-\d{2}_.+$"
STEPS = [StageStep(key=k) for k in ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]]
START = 1_800_000_000.0  # a fixed "now" in epoch seconds


class Clock:
    def __init__(self):
        self.now = START

    def __call__(self):
        return self.now

    def advance(self, minutes):
        self.now += minutes * 60


@pytest.fixture
def world(db, tmp_path):
    ensure_schema(db)
    clock = Clock()
    batches, passes = BatchRepository(db), PassRepository(db)
    service = ProductionService(batches, passes, LogRepository(db), StageLibrary(build_registry()), FakePipelines(), lambda: "t", str(tmp_path / "out"), ["local", "studio"])
    watches = WatchRepository(db)
    watch_service = WatchService(watches, service, clock)

    class World:
        pass

    w = World()
    w.clock, w.batches, w.passes, w.service, w.watches, w.ws, w.tmp = clock, batches, passes, service, watches, watch_service, tmp_path
    w.parent = tmp_path / "collected"
    w.parent.mkdir()

    def folder(name, clips=2, age_minutes=60):
        base = w.parent / name
        base.mkdir(parents=True, exist_ok=True)
        for n in range(clips):
            (base / f"c{n}.mp4").write_bytes(b"x")
        when = START - age_minutes * 60
        for path in [base, *base.iterdir()]:
            os.utime(path, (when, when))
        return str(base)

    w.folder = folder
    w.data = lambda **kw: WatchCreate(**{"name": "Coach", "parent_folder": str(w.parent), "pattern": DATE, "pipeline_id": 1, **kw})
    return w


def test_new_matching_folder_gets_a_batch(world):
    watch = world.ws.create(world.data())
    world.folder("2026-11-07_a")
    result = world.ws.check(watch.id)
    assert [b.name for b in result.created] == ["2026-11-07_a"] and result.error is None
    assert world.passes.for_batch(result.created[0].id)[0].status == "queued"
    assert world.watches.get(watch.id).created_total == 1


def test_folder_still_changing_is_waiting_and_named(world):
    watch = world.ws.create(world.data(settle_minutes=10))
    world.folder("2026-11-07_a", age_minutes=4)
    result = world.ws.check(watch.id)
    assert result.created == [] and result.waiting == ["2026-11-07_a"]
    assert world.watches.get(watch.id).waiting == ["2026-11-07_a"]


def test_folder_batches_once_it_has_settled(world):
    watch = world.ws.create(world.data(settle_minutes=10))
    world.folder("2026-11-07_a", age_minutes=4)
    world.ws.check(watch.id)
    world.clock.advance(7)
    result = world.ws.check(watch.id)
    assert [b.name for b in result.created] == ["2026-11-07_a"] and result.waiting == []
    assert world.watches.get(watch.id).waiting == []


@pytest.mark.full
@pytest.mark.full
def test_a_settle_time_of_zero_batches_at_once(world):
    watch = world.ws.create(world.data(settle_minutes=0))
    world.folder("2026-11-07_a", age_minutes=0)
    assert len(world.ws.check(watch.id).created) == 1


def test_nothing_is_batched_twice_across_checks(world):
    watch = world.ws.create(world.data())
    world.folder("2026-11-07_a")
    world.ws.check(watch.id)
    assert world.ws.check(watch.id).created == []
    assert len(world.batches.list()) == 1


@pytest.mark.full
@pytest.mark.full
def test_deleting_the_batch_does_not_bring_the_folder_back(world):
    watch = world.ws.create(world.data())
    world.folder("2026-11-07_a")
    [batch] = world.ws.check(watch.id).created
    world.batches.delete(batch.id)
    assert world.ws.check(watch.id).created == [] and world.batches.list() == []


@pytest.mark.full
@pytest.mark.full
def test_existing_folders_are_baselined_by_default(world):
    world.folder("2026-11-07_old")
    watch = world.ws.create(world.data())
    assert world.ws.check(watch.id).created == [] and world.batches.list() == []
    world.folder("2026-11-08_new")
    assert [b.name for b in world.ws.check(watch.id).created] == ["2026-11-08_new"]


@pytest.mark.full
@pytest.mark.full
def test_include_existing_creates_for_settled_existing_folders(world):
    world.folder("2026-11-07_old")
    world.folder("2026-11-08_busy", age_minutes=2)
    watch = world.ws.create(world.data(include_existing=True, settle_minutes=10))
    assert [b.name for b in world.batches.list()] == ["2026-11-07_old"]
    assert world.watches.get(watch.id).waiting == ["2026-11-08_busy"]


@pytest.mark.full
@pytest.mark.full
def test_folder_without_videos_is_not_marked_seen_so_it_can_be_batched_later(world):
    watch = world.ws.create(world.data())
    world.folder("2026-11-07_a", clips=0)
    assert world.ws.check(watch.id).created == []
    world.folder("2026-11-07_a", clips=2)
    assert [b.name for b in world.ws.check(watch.id).created] == ["2026-11-07_a"]


@pytest.mark.full
@pytest.mark.full
def test_a_folder_empty_at_baseline_is_still_batched_once_videos_arrive(world):
    world.folder("2026-11-07_a", clips=0)
    watch = world.ws.create(world.data())
    world.folder("2026-11-07_a", clips=3)
    assert len(world.ws.check(watch.id).created) == 1


@pytest.mark.full
@pytest.mark.full
def test_cap_per_check_leaves_the_rest_for_the_next_check(world):
    watch = world.ws.create(world.data(max_per_check=2))
    for n in range(5):
        world.folder(f"2026-11-0{n}_x")
    assert len(world.ws.check(watch.id).created) == 2
    assert len(world.ws.check(watch.id).created) == 2
    assert len(world.ws.check(watch.id).created) == 1
    assert world.ws.check(watch.id).created == []


@pytest.mark.full
@pytest.mark.full
def test_batches_are_created_in_folder_name_order(world):
    watch = world.ws.create(world.data())
    for name in ("2026-11-09_c", "2026-11-07_a", "2026-11-08_b"):
        world.folder(name)
    assert [b.name for b in world.ws.check(watch.id).created] == ["2026-11-07_a", "2026-11-08_b", "2026-11-09_c"]


def test_already_batched_folder_is_marked_seen_not_duplicated(world):
    watch = world.ws.create(world.data())
    path = world.folder("2026-11-07_a")
    world.service.create_batch("Manual", path, 1, "any", None)
    assert world.ws.check(watch.id).created == [] and len(world.batches.list()) == 1
    assert path in world.watches.seen(watch.id)


@pytest.mark.full
@pytest.mark.full
def test_missing_parent_sets_a_problem_and_recovers_when_it_returns(world):
    watch = world.ws.create(world.data())
    gone = world.tmp / "moved"
    world.parent.rename(gone)
    result = world.ws.check(watch.id)
    assert "does not exist" in result.error and world.watches.get(watch.id).last_error == result.error
    gone.rename(world.parent)
    world.folder("2026-11-07_a")
    result = world.ws.check(watch.id)
    assert result.error is None and len(result.created) == 1 and world.watches.get(watch.id).last_error is None


@pytest.mark.full
@pytest.mark.full
def test_an_invalid_pattern_or_settings_is_refused_on_create(world):
    for over, message in (({"pattern": "(a+)+"}, "far too long"), ({"name_template": "{nope}"}, "does not have"), ({"run_on": "ghost"}, "no worker"), ({"parent_folder": str(world.tmp / "nope")}, "does not exist"), ({"parent_folder": "relative"}, "absolute"), ({"output_root": str(world.parent / "x")}, "must not overlap")):
        with pytest.raises(InvalidInputError, match=message):
            world.ws.create(world.data(**over))
    assert world.watches.list() == []


@pytest.mark.full
@pytest.mark.full
def test_edit_keeps_what_was_seen(world):
    watch = world.ws.create(world.data())
    world.folder("2026-11-07_a")
    world.ws.check(watch.id)
    world.ws.update(watch.id, world.data(name="Renamed", pattern=r"^2026-.+$"))
    assert world.ws.check(watch.id).created == [] and len(world.batches.list()) == 1


@pytest.mark.full
@pytest.mark.full
def test_edit_is_validated_and_unknown_ids_are_not_found(world):
    watch = world.ws.create(world.data())
    with pytest.raises(InvalidInputError):
        world.ws.update(watch.id, world.data(pattern="(a+)+"))
    for call in (lambda: world.ws.update(99, world.data()), lambda: world.ws.delete(99), lambda: world.ws.set_enabled(99, True), lambda: world.ws.check(99), lambda: world.ws.get(99)):
        with pytest.raises(NotFoundError):
            call()


@pytest.mark.full
@pytest.mark.full
def test_two_checks_at_once_create_each_folder_once(world):
    watch = world.ws.create(world.data())
    for n in range(6):
        world.folder(f"2026-11-0{n}_x")
    counts = []
    threads = [threading.Thread(target=lambda: counts.append(len(world.ws.check(watch.id).created))) for _ in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sum(counts) == 6 and len(world.batches.list()) == 6


@pytest.mark.full
@pytest.mark.full
def test_a_watch_and_a_manual_bulk_create_never_double_up(world):
    from collector_server.production.models import BulkCreate

    watch = world.ws.create(world.data())
    for n in range(6):
        world.folder(f"2026-11-0{n}_x")
    outcomes = []

    def bulk():
        try:
            outcomes.append(len(world.service.create_batches(BulkCreate(parent_folder=str(world.parent), pattern=DATE, pipeline_id=1)).created))
        except InvalidInputError:
            outcomes.append(0)

    threads = [threading.Thread(target=bulk), threading.Thread(target=lambda: outcomes.append(len(world.ws.check(watch.id).created)))]
    [t.start() for t in threads]
    [t.join() for t in threads]
    covered = sorted(c.folder for b in world.batches.list() for c in world.passes.for_batch(b.id))
    assert covered == sorted(str(world.parent / f"2026-11-0{n}_x") for n in range(6))  # each folder is in exactly one batch


@pytest.mark.full
@pytest.mark.full
def test_the_watch_uses_its_template_settings_and_output_folder(world):
    watch = world.ws.create(world.data(name_template="{1} coach", pattern=r"^(\d{4})-\d{2}-\d{2}_.+$", run_on="studio", output_root=str(world.tmp / "reels")))
    world.folder("2026-11-07_a")
    [batch] = world.ws.check(watch.id).created
    assert (batch.name, batch.run_on, batch.output_root) == ("2026 coach", "studio", str(world.tmp / "reels"))


@pytest.mark.full
@pytest.mark.full
def test_status_and_status_line_for_each_state(world):
    watch = world.ws.create(world.data(interval_minutes=5, settle_minutes=10))
    fresh = world.ws.get(watch.id)
    assert fresh.status == "watching" and fresh.status_line == "Not checked yet"
    world.folder("2026-11-07_a")
    world.ws.check(watch.id)
    world.clock.advance(2)
    view = world.ws.get(watch.id)
    assert view.status == "watching"
    assert "created 1 batch in total" in view.status_line and "next check in 3 minutes" in view.status_line
    world.folder("2026-11-08_b", age_minutes=1)
    world.ws.check(watch.id)
    waiting = world.ws.get(watch.id)
    assert waiting.status == "waiting" and "Waiting for 2026-11-08_b to settle" in waiting.status_line and "10 quiet minutes" in waiting.status_line
    world.ws.set_enabled(watch.id, False)
    paused = world.ws.get(watch.id)
    assert paused.status == "paused" and paused.status_line.startswith("Paused")
    world.ws.set_enabled(watch.id, True)
    world.parent.rename(world.tmp / "moved")
    world.ws.check(watch.id)
    problem = world.ws.get(watch.id)
    assert problem.status == "problem" and problem.status_line.startswith("Problem:") and "Checking again in 5 minutes" in problem.status_line


@pytest.mark.full
@pytest.mark.full
def test_list_returns_views_in_creation_order(world):
    first = world.ws.create(world.data(name="A"))
    second = world.ws.create(world.data(name="B"))
    assert [v.id for v in world.ws.list()] == [first.id, second.id]


@pytest.mark.full
@pytest.mark.full
def test_delete_removes_the_watch(world):
    watch = world.ws.create(world.data())
    world.ws.delete(watch.id)
    assert world.ws.list() == []


@pytest.mark.full
@pytest.mark.full
def test_the_scheduler_cannot_batch_existing_folders_while_a_watch_is_being_created(world, monkeypatch):
    import collector_server.production.watch_service as watch_module
    from collector_server.production.watch_scheduler import WatchScheduler

    world.folder("2026-11-07_old")
    scheduler = WatchScheduler(world.watches, world.ws, world.clock)
    real = watch_module.scan_parent

    fired = []

    def slow_scan(parent, pattern):
        if not fired:
            fired.append(1)
            scheduler.tick()  # the timer fires in the middle of creating the watch
        return real(parent, pattern)

    monkeypatch.setattr(watch_module, "scan_parent", slow_scan)
    watch = world.ws.create(world.data())
    monkeypatch.setattr(watch_module, "scan_parent", real)
    assert world.batches.list() == []
    assert world.ws.get(watch.id).status == "watching" and world.watches.get(watch.id).enabled is True


@pytest.mark.full
@pytest.mark.full
def test_a_folder_still_being_copied_when_the_watch_is_created_is_batched_once_it_settles(world):
    world.folder("2026-11-07_busy", age_minutes=2)
    watch = world.ws.create(world.data(settle_minutes=10))
    assert world.ws.check(watch.id).created == []
    world.clock.advance(9)
    assert [b.name for b in world.ws.check(watch.id).created] == ["2026-11-07_busy"]


def test_changing_the_parent_folder_starts_from_a_fresh_baseline(world):
    other = world.tmp / "other"
    other.mkdir()
    for n in range(3):
        (other / f"2026-11-0{n}_old").mkdir()
        (other / f"2026-11-0{n}_old" / "c.mp4").write_bytes(b"x")
        os.utime(other / f"2026-11-0{n}_old", (START - 7200, START - 7200))
        os.utime(other / f"2026-11-0{n}_old" / "c.mp4", (START - 7200, START - 7200))
    watch = world.ws.create(world.data())
    world.ws.update(watch.id, world.data(parent_folder=str(other)))
    assert world.ws.check(watch.id).created == [] and world.batches.list() == []


@pytest.mark.full
@pytest.mark.full
def test_widening_the_pattern_does_not_batch_what_was_already_there(world):
    world.folder("2026-11-07_a")
    world.folder("notes")
    watch = world.ws.create(world.data())
    world.ws.update(watch.id, world.data(pattern=r"^.+$"))
    assert world.ws.check(watch.id).created == []


@pytest.mark.full
@pytest.mark.full
def test_changing_the_parent_with_include_existing_batches_the_new_folders(world):
    other = world.tmp / "other"
    (other / "2026-11-01_x").mkdir(parents=True)
    (other / "2026-11-01_x" / "c.mp4").write_bytes(b"x")
    os.utime(other / "2026-11-01_x", (START - 7200, START - 7200))
    os.utime(other / "2026-11-01_x" / "c.mp4", (START - 7200, START - 7200))
    watch = world.ws.create(world.data())
    world.ws.update(watch.id, world.data(parent_folder=str(other), include_existing=True))
    assert [b.name for b in world.batches.list()] == ["2026-11-01_x"]


def test_one_bad_folder_does_not_stop_the_others_and_good_ones_stay_marked(world, monkeypatch):
    watch = world.ws.create(world.data())
    for n in range(4):
        world.folder(f"2026-11-0{n}_x")
    real = world.service.create_batch

    def flaky(name, *rest, **kw):
        if name == "2026-11-01_x":
            raise InvalidInputError("The folder vanished")
        return real(name, *rest, **kw)

    monkeypatch.setattr(world.service, "create_batch", flaky)
    result = world.ws.check(watch.id)
    assert sorted(b.name for b in result.created) == ["2026-11-00_x", "2026-11-02_x", "2026-11-03_x"]
    assert "2026-11-01_x" in result.error and "vanished" in result.error
    for batch in world.batches.list():
        world.batches.delete(batch.id)
    monkeypatch.setattr(world.service, "create_batch", real)
    assert [b.name for b in world.ws.check(watch.id).created] == ["2026-11-01_x"]


@pytest.mark.full
@pytest.mark.full
def test_a_paused_watch_with_an_old_problem_says_paused_and_does_not_promise_a_check(world):
    watch = world.ws.create(world.data())
    world.parent.rename(world.tmp / "moved")
    world.ws.check(watch.id)
    world.ws.set_enabled(watch.id, False)
    view = world.ws.get(watch.id)
    assert view.status == "paused" and "Checking again" not in view.status_line and "last problem" in view.status_line
    assert ".." not in view.status_line


@pytest.mark.full
@pytest.mark.full
def test_a_problem_that_ends_with_a_dot_is_not_followed_by_another(world):
    watch = world.ws.create(world.data())
    world.watches.record_check(watch.id, "2026-11-17T10:00:00+00:00", "The folder is gone.", [], 0)
    assert ".." not in world.ws.get(watch.id).status_line


@pytest.mark.full
@pytest.mark.full
def test_the_cap_counts_only_batches_created_and_leaves_settled_folders_for_next_time(world):
    watch = world.ws.create(world.data(max_per_check=1))
    world.folder("2026-11-07_a")
    world.folder("2026-11-08_b")
    first = world.ws.check(watch.id)
    assert len(first.created) == 1 and first.waiting == []


@pytest.mark.full
@pytest.mark.full
def test_a_watch_deleted_during_its_check_is_handled(world, monkeypatch):
    watch = world.ws.create(world.data())
    world.folder("2026-11-07_a")
    real = world.service.create_batch

    def create_then_delete(*args, **kw):
        batch = real(*args, **kw)
        world.watches.delete(watch.id)
        return batch

    monkeypatch.setattr(world.service, "create_batch", create_then_delete)
    result = world.ws.check(watch.id)
    assert result.error and len(result.created) == 1


def test_a_watch_without_an_output_folder_puts_the_output_beside_the_watched_folder_not_inside_it(world):
    watch = world.ws.create(world.data())
    world.folder("2026-11-07_a")
    [batch] = world.ws.check(watch.id).created
    assert batch.output_root == str(world.parent.parent / "output")
