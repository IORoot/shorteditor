from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from fastapi import HTTPException

T = TypeVar("T")


class InvalidInputError(ValueError):
    """The request cannot be accepted, in words the user can act on."""


class NotFoundError(Exception):
    pass


class StateError(Exception):
    """The action does not fit the current state."""


def guarded(call: Callable[[], T]) -> T:
    """Run a service call, turning its errors into HTTP answers."""
    try:
        return call()
    except NotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except StateError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except InvalidInputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
