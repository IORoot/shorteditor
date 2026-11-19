from __future__ import annotations

from fastapi import APIRouter, HTTPException

from collector_server.shared.camel_model import CamelModel
from collector_server.production.stage_api import DEFAULT_AI_MODEL
from collector_server.shared.database import Database

OPENROUTER_KEY = "openrouter_key"
OPENROUTER_MODEL = "openrouter_model"
_MAX_KEY_LENGTH = 300
_MAX_MODEL_LENGTH = 200


class AppSettings:
    """Small settings the user keeps in the app. Values stay on this computer's database."""

    def __init__(self, db: Database) -> None:
        self._db = db
        db.execute("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")

    def get(self, name: str) -> str | None:
        rows = self._db.query("SELECT value FROM app_settings WHERE key = ?", (name,))
        return rows[0]["value"] if rows else None

    def put(self, name: str, value: str | None) -> None:
        if value is None:
            self._db.execute("DELETE FROM app_settings WHERE key = ?", (name,))
        else:
            self._db.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", (name, value))


class AiKeyView(CamelModel):
    key_set: bool
    key_hint: str | None  # the last four characters only; the key itself is never sent back
    model: str  # the model the AI stages ask; the default until the user picks another


class AiKeyUpdate(CamelModel):
    key: str | None = None  # None leaves the key alone; an empty string removes it
    model: str | None = None  # None leaves the model alone; an empty string goes back to the default


def _view(settings: AppSettings) -> AiKeyView:
    key = settings.get(OPENROUTER_KEY)
    return AiKeyView(key_set=bool(key), key_hint=f"...{key[-4:]}" if key else None, model=settings.get(OPENROUTER_MODEL) or DEFAULT_AI_MODEL)


def build_settings_router(settings: AppSettings) -> APIRouter:
    router = APIRouter(prefix="/api/settings", tags=["settings"])

    @router.get("/ai", response_model=AiKeyView)
    def read_ai() -> AiKeyView:
        return _view(settings)

    @router.put("/ai", response_model=AiKeyView)
    def write_ai(update: AiKeyUpdate) -> AiKeyView:
        if update.key is not None:
            key = update.key.strip()
            if key and (len(key) > _MAX_KEY_LENGTH or any(ch.isspace() for ch in key)):
                raise HTTPException(status_code=400, detail="That does not look like an OpenRouter key")
            settings.put(OPENROUTER_KEY, key or None)
        if update.model is not None:
            model = update.model.strip()
            if model and (len(model) > _MAX_MODEL_LENGTH or any(ch.isspace() for ch in model)):
                raise HTTPException(status_code=400, detail="That does not look like an OpenRouter model name, such as nvidia/nemotron-3.5-super-vl")
            settings.put(OPENROUTER_MODEL, model or None)
        return _view(settings)

    return router
