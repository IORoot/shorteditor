import pytest

from collector_server.pipeline.repository import PipelineRepository
from collector_server.pipeline.schema import ensure_schema
from collector_server.pipeline.service import PipelineService
from collector_server.pipeline.models import PipelineSave
from collector_server.pipeline.templates import TEMPLATE_KEYS, defaults_from_schema
from collector_server.shared.errors import InvalidInputError, NotFoundError
from collector_server.shared.pipeline import StageStep

from .helpers import FakeUsage, real_catalog

NOW = "2026-11-17T10:00:00+00:00"


@pytest.fixture
def svc(db, tmp_path):
    ensure_schema(db)
    repo = PipelineRepository(db)
    service = PipelineService(repo, real_catalog(db, tmp_path), FakeUsage(), lambda: NOW)
    service.repo = repo
    return service


def join(svc):
    return svc.template()


def save(svc, name="Join", steps=None, description=""):
    return PipelineSave(name=name, description=description, steps=steps if steps is not None else svc.template())


@pytest.mark.full
@pytest.mark.full
def test_template_is_the_five_stage_join_with_stage_defaults(svc):
    steps = svc.template()
    assert [s.key for s in steps] == TEMPLATE_KEYS
    limit = next(s for s in steps if s.key == "limit_length")
    assert limit.settings["maxSeconds"] == 900 and "choice" not in limit.settings
    assert next(s for s in steps if s.key == "render_output").settings["maxSizeMb"] == 150


@pytest.mark.full
@pytest.mark.full
def test_defaults_from_schema_skips_null_defaults():
    schema = {"properties": {"a": {"default": 1}, "b": {"default": None}, "c": {"type": "string"}}}
    assert defaults_from_schema(schema) == {"a": 1}


def test_create_makes_an_enabled_pipeline_with_the_given_steps(svc):
    p = svc.create(save(svc))
    assert p.enabled is True and p.steps == svc.template() and p.created_at == NOW


@pytest.mark.full
@pytest.mark.full
def test_create_trims_the_name(svc):
    assert svc.create(save(svc, "  Join  ")).name == "Join"


@pytest.mark.full
@pytest.mark.full
@pytest.mark.parametrize("name", ["", "  ", "x" * 121, "a\nb"])
def test_bad_names_are_refused(svc, name):
    with pytest.raises(InvalidInputError, match="needs a name"):
        svc.create(save(svc, name))


@pytest.mark.full
@pytest.mark.full
def test_names_are_unique_ignoring_case_and_spaces(svc):
    svc.create(save(svc, "Coach Saturdays"))
    with pytest.raises(InvalidInputError, match="already a pipeline called coach saturdays"):
        svc.create(save(svc, "coach saturdays "))


@pytest.mark.full
@pytest.mark.full
def test_long_description_is_refused(svc):
    with pytest.raises(InvalidInputError, match="300"):
        svc.create(save(svc, description="x" * 301))


def test_an_invalid_order_is_refused_with_the_catalog_message_and_nothing_is_stored(svc):
    with pytest.raises(InvalidInputError, match="Render needs video"):
        svc.create(save(svc, steps=[StageStep(key="render_output")]))
    assert svc.repo.list() == []


@pytest.mark.full
@pytest.mark.full
def test_too_many_steps_and_oversized_settings_are_refused(svc):
    with pytest.raises(InvalidInputError, match="at most 30"):
        svc.create(save(svc, steps=[StageStep(key="scan_folder")] * 31))
    with pytest.raises(InvalidInputError, match="too large"):
        svc.create(save(svc, steps=[StageStep(key="scan_folder", settings={"x": "y" * 5000})]))


def test_save_updates_name_description_steps_and_keeps_enabled(svc):
    p = svc.create(save(svc))
    svc.set_enabled(p.id, False)
    steps = svc.template()[:2] + svc.template()[2:]
    got = svc.save(p.id, save(svc, "New", steps, "d"))
    assert (got.name, got.description, got.enabled) == ("New", "d", False)


@pytest.mark.full
@pytest.mark.full
def test_save_may_keep_its_own_name_but_not_take_another(svc):
    a, b = svc.create(save(svc, "A")), svc.create(save(svc, "B"))
    svc.save(a.id, save(svc, "a"))
    with pytest.raises(InvalidInputError, match="already"):
        svc.save(b.id, save(svc, "A"))


@pytest.mark.full
@pytest.mark.full
def test_a_refused_save_leaves_the_stored_pipeline_unchanged(svc):
    p = svc.create(save(svc, "A"))
    with pytest.raises(InvalidInputError):
        svc.save(p.id, save(svc, "B", [StageStep(key="render_output")]))
    assert svc.repo.get(p.id) == p


@pytest.mark.full
@pytest.mark.full
def test_an_unknown_id_is_not_found(svc):
    with pytest.raises(NotFoundError):
        svc.save(99, save(svc))
    with pytest.raises(NotFoundError):
        svc.duplicate(99)
    with pytest.raises(NotFoundError):
        svc.set_enabled(99, True)


def test_duplicate_names_copy_then_copy_2(svc):
    p = svc.create(save(svc, "A", description="d"))
    one, two = svc.duplicate(p.id), svc.duplicate(p.id)
    assert (one.name, two.name) == ("A copy", "A copy 2")
    assert one.description == "d" and one.steps == p.steps and one.enabled is True


@pytest.mark.full
@pytest.mark.full
def test_duplicate_of_a_120_character_name_stays_within_120(svc):
    p = svc.create(save(svc, "x" * 120))
    copy = svc.duplicate(p.id)
    assert len(copy.name) <= 120 and copy.name.endswith(" copy")
    assert len(svc.duplicate(p.id).name) <= 120


@pytest.mark.full
@pytest.mark.full
def test_set_enabled_is_idempotent_and_an_off_pipeline_can_still_be_saved(svc):
    p = svc.create(save(svc))
    assert svc.set_enabled(p.id, False).enabled is False
    assert svc.set_enabled(p.id, False).enabled is False
    assert svc.save(p.id, save(svc, "Renamed")).name == "Renamed"
