from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from collector_server.collector_repository import CollectorRepository
from collector_server.database import Database
from collector_server.run_repository import RunRepository

LONDON = ZoneInfo("Europe/London")


class FakeClock:
    def __init__(self, start: datetime) -> None:
        self.current = start

    def now(self) -> datetime:
        return self.current

    def advance(self, **delta: float) -> None:
        self.current += timedelta(**delta)


class FakeChecker:
    def __init__(self, reachable: bool = True) -> None:
        self.reachable = reachable
        self.checked: list[str] = []

    def is_reachable(self, source: str) -> bool:
        self.checked.append(source)
        return self.reachable


class FakeMover:
    def __init__(self, outcome: str = "Moved 3 clips", error: Exception | None = None) -> None:
        self.outcome = outcome
        self.error = error
        self.calls = 0

    def move(self, collector, run_id=0, progress=None) -> str:  # noqa: ANN001
        self.calls += 1
        if self.error:
            raise self.error
        return self.outcome


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock(datetime(2026, 11, 16, 12, 0, tzinfo=LONDON))


@pytest.fixture
def db(tmp_path):
    database = Database(str(tmp_path / "test.db"))
    yield database
    database.close()


@pytest.fixture
def collectors(db) -> CollectorRepository:
    return CollectorRepository(db)


@pytest.fixture
def runs(db) -> RunRepository:
    return RunRepository(db)
