# Pipeline Stage 1: Server Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Pipeline stage to the server: saved, named pipelines that can be created, edited, copied, switched on and off and deleted through an API, with the contract in `shared/` that lets Production and Pipeline meet without importing each other.

**Architecture:** A new package `collector_server/pipeline/` (model, storage, service, routes, wiring) that imports only itself and `shared/`. Production's stage list and pipeline check are exposed to it through a `StageCatalog` protocol in `shared/`; what depends on a pipeline is asked through a `PipelineUsage` protocol (a null version until plan 3). `main.py` connects the parts. Production keeps working unchanged.

**Tech Stack:** Python 3.14, FastAPI, pydantic, SQLite via `shared.database.Database`, pytest (`cd app/server && .venv/bin/python -m pytest`).

**Spec:** `docs/superpowers/specs/2026-11-17-pipeline-stage-design.md`. This is plan 1 of 3. Plan 2 is the web tab, list page and editor. Plan 3 connects Production (batch, bulk and watch `pipelineId`, the hard switch, `stepsUsed`, Custom batches). Nothing visible changes for the user after this plan except new API routes and a seeded "Join clips" pipeline.

## Global Constraints

- A stage imports only itself and `shared/`. `shared/` imports no stage. `main.py` may import any stage.
- No new dependencies.
- Pipeline names are unique ignoring case, 1 to 120 characters, no control characters. The description is optional, up to 300 characters.
- Limits stay as they are: at most 30 steps, 4000 characters of settings per step (both already enforced by `ProductionService.check_pipeline`, which is the `StageCatalog` check).
- Stage defaults have one source, the stage's own settings model: limit length 900 s, render output 150 MB.
- A new pipeline starts as the five-stage Join pipeline (Scan folder, Order clips, Limit length, Join in order, Render output) with every setting filled from the stage defaults.
- "Join clips" is seeded once, with a saved marker, and never again after the user deletes it.
- Every error message that reaches the user is a plain sentence. Errors map to 404 (`NotFoundError`), 409 (`StateError`), 422 (`InvalidInputError`), as in Production.
- Baseline before starting: server suite = 704 passed. Production behavior must not change in any task; only the 60/50 defaults change in task 3.
- Work on a new branch `pipeline-stage` created from the current branch (`batches-from-folders`, not yet merged). Do not commit `app/web/tsconfig.tsbuildinfo` or `chat.md`. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never kill the user's uvicorn on port 8000; tell them to restart it at the end. Nothing is pushed.

## Review Focus

- Two names that differ only by case or surrounding spaces ("coach saturdays" and "Coach Saturdays ") must be refused as duplicates (task 3).
- A save that is refused (invalid order, bad name) must leave the stored pipeline exactly as it was (task 3).
- After the user deletes the seeded pipeline and the server restarts, it must not come back (task 4, task 6).
- A stored pipeline that names a stage that no longer exists must not break the list or the detail; the check reports the missing stage (task 4).
- Copying a pipeline whose name is already 120 characters must still work and stay within 120 (task 3).

---

### Task 1: The contract in `shared/`, shared errors, architecture test

**Files:**
- Create: `app/server/collector_server/shared/errors.py`, `app/server/collector_server/shared/pipeline.py`
- Create: `app/server/tests/shared/test_errors.py`, `app/server/tests/shared/test_pipeline_contract.py`
- Modify: `production/errors.py`, `production/service.py` (the `NotFoundError` and `StateError` classes at lines ~23-28 become imports), `production/stage_api.py` (`StageStep` becomes an import), `production/models.py` (`StageInfo` becomes an import), `production/api.py` (its inner `guarded` becomes the shared one), `production/wiring.py`, `tests/test_architecture.py`, `tests/production/test_wiring.py`
- Branch: `git checkout -b pipeline-stage`

