from typing import Literal

from pydantic import Field

from collector_server.shared.camel_model import CamelModel


class HandoffClip(CamelModel):
    name: str
    size_bytes: int = Field(ge=0)


class HandoffFolder(CamelModel):
    path: str
    clips: list[HandoffClip]


class StageHandoff(CamelModel):
    run_id: int = Field(ge=0)
    stage: Literal["collection", "production", "output"]
    folders: list[HandoffFolder]
