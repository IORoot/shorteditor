import pytest

from collector_server.pipeline.repository import PipelineRepository
from collector_server.pipeline.schema import ensure_schema
from collector_server.shared.pipeline import StageStep

T1 = "2026-11-17T10:00:00+00:00"
T2 = "2026-11-17T11:00:00+00:00"


@pytest.fixture
def repo(db):
    ensure_schema(db)
    return PipelineRepository(db)


def test_create_and_get_round_trip(repo):
    steps = [StageStep(key="scan_folder"), StageStep(key="limit_length", settings={"maxSeconds": 45}, enabled=False)]
    made = repo.create("Join", "desc", steps, T1)
    got = repo.get(made.id)
    assert got == made
    assert got.steps == steps
    assert got.enabled is True
    assert got.created_at == got.updated_at == T1


def test_list_is_in_id_order(repo):
    a = repo.create("A", "", [], T1)
    b = repo.create("B", "", [], T1)
    assert [p.id for p in repo.list()] == [a.id, b.id]


def test_update_changes_content_and_updated_at_only(repo):
    p = repo.create("A", "", [], T1)
    repo.update(p.id, "B", "d", [StageStep(key="x")], T2)
    got = repo.get(p.id)
    assert (got.name, got.description, got.steps, got.updated_at, got.created_at, got.enabled) == ("B", "d", [StageStep(key="x")], T2, T1, True)


def test_set_enabled_does_not_change_updated_at(repo):
    p = repo.create("A", "", [], T1)
    repo.set_enabled(p.id, False)
    got = repo.get(p.id)
    assert got.enabled is False and got.updated_at == T1
    repo.set_enabled(p.id, True)
    assert repo.get(p.id).enabled is True


def test_delete_removes_it_and_get_returns_none(repo):
    p = repo.create("A", "", [], T1)
    repo.delete(p.id)
    assert repo.get(p.id) is None


def test_meta_set_get_and_overwrite(repo):
    assert repo.get_meta("seeded") is None
    repo.set_meta("seeded", "1")
    assert repo.get_meta("seeded") == "1"
    repo.set_meta("seeded", "2")
    assert repo.get_meta("seeded") == "2"
