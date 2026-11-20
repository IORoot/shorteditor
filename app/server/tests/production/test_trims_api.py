import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from collector_server.production.api import build_router
from collector_server.production.builtin import build_registry
from collector_server.production.catalog import StageLibrary
from collector_server.production.models import StageRun
from collector_server.production.pieces import Piece, PiecesData
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import ProductionService
from collector_server.production.stages.apply_trims import TrimSettings
from tests.production.helpers import FakePipelines

NOW = "2026-11-20T10:00:00+00:00"


@pytest.fixture
def card(db, tmp_path):
    ensure_schema(db)
    inbox = tmp_path / "in"
    inbox.mkdir()
    batches, passes, logs = BatchRepository(db), PassRepository(db), LogRepository(db)
    service = ProductionService(batches, passes, logs, StageLibrary(build_registry()), FakePipelines(), lambda: NOW, str(tmp_path / "out"), ["local"])
    batch = service.create_batch(name="Coach", input_folder=str(inbox), pipeline_id=1, run_on="any", output_root=None)
    [pass_] = passes.for_batch(batch.id)
    scan = StageRun(key="scan_folder", title="Scan folder", status="done", started_at=NOW, finished_at=NOW, details={
        "kind": "clips", "total": 10.0, "clips": [
            {"name": "a.mp4", "start": 0, "end": 4.0, "length": 4.0},
            {"name": "b.mp4", "start": 0, "end": 6.0, "length": 6.0},
        ]})
    passes.update(pass_.id, stages=[scan.model_dump()])
    app = FastAPI()
    app.include_router(build_router(service))
    return TestClient(app), passes, pass_.id


def put(client, pass_id, clip, trims):
    return client.put(f"/api/production/passes/{pass_id}/trims", json={"clip": clip, "trims": trims})


def test_saved_trims_are_kept_on_the_pass_in_clip_time(card):
    client, _, pass_id = card
    response = put(client, pass_id, "a.mp4", [{"start": 2.5, "end": 3.5}, {"start": 0.5, "end": 1.0}])
    assert response.status_code == 200
    # sorted by start, and kept under the stage the render reads
    assert response.json()["overrides"]["apply_trims"]["trims"]["a.mp4"] == [{"start": 0.5, "end": 1.0}, {"start": 2.5, "end": 3.5}]


def test_a_trim_past_the_end_of_its_clip_is_refused_and_names_the_clip(card):
    client, _, pass_id = card
    response = put(client, pass_id, "a.mp4", [{"start": 3.0, "end": 5.0}])
    assert response.status_code == 422
    assert "a.mp4" in response.json()["detail"]


def test_overlapping_trims_are_refused(card):
    client, _, pass_id = card
    response = put(client, pass_id, "b.mp4", [{"start": 1.0, "end": 3.0}, {"start": 2.5, "end": 4.0}])
    assert response.status_code == 422
    assert "b.mp4" in response.json()["detail"]


def test_a_clip_the_card_does_not_have_is_not_found(card):
    client, _, pass_id = card
    assert put(client, pass_id, "other.mp4", [{"start": 0, "end": 1}]).status_code == 404


def test_trims_cannot_change_while_the_card_runs(card):
    client, passes, pass_id = card
    passes.update(pass_id, status="running")
    assert put(client, pass_id, "a.mp4", [{"start": 0, "end": 1}]).status_code == 409


def test_reset_removes_one_clip_and_keeps_the_others(card):
    client, _, pass_id = card
    put(client, pass_id, "a.mp4", [{"start": 0, "end": 1}])
    put(client, pass_id, "b.mp4", [{"start": 2, "end": 3}])
    response = client.delete(f"/api/production/passes/{pass_id}/trims/a.mp4")
    assert response.status_code == 200
    assert response.json()["overrides"]["apply_trims"]["trims"] == {"b.mp4": [{"start": 2.0, "end": 3.0}]}


def test_saved_trims_are_what_the_stage_cuts_to(card):
    client, _, pass_id = card
    response = put(client, pass_id, "b.mp4", [{"start": 1, "end": 2}, {"start": 4, "end": 5}])
    settings = TrimSettings(**response.json()["overrides"]["apply_trims"])
    from collector_server.production.stages.apply_trims import STAGE
    from collector_server.production.stage_api import StageContext
    data = PiecesData(items=[Piece(clip="/in/b.mp4", clip_duration=6), Piece(clip="/in/a.mp4", clip_duration=4)])
    out = STAGE.run(data, settings, StageContext("/in", "/w", "/o", None, lambda line: None))
    assert [(p.clip, p.start, p.end) for p in out.items] == [("/in/b.mp4", 1, 2), ("/in/b.mp4", 4, 5), ("/in/a.mp4", 0, None)]  # an untrimmed piece keeps its own end, None meaning the whole clip
