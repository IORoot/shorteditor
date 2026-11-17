import pytest

from collector_server.production.builtin import build_registry
from collector_server.production.catalog import StageLibrary
from pydantic import ValidationError

from collector_server.production.builtin import build_registry
from collector_server.production.repositories import BatchRepository, LogRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.service import ProductionService
from collector_server.shared.pipeline import OffImpact, PipelineRef, StageCatalog, StageStep, UsageItem


@pytest.mark.full
@pytest.mark.full
def test_models_use_camel_case():
    ref = PipelineRef(id=1, name="x", enabled=True, steps=[StageStep(key="a")])
    assert ref.model_dump(by_alias=True) == {"id": 1, "name": "x", "enabled": True, "steps": [{"key": "a", "settings": {}, "enabled": True}]}
    assert "waitingBatches" in OffImpact(watches=1, waiting_batches=2).model_dump(by_alias=True)


def test_usage_kind_is_checked():
    with pytest.raises(ValidationError):
        UsageItem(kind="folder", id=1, name="x")


def test_production_stage_library_is_a_stage_catalog():
    assert isinstance(StageLibrary(build_registry()), StageCatalog)
