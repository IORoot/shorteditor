import logging

import pytest

from collector_server.production.watch_scheduler import WatchScheduler
from tests.production.test_watch_service import DATE, STEPS, START, world  # noqa: F401


@pytest.fixture
def scheduler(world):
    return WatchScheduler(world.watches, world.ws, world.clock)


def test_a_new_watch_is_checked_at_the_first_tick_then_only_when_due(world, scheduler):
    watch = world.ws.create(world.data(interval_minutes=5))
    assert scheduler.tick() == [watch.id]
    assert scheduler.tick() == []
    world.clock.advance(4)
    assert scheduler.tick() == []
    world.clock.advance(1.1)
    assert scheduler.tick() == [watch.id]


def test_a_paused_watch_is_never_checked(world, scheduler):
    watch = world.ws.create(world.data(enabled=False))
    world.clock.advance(1000)
    assert scheduler.tick() == []
    assert world.watches.get(watch.id).last_checked_at is None


@pytest.mark.full
@pytest.mark.full
def test_only_due_enabled_watches_are_checked(world, scheduler):
    fast = world.ws.create(world.data(name="fast", interval_minutes=1))
    slow = world.ws.create(world.data(name="slow", interval_minutes=60))
    scheduler.tick()
    world.clock.advance(2)
    assert scheduler.tick() == [fast.id] and slow.id not in scheduler.tick()


@pytest.mark.full
@pytest.mark.full
def test_one_watch_failing_does_not_stop_the_others(world, scheduler, caplog, monkeypatch):
    bad = world.ws.create(world.data(name="bad"))
    good = world.ws.create(world.data(name="good"))
    real = world.ws.check

    def check(watch_id):
        if watch_id == bad.id:
            raise RuntimeError("boom")
        return real(watch_id)

    monkeypatch.setattr(world.ws, "check", check)
    with caplog.at_level(logging.ERROR):
        assert scheduler.tick() == [good.id]
    assert "boom" in caplog.text and world.watches.get(good.id).last_checked_at is not None


@pytest.mark.full
@pytest.mark.full
def test_a_watch_whose_folder_vanished_is_checked_again_after_its_interval(world, scheduler):
    watch = world.ws.create(world.data(interval_minutes=5))
    world.parent.rename(world.tmp / "gone")
    assert scheduler.tick() == [watch.id]
    assert world.watches.get(watch.id).last_error
    world.clock.advance(5.1)
    assert scheduler.tick() == [watch.id]


@pytest.mark.full
@pytest.mark.full
def test_a_clock_that_jumps_back_does_not_silence_a_watch(world, scheduler):
    watch = world.ws.create(world.data(interval_minutes=5))
    scheduler.tick()
    world.clock.advance(-60)
    assert scheduler.tick() == [watch.id]


@pytest.mark.full
@pytest.mark.full
def test_a_bad_stored_timestamp_does_not_stop_the_tick(world, scheduler, db):
    good = world.ws.create(world.data(name="good"))
    bad = world.ws.create(world.data(name="bad"))
    db.execute("UPDATE production_watches SET last_checked_at = 'garbage' WHERE id = ?", (bad.id,))
    assert good.id in scheduler.tick()
