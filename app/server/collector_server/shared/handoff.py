from typing import Literal

from collector_server.shared.camel_model import CamelModel


class HandoffClip(CamelModel):
    name: str
    size_bytes: int


class HandoffFolder(CamelModel):
    path: str
    clips: list[HandoffClip]


class StageHandoff(CamelModel):
    run_id: int
    stage: Literal["collection", "production", "output"]
    folders: list[HandoffFolder]
