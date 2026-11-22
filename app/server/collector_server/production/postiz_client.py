from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import uuid
from collections.abc import Callable
from dataclasses import dataclass

CLIENT_NAME = "ldnpk-video-editor/1.0"  # the name the user's Cloudflare rule lets through
_READ_SECONDS = 30
_UPLOAD_SECONDS = 180


class PostizError(Exception):
    """Postiz refused, or could not be reached before anything was sent. Nothing was created."""


class PostizUnclear(PostizError):
    """No readable answer after the request was sent. Postiz may have acted, so never try again unchecked."""


@dataclass(frozen=True)
class Channel:
    id: str
    name: str
    identifier: str  # the platform: instagram, facebook, youtube ...
    disabled: bool = False


@dataclass(frozen=True)
class Pipeline:
    id: str
    name: str
    channels: list[Channel]  # the channels the pipeline posts to


@dataclass(frozen=True)
class Folder:
    id: str
    name: str


@dataclass(frozen=True)
class Media:
    id: str
    path: str


@dataclass(frozen=True)
class ChannelPost:
    id: str
    identifier: str
    settings: dict


@dataclass(frozen=True)
class Enqueued:
    id: str
    group: str


def base_url(raw: str) -> str:
    """The API address: https, no trailing slash, no /public/v1, ending /api."""
    text = (raw or "").strip()
    if not text:
        raise PostizError("Enter the Postiz address")
    if "://" not in text:
        text = "https://" + text
    if not text.startswith("https://"):
        raise PostizError("The Postiz address must use https")
    text = text.rstrip("/")
    if text.endswith("/public/v1"):
        text = text[: -len("/public/v1")].rstrip("/")
    if not text.endswith("/api"):
        text += "/api"
    return text


class PostizClient:
    def __init__(self, url: str, key: str, opener: Callable = urllib.request.urlopen) -> None:
        self._base = base_url(url)
        self._key = key
        self._opener = opener

    def channels(self) -> list[Channel]:
        rows = self._request("GET", "/public/v1/integrations")
        if not isinstance(rows, list):
            raise PostizError("Postiz sent an unexpected list of channels")
        return [Channel(id=r["id"], name=r.get("name", ""), identifier=r.get("identifier", ""), disabled=bool(r.get("disabled"))) for r in rows if not r.get("disabled")]

    def pipelines(self) -> list[Pipeline]:
        rows = self._request("GET", "/public/v1/pipelines")
        if not isinstance(rows, list):
            raise PostizError("Postiz sent an unexpected list of pipelines")
        return [
            Pipeline(id=r["id"], name=r.get("name", ""), channels=[Channel(id=c["id"], name=c.get("name", ""), identifier=c.get("identifier", "")) for c in r.get("channels") or []])
            for r in rows
        ]

    def folders(self) -> list[Folder]:
        rows = self._request("GET", "/media/folders")
        if not isinstance(rows, list):
            raise PostizError("Postiz sent an unexpected list of media folders")
        return [Folder(id=r["id"], name=r.get("name", "")) for r in rows if not r.get("deletedAt")]

    def upload(self, path: str) -> Media:
        boundary = uuid.uuid4().hex
        with open(path, "rb") as video:
            content = video.read()
        head = f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{os.path.basename(path)}"\r\nContent-Type: video/mp4\r\n\r\n'.encode()
        body = head + content + f"\r\n--{boundary}--\r\n".encode()
        media = self._request("POST", "/public/v1/upload", body, f"multipart/form-data; boundary={boundary}", _UPLOAD_SECONDS)
        if not isinstance(media, dict) or not media.get("id") or not media.get("path") or media.get("status") not in (None, "ready"):
            raise PostizError("Postiz did not return a ready media file after the upload")
        return Media(id=media["id"], path=media["path"])

    def move(self, media_id: str, folder_id: str) -> None:
        self._request("POST", "/media/move", json.dumps({"id": media_id, "folderId": folder_id}).encode())

    def enqueue(self, pipeline_id: str, post_type: str, caption: str, media: Media, channels: list[ChannelPost]) -> Enqueued:
        posts = [
            {"integration": {"id": c.id}, "value": [{"content": caption, "image": [{"id": media.id, "path": media.path}]}], "settings": {"__type": c.identifier, **c.settings}}
            for c in channels
        ]
        payload = {"pipelineId": pipeline_id, "post": {"type": post_type, "tags": [], "shortLink": False, "posts": posts}}
        result = self._request("POST", "/pipelines/enqueue", json.dumps(payload).encode())
        if not isinstance(result, dict) or not result.get("id"):
            raise PostizUnclear("Postiz did not return a queue ID, so the post may or may not exist")
        return Enqueued(id=str(result["id"]), group=str(result.get("group", "")))

    def _clean(self, text: str) -> str:
        return text.replace(self._key, "[KEY]") if self._key else text

    def _request(self, method: str, path: str, data: bytes | None = None, content_type: str = "application/json", timeout: int = _READ_SECONDS):  # noqa: ANN202
        reading = method == "GET"
        headers = {"Authorization": self._key, "Accept": "application/json", "User-Agent": CLIENT_NAME}
        if data is not None:
            headers["Content-Type"] = content_type
        request = urllib.request.Request(self._base + path, data=data, headers=headers, method=method)
        try:
            with self._opener(request, timeout=timeout) as response:
                body = response.read()
        except urllib.error.HTTPError as error:
            try:
                detail = error.read(400).decode("utf-8", "replace")
            except OSError:
                detail = ""
            message = self._clean(f"Postiz said {error.code} for {path}: {detail}".strip())
            if not reading and (error.code >= 500 or error.code == 408):  # a gateway can answer after Postiz has already acted
                raise PostizUnclear(message + "; the request may have been processed") from None
            raise PostizError(message) from None
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            reason = f"Postiz could not be reached for {path} ({type(error).__name__})"
            raise (PostizError(reason) if reading else PostizUnclear(reason + "; the request may have been processed")) from None
        try:
            return json.loads(body) if body else {}
        except (UnicodeDecodeError, json.JSONDecodeError):
            message = f"Postiz sent an answer that could not be read for {path}"
            raise (PostizError(message) if reading else PostizUnclear(message)) from None
