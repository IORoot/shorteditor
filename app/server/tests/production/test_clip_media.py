import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from collector_server.production.api import build_router
from collector_server.production.builtin import build_registry
from collector_server.production.catalog import StageLibrary
from collector_server.production.models import StageRun
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import NotFoundError, ProductionService
from tests.production.helpers import FakePipelines

NOW = "2026-11-20T10:00:00+00:00"


@pytest.fixture
def card(db, tmp_path):
    ensure_schema(db)
    inbox = tmp_path / "in"
    (inbox / "day").mkdir(parents=True)
    (inbox / "day" / "a.mp4").write_bytes(b"0123456789" * 50)
    batches, passes, logs = BatchRepository(db), PassRepository(db), LogRepository(db)
    service = ProductionService(batches, passes, logs, StageLibrary(build_registry()), FakePipelines(), lambda: NOW, str(tmp_path / "out"), ["local"])
    batch = service.create_batch(name="Coach", input_folder=str(inbox), pipeline_id=1, run_on="any", output_root=None)
    [pass_] = passes.for_batch(batch.id)
    scan = StageRun(key="scan_folder", title="Scan folder", status="done", started_at=NOW, finished_at=NOW,
                    details={"kind": "clips", "total": 4.0, "clips": [{"name": "a.mp4", "start": 0, "end": 4.0, "length": 4.0}]})
    passes.update(pass_.id, stages=[scan.model_dump()])
    app = FastAPI()
    app.include_router(build_router(service))
    return service, TestClient(app), pass_.id


def test_the_clip_is_served_so_the_editor_can_play_it(card):
    service, client, pass_id = card
    response = client.get(f"/api/production/passes/{pass_id}/clip", params={"clip": "a.mp4"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "video/mp4"
    assert response.content == b"0123456789" * 50


def test_a_range_request_gets_part_of_the_clip_for_seeking(card):
    service, client, pass_id = card
    response = client.get(f"/api/production/passes/{pass_id}/clip", params={"clip": "a.mp4"}, headers={"Range": "bytes=0-9"})
    assert response.status_code == 206
    assert response.content == b"0123456789"


def test_a_name_that_is_not_a_clip_of_the_card_is_not_served(card):
    service, client, pass_id = card
    assert client.get(f"/api/production/passes/{pass_id}/clip", params={"clip": "../in/day/a.mp4"}).status_code == 404
    with pytest.raises(NotFoundError):
        service.clip_path(pass_id, "missing.mp4")
