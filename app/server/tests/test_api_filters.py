import pytest
from fastapi.testclient import TestClient

from collector_server.api import create_app
from collector_server.executor import TransferExecutor
from collector_server.file_transfer import FileTransfer
from collector_server.local_mover import LocalMover
from collector_server.move_repository import MoveRepository
from collector_server.planner import TransferPlanner
from collector_server.run_service import RunService
from collector_server.scheduler import Scheduler
from collector_server.service import CollectorService
from collector_server.source_checker import LocalSourceChecker
from collector_server.undo import UndoService
from datetime import datetime
from tests.conftest import LONDON
from tests.helpers import config_for, make_clip

SAT = datetime(2026, 11, 14, 9, 30, tzinfo=LONDON)
MON = datetime(2026, 11, 16, 18, 0, tzinfo=LONDON)


@pytest.fixture
def stack(db, collectors, runs, clock, tmp_path):
    source, output = tmp_path / "in", tmp_path / "out"
    source.mkdir()
    output.mkdir()
    moves, files = MoveRepository(db), FileTransfer()
    planner = TransferPlanner(clock)
    scheduler = Scheduler(collectors, runs, LocalSourceChecker(), LocalMover(planner, TransferExecutor(files, moves)), clock)
    service = CollectorService(collectors, runs, clock)
    client = TestClient(create_app(service, runs=RunService(collectors, planner, scheduler, UndoService(moves, runs, files))))
    record = collectors.add_with_config(config_for(source, output))
    return client, record, source


def payload(source, **overrides):
    base = config_for(source, source.parent / "out").model_dump(by_alias=True, mode="json")
    base.update(overrides)
    return base


def test_filters_random_selection_and_date_sources_round_trip(stack):
    client, record, source = stack
    filters = [{"rules": [{"kind": "window", "exclude": False, "days": [6], "start": "09:00", "end": "13:00"}, {"kind": "name", "exclude": True, "value": "proxy"}]}]
    body = payload(source, filters=filters, randomSelection={"enabled": True, "mode": "count", "value": 3, "scope": "folder", "seed": 9}, dateSources=["filename", "mtime"], filenamePattern="GX_YYYYMMDD")
    response = client.put(f"/api/collectors/{record.id}", json=body)
    assert response.status_code == 200
    config = client.get(f"/api/collectors/{record.id}").json()["config"]
    assert config["filters"][0]["rules"][0] == {"kind": "window", "exclude": False, "value": "", "dateFrom": "", "dateTo": "", "days": [6], "start": "09:00", "end": "13:00", "caseSensitive": False}
    assert config["randomSelection"] == {"enabled": True, "mode": "count", "value": 3, "scope": "folder", "seed": 9}
    assert config["dateSources"] == ["filename", "mtime"] and config["filenamePattern"] == "GX_YYYYMMDD"


@pytest.mark.parametrize(
    "overrides,message",
    [
        ({"filters": [{"rules": [{"kind": "regex", "value": "("}]}]}, "Invalid regex"),
        ({"filters": [{"rules": [{"kind": "weekday", "days": []}]}]}, "weekday"),
        ({"randomSelection": {"enabled": True, "mode": "percent", "value": 150}}, "more than 100"),
        ({"dateSources": []}, "at least one"),
        ({"dateSources": ["filename"], "filenamePattern": ""}, "YYYY, MM and DD"),
    ],
)
def test_invalid_filter_settings_are_rejected_with_a_message(stack, overrides, message):
    client, record, source = stack
    response = client.put(f"/api/collectors/{record.id}", json=payload(source, **overrides))
    assert response.status_code == 422 and message in response.json()["detail"]


def test_dry_run_reports_what_stays_in_place(stack):
    client, record, source = stack
    make_clip(source / "a.mp4", SAT)
    make_clip(source / "b.mp4", MON)
    make_clip(source / "c.mp4", MON)
    filters = [{"rules": [{"kind": "weekday", "days": [6]}]}]
    assert client.put(f"/api/collectors/{record.id}", json=payload(source, filters=filters)).status_code == 200
    body = client.post(f"/api/collectors/{record.id}/dry-run").json()
    assert (body["totalFiles"], body["unmatched"], body["notSelected"], body["leftInPlace"]) == (1, 2, 0, 2)
    assert body["leftSample"] == ["b.mp4", "c.mp4"]


def test_a_run_only_moves_the_matching_clips(stack):
    client, record, source = stack
    make_clip(source / "a.mp4", SAT)
    make_clip(source / "b.mp4", MON)
    client.put(f"/api/collectors/{record.id}", json=payload(source, filters=[{"rules": [{"kind": "weekday", "days": [6]}]}]))
    client.post(f"/api/collectors/{record.id}/run")
    import time
    for _ in range(100):
        runs = client.get(f"/api/collectors/{record.id}/runs").json()
        if runs and runs[0]["status"] != "running":
            break
        time.sleep(0.05)
    assert runs[0]["outcome"] == "Moved 1 clip into 1 folder"
    assert (source / "b.mp4").exists() and not (source / "a.mp4").exists()


def test_older_databases_get_default_filter_settings(collectors):
    record = collectors.add("Old", "/old")
    config = record.config()
    assert config.filters == [] and config.random_selection.enabled is False and config.date_sources == ["mtime"]
