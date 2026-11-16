import time
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from collector_server.collection.api import create_app
from collector_server.collection.executor import TransferExecutor
from collector_server.collection.file_transfer import FileTransfer
from collector_server.collection.local_mover import LocalMover
from collector_server.collection.move_repository import MoveRepository
from collector_server.collection.planner import TransferPlanner
from collector_server.collection.run_service import RunService
from collector_server.collection.scheduler import Scheduler
from collector_server.collection.service import CollectorService
from collector_server.collection.source_checker import LocalSourceChecker
from collector_server.collection.undo import UndoService
from tests.conftest import LONDON
from tests.helpers import config_for, make_clip

SAT = datetime(2026, 11, 14, 18, 40, tzinfo=LONDON)


@pytest.fixture
def stack(db, collectors, runs, clock, tmp_path):
    source, output = tmp_path / "in", tmp_path / "out"
    source.mkdir()
    output.mkdir()
    moves, files = MoveRepository(db), FileTransfer()
    planner = TransferPlanner(clock)
    scheduler = Scheduler(collectors, runs, LocalSourceChecker(), LocalMover(planner, TransferExecutor(files, moves)), clock, undoable=lambda i: moves.count(i) > 0)
    run_service = RunService(collectors, planner, scheduler, UndoService(moves, runs, files))
    record = collectors.add_with_config(config_for(source, output))
    client = TestClient(create_app(CollectorService(collectors, runs, clock), runs=run_service))
    return client, record, source, output


def wait_for(client, collector_id, status="done"):
    for _ in range(100):
        runs = client.get(f"/api/collectors/{collector_id}/runs").json()
        if runs and runs[0]["status"] == status:
            return runs[0]
        time.sleep(0.05)
    raise AssertionError("run did not finish")


def test_dry_run_returns_the_plan_and_touches_nothing(stack):
    client, record, source, output = stack
    make_clip(source / "a.mp4", SAT)
    make_clip(source / "b.mp4", SAT)
    body = client.post(f"/api/collectors/{record.id}/dry-run").json()
    assert body["totalFiles"] == 2 and body["folderCount"] == 1 and body["transfer"] == "move"
    assert body["groups"][0]["folder"] == "2026-11-14_Sat_coach"
    assert body["groups"][0]["sample"] == ["a.mp4", "b.mp4"]
    assert (source / "a.mp4").exists() and list(output.iterdir()) == []


def test_run_moves_files_in_the_background_and_shows_in_history(stack):
    client, record, source, output = stack
    make_clip(source / "a.mp4", SAT)
    response = client.post(f"/api/collectors/{record.id}/run")
    assert response.status_code == 202
    assert response.json()["status"] in ("running", "done")
    final = wait_for(client, record.id)
    assert final["outcome"] == "Moved 1 clip into 1 folder"
    assert final["canUndo"] is True and final["trigger"] == "manual"
    assert (output / "2026-11-14_Sat_coach" / "a.mp4").exists()


def test_undo_restores_the_files(stack):
    client, record, source, output = stack
    make_clip(source / "a.mp4", SAT)
    client.post(f"/api/collectors/{record.id}/run")
    run = wait_for(client, record.id)
    undone = client.post(f"/api/runs/{run['id']}/undo")
    assert undone.status_code == 200
    assert undone.json()["canUndo"] is False and "Undone" in undone.json()["outcome"]
    assert (source / "a.mp4").exists()
    assert client.post(f"/api/runs/{run['id']}/undo").status_code == 409


def test_run_with_no_clips_is_done_and_not_undoable(stack):
    client, record, _, _ = stack
    client.post(f"/api/collectors/{record.id}/run")
    final = wait_for(client, record.id)
    assert final["outcome"] == "No new clips found" and final["canUndo"] is False


def test_errors_are_reported_with_messages(stack, collectors, tmp_path):
    client, record, _, _ = stack
    ssh = collectors.add_with_config(config_for(tmp_path / "in", tmp_path / "out", name="Remote", source_type="ssh", host="nas"))
    for path in ("dry-run", "run"):
        response = client.post(f"/api/collectors/{ssh.id}/{path}")
        assert response.status_code == 422 and "SSH" in response.json()["detail"]
    missing = collectors.add_with_config(config_for(tmp_path / "nope", tmp_path / "out", name="Missing"))
    assert "Input folder not found" in client.post(f"/api/collectors/{missing.id}/dry-run").json()["detail"]
    assert client.post("/api/collectors/99/dry-run").status_code == 404
    assert client.post("/api/collectors/99/run").status_code == 404
    assert client.post("/api/runs/999/undo").status_code == 404


def test_history_shows_a_running_status_label(stack, runs, clock):
    client, record, _, _ = stack
    runs.add(record.id, clock.now(), "manual", "running", "Moving 3 of 9…")
    assert client.get(f"/api/collectors/{record.id}/runs").json()[0]["status"] == "running"
