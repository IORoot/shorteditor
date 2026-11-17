import pytest
from pydantic import ValidationError

from collector_server.production.schema import ensure_schema
from collector_server.production.stage_api import StageStep
from collector_server.production.watch_models import WatchCreate
from collector_server.production.watch_repository import WatchRepository

NOW = "2026-11-17T10:00:00+00:00"
STEPS = [StageStep(key="scan_folder"), StageStep(key="limit_length", settings={"maxSeconds": 45})]


def data(**over):
    return WatchCreate(**{"name": "Coach Saturdays", "parent_folder": "/Volumes/Edit/Collected", "pattern": r"^\d{4}-.+$", "steps": STEPS, **over})


@pytest.fixture
def repo(db):
    ensure_schema(db)
    return WatchRepository(db)


def test_schema_is_idempotent(db):
    ensure_schema(db)
    ensure_schema(db)


def test_watch_round_trips_every_field_and_steps(repo):
    made = repo.create(data(name_template="{1} coach", run_on="studio", output_root="/out", interval_minutes=15, settle_minutes=3, max_per_check=7, enabled=False), NOW)
    got = repo.get(made.id)
    assert got == made
    assert (got.name, got.parent_folder, got.pattern, got.name_template, got.run_on, got.output_root) == ("Coach Saturdays", "/Volumes/Edit/Collected", r"^\d{4}-.+$", "{1} coach", "studio", "/out")
    assert (got.interval_minutes, got.settle_minutes, got.max_per_check, got.enabled) == (15, 3, 7, False)
    assert got.steps[1].settings == {"maxSeconds": 45}
    assert (got.created_at, got.last_checked_at, got.last_error, got.waiting, got.created_total) == (NOW, None, None, [], 0)


def test_defaults_match_the_design(repo):
    made = repo.create(data(), NOW)
    assert (made.interval_minutes, made.settle_minutes, made.max_per_check, made.enabled, made.name_template, made.run_on) == (5, 10, 20, True, "{name}", "any")


def test_unknown_watch_is_none_and_list_is_in_creation_order(repo):
    assert repo.get(99) is None
    first, second = repo.create(data(name="A"), NOW), repo.create(data(name="B"), NOW)
    assert [w.id for w in repo.list()] == [first.id, second.id]


def test_update_keeps_seen_list_and_counts(repo):
    made = repo.create(data(), NOW)
    repo.mark_seen(made.id, ["/p/2026-11-07_a"], NOW)
    repo.record_check(made.id, NOW, None, [], 2)
    repo.update(made.id, data(name="Renamed", pattern="^x$", interval_minutes=9))
    got = repo.get(made.id)
    assert (got.name, got.pattern, got.interval_minutes) == ("Renamed", "^x$", 9)
    assert repo.seen(made.id) == {"/p/2026-11-07_a"} and got.created_total == 2 and got.last_checked_at == NOW


def test_delete_removes_the_seen_list(repo, db):
    made = repo.create(data(), NOW)
    repo.mark_seen(made.id, ["/p/a"], NOW)
    repo.delete(made.id)
    assert repo.get(made.id) is None
    assert db.query("SELECT COUNT(*) AS n FROM production_watch_seen")[0]["n"] == 0


def test_set_enabled(repo):
    made = repo.create(data(), NOW)
    assert repo.set_enabled(made.id, False).enabled is False
    assert repo.set_enabled(made.id, True).enabled is True


def test_record_check_adds_to_the_total_and_stores_waiting_and_error(repo):
    made = repo.create(data(), NOW)
    repo.record_check(made.id, "t1", None, ["2026-11-09_x"], 2)
    repo.record_check(made.id, "t2", "The folder was not found", [], 3)
    got = repo.get(made.id)
    assert (got.last_checked_at, got.last_error, got.waiting, got.created_total) == ("t2", "The folder was not found", [], 5)


def test_mark_seen_is_idempotent_and_per_watch(repo):
    one, two = repo.create(data(name="A"), NOW), repo.create(data(name="B"), NOW)
    repo.mark_seen(one.id, ["/p/a", "/p/b"], NOW)
    repo.mark_seen(one.id, ["/p/a"], NOW)
    assert repo.seen(one.id) == {"/p/a", "/p/b"} and repo.seen(two.id) == set()


@pytest.mark.parametrize(
    "over",
    [{"interval_minutes": 0}, {"interval_minutes": 1441}, {"settle_minutes": -1}, {"settle_minutes": 1441}, {"max_per_check": 0}, {"max_per_check": 101}, {"name": ""}, {"name": "x" * 121}, {"name": "a\nb"}, {"pattern": "x" * 201}, {"parent_folder": "/" + "x" * 1001}, {"steps": [StageStep(key="a")] * 31}],
)
def test_field_limits_are_enforced(over):
    with pytest.raises(ValidationError):
        data(**over)


def test_unknown_watch_calls_raise(repo):
    with pytest.raises(KeyError):
        repo.update(99, data())
    with pytest.raises(KeyError):
        repo.set_enabled(99, True)
