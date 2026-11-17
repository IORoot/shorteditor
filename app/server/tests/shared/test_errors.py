import pytest
from fastapi import HTTPException

from collector_server.shared.errors import InvalidInputError, NotFoundError, StateError, guarded


def test_guarded_turns_service_errors_into_http_answers():
    for error, status in [(NotFoundError, 404), (StateError, 409), (InvalidInputError, 422)]:
        def fail():
            raise error("boom")

        with pytest.raises(HTTPException) as caught:
            guarded(fail)
        assert caught.value.status_code == status
        assert caught.value.detail == "boom"


@pytest.mark.full
@pytest.mark.full
def test_guarded_lets_other_errors_through():
    def fail():
        raise RuntimeError("x")

    with pytest.raises(RuntimeError):
        guarded(fail)


@pytest.mark.full
@pytest.mark.full
def test_guarded_returns_the_result():
    assert guarded(lambda: 5) == 5
