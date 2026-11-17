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


@pytest.mark.full
def test_unknown_stage_is_rejected():
    with pytest.raises(ValidationError):
        StageHandoff.model_validate({**PAYLOAD, "stage": "export"})


def test_handoff_rejects_negative_size():
    bad = {**PAYLOAD, "folders": [{"path": "/a", "clips": [{"name": "x", "sizeBytes": -1}]}]}
    with pytest.raises(ValidationError):
        StageHandoff.model_validate(bad)


@pytest.mark.full
def test_handoff_rejects_negative_run_id():
    with pytest.raises(ValidationError):
        StageHandoff.model_validate({**PAYLOAD, "runId": -1})


@pytest.mark.full
def test_handoff_accepts_zero_size_and_run_id():
    zero = {**PAYLOAD, "runId": 0, "folders": [{"path": "/a", "clips": [{"name": "x", "sizeBytes": 0}]}]}
    assert StageHandoff.model_validate(zero).run_id == 0
