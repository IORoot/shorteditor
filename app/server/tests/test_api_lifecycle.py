from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from collector_server.api import create_app
from collector_server.move_repository import MoveRepository
from collector_server.service import CollectorService
from tests.conftest import LONDON


@pytest.fixture
def client(collectors, runs, clock):
    return TestClient(create_app(CollectorService(collectors, runs, clock)))


def test_creating_a_collector_gives_it_a_name_and_defaults(client, collectors):
    response = client.post("/api/collectors", json={"name": "  Coach Saturdays  "})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Coach Saturdays" and body["config"]["filters"] == []
    assert collectors.get(body["id"]) is not None


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


def test_deleting_a_missing_collector_is_a_404(client):
    assert client.delete("/api/collectors/999").status_code == 404


def test_deleting_while_a_run_is_in_progress_is_refused(client, collectors, runs, clock):
    record = collectors.add("Busy", "/src")
    runs.add(record.id, clock.now(), "manual", "running", "Moving…")
    response = client.delete(f"/api/collectors/{record.id}")
    assert response.status_code == 409 and "in progress" in response.json()["detail"]
    assert collectors.get(record.id) is not None
