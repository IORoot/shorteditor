import pytest
from fastapi.testclient import TestClient

from collector_server.main import create_default_app


def test_the_key_is_saved_but_only_its_last_four_characters_come_back(tmp_path, monkeypatch):
    monkeypatch.setenv("SHORT_EDITOR_DB", str(tmp_path / "app.db"))
    client = TestClient(create_default_app())
    assert client.get("/api/settings/ai").json() == {"keySet": False, "keyHint": None}
    saved = client.put("/api/settings/ai", json={"key": "sk-or-secret-1234"}).json()
    assert saved == {"keySet": True, "keyHint": "...1234"}
    assert "secret" not in client.get("/api/settings/ai").text
    assert client.put("/api/settings/ai", json={"key": ""}).json() == {"keySet": False, "keyHint": None}


@pytest.mark.full
def test_a_key_with_spaces_is_refused(tmp_path, monkeypatch):
    monkeypatch.setenv("SHORT_EDITOR_DB", str(tmp_path / "app.db"))
    client = TestClient(create_default_app())
    assert client.put("/api/settings/ai", json={"key": "two words"}).status_code == 400
