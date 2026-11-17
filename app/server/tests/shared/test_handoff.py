import pytest
from pydantic import ValidationError

from collector_server.shared.handoff import StageHandoff

PAYLOAD = {
    "runId": 3,
    "stage": "collection",
    "folders": [{"path": "/a/2026-11-14", "clips": [{"name": "x.mov", "sizeBytes": 10}]}],
}


def test_handoff_round_trips_camel_case():
    h = StageHandoff.model_validate(PAYLOAD)
    assert h.run_id == 3
    assert h.model_dump(by_alias=True) == PAYLOAD


def test_unknown_stage_is_rejected():
    with pytest.raises(ValidationError):
        StageHandoff.model_validate({**PAYLOAD, "stage": "export"})
