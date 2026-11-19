import pytest
from fastapi.testclient import TestClient

from collector_server.main import create_default_app


def test_the_key_is_saved_but_only_its_last_four_characters_come_back(tmp_path, monkeypatch):
    monkeypatch.setenv("SHORT_EDITOR_DB", str(tmp_path / "app.db"))
    client = TestClient(create_default_app())
    assert client.get("/api/settings/ai").json() == {"keySet": False, "keyHint": None, "model": "nvidia/nemotron-3.5-super-vl"}
    saved = client.put("/api/settings/ai", json={"key": "sk-or-secret-1234"}).json()
    assert saved == {"keySet": True, "keyHint": "...1234", "model": "nvidia/nemotron-3.5-super-vl"}
    assert "secret" not in client.get("/api/settings/ai").text
    assert client.put("/api/settings/ai", json={"key": ""}).json() == {"keySet": False, "keyHint": None, "model": "nvidia/nemotron-3.5-super-vl"}


@pytest.mark.full
def test_the_model_is_saved_and_an_empty_one_goes_back_to_the_default(tmp_path, monkeypatch):
    monkeypatch.setenv("SHORT_EDITOR_DB", str(tmp_path / "app.db"))
    client = TestClient(create_default_app())
    assert client.put("/api/settings/ai", json={"model": "openai/gpt-4o"}).json()["model"] == "openai/gpt-4o"
    assert client.get("/api/settings/ai").json()["model"] == "openai/gpt-4o"
    assert client.put("/api/settings/ai", json={"model": ""}).json()["model"] == "nvidia/nemotron-3.5-super-vl"
    assert client.put("/api/settings/ai", json={"model": "two words"}).status_code == 400


@pytest.mark.full
def test_a_key_with_spaces_is_refused(tmp_path, monkeypatch):
    monkeypatch.setenv("SHORT_EDITOR_DB", str(tmp_path / "app.db"))
    client = TestClient(create_default_app())
    assert client.put("/api/settings/ai", json={"key": "two words"}).status_code == 400

