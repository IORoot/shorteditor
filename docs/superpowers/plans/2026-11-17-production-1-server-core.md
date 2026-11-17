# Production 1: Server Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Join pipeline (Scan → Order → Limit length → Join → Render) runs end to end through the API: create a batch, it queues, runs on this computer, ends Ready to review (or Blocked/Failed), and can be approved or run again as a new pass.

**Architecture:** A new `collector_server/production/` package (imports only itself and `shared`). Stages are plugins: one file each exposing `STAGE`, working on typed data (`pieces` → `video`). A `PassRunner` executes a pass's stages and records status and logs. A `JobQueue` starts one job per worker in first-in-first-out order. Workers other than "This computer", AI, trims and the web UI are later plans.

**Tech Stack:** Python 3.14, FastAPI, pydantic (`CamelModel`), SQLite via `shared.database.Database`, `ffmpeg`/`ffprobe` at `/opt/homebrew/bin` (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-11-17-production-design.md`

## Global Constraints

- Production code imports only `collector_server.production.*` and `collector_server.shared.*`; `tests/test_architecture.py` must stay green.
- No new dependencies. FFmpeg is invoked with an argv list, never through a shell.
- Files small and single-purpose; simple classes; every behavior has a test.
- Run tests from `app/server` with `.venv/bin/pytest -q`. Tests that need FFmpeg are skipped when `shutil.which("ffmpeg")` is `None` (use `@requires_ffmpeg` from `tests/production/helpers.py`).
- API JSON is camelCase (use `CamelModel`).
- Pass statuses are exactly: `queued`, `running`, `review`, `blocked`, `failed`, `approved`.
- Worker ids are strings; the built-in one is `"local"`. Batch `run_on` is `"any"` or a worker id.
- Never kill the user's uvicorn on port 8000; tell the user to restart it after server changes.

## Review Focus

- A clip with no audio stream is joined with other clips (silence is generated; no crash).
- Clips of different shapes (e.g. 1920×1080 and 1080×1920) join into the canvas size without error.
- An empty folder, or one whose clips are all shorter than the minimum, ends the pass Failed with a plain message, not a traceback.
- A size limit that would need an unusably low bitrate ends the pass Failed with a plain message.
- The server restarting while a pass is Running: on start-up that pass becomes Failed ("Interrupted by a restart") and the queue carries on.
- File names with spaces, quotes or non-ASCII characters work through scan, join and render.

---

## File Structure

`app/server/collector_server/production/`
- `pieces.py` — `Piece`, `PiecesData`, `VideoData`, `Kind`, `StageData`
- `stage_api.py` — `Stage` protocol, `StageContext`, `BlockedError`, `StageError`, `StageStep`
- `registry.py` — `StageRegistry` (register, get, all, discover package and folder)
- `validation.py` — `validate_pipeline`
- `worker.py` — `Worker` protocol, `LocalWorker`
- `ffmpeg.py` — `FfmpegRunner`, `FfmpegError`
- `stages/scan_folder.py`, `order_clips.py`, `limit_length.py`, `join_pieces.py`, `render_output.py` — one `STAGE` each
- `models.py` — `Batch`, `Pass`, `PassStatus`, request/response models
- `schema.py` — `ensure_schema(db)`
- `repositories.py` — `BatchRepository`, `PassRepository`, `LogRepository`
- `runner.py` — `PassRunner`
- `queue.py` — `JobQueue`
- `service.py` — `ProductionService`
- `api.py` — `build_router`
- `builtin.py` — `build_registry()` registering the built-in stages

Tests mirror these under `app/server/tests/production/`. Modify `shared/handoff.py` and `main.py`.

---

### Task 1: Typed data and handoff tightening

**Files:**
- Create: `collector_server/production/__init__.py`, `collector_server/production/pieces.py`
- Modify: `collector_server/shared/handoff.py`
- Test: `tests/production/__init__.py`, `tests/production/test_pieces.py`, `tests/shared/test_handoff.py` (extend if it exists)

**Interfaces:**
- Produces: `Kind = Literal["none","pieces","video"]`; `Piece(clip: str, clip_duration: float, start: float = 0.0, end: float | None = None)` with property `length -> float`; `PiecesData(items: list[Piece], kind="pieces")` with property `total -> float`; `VideoData(path: str, duration: float, size_bytes: int, kind="video")`; `StageData = PiecesData | VideoData | None`.

- [ ] **Step 1: Write failing tests** in `tests/production/test_pieces.py`: `test_piece_length_whole_clip` (`Piece(clip="a.mp4", clip_duration=10).length == 10`), `test_piece_length_trimmed` (`start=2, end=5` → `3`), `test_pieces_total_adds_lengths` (two pieces of 3 and 4 → `7`), `test_piece_rejects_end_before_start` (`start=5, end=2` raises `pydantic.ValidationError`). In the handoff test: `test_handoff_rejects_negative_size` (`HandoffClip(name="a", size_bytes=-1)` raises) and `test_handoff_rejects_negative_run_id`.
- [ ] **Step 2: Run** `.venv/bin/pytest tests/production/test_pieces.py -q`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `pieces.py` as above (a pydantic model validator rejects `end <= start`; `length` uses `clip_duration` when `end is None`). In `shared/handoff.py` use `Field(ge=0)` for `run_id` and `size_bytes`.
- [ ] **Step 4: Run** `.venv/bin/pytest -q`. Expected: all pass, including `tests/test_architecture.py`.
- [ ] **Step 5: Commit** `git add collector_server tests && git commit -m "Add production piece types and tighten the handoff contract"`.

### Task 2: Stage plugin API, registry, validation

**Files:**
- Create: `production/stage_api.py`, `production/registry.py`, `production/validation.py`
- Test: `tests/production/test_registry.py`, `tests/production/test_validation.py`

**Interfaces:**
- Consumes: `Kind`, `StageData` (Task 1).
- Produces:
  - `StageStep(key: str, settings: dict = {}, enabled: bool = True)` (CamelModel)
  - `class BlockedError(Exception)`: `__init__(reason: str, choices: list[str])`, attributes of the same names. `class StageError(Exception)` (a plain-message failure).
  - `class Stage(Protocol)`: `key: str`, `title: str`, `settings_model: type[CamelModel]`, `transitions: dict[Kind, Kind]`, `position: Literal["first","last","any"]`, `run(self, data: StageData, settings: CamelModel, ctx: StageContext) -> StageData`.
  - `StageContext` dataclass: `input_folder: str`, `work_dir: str`, `ffmpeg: FfmpegRunner`, `log: Callable[[str], None]`, `fit: str = "crop"`, `output_dir: str`. (Import `FfmpegRunner` under `TYPE_CHECKING`.)
  - `StageRegistry`: `register(stage)` (duplicate key raises `ValueError`), `get(key) -> Stage` (unknown raises `KeyError`), `all() -> list[Stage]`, `discover_folder(path: str) -> None` (imports each `*.py` in the folder; a module must define `STAGE`, otherwise it is skipped and recorded in `registry.problems: list[str]`).
  - `validate_pipeline(registry, steps: list[StageStep]) -> list[str]` — plain-English errors, empty when valid.

- [ ] **Step 1: Write failing tests.** Registry: `test_register_and_get`, `test_duplicate_key_rejected`, `test_unknown_key_raises`, `test_discover_folder_loads_stage_files` (write a tmp file defining a minimal `STAGE`), `test_discover_folder_records_bad_file` (a file without `STAGE` → `problems` has one entry naming the file). Validation, using small fake stages: `test_valid_join_pipeline` (scan, order, join, render → `[]`), `test_scan_must_be_first` (message contains `"Scan folder must be first"`), `test_render_must_be_last` (contains `"Render must be last"`), `test_stage_needs_matching_input` (`[scan, join, join, render]` → a message like `"Join in order needs pieces; the step before it makes a video"`), `test_unknown_stage_reported`, `test_disabled_steps_are_skipped` (a disabled bad step does not error), `test_pipeline_must_end_with_video` (`[scan]` → message `"The pipeline must end with a video"`).
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement.** `validate_pipeline` walks enabled steps carrying the current `Kind` from `"none"`; a step is valid when its stage's `transitions` has the current kind as a key; `position` rules checked against first/last enabled step.
- [ ] **Step 4: Run** the files plus `tests/test_architecture.py`. Expected: PASS.
- [ ] **Step 5: Commit** `"Add the stage plugin API, registry and pipeline validation"`.

### Task 3: Worker and FFmpeg runner

**Files:**
- Create: `production/worker.py`, `production/ffmpeg.py`
- Test: `tests/production/helpers.py`, `tests/production/test_ffmpeg.py`

**Interfaces:**
- Produces:
  - `Worker` protocol: `id: str`; `run(argv: list[str], on_line: Callable[[str], None]) -> int`.
  - `LocalWorker(id="local")`: runs argv with `subprocess.Popen`, stderr merged into stdout, calls `on_line` for each line, returns the exit code.
  - `FfmpegRunner(worker: Worker, on_line: Callable[[str], None])`: `run(args: list[str]) -> None` (runs `ffmpeg -hide_banner -y <args>`; non-zero exit raises `FfmpegError(code, tail)` where `tail` is the last 5 lines; `FfmpegError.__str__` is plain), `duration(path: str) -> float` (ffprobe), `has_audio(path: str) -> bool`, `capture_time(path: str) -> float | None` (ffprobe `creation_time` tag as epoch seconds).
  - Binaries resolved with `shutil.which`, falling back to `/opt/homebrew/bin/<name>`.
  - `tests/production/helpers.py`: `requires_ffmpeg` (a `pytest.mark.skipif`), `make_clip(path, seconds=2.0, width=320, height=180, audio=True, creation_time: str | None = None)` using `ffmpeg -f lavfi -i testsrc2=...` (and `sine` when `audio`).

- [ ] **Step 1: Write failing tests** (`@requires_ffmpeg`): `test_duration_of_generated_clip` (`make_clip(seconds=2)` → `abs(runner.duration(p) - 2.0) < 0.2`), `test_has_audio_true_and_false`, `test_capture_time_from_tag` (clip made with `creation_time="2026-11-10T07:02:11Z"` → the matching epoch), `test_capture_time_none_when_missing`, `test_failure_raises_with_tail` (`run(["-i", "missing.mp4", "out.mp4"])` raises `FfmpegError`; `"missing.mp4"` appears in `str(error)`), `test_every_line_is_logged` (a collecting `on_line` receives at least one line), `test_path_with_spaces_and_quotes` (`make_clip` to `tmp/"it's a clip.mp4"` then `duration` works).
- [ ] **Step 2: Run** `.venv/bin/pytest tests/production/test_ffmpeg.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `"Add the local worker and FFmpeg runner"`.

### Task 4: Scan folder and Order clips stages

**Files:**
- Create: `production/stages/__init__.py`, `production/stages/scan_folder.py`, `production/stages/order_clips.py`
- Test: `tests/production/test_scan_and_order.py`

**Interfaces:**
- Consumes: `Stage`, `StageContext`, `StageError`, `FfmpegRunner`, `PiecesData`, `Piece`.
- Produces: each module exposes `STAGE` with:
  - `scan_folder`: `key="scan_folder"`, `title="Scan folder"`, `transitions={"none": "pieces"}`, `position="first"`. Settings: `include_subfolders: bool = True`, `extensions: list[str] = ["mp4","mov"]`, `min_length: float = 1.0`. Output pieces are whole clips sorted by path. Empty result raises `StageError("No clips found in <folder>")`; a log line states how many clips and how many were skipped as too short.
  - `order_clips`: `key="order_clips"`, `title="Order clips"`, `transitions={"pieces":"pieces"}`, `position="any"`. Settings: `order_by: Literal["capture_time","created","name","duration","random"] = "capture_time"`, `direction: Literal["oldest_first","newest_first"] = "oldest_first"`, `seed: int = 0`. `capture_time` uses `ffmpeg.capture_time` and falls back to the file's modified time; `created` uses the file's creation/modified time; `random` is a seeded shuffle (same seed, same order); `newest_first` reverses.

- [ ] **Step 1: Write failing tests** (`@requires_ffmpeg`): `test_scan_finds_clips_in_subfolders`, `test_scan_can_skip_subfolders`, `test_scan_ignores_other_extensions`, `test_scan_skips_clips_shorter_than_minimum`, `test_scan_empty_folder_fails_plainly` (`StageError`, message starts `"No clips found"`), `test_scan_handles_odd_file_names`, `test_order_by_name`, `test_order_by_capture_time_uses_tag` (tags out of name order), `test_order_newest_first`, `test_order_random_same_seed_same_order`, `test_order_random_different_seed_differs` (use enough clips that two seeds produce different orders).
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** both stages.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `"Add the Scan folder and Order clips stages"`.

### Task 5: Limit length and Join stages

**Files:**
- Create: `production/stages/limit_length.py`, `production/stages/join_pieces.py`
- Test: `tests/production/test_limit_and_join.py`

**Interfaces:**
- Consumes: as Task 4, plus `BlockedError`, `VideoData`.
- Produces:
  - `limit_length`: `key="limit_length"`, `title="Limit length"`, `transitions={"pieces":"pieces"}`. Settings: `max_seconds: float = 60.0`, `choice: Literal["drop_shortest","keep_first"] | None = None`. Within the limit: pieces unchanged. Over with `choice=None`: `raise BlockedError(f"The video is {total:.0f} s, {over:.0f} s over the {max:.0f} s limit", ["drop_shortest","keep_first"])`. `drop_shortest` removes the shortest pieces until it fits (original order kept); `keep_first` keeps pieces in order and trims the last one so the total equals the limit.
  - `join_pieces`: `key="join_pieces"`, `title="Join in order"`, `transitions={"pieces":"video"}`. Settings: `width: int = 1080`, `height: int = 1920`, `fps: int = 30`, `fit: Literal["crop","blur"] = "crop"`. Writes `<work_dir>/joined.mp4` with one `filter_complex` that trims each piece, fits it to the canvas (`crop` = scale to cover then centre-crop; `blur` = blurred scaled copy behind a contained copy), concatenates, and uses `anullsrc` silence for any clip without audio (via `ffmpeg.has_audio`). Returns `VideoData(path, duration, size_bytes)`.

- [ ] **Step 1: Write failing tests:** limit (no FFmpeg needed): `test_within_limit_is_unchanged`, `test_over_limit_blocks_with_choices` (the `BlockedError.choices == ["drop_shortest","keep_first"]`, reason mentions the seconds), `test_drop_shortest_keeps_order_and_fits`, `test_keep_first_trims_last_piece_to_fit`. Join (`@requires_ffmpeg`): `test_join_makes_one_video_of_summed_length` (two 2 s clips → duration ≈ 4 s, size > 0, canvas 1080×1920 via ffprobe), `test_join_clip_without_audio_has_audio_track` (one clip silent, one with audio → output has audio and duration ≈ sum), `test_join_mixed_shapes` (320×180 plus 180×320), `test_join_trimmed_piece_uses_start_and_end` (a 4 s clip, `start=1,end=3` → ≈ 2 s), `test_join_blur_fit_runs`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** both stages. The filter graph is the one algorithm the signature does not decide: build per-piece chains `[0:v]trim=start:end,setpts=PTS-STARTPTS,<fit>,fps=<fps>,setsar=1[v0]` and `[0:a]atrim=…,asetpts=…,aresample=48000[a0]` (or `anullsrc` trimmed to the piece length), then `concat=n=<k>:v=1:a=1`. Use one `-i` per piece (the same clip may repeat).
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `"Add the Limit length and Join in order stages"`.

### Task 6: Render stage

**Files:**
- Create: `production/stages/render_output.py`
- Test: `tests/production/test_render_output.py`

**Interfaces:**
- Produces: `render_output`: `key="render_output"`, `title="Render"`, `transitions={"video":"video"}`, `position="last"`. Settings: `fps: int = 30`, `audio_kbps: int = 128`, `max_size_mb: float | None = 50.0`, `file_name: str = "output.mp4"`. Writes `<output_dir>/<file_name>` with H.264 + AAC. With a size limit the video bitrate is `(max_size_mb * 8 * 1024 * 1024 * 0.95 / duration) - audio_kbps * 1000`; below 300 kbps raises `StageError("A {max} MB limit is too small for a {duration:.0f} s video")`. A pure function `target_video_bitrate(max_size_mb, duration, audio_kbps) -> int` is tested directly. Returns the final `VideoData`.

- [ ] **Step 1: Write failing tests:** `test_target_bitrate_formula` (e.g. 50 MB, 60 s, 128 kbps → the expected integer), `test_render_without_limit_writes_output` (`@requires_ffmpeg`), `test_render_respects_size_limit` (a ~10 s generated video with `max_size_mb=1` → output size ≤ 1 MB × 1.05), `test_unusable_limit_fails_plainly` (huge duration, tiny limit → `StageError`, message contains `"too small"`).
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `"Add the Render stage"`.

### Task 7: Storage

**Files:**
- Create: `production/models.py`, `production/schema.py`, `production/repositories.py`, `production/builtin.py`
- Test: `tests/production/test_repositories.py`

**Interfaces:**
- Consumes: `StageStep`, `VideoData`, `shared.database.Database` (`execute`, `query`), `shared.camel_model.CamelModel`.
- Produces:
  - `PassStatus = Literal["queued","running","review","blocked","failed","approved"]`.
  - `Batch(id, name, input_folder, steps: list[StageStep], run_on: str, output_root: str, created_at: str)`; `Pass(id, batch_id, number: int, status: PassStatus, stage_index: int, stage_key: str, blocked_reason: str | None, blocked_choices: list[str], overrides: dict[str, dict], error: str | None, output: VideoData | None, created_at, started_at, finished_at)`.
  - `ensure_schema(db)`: creates tables `production_batches`, `production_passes`, `production_logs(id, pass_id, kind, at, text)` if missing (idempotent).
  - `BatchRepository(db)`: `create(name, input_folder, steps, run_on, output_root, now: str) -> Batch`, `get(id) -> Batch | None`, `list() -> list[Batch]`.
  - `PassRepository(db)`: `create(batch_id, now) -> Pass` (number = previous + 1, status `queued`, `overrides` copied from nothing), `get(id)`, `for_batch(batch_id) -> list[Pass]`, `queued() -> list[Pass]` (oldest first), `running() -> list[Pass]`, `update(id, **fields) -> Pass`.
  - `LogRepository(db)`: `add(pass_id, kind: Literal["pipeline","ffmpeg"], at: str, text: str)`, `for_pass(pass_id, kind) -> list[str]` (in order).
  - `builtin.build_registry() -> StageRegistry` registering the five built-in stages.

- [ ] **Step 1: Write failing tests:** `test_schema_is_idempotent`, `test_batch_round_trips_steps_and_settings`, `test_pass_numbers_increase_per_batch`, `test_queued_is_oldest_first`, `test_update_sets_blocked_fields_and_output`, `test_logs_keep_order_and_separate_kinds`, and in `tests/production/test_builtin.py` `test_builtin_registry_has_the_five_stages` plus `test_join_pipeline_validates` using `validate_pipeline`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Store `steps`, `overrides`, `blocked_choices`, `output` as JSON text columns.
- [ ] **Step 4: Run** the new tests and `tests/test_architecture.py`. Expected: PASS.
- [ ] **Step 5: Commit** `"Add production storage and the built-in stage registry"`.

### Task 8: Pass runner

**Files:**
- Create: `production/runner.py`
- Test: `tests/production/test_runner.py`

**Interfaces:**
- Consumes: repositories, registry, `Worker`, `FfmpegRunner`, `Clock`-style `now: Callable[[], str]`.
- Produces: `PassRunner(batches, passes, logs, registry, now)`; `run(pass_id: int, worker: Worker) -> None`. Behavior: set `running`, `started_at`; make `work_dir` = `<output_root>/<batch name>/pass-<n>/work` and `output_dir` = `<output_root>/<batch name>/pass-<n>`; for each enabled step set `stage_index`/`stage_key`, log `"<title> started"`/`"<title> done"` to the pipeline log, route FFmpeg lines to the ffmpeg log; merge `pass.overrides[step.key]` over the step's settings; on `BlockedError` set `blocked` with reason and choices and stop; on `StageError`/`FfmpegError` set `failed` with `str(error)`; on any other exception set `failed` with `"Something went wrong: <type>"` and log the traceback; on success set `review` with `output` and `finished_at`. The work folder is removed in every case.

- [ ] **Step 1: Write failing tests** (`@requires_ffmpeg`, real built-in stages, generated clips): `test_join_pipeline_ends_in_review_with_output_file`, `test_pipeline_log_records_each_stage`, `test_ffmpeg_log_has_lines`, `test_over_length_blocks_with_choices` (`max_seconds` lower than total), `test_override_choice_resolves_block` (set `overrides={"limit_length":{"choice":"keep_first"}}`, re-run → `review`), `test_empty_folder_fails_plainly`, `test_unexpected_error_fails_without_traceback_in_status` (a fake stage raising `RuntimeError("boom")` registered in a test registry; `error` does not contain `"boom"`'s traceback but the pipeline log does), `test_work_folder_is_removed`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `"Add the pass runner"`.

### Task 9: Job queue

**Files:**
- Create: `production/queue.py`
- Test: `tests/production/test_queue.py`

**Interfaces:**
- Consumes: `PassRepository`, `BatchRepository`, `PassRunner`, `Worker`.
- Produces: `JobQueue(passes, batches, runner, workers: dict[str, Worker], now)`: `tick() -> list[int]` starts, in first-in-first-out order, each queued pass whose batch `run_on` is `"any"` or names a free worker, using a free worker (at most one job per worker), each job on a `threading.Thread(daemon=True)`; returns the ids started. `wait_idle(timeout: float = 30) -> None` joins running threads (for tests). `recover() -> int` marks every `running` pass `failed` with error `"Interrupted by a restart"` and returns the count.

- [ ] **Step 1: Write failing tests** using a fake runner that blocks on an event: `test_one_job_per_worker`, `test_first_in_first_out`, `test_second_job_starts_after_first_finishes`, `test_run_on_named_worker_waits_for_that_worker`, `test_two_workers_run_two_jobs`, `test_unknown_worker_pass_stays_queued`, `test_recover_fails_running_passes`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `"Add the job queue"`.

### Task 10: Service and API

**Files:**
- Create: `production/service.py`, `production/api.py`
- Test: `tests/production/test_service.py`, `tests/production/test_api.py`

**Interfaces:**
- Consumes: repositories, registry, `validate_pipeline`, `StageHandoff`, `HandoffFolder`, `HandoffClip`.
- Produces:
  - `ProductionService(batches, passes, logs, registry, now)`:
    - `create_batch(name, input_folder, steps, run_on, output_root) -> Batch` (raises `ValueError` with the validation messages joined, or `"The folder does not exist"`; also creates pass 1 `queued`)
    - `run_again(batch_id, steps: list[StageStep] | None) -> Pass` (updates the batch's steps when given; new pass `queued`; copies the previous pass's `overrides`)
    - `resolve_block(pass_id, choice: str) -> Pass` (only for `blocked`; sets `overrides[<stage_key>] = {"choice": choice}`, status `queued`)
    - `approve(pass_id) -> StageHandoff` (only for `review`; sets `approved`; returns the handoff for the output folder with `stage="production"`, `run_id=pass_id`)
    - `cards() -> list[BatchCard]` where `BatchCard(id, name, input_folder, pipeline: list[str], status, stage_title, stage_position: int, stage_count: int, pass_number, blocked_reason, error, output)` uses the newest pass.
  - Routes under `/api/production` (camelCase): `GET /stages` (key, title, transitions, position, `settingsSchema`), `POST /pipelines/validate` → `{errors: []}`, `GET /batches` → cards, `POST /batches` (201; 422 with the message), `GET /batches/{id}` (batch and its passes), `POST /batches/{id}/passes` (201), `POST /passes/{id}/resolve`, `POST /passes/{id}/approve` (200 handoff), `GET /passes/{id}/logs?kind=pipeline|ffmpeg` → `{lines: []}`. Unknown ids 404; wrong-state actions 409.

- [ ] **Step 1: Write failing tests:** service — `test_create_batch_makes_queued_pass_one`, `test_create_batch_rejects_invalid_pipeline_with_message`, `test_create_batch_rejects_missing_folder`, `test_run_again_creates_next_pass_with_same_overrides`, `test_resolve_block_requeues_with_choice`, `test_resolve_block_refuses_other_states`, `test_approve_returns_handoff_with_output_file`, `test_approve_refuses_unless_review`, `test_cards_show_newest_pass_status_and_stage`. API (FastAPI `TestClient`, a service with fakes): one test per route for the success status and body keys, plus `test_stages_lists_builtin_with_schema`, `test_invalid_pipeline_returns_422_message`, `test_unknown_batch_404`, `test_approve_wrong_state_409`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the new tests. Expected: PASS.
- [ ] **Step 5: Commit** `"Add the production service and API"`.

### Task 11: Wire into the app and prove it end to end

**Files:**
- Modify: `collector_server/main.py`
- Test: `tests/production/test_end_to_end.py`

**Interfaces:**
- Consumes: everything above.
- Produces: `create_default_app()` builds the production objects (`ensure_schema`, repositories, `build_registry()`, `LocalWorker()` as `"local"`, `JobQueue`, `ProductionService`), calls `queue.recover()` once at start-up, ticks `queue.tick` in the existing 30 s loop (and every 2 s when anything is queued or running, to keep the board lively), and includes the production router. Default output root from env `SHORT_EDITOR_OUTPUT`, else `production_output` next to the database.

- [ ] **Step 1: Write the failing end-to-end test** (`@requires_ffmpeg`): build the service, queue and runner against a temp database with three generated 2 s clips in a temp folder (one without audio); `POST /api/production/batches` with steps scan → order → limit(60) → join → render(`max_size_mb=5`); call `queue.tick()` and `queue.wait_idle()`; assert `GET /batches` shows `status == "review"`, the output file exists and is ≤ 5 MB, the pipeline log has five "done" lines; `POST /passes/{id}/approve` returns a handoff whose folder lists the output file; then `POST /batches/{id}/passes` creates pass 2 as `queued`. A second test: limit of 3 s over 6 s of clips → `blocked`, `POST /passes/{id}/resolve` with `keep_first`, tick, wait, → `review` with duration ≈ 3 s.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement the wiring in `main.py`.**
- [ ] **Step 4: Run the whole server suite** `.venv/bin/pytest -q`. Expected: all pass (previous 241 plus the new ones), including the architecture tests.
- [ ] **Step 5: Commit** `"Wire production into the server and prove the Join pipeline end to end"`. Then tell the user to restart uvicorn on port 8000.

---

## Later plans (not part of this one)

Web board; workers and settings; batch detail with proxies; AI Detect; manual trims; stage editor with FFmpeg command and the user stages folder. `Limit length` choices "drop quietest" and "speed up" arrive with the plans that need audio analysis and speed changes.