**Interfaces:**
- Consumes: nothing.
- Produces, in `shared/errors.py`: `class InvalidInputError(ValueError)`, `class NotFoundError(Exception)`, `class StateError(Exception)`, and `def guarded(call: Callable[[], T]) -> T` that runs the call and turns those three into `HTTPException` 422, 404, 409 with `detail=str(error)` (other exceptions pass through).
- Produces, in `shared/pipeline.py` (all models are `CamelModel`):
  - `StageStep(key: str, settings: dict = {}, enabled: bool = True)`
  - `StageInfo(key: str, title: str, transitions: dict[str, str], position: str, settings_schema: dict)`
  - `UsageItem(kind: Literal["batch", "watch"], id: int, name: str, status: str | None = None, at: str | None = None)`
  - `OffImpact(watches: int, waiting_batches: int)`
  - `PipelineRef(id: int, name: str, enabled: bool, steps: list[StageStep])`
  - `@runtime_checkable class StageCatalog(Protocol)`: `stages() -> list[StageInfo]`, `check_pipeline(steps: list[StageStep]) -> list[str]`
  - `@runtime_checkable class PipelineSource(Protocol)`: `get_pipeline(pipeline_id: int) -> PipelineRef | None`, `enabled_pipelines() -> list[PipelineRef]`
  - `@runtime_checkable class PipelineUsage(Protocol)`: `users_of(pipeline_id: int) -> list[UsageItem]` (every batch, newest first, then every watch), `off_impact(pipeline_id: int) -> OffImpact`
- Production keeps importing the same names from the same places (`production.errors`, `production.service`, `production.stage_api`, `production.models`), which now re-export.
- `Production` (in `production/wiring.py`) gains the optional field `catalog: StageCatalog | None = None`, set to the `ProductionService` by `build_production`.

- [ ] **Step 1: Write the failing tests.** `test_errors.py`: `test_guarded_turns_service_errors_into_http_answers` (parametrize `NotFoundError` to 404, `StateError` to 409, `InvalidInputError` to 422; assert `HTTPException.status_code` and `detail == "boom"`), `test_guarded_lets_other_errors_through` (`RuntimeError` propagates), `test_guarded_returns_the_result`. `test_pipeline_contract.py`: `test_models_use_camel_case` (`PipelineRef(id=1, name="x", enabled=True, steps=[StageStep(key="a")]).model_dump(by_alias=True)` equals `{"id": 1, "name": "x", "enabled": True, "steps": [{"key": "a", "settings": {}, "enabled": True}]}`; `OffImpact(watches=1, waiting_batches=2).model_dump(by_alias=True)` has `waitingBatches`), `test_usage_kind_is_checked` (`UsageItem(kind="folder", id=1, name="x")` raises `ValidationError`), `test_production_service_is_a_stage_catalog` (build a `ProductionService` like `tests/production/test_api.py` does and assert `isinstance(service, StageCatalog)`). In `test_wiring.py` add `test_build_production_exposes_the_catalog` (`build_production(db, str(tmp_path)).catalog` is an instance of `StageCatalog`). In `test_architecture.py` add `"pipeline"` to `STAGES` and `test_flags_a_pipeline_module_importing_production` (`violations([("pipeline/a.py", "from ..production import x")])` has length 1; `from collector_server.production.x import y` too).
- [ ] **Step 2: Run** `cd app/server && .venv/bin/python -m pytest tests/shared tests/production/test_wiring.py tests/test_architecture.py -q`. Expected: FAIL (modules and field missing).
- [ ] **Step 3: Implement** the two shared modules as specified above; make `production/errors.py` import `InvalidInputError` from shared; delete the two error classes in `service.py` and import them (and `InvalidInputError`) from shared; import `StageStep` in `stage_api.py` and `StageInfo` in `models.py` from `collector_server.shared.pipeline`; in `api.py` delete the inner `guarded` and use `from collector_server.shared.errors import guarded`; add the `catalog` field and set it in `build_production`.
- [ ] **Step 4: Verify.** `find app/server -name __pycache__ -prune -exec rm -rf {} +` then `.venv/bin/python -m pytest -q`. Expected: 704 plus the new tests, all passed.
- [ ] **Step 5: Commit** `git add app/server && git commit` with message "Add the pipeline contract and shared errors".

### Task 2: Pipeline storage

**Files:**
- Create: `app/server/collector_server/pipeline/__init__.py` (empty), `pipeline/models.py`, `pipeline/schema.py`, `pipeline/repository.py`
- Create: `app/server/tests/pipeline/__init__.py` (empty), `tests/pipeline/test_repository.py`

