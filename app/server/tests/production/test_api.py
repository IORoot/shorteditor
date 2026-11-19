import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from collector_server.production.api import build_router
from collector_server.production.builtin import build_registry
from collector_server.production.pieces import VideoData
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import ProductionService
from collector_server.production.catalog import StageLibrary
from tests.production.helpers import FakePipelines

NOW = "2026-11-17T10:00:00+00:00"
JOIN = [{"key": k} for k in ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]]


@pytest.fixture
def api(db, tmp_path):
    ensure_schema(db)
    inbox = tmp_path / "in"
    inbox.mkdir()
    batches, passes, logs = BatchRepository(db), PassRepository(db), LogRepository(db)
    service = ProductionService(batches, passes, logs, StageLibrary(build_registry()), FakePipelines(), lambda: NOW, str(tmp_path / "out"), ["local"])
    app = FastAPI()
    app.include_router(build_router(service))

    class Api:
        client = TestClient(app)
        folder = str(inbox)
        repo_passes = passes
        repo_logs = logs

        def create(self, **kw):
            body = {"name": "Coach Saturdays", "inputFolder": self.folder, "pipelineId": 1, **kw}
            return self.client.post("/api/production/batches", json=body)

    return Api()


def test_create_batch_returns_201_and_shows_on_the_board(api):
    response = api.create(runOn="local")
    assert response.status_code == 201
    assert {"id", "name", "inputFolder", "steps", "runOn", "outputRoot", "createdAt"} <= set(response.json())
    [card] = api.client.get("/api/production/batches").json()
    assert card["status"] == "queued" and card["passNumber"] == 1 and card["queuePosition"] == 0
    assert card["pipeline"][0] == "Scan folder" and card["stageCount"] == 5


@pytest.mark.full
@pytest.mark.full
def test_invalid_input_folder_returns_422(api):
    response = api.create(inputFolder="relative")
    assert response.status_code == 422 and "absolute" in response.json()["detail"]


@pytest.mark.full
@pytest.mark.full
def test_batch_detail_lists_passes(api):
    batch = api.create().json()
    detail = api.client.get(f"/api/production/batches/{batch['id']}").json()
    assert detail["batch"]["id"] == batch["id"] and [p["number"] for p in detail["passes"]] == [1]


@pytest.mark.full
@pytest.mark.full
def test_unknown_batch_is_404(api):
    assert api.client.get("/api/production/batches/99").status_code == 404
    assert api.client.post("/api/production/batches/99/runs", json={}).status_code == 404


def test_run_again_returns_201_and_refuses_while_waiting(api):
    batch = api.create().json()
    assert api.client.post(f"/api/production/batches/{batch['id']}/runs", json={}).status_code == 409
    api.repo_passes.update(1, status="review")
    again = api.client.post(f"/api/production/batches/{batch['id']}/runs", json={})
    assert again.status_code == 201 and [c["status"] for c in again.json()["passes"]] == ["queued"]


@pytest.mark.full
@pytest.mark.full
def test_resolve_a_blocked_pass(api):
    api.create()
    api.repo_passes.update(1, status="blocked", stage_key="limit_length", blocked_choices=["keep_first"])
    ok = api.client.post("/api/production/passes/1/resolve", json={"choice": "keep_first"})
    assert ok.status_code == 200 and ok.json()["status"] == "queued"
    api.repo_passes.update(1, status="blocked", blocked_choices=["keep_first"])
    assert api.client.post("/api/production/passes/1/resolve", json={"choice": "nope"}).status_code == 422
    api.repo_passes.update(1, status="review")
    assert api.client.post("/api/production/passes/1/resolve", json={"choice": "keep_first"}).status_code == 409


@pytest.mark.full
@pytest.mark.full
def test_approve_returns_the_handoff_and_refuses_the_wrong_state(api):
    api.create()
    assert api.client.post("/api/production/passes/1/approve").status_code == 409
    api.repo_passes.update(1, status="review", output=VideoData(path="/out/b/pass-1/output.mp4", duration=1, size_bytes=5))
    response = api.client.post("/api/production/passes/1/approve")
    assert response.status_code == 200
    body = response.json()
    assert body["stage"] == "production" and body["runId"] == 1
    assert body["folders"][0]["clips"] == [{"name": "output.mp4", "sizeBytes": 5}]
    assert api.client.post("/api/production/passes/99/approve").status_code == 404


