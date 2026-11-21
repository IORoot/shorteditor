import io
import json
import urllib.error

import pytest

from collector_server.production.postiz_client import (
    ChannelPost, Media, PostizClient, PostizError, PostizUnclear, base_url,
)

KEY = "SECRETKEY"


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self) -> bytes:
        return self._body


class FakeOpener:
    """Records each request and answers from a queue: bytes, dicts and lists become JSON, exceptions are raised."""

    def __init__(self, *answers) -> None:
        self.answers = list(answers)
        self.requests = []

    def __call__(self, request, timeout=None):
        self.requests.append(request)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return FakeResponse(answer if isinstance(answer, bytes) else json.dumps(answer).encode())


def client(*answers):
    opener = FakeOpener(*answers)
    return PostizClient("postiz.example", KEY, opener=opener), opener


def body_of(request):
    return json.loads(request.data.decode())


def test_base_url_forms():
    for raw in ["https://postiz.example", "postiz.example", "postiz.example/", "https://postiz.example/api", "https://postiz.example/api/public/v1"]:
        assert base_url(raw) == "https://postiz.example/api"


def test_requests_carry_agreed_headers():
    postiz, opener = client([])
    postiz.channels()
    request = opener.requests[0]
    assert request.get_header("User-agent") == "ldnpk-video-editor/1.0"
    assert request.get_header("Authorization") == KEY


def test_channels_skips_disabled_and_reads_identifier():
    postiz, opener = client([
        {"id": "a", "name": "London Parkour", "identifier": "instagram", "disabled": False},
        {"id": "b", "name": "Old", "identifier": "facebook", "disabled": True},
    ])
    channels = postiz.channels()
    assert [(c.id, c.identifier) for c in channels] == [("a", "instagram")]
    assert opener.requests[0].full_url == "https://postiz.example/api/public/v1/integrations"


def test_folders_skips_deleted():
    postiz, opener = client([{"id": "f1", "name": "Class Clips - Sat", "deletedAt": None}, {"id": "f2", "name": "Gone", "deletedAt": "2026-01-01"}])
    assert [f.name for f in postiz.folders()] == ["Class Clips - Sat"]
    assert opener.requests[0].full_url == "https://postiz.example/api/media/folders"


def test_upload_then_move_use_v2_paths(tmp_path):
    video = tmp_path / "out.mp4"
    video.write_bytes(b"VIDEO")
    postiz, opener = client({"id": "m1", "path": "https://x/m1.mp4", "status": "ready"}, {})
    media = postiz.upload(str(video))
    postiz.move(media.id, "f1")
    assert media == Media(id="m1", path="https://x/m1.mp4")
    assert opener.requests[0].full_url.endswith("/api/public/v1/upload")
    assert b"VIDEO" in opener.requests[0].data and b"video/mp4" in opener.requests[0].data
    assert opener.requests[1].full_url.endswith("/api/media/move")
    assert body_of(opener.requests[1]) == {"id": "m1", "folderId": "f1"}


def test_enqueue_body_matches_v2():
    postiz, opener = client({"id": "q1", "group": "g1"})
    result = postiz.enqueue("p1", "draft", "Hello", Media("m1", "https://x/m1.mp4"), [
        ChannelPost("c1", "instagram", {"post_type": "post", "collaborators": [], "is_trial_reel": False}),
        ChannelPost("c2", "youtube", {"title": "Hello", "type": "public"}),
    ])
    assert (result.id, result.group) == ("q1", "g1")
    request = opener.requests[0]
    assert request.full_url.endswith("/api/pipelines/enqueue")
    body = body_of(request)
    assert body["pipelineId"] == "p1"
    assert body["post"]["type"] == "draft" and body["post"]["tags"] == [] and body["post"]["shortLink"] is False
    first, second = body["post"]["posts"]
    assert first["integration"] == {"id": "c1"}
    assert first["value"] == [{"content": "Hello", "image": [{"id": "m1", "path": "https://x/m1.mp4"}]}]
    assert first["settings"] == {"__type": "instagram", "post_type": "post", "collaborators": [], "is_trial_reel": False}
    assert second["settings"]["__type"] == "youtube" and second["settings"]["title"] == "Hello"


def test_enqueue_sends_schedule_type_when_asked():
    postiz, opener = client({"id": "q1", "group": "g1"})
    postiz.enqueue("p1", "schedule", "Hi", Media("m1", "p"), [])
    assert body_of(opener.requests[0])["post"]["type"] == "schedule"


def test_http_error_is_postiz_error_without_key():
    error = urllib.error.HTTPError("u", 400, "Bad", {}, io.BytesIO(f"bad key {KEY}".encode()))
    postiz, _ = client(error)
    with pytest.raises(PostizError) as caught:
        postiz.channels()
    assert not isinstance(caught.value, PostizUnclear)
    assert "400" in str(caught.value) and KEY not in str(caught.value)


def test_network_error_after_send_is_unclear():
    postiz, _ = client(urllib.error.URLError("boom"))
    with pytest.raises(PostizUnclear):
        postiz.enqueue("p1", "draft", "Hi", Media("m1", "p"), [])


def test_network_error_on_a_read_is_a_plain_error():
    postiz, _ = client(urllib.error.URLError("boom"))
    with pytest.raises(PostizError) as caught:
        postiz.channels()
    assert not isinstance(caught.value, PostizUnclear)


def test_unreadable_answer_is_unclear():
    postiz, _ = client(b"<html>not json</html>")
    with pytest.raises(PostizUnclear):
        postiz.enqueue("p1", "draft", "Hi", Media("m1", "p"), [])


def test_enqueue_without_id_is_unclear():
    postiz, _ = client({})
    with pytest.raises(PostizUnclear):
        postiz.enqueue("p1", "draft", "Hi", Media("m1", "p"), [])


def test_upload_without_ready_media_is_an_error(tmp_path):
    video = tmp_path / "out.mp4"
    video.write_bytes(b"V")
    postiz, _ = client({"status": "failed"})
    with pytest.raises(PostizError):
        postiz.upload(str(video))
