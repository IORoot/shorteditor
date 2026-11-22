import os

import pytest

from collector_server.production.batch_watch import BatchWatcher
from collector_server.production.builtin import build_registry
from collector_server.production.catalog import StageLibrary
from collector_server.production.errors import InvalidInputError
from collector_server.production.models import BulkCreate
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import ProductionService
from collector_server.production.stage_api import StageStep
from collector_server.shared.pipeline import PipelineRef
from tests.production.helpers import FakePipelines

DATE = r"^\d{4}-\d{2}-\d{2}_.+$"
STEPS = [StageStep(key=k) for k in ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]]
START = 1_800_000_000.0


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
    pipelines = FakePipelines({1: PipelineRef(id=1, name="Join", enabled=True, steps=STEPS)})
    service = ProductionService(batches, passes, LogRepository(db), StageLibrary(build_registry()), pipelines, lambda: "t", str(tmp_path / "out"), ["local"], clock=clock)
    watcher = BatchWatcher(service, batches, passes, clock)

    class World:
        pass

    w = World()
    w.clock, w.batches, w.passes, w.service, w.watcher, w.pipelines = clock, batches, passes, service, watcher, pipelines
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

    def make(**over):
        request = BulkCreate(**{"parent_folder": str(w.parent), "pattern": DATE, "pipeline_id": 1, "auto_run": True, "watching": True, **over})
        return service.create_batches(request).created[0]

    w.folder, w.make = folder, make
    w.cards = lambda batch: sorted(c.folder for c in passes.for_batch(batch.id))
    return w


def test_a_watching_batch_starts_with_the_folders_already_there_and_keeps_its_watch_settings(world):
    a = world.folder("2026-11-07_a")
    batch = world.make(watch_interval_minutes=7, watch_settle_minutes=3, watch_max_per_check=4)
    assert world.cards(batch) == [a]
    assert (batch.watching, batch.watch_interval_minutes, batch.watch_settle_minutes, batch.watch_max_per_check) == (True, 7, 3, 4)


def test_a_new_settled_folder_becomes_a_card_of_the_same_batch_not_a_new_batch(world):
    world.folder("2026-11-07_a")
    batch = world.make()
    b = world.folder("2026-11-14_b")
    result = world.watcher.check(batch.id)
    assert result.created == 1 and len(world.batches.list()) == 1
    assert b in world.cards(batch)
    assert {c.status for c in world.passes.for_batch(batch.id)} == {"queued"}


def test_with_auto_run_off_a_new_card_waits_held(world):
    world.folder("2026-11-07_a")
    batch = world.make(auto_run=False)
    world.folder("2026-11-14_b")
    world.watcher.check(batch.id)
    assert {c.status for c in world.passes.for_batch(batch.id)} == {"held"}


def test_a_folder_still_changing_waits_until_it_has_been_quiet_for_the_settle_time(world):
    world.folder("2026-11-07_a")
    batch = world.make(watch_settle_minutes=10)
    fresh = world.folder("2026-11-14_b", age_minutes=2)
    result = world.watcher.check(batch.id)
    assert result.created == 0 and result.waiting == ["2026-11-14_b"]
    assert fresh not in world.cards(batch)
    world.clock.advance(20)
    assert world.watcher.check(batch.id).created == 1


def test_a_folder_with_no_videos_is_not_added(world):
    batch = world.make(watch_existing=False)
    (world.parent / "2026-11-14_empty").mkdir()
    assert world.watcher.check(batch.id).created == 0


def test_at_most_the_per_check_limit_is_added_and_the_rest_wait_for_the_next_check(world):
    batch = world.make(watch_max_per_check=2, watch_existing=False)
    for n in range(5):
        world.folder(f"2026-11-0{n + 1}_x")
    assert world.watcher.check(batch.id).created == 2
    assert world.watcher.check(batch.id).created == 2
    assert world.watcher.check(batch.id).created == 1
    assert len(world.cards(batch)) == 5


def test_without_the_existing_folders_they_are_skipped_for_good_and_only_new_ones_are_added(world):
    old = world.folder("2026-11-07_old")
    batch = world.make(watch_existing=False)
    assert world.cards(batch) == []
    new = world.folder("2026-11-14_new")
    world.watcher.check(batch.id)
    assert world.cards(batch) == [new] and old not in world.cards(batch)


