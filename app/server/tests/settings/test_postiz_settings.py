import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from collector_server.production.postiz_client import Channel, Folder, Pipeline, PostizError
from collector_server.settings.app_settings import AppSettings
from collector_server.settings.postiz_settings import POSTIZ_KEY, POSTIZ_URL, build_postiz_router


class FakeClient:
    def __init__(self, url, key):
        self.url, self.key = url, key
        FakeClient.made.append((url, key))

    made: list = []
    refuse: str | None = None

    def channels(self):
        if FakeClient.refuse:
            raise PostizError(FakeClient.refuse)
        return [Channel("c1", "London Parkour", "instagram"), Channel("c2", "ldnpk", "facebook")]

    def pipelines(self):
        return [Pipeline("p1", "Class Highlights", [Channel("c1", "London Parkour", "instagram")])]

    def folders(self):
        return [Folder("f1", "Class Clips - Sat")]


@pytest.fixture
def api(db):
    FakeClient.made, FakeClient.refuse = [], None
    settings = AppSettings(db)
    app = FastAPI()
    app.include_router(build_postiz_router(settings, FakeClient))

    class Api:
        client = TestClient(app)
        store = settings

    return Api()


def test_put_stores_full_url_and_hides_key(api):
    saved = api.client.put("/api/settings/postiz", json={"url": "postiz.example", "key": "abcd1234"})
    assert saved.status_code == 200
    assert saved.json() == {"url": "https://postiz.example/api", "keySet": True, "keyHint": "...1234"}
    assert "abcd1234" not in saved.text and "abcd1234" not in api.client.get("/api/settings/postiz").text
    assert api.store.get(POSTIZ_URL) == "https://postiz.example/api" and api.store.get(POSTIZ_KEY) == "abcd1234"


def test_a_bad_address_is_refused(api):
    assert api.client.put("/api/settings/postiz", json={"url": "http://postiz.example"}).status_code == 400


def test_empty_string_removes_key_and_none_leaves_it(api):
    api.client.put("/api/settings/postiz", json={"url": "postiz.example", "key": "abcd1234"})
    assert api.client.put("/api/settings/postiz", json={"url": "other.example"}).json()["keySet"] is True
    removed = api.client.put("/api/settings/postiz", json={"key": ""}).json()
    assert removed == {"url": "https://other.example/api", "keySet": False, "keyHint": None}


def test_channels_and_folders_need_setup(api):
    assert api.client.get("/api/settings/postiz/channels").status_code == 409
    assert api.client.get("/api/settings/postiz/folders").status_code == 409
    assert api.client.post("/api/settings/postiz/test").status_code == 409


def test_live_lists_use_the_saved_connection(api):
    api.client.put("/api/settings/postiz", json={"url": "postiz.example", "key": "abcd1234"})
    assert api.client.get("/api/settings/postiz/channels").json() == [{"id": "c1", "name": "London Parkour", "identifier": "instagram"}, {"id": "c2", "name": "ldnpk", "identifier": "facebook"}]
    assert api.client.get("/api/settings/postiz/folders").json() == [{"id": "f1", "name": "Class Clips - Sat"}]
    assert FakeClient.made[-1] == ("https://postiz.example/api", "abcd1234")


def test_test_connection_lists_channels_and_counts_folders(api):
    api.client.put("/api/settings/postiz", json={"url": "postiz.example", "key": "abcd1234"})
    body = api.client.post("/api/settings/postiz/test").json()
    assert [c["identifier"] for c in body["channels"]] == ["instagram", "facebook"] and body["folders"] == 1


def test_a_postiz_refusal_is_a_400_with_its_message(api):
    api.client.put("/api/settings/postiz", json={"url": "postiz.example", "key": "abcd1234"})
    FakeClient.refuse = "Postiz said 401 for /x"
    response = api.client.get("/api/settings/postiz/channels")
    assert response.status_code == 400 and response.json()["detail"] == "Postiz said 401 for /x"


def test_pipelines_list_names_with_their_channels(api):
    assert api.client.get("/api/settings/postiz/pipelines").status_code == 409
    api.client.put("/api/settings/postiz", json={"url": "postiz.example", "key": "abcd1234"})
    assert api.client.get("/api/settings/postiz/pipelines").json() == [{"id": "p1", "name": "Class Highlights", "channels": [{"id": "c1", "name": "London Parkour", "identifier": "instagram"}]}]