@pytest.mark.full
@pytest.mark.full
def test_logs_by_kind(api):
    api.create()
    api.repo_logs.add_many(1, "pipeline", [(NOW, "Scan folder started")])
    api.repo_logs.add_many(1, "ffmpeg", [(NOW, "frame=1")])
    assert api.client.get("/api/production/passes/1/logs?kind=pipeline").json() == {"lines": ["Scan folder started"], "entries": [{"at": NOW, "text": "Scan folder started"}]}
    assert api.client.get("/api/production/passes/1/logs?kind=ffmpeg").json()["lines"] == ["frame=1"]
    assert api.client.get("/api/production/passes/1/logs?kind=other").status_code == 422
    assert api.client.get("/api/production/passes/99/logs?kind=pipeline").status_code == 404


@pytest.mark.full
@pytest.mark.full
def test_a_bug_in_the_service_is_not_reported_as_bad_input(db, tmp_path):
    class Broken:
        def cards(self):
            raise ValueError("a bug, not the user's fault")

    app = FastAPI()
    app.include_router(build_router(Broken()))
    with pytest.raises(ValueError):
        TestClient(app, raise_server_exceptions=True).get("/api/production/batches")


@pytest.mark.full
@pytest.mark.full
def test_defaults_route(api):
    body = api.client.get("/api/production/defaults").json()
    assert body["outputRoot"].endswith("out") and body["workers"] == [{"id": "local", "label": "local"}]


@pytest.mark.full
@pytest.mark.full
def test_output_route_streams_the_file_with_range(api, tmp_path):
    api.create(outputRoot=str(tmp_path / "results"))
    folder = tmp_path / "results" / "b-1" / "pass-1"
    folder.mkdir(parents=True)
    (folder / "output.mp4").write_bytes(b"0123456789")
    api.repo_passes.update(1, status="review", output=VideoData(path=str(folder / "output.mp4"), duration=1, size_bytes=10))
    whole = api.client.get("/api/production/passes/1/output")
    assert whole.status_code == 200 and whole.content == b"0123456789" and whole.headers["content-type"] == "video/mp4"
    part = api.client.get("/api/production/passes/1/output", headers={"Range": "bytes=0-3"})
    assert part.status_code == 206 and part.content == b"0123"


@pytest.mark.full
@pytest.mark.full
def test_output_route_404_without_video(api):
    api.create()
    assert api.client.get("/api/production/passes/1/output").status_code == 404
    assert api.client.get("/api/production/passes/99/output").status_code == 404


@pytest.mark.full
def test_selected_batches_are_deleted_together_with_their_passes(api):
    api.create(runOn="local")
    api.create(name="Second", runOn="local")
    api.repo_passes.update(1, status="failed")
    api.repo_passes.update(2, status="review")
    response = api.client.post("/api/production/batches/delete", json={"batchIds": [1, 2]})
    assert response.status_code == 200 and response.json() == {"deleted": 2}
    assert api.client.get("/api/production/batches").json() == []
    assert api.repo_passes.get(1) is None


@pytest.mark.full
def test_a_selection_with_a_running_batch_is_refused_and_nothing_is_deleted(api):
    api.create(runOn="local")
    api.create(name="Second", runOn="local")
    api.repo_passes.update(2, status="running")
    response = api.client.post("/api/production/batches/delete", json={"batchIds": [1, 2]})
    assert response.status_code == 409
    assert len(api.client.get("/api/production/batches").json()) == 2


@pytest.mark.full
def test_deleting_an_unknown_batch_is_a_404_and_an_empty_selection_is_refused(api):
    assert api.client.post("/api/production/batches/delete", json={"batchIds": [99]}).status_code == 404
    assert api.client.post("/api/production/batches/delete", json={"batchIds": []}).status_code == 422
