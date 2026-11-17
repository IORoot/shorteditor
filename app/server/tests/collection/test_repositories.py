import pytest
from datetime import timedelta

from collector_server.collection.models import ScheduleDraft


@pytest.mark.full
@pytest.mark.full
def test_add_and_get_collector(collectors):
    record = collectors.add("Coach", "/Volumes/Coach")
    assert record.id == 1
    assert record.transfer == "move"
    assert record.enabled is False
    assert collectors.get(1) == record
    assert collectors.get(99) is None


@pytest.mark.full
@pytest.mark.full
def test_list_returns_collectors_in_id_order(collectors):
    collectors.add("A", "/a")
    collectors.add("B", "/b")
    assert [c.name for c in collectors.list()] == ["A", "B"]


def test_save_schedule_round_trips_the_fields(collectors, clock):
    record = collectors.add("Coach", "/c")
    draft = ScheduleDraft(enabled=True, kind="weekly", time="02:00", weekdays=[6, 0], day_of_month=1)
    saved = collectors.save_schedule(record.id, draft, "0 2 * * 0,6", clock.now())
    assert saved is not None
    assert saved.enabled and saved.weekdays == [0, 6] and saved.cron == "0 2 * * 0,6"
    assert saved.last_slot == clock.now()
    assert saved.draft().weekdays == [0, 6]


@pytest.mark.full
@pytest.mark.full
def test_save_schedule_for_missing_collector_returns_none(collectors, clock):
    draft = ScheduleDraft(enabled=True, kind="daily", time="02:00")
    assert collectors.save_schedule(42, draft, "0 2 * * *", clock.now()) is None


@pytest.mark.full
@pytest.mark.full
def test_set_last_slot(collectors, clock):
    record = collectors.add("A", "/a")
    collectors.set_last_slot(record.id, clock.now())
    assert collectors.get(record.id).last_slot == clock.now()


@pytest.mark.full
@pytest.mark.full
def test_runs_are_returned_newest_first_and_limited(collectors, runs, clock):
    record = collectors.add("A", "/a")
    for i in range(7):
        runs.add(record.id, clock.now() + timedelta(hours=i), "manual", "done", f"run {i}", can_undo=True)
    recent = runs.recent(record.id)
    assert [r.outcome for r in recent] == ["run 6", "run 5", "run 4", "run 3", "run 2"]
    assert recent[0].can_undo is True


@pytest.mark.full
@pytest.mark.full
def test_runs_are_scoped_to_their_collector(collectors, runs, clock):
    first, second = collectors.add("A", "/a"), collectors.add("B", "/b")
    runs.add(first.id, clock.now(), "manual", "done", "a")
    assert runs.recent(second.id) == []
