import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from collector_server.production.api import build_router
from collector_server.production.catalog import StageLibrary
from collector_server.production.errors import InvalidInputError
from collector_server.production.pipeline_usage import ProductionUsage
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.runner import PassRunner
from collector_server.production.schema import ensure_schema
from collector_server.production.service import ProductionService
from collector_server.production.stage_api import StageStep
from collector_server.production.watch_models import WatchCreate
from collector_server.production.watch_repository import WatchRepository
from collector_server.production.watch_service import WatchService
from collector_server.production.worker import LocalWorker
from collector_server.shared.pipeline import PipelineRef
from tests.production.helpers import FakePipelines, fake_registry

NOW = "2026-11-17T10:00:00+00:00"
FAKE_STEPS = [StageStep(key=k) for k in ["scan", "order", "join", "render"]]


def put(pipelines, pipeline_id, name="Join clips", enabled=True, steps=FAKE_STEPS):
    pipelines.pipelines[pipeline_id] = PipelineRef(id=pipeline_id, name=name, enabled=enabled, steps=steps)


@pytest.fixture
def world(db, tmp_path):
    ensure_schema(db)
    inbox, parent = tmp_path / "in", tmp_path / "parent"
    inbox.mkdir()
    parent.mkdir()
    batches, passes, watches, logs = BatchRepository(db), PassRepository(db), WatchRepository(db), LogRepository(db)
    pipelines = FakePipelines()
    put(pipelines, 1)
    service = ProductionService(batches, passes, logs, StageLibrary(fake_registry()), pipelines, lambda: NOW, str(tmp_path / "out"), ["local"])
    runner = PassRunner(batches, passes, logs, fake_registry(), pipelines, lambda: NOW)
    watch_service = WatchService(watches, service, lambda: 1_000_000.0)
    return {"service": service, "passes": passes, "batches": batches, "pipelines": pipelines, "runner": runner,
            "inbox": inbox, "parent": parent, "usage": ProductionUsage(batches, passes, watches), "watch_service": watch_service}


def test_a_batch_cannot_use_a_switched_off_or_missing_pipeline(world):
    put(world["pipelines"], 1, enabled=False)
    with pytest.raises(InvalidInputError, match="is off"):
        world["service"].create_batch("Coach", str(world["inbox"]), 1, "any", None)
    with pytest.raises(InvalidInputError, match="does not exist"):
        world["service"].create_batch("Coach", str(world["inbox"]), 9, "any", None)


def test_a_pass_runs_the_pipeline_steps_and_keeps_them(world):
    batch = world["service"].create_batch("Coach", str(world["inbox"]), 1, "any", None)
    queued = world["passes"].for_batch(batch.id)[0]
    world["runner"].run(queued.id, LocalWorker("local"))
    assert [s.key for s in world["passes"].get(queued.id).steps_used] == ["scan", "order", "join", "render"]


def test_a_switched_off_pipeline_stops_its_next_pass_with_the_switch_message(world):
    batch = world["service"].create_batch("Coach", str(world["inbox"]), 1, "any", None)
    queued = world["passes"].for_batch(batch.id)[0]
    put(world["pipelines"], 1, enabled=False)
    world["runner"].run(queued.id, LocalWorker("local"))
    failed = world["passes"].get(queued.id)
    assert (failed.status, failed.error) == ("failed", "Pipeline 'Join clips' is off. Switch it on, then run again.")


def test_run_again_can_switch_to_another_pipeline_and_a_custom_batch_must_choose_one(world):
    put(world["pipelines"], 2, name="Short")
    batch = world["service"].create_batch("Coach", str(world["inbox"]), 1, "any", None)
    world["runner"].run(world["passes"].for_batch(batch.id)[0].id, LocalWorker("local"))  # finishes, so it can run again
    world["service"].run_again(batch.id, 2)
    assert world["batches"].get(batch.id).pipeline_id == 2
    custom = world["batches"].create("Old", str(world["inbox"]), None, FAKE_STEPS, "any", str(world["inbox"]) + "-out", NOW)
    with pytest.raises(InvalidInputError, match="Choose a pipeline"):
        world["service"].run_again(custom.id, None)


def test_usage_counts_the_batches_and_watches_that_a_switch_would_stop(world):
    world["service"].create_batch("Coach", str(world["inbox"]), 1, "any", None)
    world["watch_service"].create(WatchCreate(name="Watch", parent_folder=str(world["parent"]), pattern=r"^\d{4}-.+$", pipeline_id=1))
    impact = world["usage"].off_impact(1)
    assert (impact.watches, impact.waiting_batches) == (1, 1)
    assert sorted(item.kind for item in world["usage"].users_of(1)) == ["batch", "watch"]


def test_a_watch_is_paused_while_its_pipeline_is_off(world):
    watch = world["watch_service"].create(WatchCreate(name="Watch", parent_folder=str(world["parent"]), pattern=r"^\d{4}-.+$", pipeline_id=1))
    put(world["pipelines"], 1, enabled=False)
    view = world["watch_service"].get(watch.id)
    assert view.status == "paused" and "is off" in view.status_line
    result = world["watch_service"].check(watch.id)
    assert (result.created, result.error) == ([], None)


def test_the_pipeline_picker_lists_only_switched_on_pipelines(world):
    put(world["pipelines"], 2, name="Off one", enabled=False)
    app = FastAPI()
    app.include_router(build_router(world["service"]))
    body = TestClient(app).get("/api/production/pipelines").json()
    assert body == [{"id": 1, "name": "Join clips", "stageCount": 4}]
