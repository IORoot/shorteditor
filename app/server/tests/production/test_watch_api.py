import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from collector_server.production.api import build_router
from tests.production.test_watch_service import DATE, STEPS, world  # noqa: F401


@pytest.fixture
def client(world):
    app = FastAPI()
    app.include_router(build_router(world.service, world.ws))
    return TestClient(app)


def body(world, **over):
    return {"name": "Coach", "parentFolder": str(world.parent), "pattern": DATE, "steps": [{"key": s.key} for s in STEPS], **over}


def test_create_list_and_shape(world, client):
    created = client.post("/api/production/watches", json=body(world))
    assert created.status_code == 201
    watch = created.json()
    assert {"id", "name", "parentFolder", "pattern", "nameTemplate", "steps", "runOn", "outputRoot", "intervalMinutes", "settleMinutes", "maxPerCheck", "enabled", "createdAt", "lastCheckedAt", "lastError", "waiting", "createdTotal", "status", "statusLine"} <= set(watch)
    assert (watch["status"], watch["intervalMinutes"], watch["settleMinutes"], watch["maxPerCheck"]) == ("watching", 5, 10, 20)
    listed = client.get("/api/production/watches").json()
    assert [w["id"] for w in listed] == [watch["id"]]


def test_update_enabled_check_and_delete(world, client):
    watch = client.post("/api/production/watches", json=body(world)).json()
    wid = watch["id"]
    updated = client.put(f"/api/production/watches/{wid}", json=body(world, name="Renamed", intervalMinutes=15))
    assert updated.status_code == 200 and updated.json()["name"] == "Renamed" and updated.json()["intervalMinutes"] == 15
    paused = client.post(f"/api/production/watches/{wid}/enabled", json={"enabled": False})
    assert paused.status_code == 200 and paused.json()["status"] == "paused"
    world.folder("2026-11-07_a")
    checked = client.post(f"/api/production/watches/{wid}/check")
    assert checked.status_code == 200
    assert [b["name"] for b in checked.json()["created"]] == ["2026-11-07_a"] and checked.json()["error"] is None
    assert client.delete(f"/api/production/watches/{wid}").status_code == 204
    assert client.get("/api/production/watches").json() == []


def test_include_existing_creates_batches_on_the_spot(world, client):
    world.folder("2026-11-07_a")
    client.post("/api/production/watches", json=body(world, includeExisting=True))
    assert len(world.batches.list()) == 1


def test_unknown_watch_is_404(client):
    for call in (lambda: client.put("/api/production/watches/9", json={}), lambda: client.delete("/api/production/watches/9"), lambda: client.post("/api/production/watches/9/enabled", json={"enabled": True}), lambda: client.post("/api/production/watches/9/check")):
        assert call().status_code in (404, 422)
    assert client.delete("/api/production/watches/9").status_code == 404
    assert client.post("/api/production/watches/9/check").status_code == 404
    assert client.post("/api/production/watches/9/enabled", json={"enabled": True}).status_code == 404


def test_invalid_input_is_422_with_a_readable_message(world, client):
    bad = client.post("/api/production/watches", json=body(world, pattern="(a+)+"))
    assert bad.status_code == 422 and "far too long" in bad.json()["detail"]
    shape = client.post("/api/production/watches", json=body(world, intervalMinutes=0))
    assert shape.status_code == 422


def test_ids_are_bounded(client):
    assert client.post("/api/production/watches/99999999999999999999999/check").status_code == 422