def test_a_folder_whose_card_was_deleted_is_not_added_again(world):
    a = world.folder("2026-11-07_a")
    batch = world.make(auto_run=False)
    [card] = world.passes.for_batch(batch.id)
    world.service.card_action(card.id, "delete")
    assert world.cards(batch) == []
    world.watcher.check(batch.id)
    assert a not in world.cards(batch)


def test_tick_checks_only_watching_batches_whose_interval_has_passed(world):
    world.folder("2026-11-07_a")
    watching = world.make(watch_interval_minutes=5)
    world.folder("2026-11-14_b")
    assert world.watcher.tick() == [watching.id]      # never checked: due
    world.clock.advance(2)
    world.folder("2026-11-21_c")
    assert world.watcher.tick() == []                  # 2 of 5 minutes
    world.clock.advance(4)
    assert world.watcher.tick() == [watching.id]
    assert len(world.cards(watching)) == 3


def test_a_batch_that_is_not_watching_is_never_checked(world):
    world.folder("2026-11-07_a")
    plain = world.make(watching=False)
    world.folder("2026-11-14_b")
    assert world.watcher.tick() == [] and len(world.cards(plain)) == 1


def test_a_batch_is_paused_while_its_pipeline_is_off(world):
    batch = world.make(watch_existing=False)
    world.folder("2026-11-14_b")
    world.pipelines.pipelines[1] = PipelineRef(id=1, name="Join", enabled=False, steps=STEPS)
    assert world.watcher.check(batch.id).created == 0
    world.pipelines.pipelines[1] = PipelineRef(id=1, name="Join", enabled=True, steps=STEPS)
    assert world.watcher.check(batch.id).created == 1


def test_watching_can_be_switched_on_later_and_starts_from_now_not_from_folders_that_were_deleted(world):
    a = world.folder("2026-11-07_a")
    batch = world.make(watching=False)
    [card] = world.passes.for_batch(batch.id)
    world.service.card_action(card.id, "delete")
    world.service.update_batch(batch.id, None, None, watching=True)
    world.watcher.check(batch.id)
    assert a not in world.cards(batch)
    b = world.folder("2026-11-14_b")
    world.watcher.check(batch.id)
    assert b in world.cards(batch)


def test_the_watch_settings_can_be_changed_and_are_checked(world):
    world.folder("2026-11-07_a")
    batch = world.make()
    changed = world.service.update_batch(batch.id, None, None, watch_interval_minutes=15, watch_settle_minutes=0, watch_max_per_check=3)
    assert (changed.watch_interval_minutes, changed.watch_settle_minutes, changed.watch_max_per_check) == (15, 0, 3)
    for bad in ({"watch_interval_minutes": 0}, {"watch_interval_minutes": 2000}, {"watch_settle_minutes": -1}, {"watch_max_per_check": 0}, {"watch_max_per_check": 500}):
        with pytest.raises(InvalidInputError):
            world.service.update_batch(batch.id, None, None, **bad)


def test_only_a_batch_made_from_subfolders_can_watch(world):
    world.folder("2026-11-07_a")
    one_folder = world.make(watching=False, ignore_subfolders=True)
    with pytest.raises(InvalidInputError, match="subfolders"):
        world.service.update_batch(one_folder.id, None, None, watching=True)
    with pytest.raises(InvalidInputError, match="subfolders"):
        world.make(ignore_subfolders=True)


def test_the_batch_list_says_how_a_watching_batch_is_doing(world):
    world.folder("2026-11-07_a")
    batch = world.make(watch_settle_minutes=10)
    [item] = world.service.batch_list()
    assert (item.watching, item.watch_line) == (True, "Watching · not checked yet")
    world.folder("2026-11-14_b", age_minutes=2)
    world.watcher.check(batch.id)
    assert world.service.batch_list()[0].watch_line == "Watching · waiting for 2026-11-14_b to settle"
    world.clock.advance(30)
    world.watcher.check(batch.id)
    assert world.service.batch_list()[0].watch_line == "Watching · checks every 5 min"
