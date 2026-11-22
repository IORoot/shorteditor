import pytest

from collector_server.production.builtin import build_registry
from collector_server.production.catalog import StageLibrary
from collector_server.production.errors import InvalidInputError
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import ProductionService, StateError
from collector_server.production.stage_api import StageStep
from collector_server.shared.pipeline import PipelineRef
from tests.production.helpers import FakePipelines

NOW = "2026-11-17T10:00:00+00:00"
STEPS = [StageStep(key=k) for k in ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]]


@pytest.fixture
def parts(db, tmp_path):
    ensure_schema(db)
    inbox = tmp_path / "in"
    (inbox / "class-1").mkdir(parents=True)
    ((inbox / "class-1") / "a.mp4").write_bytes(b"x")
    pipelines = FakePipelines({1: PipelineRef(id=1, name="Join", enabled=True, steps=STEPS), 2: PipelineRef(id=2, name="Other", enabled=True, steps=STEPS), 3: PipelineRef(id=3, name="Off", enabled=False, steps=STEPS)})
    passes = PassRepository(db)
    service = ProductionService(BatchRepository(db), passes, LogRepository(db), StageLibrary(build_registry()), pipelines, lambda: NOW, str(tmp_path / "out"), ["local", "studio"])
    batch = service.create_batch("Coach", str(inbox), 1, "any", None)
    return service, passes, batch


def test_the_pipeline_and_the_worker_of_a_batch_can_be_changed(parts):
    service, passes, batch = parts
    for card in passes.for_batch(batch.id):
        passes.update(card.id, status="review")  # nothing waiting or running
    changed = service.update_batch(batch.id, None, None, pipeline_id=2, run_on="studio")
    assert (changed.pipeline_id, changed.run_on) == (2, "studio")


def test_a_pipeline_that_is_off_or_missing_and_a_worker_that_does_not_exist_are_refused(parts):
    service, passes, batch = parts
    for card in passes.for_batch(batch.id):
        passes.update(card.id, status="review")
    for bad in ({"pipeline_id": 3}, {"pipeline_id": 99}, {"run_on": "ghost"}):
        with pytest.raises(InvalidInputError):
            service.update_batch(batch.id, None, None, **bad)
    assert service.update_batch(batch.id, None, None).pipeline_id == 1


def test_the_pipeline_and_worker_cannot_change_while_a_card_is_waiting_or_running_but_the_name_can(parts):
    service, passes, batch = parts  # its card starts queued
    with pytest.raises(StateError, match="waiting or running"):
        service.update_batch(batch.id, None, None, pipeline_id=2)
    with pytest.raises(StateError, match="waiting or running"):
        service.update_batch(batch.id, None, None, run_on="studio")
    assert service.update_batch(batch.id, "Renamed", None).name == "Renamed"
