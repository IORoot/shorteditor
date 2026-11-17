import sqlite3

import pytest
from fastapi.testclient import TestClient

from collector_server.collection.api import create_app
from collector_server.collection.browser import FolderBrowser
from collector_server.shared.database import Database
from collector_server.collection.seed import seed_demo
from collector_server.collection.service import CollectorService


@pytest.fixture
def client(collectors, runs, clock, tmp_path):
    service = CollectorService(collectors, runs, clock)
    seed_demo(collectors, service.save_schedule)
    (tmp_path / "clips").mkdir()
    return TestClient(create_app(service, FolderBrowser(default=str(tmp_path))))


def payload(**overrides):
    base = {
        "name": "Coach Saturdays",
        "sourceType": "ssh",
        "host": "coach-nas",
        "user": "andy",
        "keyPath": "~/.ssh/id_ed25519",
        "inputFolder": "/volume1/clips",
        "outputFolder": "/Volumes/Edit/Collected",
        "folderTemplate": "{date:YYYY-MM-DD}_{weekday}_{suffix}",
        "groupBy": "day",
        "transfer": "move",
        "suffix": "coach",
    }
    base.update(overrides)
    return base


def test_collectors_expose_their_config(client):
    coach = client.get("/api/collectors/1").json()
    assert coach["config"]["host"] == "coach-nas"
    assert coach["config"]["folderTemplate"] == "{date:YYYY-MM-DD}_{weekday}_{suffix}"
    assert coach["source"] == "ssh://coach-nas/volume1/clips"


def test_get_unknown_collector_is_404(client):
    assert client.get("/api/collectors/99").status_code == 404


def test_put_config_updates_everything_and_keeps_the_schedule(client):
    response = client.put("/api/collectors/1", json=payload(name="Coach Sundays", outputFolder="/Volumes/Edit/New", groupBy="week", suffix="c2"))
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Coach Sundays"
    assert body["config"]["outputFolder"] == "/Volumes/Edit/New"
    assert body["config"]["groupBy"] == "week"
    assert body["schedule"]["summary"] == "Every Sunday at 02:00"
    assert client.get("/api/collectors/1").json()["config"]["suffix"] == "c2"


def test_put_config_validation_errors_are_422_with_a_message(client):
    response = client.put("/api/collectors/1", json=payload(folderTemplate="{bogus}"))
    assert response.status_code == 422
    assert "Unknown token" in response.json()["detail"]


def test_put_config_unknown_collector_is_404(client):
    assert client.put("/api/collectors/99", json=payload()).status_code == 404


def test_preview_folder(client):
    response = client.post(
        "/api/preview/folder",
        json={"folderTemplate": "{date:YYYY-MM-DD}_{weekday}_{suffix}", "outputFolder": "/Volumes/Edit/Collected", "suffix": "coach", "sampleDate": "2026-11-14T18:40:00"},
    )
    assert response.status_code == 200
    assert response.json() == {"relativePath": "2026-11-14_Sat_coach", "fullPath": "/Volumes/Edit/Collected/2026-11-14_Sat_coach"}


def test_preview_folder_reports_template_errors(client):
    response = client.post("/api/preview/folder", json={"folderTemplate": "{nope}"})
    assert response.status_code == 422


def test_browse_lists_directories_and_reports_errors(client, tmp_path):
    body = client.get("/api/fs/browse").json()
    assert body["path"] == str(tmp_path)
    assert [e["name"] for e in body["entries"]] == ["clips"]
    assert client.get("/api/fs/browse", params={"path": str(tmp_path / "missing")}).status_code == 404
    assert client.get("/api/fs/browse", params={"path": "relative"}).status_code == 422


def test_existing_databases_are_migrated_with_new_columns(tmp_path):
    path = str(tmp_path / "old.db")
    old = sqlite3.connect(path)
    old.executescript(
        "CREATE TABLE collectors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, source TEXT NOT NULL,"
        " transfer TEXT NOT NULL DEFAULT 'move', enabled INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL DEFAULT 'daily',"
        " time TEXT NOT NULL DEFAULT '02:00', weekdays TEXT NOT NULL DEFAULT '', day_of_month INTEGER NOT NULL DEFAULT 1,"
        " cron TEXT NOT NULL DEFAULT '', last_slot TEXT); INSERT INTO collectors (name, source) VALUES ('Old', '/old');"
    )
    old.commit()
    old.close()
    db = Database(path)
    row = db.query("SELECT * FROM collectors")[0]
    assert row["group_by"] == "day" and row["output_folder"] == "" and row["name"] == "Old"
    db.close()