**Interfaces:**
- Consumes: `Database` (`shared/database.py`: `execute`, `query`), `StageStep`, `UsageItem` from task 1.
- Produces, in `pipeline/models.py` (all `CamelModel`):
  - `Pipeline(id: int, name: str, description: str = "", enabled: bool, steps: list[StageStep], created_at: str, updated_at: str)`
  - `PipelineSave(name: str, description: str = "", steps: list[StageStep])`
  - `PipelineSummary(id: int, name: str, description: str, enabled: bool, stage_count: int, max_seconds: float | None, max_size_mb: float | None, used_by: int, updated_at: str)`
  - `PipelineDetail(Pipeline)` plus `used_by: list[UsageItem]`, `recent_batches: list[UsageItem]`
  - `Template(steps: list[StageStep])`, `Enabled(enabled: bool)`, `CheckRequest(steps: list[StageStep])`, `CheckResult(errors: list[str])`
- Produces, in `pipeline/schema.py`: `ensure_schema(db: Database) -> None` creating tables `pipelines` (`id`, `name`, `description` default `''`, `enabled` default 1, `steps` JSON text, `created_at`, `updated_at`) and `pipeline_meta` (`key` primary key, `value`). Follow the statement-splitting style of `production/schema.py` (no `;` inside a default or comment).
- Produces, in `pipeline/repository.py`: `class PipelineRepository` with `__init__(db)`, `create(name: str, description: str, steps: list[StageStep], now: str) -> Pipeline`, `get(pipeline_id: int) -> Pipeline | None`, `list() -> list[Pipeline]` (by id), `update(pipeline_id: int, name: str, description: str, steps: list[StageStep], now: str) -> None` (sets `updated_at`), `set_enabled(pipeline_id: int, enabled: bool) -> None` (does not touch `updated_at`), `delete(pipeline_id: int) -> None`, `get_meta(key: str) -> str | None`, `set_meta(key: str, value: str) -> None` (insert or replace).

