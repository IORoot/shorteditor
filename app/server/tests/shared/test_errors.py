import pytest
from fastapi import HTTPException

from collector_server.shared.errors import InvalidInputError, NotFoundError, StateError, guarded


@pytest.mark.parametrize(("error", "status"), [(NotFoundError, 404), (StateError, 409), (InvalidInputError, 422)])
def test_guarded_turns_service_errors_into_http_answers(error, status):
    def fail():
        raise error("boom")

    with pytest.raises(HTTPException) as caught:
        guarded(fail)
    assert caught.value.status_code == status
    assert caught.value.detail == "boom"


def test_guarded_lets_other_errors_through():
    def fail():
        raise RuntimeError("x")

    with pytest.raises(RuntimeError):
        guarded(fail)


def test_guarded_returns_the_result():
    assert guarded(lambda: 5) == 5
