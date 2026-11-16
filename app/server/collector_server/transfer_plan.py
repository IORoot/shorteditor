from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class PlannedFile:
    source: str
    destination: str
    size: int

    @property
    def name(self) -> str:
        return self.destination.rsplit("/", 1)[-1]


@dataclass
class PlannedGroup:
    folder: str
    path: str
    renamed: bool
    files: list[PlannedFile] = field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.files)

    @property
    def bytes(self) -> int:
        return sum(item.size for item in self.files)


@dataclass
class TransferPlan:
    groups: list[PlannedGroup] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    unmatched: list[str] = field(default_factory=list)
    not_selected: list[str] = field(default_factory=list)

    @property
    def left_in_place(self) -> int:
        return len(self.unmatched) + len(self.not_selected)

    @property
    def total_files(self) -> int:
        return sum(group.count for group in self.groups)

    @property
    def total_bytes(self) -> int:
        return sum(group.bytes for group in self.groups)

    @property
    def folder_count(self) -> int:
        return len(self.groups)
