from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from collector_server.collection.api import create_app
from collector_server.collection.move_repository import MoveRepository
from collector_server.collection.service import CollectorService
from tests.conftest import LONDON


@pytest.fixture
def client(collectors, runs, clock):
    return TestClient(create_app(CollectorService(collectors, runs, clock)))


@pytest.mark.full
@pytest.mark.full
def test_creating_a_collector_gives_it_a_name_and_defaults(client, collectors):
    response = client.post("/api/collectors", json={"name": "  Coach Saturdays  "})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Coach Saturdays" and body["config"]["filters"] == []
    assert collectors.get(body["id"]) is not None


@pytest.mark.full
@pytest.mark.full
def test_creating_without_a_name_is_rejected(client):
    response = client.post("/api/collectors", json={"name": "   "})
    assert response.status_code == 422 and "name" in response.json()["detail"]


def test_deleting_removes_the_collector_its_runs_and_their_moves(client, collectors, runs, db):
    moves = MoveRepository(db)
    record = collectors.add("Gone", "/src")
    run = runs.add(record.id, datetime(2026, 11, 14, 9, 0, tzinfo=LONDON), "manual", "done", "ok")
    moves.add(run.id, "/src/a.mp4", "/out/a.mp4", "move")
    assert client.delete(f"/api/collectors/{record.id}").status_code == 204
    assert collectors.get(record.id) is None and runs.recent(record.id) == [] and moves.count(run.id) == 0


@pytest.mark.full
@pytest.mark.full
def test_deleting_a_missing_collector_is_a_404(client):
    assert client.delete("/api/collectors/999").status_code == 404


@pytest.mark.full
@pytest.mark.full
def test_deleting_while_a_run_is_in_progress_is_refused(client, collectors, runs, clock):
    record = collectors.add("Busy", "/src")
    runs.add(record.id, clock.now(), "manual", "running", "Moving…")
    response = client.delete(f"/api/collectors/{record.id}")
    assert response.status_code == 409 and "in progress" in response.json()["detail"]
    assert collectors.get(record.id) is not None


@pytest.mark.full
@pytest.mark.full
def test_turning_a_collector_off_is_saved_and_reported(client, collectors):
    record = collectors.add("Off", "/src")
    assert client.put(f"/api/collectors/{record.id}/active", json={"active": False}).json()["active"] is False
    assert collectors.get(record.id).active is False


@pytest.mark.full
@pytest.mark.full
def test_turning_a_collector_back_on_allows_runs(client, collectors):
    record = collectors.add("Toggle", "/src")
    client.put(f"/api/collectors/{record.id}/active", json={"active": False})
    assert client.put(f"/api/collectors/{record.id}/active", json={"active": True}).json()["active"] is True
    assert collectors.get(record.id).active is True


@pytest.mark.full
@pytest.mark.full
def test_turning_an_unknown_collector_on_or_off_is_a_404(client):
    assert client.put("/api/collectors/999/active", json={"active": True}).status_code == 404


def test_a_turned_off_collector_refuses_run_now_in_the_run_service(collectors, runs, clock, tmp_path):
    from collector_server.collection.run_service import RunService
    from collector_server.collection.planner import TransferPlanner
    from collector_server.collection.undo import UndoService
    record = collectors.add("Off", str(tmp_path))
    collectors.set_active(record.id, False, clock.now())
    service = RunService(collectors, TransferPlanner(clock), scheduler=None, undo=UndoService(None, runs, None))
    with pytest.raises(ValueError, match="turned off"):
        service.start_run(record.id)
