import pytest

from collector_server.shared.clock import SystemClock
from collector_server.collection.mover import UnavailableMover
from collector_server.collection.source_checker import LocalSourceChecker


def test_existing_directory_is_reachable(tmp_path):
    assert LocalSourceChecker().is_reachable(str(tmp_path))


def test_missing_path_and_files_are_unreachable(tmp_path):
    file = tmp_path / "file.txt"
    file.write_text("x")
    checker = LocalSourceChecker()
    assert not checker.is_reachable(str(tmp_path / "missing"))
    assert not checker.is_reachable(str(file))


def test_system_clock_is_timezone_aware():
    now = SystemClock("Europe/London").now()
    assert now.tzinfo is not None


def test_unavailable_mover_always_raises():
    with pytest.raises(NotImplementedError):
        UnavailableMover().move(None, 1, lambda _text: None)  # type: ignore[arg-type]