- [ ] **Step 1: Write the failing tests** in `test_repository.py` using the `db` fixture and `ensure_schema(db)`: `test_create_and_get_round_trip` (steps including `StageStep(key="limit_length", settings={"maxSeconds": 45}, enabled=False)` come back equal; `enabled` is True; `created_at == updated_at == now`), `test_list_is_in_id_order`, `test_update_changes_content_and_updated_at_only`, `test_set_enabled_does_not_change_updated_at`, `test_delete_removes_it_and_get_returns_none`, `test_meta_set_get_and_overwrite` (`get_meta("seeded") is None`, then `"1"`, then overwritten).
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/pipeline/test_repository.py -q`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the three modules per the Interfaces block (SQL parameters only, never string formatting).
- [ ] **Step 4: Run** the same command. Expected: PASS. Then run `.venv/bin/python -m pytest tests/test_architecture.py -q`; expected PASS (the scan now includes `pipeline/`).
- [ ] **Step 5: Commit** "Store pipelines".

### Task 3: Pipeline rules: template, create, save, copy, switch

**Files:**
- Create: `pipeline/service.py`, `pipeline/templates.py`, `tests/pipeline/helpers.py`, `tests/pipeline/test_service.py`
- Modify: `production/stages/limit_length.py` (`max_seconds` default 60.0 becomes 900.0), `production/stages/render_output.py` (`max_size_mb` default 50.0 becomes 150.0); update any existing test that relied on the old defaults (find them by running the suite).

**Interfaces:**
- Consumes: `PipelineRepository`, models from task 2; `StageCatalog`, `PipelineUsage`, `StageStep`, `OffImpact` from task 1; `InvalidInputError`, `NotFoundError` from `shared/errors`.
- Produces, in `pipeline/templates.py`: `TEMPLATE_KEYS = ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]` and `defaults_from_schema(schema: dict) -> dict` (maps each property that has a non-null `default` to that default, using the schema's own camelCase property names).
- Produces, in `pipeline/service.py`: `class PipelineService.__init__(repo: PipelineRepository, catalog: StageCatalog, usage: PipelineUsage, now: Callable[[], str])` with:
  - `template() -> list[StageStep]`: for each key in `TEMPLATE_KEYS` that the catalog has, a step with `settings=defaults_from_schema(info.settings_schema)`.
  - `create(request: PipelineSave) -> Pipeline`
  - `save(pipeline_id: int, request: PipelineSave) -> Pipeline` (keeps `enabled`)
  - `duplicate(pipeline_id: int) -> Pipeline` (same description and steps, `enabled` True, name `"<name> copy"`, then `"<name> copy 2"`, `"<name> copy 3"`, the name part cut so the whole name stays within 120)
  - `set_enabled(pipeline_id: int, enabled: bool) -> Pipeline`
  - `stages() -> list[StageInfo]` and `check(steps: list[StageStep]) -> list[str]` (both pass through to the catalog)
  - Rules for `create` and `save`: the name is trimmed; it must be 1 to 120 characters with no control characters, otherwise `InvalidInputError("The pipeline needs a name of up to 120 characters")`; it must be unique ignoring case among the other pipelines, otherwise `InvalidInputError(f"There is already a pipeline called {name}")`; the description (trimmed) is at most 300 characters with no control characters, otherwise `InvalidInputError("The description can be up to 300 characters")`; the catalog's errors for the steps, if any, are joined with `". "` into one `InvalidInputError`. A refused request changes nothing. An unknown id raises `NotFoundError(f"There is no pipeline {pipeline_id}")`. An off pipeline can still be saved.
- `tests/pipeline/helpers.py` produces: `real_catalog(db, tmp_path) -> ProductionService` (built the way `tests/production/test_api.py` builds it) and `class FakeUsage` with settable `.items: list[UsageItem]` and `.impact: OffImpact` implementing `PipelineUsage`.

- [ ] **Step 1: Write the failing tests** in `test_service.py` (a fixture builds `PipelineService(PipelineRepository(db), real_catalog(...), FakeUsage(), lambda: NOW)`): `test_template_is_the_five_stage_join_with_stage_defaults` (keys equal `TEMPLATE_KEYS`; the `limit_length` step has `settings["maxSeconds"] == 900` and no `choice`; `render_output` has `settings["maxSizeMb"] == 150`), `test_defaults_from_schema_skips_null_defaults`, `test_create_makes_an_enabled_pipeline_with_the_given_steps`, `test_create_trims_the_name`, `test_bad_names_are_refused` (parametrize `""`, `"  "`, 121 characters, a name with `"\n"`), `test_names_are_unique_ignoring_case_and_spaces` (create "Coach Saturdays"; creating "coach saturdays " raises the "already a pipeline called" error), `test_long_description_is_refused` (301 characters), `test_an_invalid_order_is_refused_with_the_catalog_message_and_nothing_is_stored` (steps `[StageStep(key="render_output")]` raises; `repo.list() == []`), `test_too_many_steps_and_oversized_settings_are_refused` (31 steps; a 5000-character setting value), `test_save_updates_name_description_steps_and_keeps_enabled`, `test_save_may_keep_its_own_name_but_not_take_another`, `test_a_refused_save_leaves_the_stored_pipeline_unchanged`, `test_an_unknown_id_is_not_found` (save, duplicate, set_enabled), `test_duplicate_names_copy_then_copy_2`, `test_duplicate_of_a_120_character_name_stays_within_120`, `test_set_enabled_is_idempotent_and_an_off_pipeline_can_still_be_saved`.
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/pipeline/test_service.py -q`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `templates.py` and `service.py` per the Interfaces block; change the two stage defaults.
- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests/pipeline -q` then the whole suite `.venv/bin/python -m pytest -q`. Expected: all passed. If an older production test fails because it relied on the old 60 s or 50 MB default, make the test pass the value it means explicitly (do not change the new defaults).
- [ ] **Step 5: Commit** "Pipeline rules and stage defaults of 900 s and 150 MB".

### Task 4: Usage rules, summaries, detail, delete, seeding

**Files:**
- Create: `pipeline/usage.py`, `tests/pipeline/test_usage_and_seed.py`
- Modify: `pipeline/service.py`

**Interfaces:**
- Consumes: everything from task 3; `UsageItem`, `OffImpact`, `PipelineRef`, `StateError`.
- Produces, in `pipeline/usage.py`: `class NoUsage` implementing `PipelineUsage` (`users_of` returns `[]`, `off_impact` returns `OffImpact(watches=0, waiting_batches=0)`). Used until plan 3.
- Produces, added to `PipelineService`:
  - `list() -> list[PipelineSummary]` (by id). `stage_count` counts enabled steps. `max_seconds` is the `maxSeconds` setting of the enabled `limit_length` step and `max_size_mb` the `maxSizeMb` of the enabled `render_output` step; when the step has no such value the stage's default from the catalog is used; when the pipeline has no such step the value is `None`. `used_by` is `len(usage.users_of(id))`. A step whose stage is unknown to the catalog is counted and otherwise ignored; it never raises.
  - `detail(pipeline_id: int) -> PipelineDetail` (`used_by` is every user; `recent_batches` is the first 5 users whose `kind == "batch"`).
  - `off_impact(pipeline_id: int) -> OffImpact` (the usage's answer; `NotFoundError` for an unknown id).
  - `delete(pipeline_id: int) -> None`: if `usage.users_of(id)` is not empty raise `StateError(f"{name} is used by {summary}. Switch it off instead")` where `summary` lists up to 5 users as `"batch Coach Saturdays"` / `"watch Class folders"` joined with `", "` (and `" and N more"` when longer); otherwise delete.
  - `seed() -> None`: if `repo.get_meta("seeded")` is `None`, build `template()`; when the catalog's `check_pipeline` reports no errors, create "Join clips" (description "The five stages that join a folder of clips into one video") and `set_meta("seeded", "1")`; when the check fails, do nothing and set no marker. If the marker exists, do nothing even when the table is empty.
  - `get_pipeline(pipeline_id: int) -> PipelineRef | None` and `enabled_pipelines() -> list[PipelineRef]` (by id), so the service satisfies `PipelineSource`.

- [ ] **Step 1: Write the failing tests** in `test_usage_and_seed.py`: `test_list_summarises_stage_count_limits_and_usage` (a pipeline with one disabled step: `stage_count` counts only enabled; `max_seconds`/`max_size_mb` read from settings; `used_by == 2` with two `FakeUsage` items), `test_summary_falls_back_to_the_stage_default_and_dashes_when_the_stage_is_absent` (steps without settings give 900 and 150; a pipeline without `limit_length` gives `None`), `test_a_stored_pipeline_with_an_unknown_stage_still_lists_and_shows_detail` (insert via the repository a pipeline whose steps include `StageStep(key="gone")`; `list()` and `detail()` succeed and `check(steps)` reports "There is no stage called gone"), `test_detail_has_users_and_the_five_most_recent_batches` (7 batch items and 1 watch: `recent_batches` is the first 5 batches; `used_by` has 8), `test_off_impact_passes_through_the_usage_answer`, `test_delete_refuses_a_pipeline_in_use_and_names_what_uses_it` (message contains "Coach Saturdays" and "Switch it off instead"), `test_delete_removes_an_unused_pipeline`, `test_seed_creates_join_clips_once`, `test_seed_does_not_come_back_after_the_user_deletes_it` (seed, delete, seed again: `list() == []`), `test_seed_skips_and_sets_no_marker_when_the_template_is_invalid` (a catalog whose `check_pipeline` returns an error), `test_pipeline_source_methods` (`get_pipeline` returns a `PipelineRef` including `enabled`; unknown id gives `None`; `enabled_pipelines` omits an off pipeline), `test_no_usage_reports_nothing`.
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/pipeline/test_usage_and_seed.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** `usage.py` and the added service methods per the Interfaces block.
- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests/pipeline -q`. Expected: PASS.
- [ ] **Step 5: Commit** "Pipeline usage, summaries, delete rule and seeding".

