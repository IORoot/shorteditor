import pytest

from collector_server.production.models import Batch
from collector_server.production.output_paths import folder_name, output_paths


def batch(name, id=7):
    return Batch(id=id, name=name, input_folder="/in", steps=[], output_root="/out", created_at="x")


@pytest.mark.parametrize(
    "name, expected",
    [("Coach Saturdays", "Coach-Saturdays-7"), ("../../evil", "evil-7"), ("", "batch-7"), ("..", "batch-7"), ("日本語", "batch-7"), ("x" * 90, "x" * 40 + "-7")],
)
def test_folder_name_is_safe_and_ends_with_the_id(name, expected):
    assert folder_name(batch(name)) == expected


def test_output_and_work_folders():
    out, work = output_paths(batch("Coach Saturdays"), pass_id=12, number=3)
    assert out == "/out/Coach-Saturdays-7/pass-3"
    assert work == "/out/.work/12"
