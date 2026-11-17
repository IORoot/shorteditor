import pytest

from collector_server.production.registry import StageRegistry
from tests.production.helpers import FakeStage

STAGE_FILE = '''
from tests.production.helpers import FakeStage
STAGE = FakeStage("dropin", "Drop in", {"pieces": "pieces"})
'''


@pytest.mark.full
@pytest.mark.full
def test_register_and_get():
    registry = StageRegistry()
    stage = FakeStage("a", "A", {"none": "pieces"})
    registry.register(stage)
    assert registry.get("a") is stage
    assert registry.all() == [stage]


@pytest.mark.full
@pytest.mark.full
def test_duplicate_key_rejected():
    registry = StageRegistry()
    registry.register(FakeStage("a", "A", {"pieces": "pieces"}))
    with pytest.raises(ValueError, match="already registered"):
        registry.register(FakeStage("a", "Again", {"pieces": "pieces"}))


@pytest.mark.full
@pytest.mark.full
def test_unknown_key_raises():
    with pytest.raises(KeyError):
        StageRegistry().get("nope")


def test_discover_folder_loads_stage_files(tmp_path):
    (tmp_path / "drop_in.py").write_text(STAGE_FILE)
    registry = StageRegistry()
    registry.discover_folder(str(tmp_path))
    assert registry.get("dropin").title == "Drop in"
    assert registry.problems == []


@pytest.mark.full
@pytest.mark.full
def test_discover_folder_records_bad_file(tmp_path):
    (tmp_path / "no_stage.py").write_text("X = 1\n")
    (tmp_path / "broken.py").write_text("raise RuntimeError('boom')\n")
    registry = StageRegistry()
    registry.discover_folder(str(tmp_path))
    assert registry.all() == []
    assert len(registry.problems) == 2
    assert any("no_stage.py" in p for p in registry.problems)
    assert any("broken.py" in p for p in registry.problems)


@pytest.mark.full
@pytest.mark.full
def test_discover_missing_folder_is_not_an_error(tmp_path):
    registry = StageRegistry()
    registry.discover_folder(str(tmp_path / "missing"))
    assert registry.all() == [] and registry.problems == []


@pytest.mark.full
@pytest.mark.full
def test_register_rejects_bad_transitions():
    bad = FakeStage("a", "A", {"pieces": "videos"})
    with pytest.raises(ValueError, match="transitions"):
        StageRegistry().register(bad)


@pytest.mark.full
@pytest.mark.full
def test_register_rejects_bad_position():
    with pytest.raises(ValueError, match="position"):
        StageRegistry().register(FakeStage("a", "A", {"pieces": "pieces"}, "middle"))


@pytest.mark.full
@pytest.mark.full
def test_register_rejects_missing_title_and_run():
    class Bare:
        key = "x"

    with pytest.raises(ValueError):
        StageRegistry().register(Bare())


@pytest.mark.full
@pytest.mark.full
def test_plugin_with_postponed_annotations_loads(tmp_path):
    (tmp_path / "modern.py").write_text(
        "from __future__ import annotations\n"
        "from dataclasses import dataclass\n"
        "from collector_server.shared.camel_model import CamelModel\n"
        "class Settings(CamelModel):\n    amount: int = 1\n"
        "@dataclass\nclass Holder:\n    value: int = 0\n"
        "class Mine:\n    key='mine'\n    title='Mine'\n    settings_model=Settings\n"
        "    transitions={'pieces':'pieces'}\n    position='any'\n"
        "    def run(self, data, settings, ctx): return Holder() and data\n"
        "STAGE = Mine()\n"
    )
    registry = StageRegistry()
    registry.discover_folder(str(tmp_path))
    assert registry.problems == []
    assert registry.get("mine").settings_model(amount=3).amount == 3


@pytest.mark.full
@pytest.mark.full
def test_plugin_that_exits_is_contained(tmp_path):
    (tmp_path / "quits.py").write_text("import sys\nsys.exit(1)\n")
    registry = StageRegistry()
    registry.discover_folder(str(tmp_path))
    assert len(registry.problems) == 1


@pytest.mark.full
@pytest.mark.full
def test_helper_files_starting_with_underscore_are_skipped(tmp_path):
    (tmp_path / "_helper.py").write_text("X = 1\n")
    (tmp_path / "__init__.py").write_text("")
    registry = StageRegistry()
    registry.discover_folder(str(tmp_path))
    assert registry.problems == []


@pytest.mark.full
@pytest.mark.full
def test_duplicate_plugin_key_is_a_problem(tmp_path):
    (tmp_path / "again.py").write_text(STAGE_FILE)
    registry = StageRegistry()
    registry.register(FakeStage("dropin", "Existing", {"pieces": "pieces"}))
    registry.discover_folder(str(tmp_path))
    assert any("again.py" in p and "already registered" in p for p in registry.problems)


@pytest.mark.full
@pytest.mark.full
def test_problem_text_names_the_error_type(tmp_path):
    (tmp_path / "broken.py").write_text("raise KeyError('x')\n")
    registry = StageRegistry()
    registry.discover_folder(str(tmp_path))
    assert "KeyError" in registry.problems[0]