### Task 5: Pipeline routes

**Files:**
- Create: `pipeline/api.py`, `tests/pipeline/test_api.py`

**Interfaces:**
- Consumes: `PipelineService` (tasks 3 and 4), models from task 2, `guarded` from task 1.
- Produces: `build_router(service: PipelineService) -> APIRouter` with prefix `/api/pipeline` and these routes (ids are `Annotated[int, Path(ge=1, le=2**63 - 1)]` as in `production/api.py`):
  - `GET /pipelines` returns `list[PipelineSummary]`
  - `POST /pipelines` (body `PipelineSave`) returns `Pipeline`, status 201
  - `GET /pipelines/{id}` returns `PipelineDetail`
  - `PUT /pipelines/{id}` (body `PipelineSave`) returns `Pipeline`
  - `POST /pipelines/{id}/enabled` (body `Enabled`) returns `Pipeline`
  - `GET /pipelines/{id}/impact` returns `OffImpact`
  - `POST /pipelines/{id}/duplicate` returns `Pipeline`, status 201
  - `DELETE /pipelines/{id}` returns 204
  - `GET /template` returns `Template`
  - `GET /stages` returns `list[StageInfo]`
  - `POST /check` (body `CheckRequest`) returns `CheckResult`

- [ ] **Step 1: Write the failing tests** in `test_api.py` (build a `FastAPI` app with the router, as `tests/production/test_api.py` does): `test_create_then_list_and_get` (status 201; list row has `stageCount`, `usedBy`, `updatedAt`; get has `usedBy` and `recentBatches` arrays), `test_template_and_stages_and_check` (`/template` has 5 steps; `/stages` lists the keys in library order; `/check` with `[{"key": "render_output"}]` returns a non-empty `errors`), `test_save_enable_duplicate_delete_flow`, `test_errors_map_to_404_409_422` (unknown id 404 on get, put, enabled, impact, duplicate and delete; deleting an in-use pipeline with a `FakeUsage` item gives 409 with the message; an invalid body gives 422 with a plain `detail` string), `test_id_out_of_range_is_422` (id `0` and `2**63`), `test_camel_case_bodies_are_accepted` (`{"name": "A", "steps": [{"key": "scan_folder", "settings": {}, "enabled": true}, ...]}`).
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/pipeline/test_api.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** `build_router` calling the service through `guarded`, with `response_model` on every route.
- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests/pipeline -q`. Expected: PASS.
- [ ] **Step 5: Commit** "Add the pipeline routes".

### Task 6: Connect it to the app

**Files:**
- Create: `pipeline/wiring.py`, `tests/pipeline/test_wiring.py`
- Modify: `collector_server/main.py`, `tests/production/test_main.py`

**Interfaces:**
- Consumes: `PipelineService`, `PipelineRepository`, `ensure_schema`, `NoUsage`, `build_router`, `StageCatalog`, `Production.catalog` from task 1.
- Produces: `@dataclass class PipelineStage(router: APIRouter, service: PipelineService)` and `build_pipeline(db: Database, catalog: StageCatalog, usage: PipelineUsage | None = None) -> PipelineStage` which ensures the schema, builds the service (`usage` defaults to `NoUsage()`, `now` is UTC ISO seconds like `production/wiring._now`), calls `service.seed()`, and returns the router and service.
- In `main.py` `create_default_app`: after `production = build_production(db, output_root)`, `pipeline = build_pipeline(db, production.catalog)` and `app.include_router(pipeline.router)`.

- [ ] **Step 1: Write the failing tests.** `tests/pipeline/test_wiring.py`: `test_build_pipeline_seeds_join_clips` (list has one pipeline named "Join clips" with `stage_count` 5), `test_building_twice_does_not_seed_twice`. In `tests/production/test_main.py` add `test_the_app_serves_the_pipeline_stage` (set `SHORT_EDITOR_DB`; `GET /api/pipeline/pipelines` returns one item named "Join clips"; `GET /api/pipeline/stages` lists 5 stages), `test_a_deleted_seed_does_not_come_back_after_a_restart` (create the app, `DELETE` the seeded pipeline, create the app again with the same database, list is empty), and `test_production_still_works_beside_it` (existing assertion that `/api/production/batches` is `[]`).
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/pipeline/test_wiring.py tests/production/test_main.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** `wiring.py` and the two lines in `main.py`.
- [ ] **Step 4: Verify everything.** `find app/server -name __pycache__ -prune -exec rm -rf {} +` then `.venv/bin/python -m pytest -q`. Expected: all passed (704 plus every new test, none removed). Then `cd app/server && .venv/bin/python -c "import collector_server.main"` succeeds. Do not start or stop the user's server; check the routes with the test client only.
- [ ] **Step 5: Commit** "Connect the pipeline stage to the app". Then tell the user to restart uvicorn on port 8000 to get the new routes, and that `git merge --no-ff --no-autostash pipeline-stage` is theirs to approve.
