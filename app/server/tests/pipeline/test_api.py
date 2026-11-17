import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from collector_server.pipeline.api import build_router
from collector_server.pipeline.repository import PipelineRepository
from collector_server.pipeline.schema import ensure_schema
from collector_server.pipeline.service import PipelineService
from collector_server.shared.pipeline import UsageItem

from .helpers import FakeUsage, real_catalog

NOW = "2026-11-17T10:00:00+00:00"
BASE = "/api/pipeline"


@pytest.fixture
def api(db, tmp_path):
    ensure_schema(db)
    usage = FakeUsage()
    service = PipelineService(PipelineRepository(db), real_catalog(db, tmp_path), usage, lambda: NOW)
    app = FastAPI()
    app.include_router(build_router(service))

    class Api:
        client = TestClient(app)

        def __init__(self):
            self.usage = usage

        def steps(self):
            return self.client.get(f"{BASE}/template").json()["steps"]

        def create(self, name="Join"):
            return self.client.post(f"{BASE}/pipelines", json={"name": name, "steps": self.steps()})

    return Api()


def test_create_then_list_and_get(api):
    made = api.create()
    assert made.status_code == 201
    pid = made.json()["id"]
    row = api.client.get(f"{BASE}/pipelines").json()[0]
    assert {"stageCount", "usedBy", "updatedAt", "maxSeconds", "maxSizeMb"} <= row.keys() and row["stageCount"] == 5
    got = api.client.get(f"{BASE}/pipelines/{pid}").json()
    assert got["usedBy"] == [] and got["recentBatches"] == []


@pytest.mark.full
@pytest.mark.full
def test_template_and_stages_and_check(api):
    assert len(api.steps()) == 5
    keys = [s["key"] for s in api.client.get(f"{BASE}/stages").json()]
    assert keys[:2] == ["scan_folder", "order_clips"] and "render_output" in keys
    errors = api.client.post(f"{BASE}/check", json={"steps": [{"key": "render_output"}]}).json()["errors"]
    assert errors


@pytest.mark.full
@pytest.mark.full
def test_save_enable_duplicate_delete_flow(api):
    pid = api.create().json()["id"]
    saved = api.client.put(f"{BASE}/pipelines/{pid}", json={"name": "Renamed", "description": "d", "steps": api.steps()})
    assert saved.json()["name"] == "Renamed"
    assert api.client.post(f"{BASE}/pipelines/{pid}/enabled", json={"enabled": False}).json()["enabled"] is False
    assert api.client.get(f"{BASE}/pipelines/{pid}/impact").json() == {"watches": 0, "waitingBatches": 0}
    copy = api.client.post(f"{BASE}/pipelines/{pid}/duplicate")
    assert copy.status_code == 201 and copy.json()["name"] == "Renamed copy"
    assert api.client.delete(f"{BASE}/pipelines/{pid}").status_code == 204
    assert api.client.get(f"{BASE}/pipelines/{pid}").status_code == 404


def test_errors_map_to_404_409_422(api):
    c = api.client
    calls = [
        c.get(f"{BASE}/pipelines/99"),
        c.put(f"{BASE}/pipelines/99", json={"name": "A", "steps": api.steps()}),
        c.post(f"{BASE}/pipelines/99/enabled", json={"enabled": True}),
        c.get(f"{BASE}/pipelines/99/impact"),
        c.post(f"{BASE}/pipelines/99/duplicate"),
        c.delete(f"{BASE}/pipelines/99"),
    ]
    assert [r.status_code for r in calls] == [404] * 6
    pid = api.create("Used").json()["id"]
    api.usage.items = [UsageItem(kind="batch", id=1, name="Coach")]
    busy = c.delete(f"{BASE}/pipelines/{pid}")
    assert busy.status_code == 409 and "Switch it off instead" in busy.json()["detail"]
    bad = c.post(f"{BASE}/pipelines", json={"name": "", "steps": api.steps()})
    assert bad.status_code == 422 and isinstance(bad.json()["detail"], str)


@pytest.mark.full
@pytest.mark.full
@pytest.mark.parametrize("pid", [0, 2**63])
def test_id_out_of_range_is_422(api, pid):
    assert api.client.get(f"{BASE}/pipelines/{pid}").status_code == 422


@pytest.mark.full
@pytest.mark.full
def test_camel_case_bodies_are_accepted(api):
    steps = [{"key": k, "settings": {}, "enabled": True} for k in ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]]
    assert api.client.post(f"{BASE}/pipelines", json={"name": "A", "steps": steps}).status_code == 201
