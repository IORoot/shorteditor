from fastapi.testclient import TestClient

from collector_server.main import create_default_app


def test_the_app_serves_production_next_to_collection(tmp_path, monkeypatch):
    monkeypatch.setenv("SHORT_EDITOR_DB", str(tmp_path / "app.db"))
    app = create_default_app()
    client = TestClient(app)
    assert client.get("/api/production/stages").status_code == 200
    assert client.get("/api/production/batches").json() == []
    assert client.get("/api/collectors").status_code == 200


def test_a_pass_left_running_by_a_crash_is_failed_at_start_up(tmp_path, monkeypatch):
    monkeypatch.setenv("SHORT_EDITOR_DB", str(tmp_path / "app.db"))
    folder = tmp_path / "in"
    folder.mkdir()
    first = TestClient(create_default_app())
    steps = [{"key": k} for k in ["scan_folder", "join_pieces", "render_output"]]
    first.post("/api/production/batches", json={"name": "B", "inputFolder": str(folder), "steps": steps})
    from collector_server.shared.database import Database

    Database(str(tmp_path / "app.db")).execute("UPDATE production_passes SET status = 'running'")
    with TestClient(create_default_app()) as restarted:  # start-up recovery runs when the app starts
        [card] = restarted.get("/api/production/batches").json()
    assert card["status"] == "failed" and card["error"] == "Interrupted by a restart"
