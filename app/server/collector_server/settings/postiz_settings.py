from __future__ import annotations

from collections.abc import Callable

from fastapi import APIRouter, HTTPException

from collector_server.production.postiz_client import PostizClient, PostizError, base_url
from collector_server.shared.camel_model import CamelModel

from .app_settings import AppSettings

POSTIZ_URL = "postiz_url"
POSTIZ_KEY = "postiz_key"
_MAX_KEY_LENGTH = 300
_MAX_URL_LENGTH = 300
_NOT_SET_UP = "Postiz is not set up. Add the address and key in Settings"


class PostizView(CamelModel):
    url: str | None
    key_set: bool
    key_hint: str | None  # the last four characters only; the key itself is never sent back


class PostizUpdate(CamelModel):
    url: str | None = None  # None leaves the address alone; an empty string removes it
    key: str | None = None  # None leaves the key alone; an empty string removes it


class ChannelView(CamelModel):
    id: str
    name: str
    identifier: str


class PipelineView(CamelModel):
    id: str
    name: str
    channels: list[ChannelView]


class FolderView(CamelModel):
    id: str
    name: str


class ConnectionTest(CamelModel):
    channels: list[ChannelView]
    folders: int


def _view(settings: AppSettings) -> PostizView:
    key = settings.get(POSTIZ_KEY)
    return PostizView(url=settings.get(POSTIZ_URL), key_set=bool(key), key_hint=f"...{key[-4:]}" if key else None)


def build_postiz_router(settings: AppSettings, make_client: Callable[[str, str], PostizClient] = PostizClient) -> APIRouter:
    router = APIRouter(prefix="/api/settings/postiz", tags=["settings"])

    def client() -> PostizClient:
        url, key = settings.get(POSTIZ_URL), settings.get(POSTIZ_KEY)
        if not url or not key:
            raise HTTPException(status_code=409, detail=_NOT_SET_UP)
        return make_client(url, key)

    def asked(action):  # noqa: ANN001, ANN202
        try:
            return action(client())
        except PostizError as error:
            raise HTTPException(status_code=400, detail=str(error)) from None

    @router.get("", response_model=PostizView)
    def read() -> PostizView:
        return _view(settings)

    @router.put("", response_model=PostizView)
    def write(update: PostizUpdate) -> PostizView:
        if update.url is not None:
            text = update.url.strip()
            if len(text) > _MAX_URL_LENGTH:
                raise HTTPException(status_code=400, detail="That address is too long")
            try:
                settings.put(POSTIZ_URL, base_url(text) if text else None)
            except PostizError as error:
                raise HTTPException(status_code=400, detail=str(error)) from None
        if update.key is not None:
            key = update.key.strip()
            if key and (len(key) > _MAX_KEY_LENGTH or any(ch.isspace() for ch in key)):
                raise HTTPException(status_code=400, detail="That does not look like a Postiz API key")
            settings.put(POSTIZ_KEY, key or None)
        return _view(settings)

    @router.post("/test", response_model=ConnectionTest)
    def test() -> ConnectionTest:
        def check(postiz: PostizClient) -> ConnectionTest:
            channels = [ChannelView(id=c.id, name=c.name, identifier=c.identifier) for c in postiz.channels()]
            return ConnectionTest(channels=channels, folders=len(postiz.folders()))

        return asked(check)

    @router.get("/channels", response_model=list[ChannelView])
    def channels() -> list[ChannelView]:
        return asked(lambda postiz: [ChannelView(id=c.id, name=c.name, identifier=c.identifier) for c in postiz.channels()])

    @router.get("/pipelines", response_model=list[PipelineView])
    def pipelines() -> list[PipelineView]:
        return asked(lambda postiz: [PipelineView(id=p.id, name=p.name, channels=[ChannelView(id=c.id, name=c.name, identifier=c.identifier) for c in p.channels]) for p in postiz.pipelines()])

    @router.get("/folders", response_model=list[FolderView])
    def folders() -> list[FolderView]:
        return asked(lambda postiz: [FolderView(id=f.id, name=f.name) for f in postiz.folders()])

    return router
