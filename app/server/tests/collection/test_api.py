import pytest
from fastapi.testclient import TestClient

from collector_server.collection.api import create_app
from collector_server.collection.seed import seed_demo
from collector_server.collection.service import CollectorService


@pytest.fixture
def client(collectors, runs, clock):
    service = CollectorService(collectors, runs, clock)
    seed_demo(collectors, service.save_schedule)
    return TestClient(create_app(service))


def test_lists_collectors_in_camel_case_with_summary_and_next_run(client):
    body = client.get("/api/collectors").json()
    assert [c["name"] for c in body][:2] == ["Coach Saturdays", "Camera A – Daily"]
    coach = body[0]
    assert coach["schedule"]["summary"] == "Every Sunday at 02:00"
    assert coach["schedule"]["nextRun"] == "Sun 22 Nov, 02:00"
    assert coach["schedule"]["dayOfMonth"] == 1


@pytest.mark.full
@pytest.mark.full
def test_disabled_collector_has_no_next_run(client):
    jams = client.get("/api/collectors").json()[3]
    assert jams["schedule"]["enabled"] is False
    assert jams["schedule"]["nextRun"] is None


@pytest.mark.full
@pytest.mark.full
def test_runs_endpoint_returns_a_list_and_404_for_unknown(client, runs, clock):
    runs.add(1, clock.now(), "manual", "done", "Moved 2 clips", can_undo=True)
    body = client.get("/api/collectors/1/runs").json()
    assert body == [
        {"id": 1, "collectorId": 1, "startedAt": "Mon 16 Nov, 12:00", "trigger": "manual", "status": "done", "outcome": "Moved 2 clips", "canUndo": True}
    ]
    assert client.get("/api/collectors/99/runs").status_code == 404


def test_put_schedule_updates_and_returns_the_collector(client):
    payload = {"enabled": True, "kind": "daily", "time": "23:30", "weekdays": [], "dayOfMonth": 1, "cron": ""}
    response = client.put("/api/collectors/4/schedule", json=payload)
    assert response.status_code == 200
    schedule = response.json()["schedule"]
    assert schedule["summary"] == "Every day at 23:30"
    assert schedule["nextRun"] == "Mon 16 Nov, 23:30"


@pytest.mark.full
@pytest.mark.full
def test_put_schedule_rejects_invalid_input_with_422(client):
    payload = {"enabled": True, "kind": "weekly", "time": "02:00", "weekdays": [], "dayOfMonth": 1, "cron": ""}
    response = client.put("/api/collectors/1/schedule", json=payload)
    assert response.status_code == 422
    assert "weekday" in response.json()["detail"]


@pytest.mark.full
@pytest.mark.full
def test_put_schedule_rejects_a_bad_time_format(client):
    payload = {"enabled": True, "kind": "daily", "time": "2am", "weekdays": [], "dayOfMonth": 1, "cron": ""}
    assert client.put("/api/collectors/1/schedule", json=payload).status_code == 422


@pytest.mark.full
@pytest.mark.full
def test_put_schedule_for_unknown_collector_is_404(client):
    payload = {"enabled": False, "kind": "daily", "time": "02:00", "weekdays": [], "dayOfMonth": 1, "cron": ""}
    assert client.put("/api/collectors/99/schedule", json=payload).status_code == 404


@pytest.mark.full
@pytest.mark.full
def test_seed_only_runs_on_an_empty_database(collectors, runs, clock):
    service = CollectorService(collectors, runs, clock)
    assert seed_demo(collectors, service.save_schedule) == 4
    assert seed_demo(collectors, service.save_schedule) == 0
    assert len(collectors.list()) == 4


AUTO = {"enabled": False, "kind": "daily", "time": "02:00", "mode": "auto", "pollSeconds": 90, "settleSeconds": 180, "maxFiles": 20}


def test_auto_collect_settings_save_and_read_back(client):
    saved = client.put("/api/collectors/1/schedule", json=AUTO)
    assert saved.status_code == 200
    schedule = client.get("/api/collectors/1").json()["schedule"]
    assert (schedule["mode"], schedule["pollSeconds"], schedule["settleSeconds"], schedule["maxFiles"]) == ("auto", 90, 180, 20)
    assert schedule["summary"].startswith("Auto-collect")
    assert schedule["lastChecked"] is None


def test_existing_collectors_stay_on_their_schedule_with_default_numbers(client):
    schedule = client.get("/api/collectors/1").json()["schedule"]
    assert (schedule["mode"], schedule["pollSeconds"], schedule["settleSeconds"], schedule["maxFiles"]) == ("schedule", 60, 120, 50)


@pytest.mark.parametrize("bad", [{"pollSeconds": 10}, {"settleSeconds": 5}, {"maxFiles": 0}, {"mode": "sometimes"}])
def test_out_of_range_auto_collect_settings_are_refused(client, bad):
    assert client.put("/api/collectors/1/schedule", json={**AUTO, **bad}).status_code == 422
