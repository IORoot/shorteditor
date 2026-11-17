from collector_server.pipeline.wiring import build_pipeline
from collector_server.production.wiring import build_production


def test_build_pipeline_seeds_join_clips(db, tmp_path):
    stage = build_pipeline(db, build_production(db, str(tmp_path)).catalog)
    [row] = stage.service.list()
    assert row.name == "Join clips" and row.stage_count == 5


def test_building_twice_does_not_seed_twice(db, tmp_path):
    catalog = build_production(db, str(tmp_path)).catalog
    build_pipeline(db, catalog)
    assert len(build_pipeline(db, catalog).service.list()) == 1
