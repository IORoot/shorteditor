"""Normal runs use the essential tests only. Tests marked `full` run with `pytest --full`."""
import pytest


def pytest_addoption(parser):
    parser.addoption("--full", action="store_true", help="also run the extended tests marked `full`")


def pytest_collection_modifyitems(config, items):
    if config.getoption("--full"):
        return
    kept = [item for item in items if "full" not in item.keywords]
    deselected = [item for item in items if "full" in item.keywords]
    if deselected:
        items[:] = kept
        config.hook.pytest_deselected(items=deselected)
