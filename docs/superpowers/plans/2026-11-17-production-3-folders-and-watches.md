# Production 3: Batches from Folders and Watches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user chose a native builder (see Build Workflow).

**Goal:** Create many batches at once from the folders inside a parent folder (matched by a regular expression, with a live preview), and watch a parent folder so each new matching folder gets a batch on its own. The board shows Queued → Running → Needs attention → Ready to review.

**Architecture:** Server: a folder scanner, bulk creation on `ProductionService`, a `production_watches` store with a "seen" list, a `WatchService` that checks a watch, and a scheduler call inside the existing 2-second production tick. Web: the new column order, the New batch dialog gains a "Folders inside a folder" mode with a preview, and a Watches panel. Everything stays inside the existing `production/` stage on both sides.

**Tech Stack:** Python 3.14, FastAPI, SQLite via `shared.database.Database`, `re`; React 19, TypeScript, Tailwind + daisyUI, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-17-batches-from-folders-design.md` (and `2026-11-17-production-design.md`). Designs: `designs/video-editor.pen` frames "Layout B2 – Board and review", "New batch – one folder", "New batches – many folders", "Watches panel".

## Global Constraints

- `production/` imports only itself and `shared/` (server and web); the architecture tests stay green. `App.tsx` may import any stage.
- No new dependencies. Reuse shared UI (Button, StatusChip, FormField, SegmentedControl, Toggle, SectionCard, FolderPicker) and the existing tokens; no new colours or fonts.
- User text never reaches a shell. Paths shown are absolute. The app deletes folders only inside a marked output folder (unchanged rules from plan 1).
- Server tests: `.venv/bin/pytest -q` from `app/server`. Web: `npx vitest run <path>` per file, `npm test` and `npm run typecheck` at gates, `npm run build` once at the end (then restore tracked `app/web/dist` with `git checkout -- app/web/dist` and remove untracked build output). Never commit `app/web/tsconfig.tsbuildinfo`.
- Never kill the user's uvicorn on port 8000; tell the user to restart it after server changes. For visual checks use a scratch server on another port and a temporary Vite config (delete afterwards).
- Merge with `git merge --no-ff --no-autostash <branch>`. Nothing is pushed.
- Server errors the user can act on are `InvalidInputError` (422), `NotFoundError` (404), `StateError` (409) with plain `detail` strings, as in plan 1.

## Limits (decided here)

- Pattern: at most 200 characters; must compile; rejected when a group is followed by a repeat and contains a repeat (e.g. `(a+)+`, `(.*)*`, `(a|aa)+`), the classic runaway shapes. Matching is `re.fullmatch` on names of at most 255 characters.
- A folder listing scans at most 2000 sub-folders; counting videos looks at most 5000 files per folder (extensions `mp4`, `mov`, case-insensitive, like Scan folder's default).
- Bulk create: at most 200 folders per request. Watch: `intervalMinutes` 1–1440 (default 5), `settleMinutes` 0–1440 (default 10), `maxPerCheck` 1–100 (default 20).

## Review Focus

- A folder is never batched twice: not by a double click on Create, not by two checks overlapping, not after its batch was deleted, not by a watch and a manual bulk create at once.
- A folder still being copied into is not batched (settle time), and a folder that keeps changing is reported as waiting, not silently ignored.
- A pattern that matches nothing, everything, or hundreds of folders behaves (preview says so; caps hold; the queue is not flooded).
- A pattern with a runaway shape or invalid syntax gives a plain 422 and never hangs the server.
- The parent folder disappearing (NAS unmounted), being unreadable, or containing odd names (spaces, unicode, newlines, a name starting with a dash, symlinks to outside) is reported per watch without stopping the other watches or the loop.
- The preview never lists or follows a symlink that leaves the parent folder, and a batch is never created for one.
- Editing a watch (pattern, settings) never re-creates batches for folders already handled.

## Build Workflow (chosen by the user)

- **Builder:** one native agent on Sonnet 5.5, test-first (`superpowers:test-driven-development`), branch `batches-from-folders`, commit per task.
- **Per-task review:** a subagent runs `ponytail:ponytail-review` on each task's diff, told the plan's rules; only "must fix" blocks the commit, the rest go on a list for the user.
- **QA gates** (time-boxed 10 minutes, no edits to project files): after tasks 2, 4 and 7 (and after task 8 if the visual check changed code), covering QA, performance and security with real runs.
- **Final:** whole-branch review on the most capable model, then ask the user before merging.

---

## File Structure

Server `app/server/collector_server/production/`:
- `pattern.py` — `compile_pattern`, `render_name`
- `folder_scan.py` — `Candidate`, `scan_parent`
- `watch_models.py` — `Watch`, `WatchCreate`, `WatchStatus`, preview/bulk models
- `watch_schema.py`, `watch_repository.py` — storage
- `watch_service.py` — `WatchService` (check, create, edit, status line)
- `watch_scheduler.py` — `WatchScheduler.tick`
- `service.py` — `create_batches` (bulk) and `preview_folders`
- `api.py` — new routes; `wiring.py` — builds and ticks the scheduler

Web `app/web/src/production/`:
- `lib/board.ts` (order), `lib/types.ts`, `lib/api.ts`, `lib/presets.ts` (patterns and request mapping), `lib/watches.ts` (status tone and labels)
- `hooks/useFolderPreview.ts`, `hooks/useWatches.ts`
- `features/new/BatchSettingsFields.tsx` (extracted), `NewBatchDialog.tsx` (mode switch), `ManyFoldersForm.tsx`, `FolderPreview.tsx`, `WatchOptions.tsx`
- `features/watches/{WatchesPanel,WatchRow}.tsx`

---

### Task 1: Pattern and folder scanning

**Files:**
- Create: `production/pattern.py`, `production/folder_scan.py`
- Test: `tests/production/test_pattern.py`, `tests/production/test_folder_scan.py`

**Interfaces:**
- Produces:
  - `compile_pattern(text: str) -> re.Pattern[str]` — raises `InvalidInputError` ("The pattern is too long", "The pattern is not valid: <reason>", "The pattern could take far too long to match") per the limits above.
  - `render_name(template: str, match: re.Match[str], folder: str) -> str` — replaces `{name}` with the folder name, `{1}`..`{9}` and `{group_name}` with captures (empty string if the group did not take part); an unknown placeholder raises `InvalidInputError("The name template uses {x}, which the pattern does not have")`; the result is stripped, collapsed of control characters, cut to 120 characters, and a blank result falls back to the folder name.
  - `Candidate(name: str, path: str, clip_count: int, newest_change: float | None, match: re.Match[str])` (dataclass).
  - `scan_parent(parent: str, pattern: re.Pattern[str]) -> ScanResult` with `ScanResult(matches: list[Candidate], not_matching: int)`; matches sorted by name; only real directories directly inside `parent` that do not resolve (`realpath`) outside `parent`; hidden names (leading ".") skipped; `clip_count` counts mp4/mov files anywhere inside (cap 5000, symlinked files outside the folder not counted); `newest_change` is the newest modification time of any file or folder inside (epoch seconds), `None` if empty. `parent` missing or not a directory raises `InvalidInputError("The folder <parent> does not exist")`.

- [ ] **Step 1: Write failing tests.** Pattern: `test_valid_pattern_compiles`, `test_too_long_pattern_is_refused`, `test_invalid_syntax_is_refused_with_the_reason`, `test_runaway_shapes_are_refused` (parametrise `(a+)+`, `(.*)*`, `(a|aa)+`, `(\d+)*x`), `test_ordinary_groups_are_allowed` (`^(\d{4})-(\d{2})_(?P<who>[a-z]+)$`), `test_pathological_input_against_an_allowed_pattern_is_fast` (200-character name, assert it returns in under 0.5 s), `render_name` cases (`{name}`, `{1}`, `{who}`, unmatched optional group, unknown placeholder, control characters, 300-character result cut, blank falls back). Scan (real temp folders): `test_matches_only_folders_that_fully_match`, `test_counts_clips_and_ignores_other_files`, `test_sorted_by_name`, `test_files_in_the_parent_are_ignored`, `test_hidden_and_symlinked_folders_are_skipped` (a link to a folder outside the parent), `test_newest_change_is_the_latest_modification_inside`, `test_empty_folder_has_no_newest_change_and_zero_clips`, `test_odd_names_work` (spaces, unicode, a name starting with `-`), `test_missing_parent_is_a_plain_error`, `test_not_matching_is_counted`, `test_caps_hold` (2001 folders: only 2000 are looked at; use a small cap constant patched in the test).
- [ ] **Step 2: Run** the two files; expect FAIL.
- [ ] **Step 3: Implement.** For the runaway check, scan the pattern text for a parenthesised group (balanced, ignoring escaped parentheses and character classes) that contains `*`, `+`, `{n,}` or an alternation with a repeat and is followed by `*`, `+`, `?` is allowed, `{`: the simple structural test described in Limits, in one function, with a `shortcut:` comment naming its limit.
- [ ] **Step 4: Run** the files plus `tests/test_architecture.py`; expect PASS.
- [ ] **Step 5: Commit** `"Add the folder name pattern and the parent folder scanner"`.

### Task 2: Preview and bulk create

**Files:**
- Modify: `production/service.py`, `production/models.py`, `production/api.py`
- Test: `tests/production/test_bulk.py`

**Interfaces:**
- Consumes: Task 1; `ProductionService.create_batch`, `_require_valid`, `BatchRepository.list`.
- Produces:
  - Models (CamelModel): `FolderPreviewRequest(parent_folder: str, pattern: str)`; `PreviewItem(name: str, path: str, clip_count: int, status: Literal["will_create","already_batched","no_videos"])`; `FolderPreview(matches: list[PreviewItem], not_matching: int)`; `BulkCreate(parent_folder: str, pattern: str, name_template: str = "{name}", steps: list[StageStep], run_on: str = "any", output_root: str | None = None, include: list[str] = [])` (`include` = folder names to create even though already batched); `BulkResult(created: list[Batch], skipped: list[PreviewItem])`.
  - `ProductionService.preview_folders(parent: str, pattern: str) -> FolderPreview` — `already_batched` when any existing batch has the same `realpath` input folder; `no_videos` when `clip_count == 0`.
  - `ProductionService.create_batches(request: BulkCreate) -> BulkResult` — validates everything first (parent, pattern, name template against the pattern's groups, steps, run_on, output_root, at most 200 matches that would be created, at least one) and raises `InvalidInputError` before creating anything; then, under the service lock, re-reads the existing batches, skips folders that became batched in the meantime or have no videos, creates the rest in folder-name order through `create_batch`, and returns created and skipped.
  - Routes: `POST /api/production/folders/preview` → `FolderPreview`; `POST /api/production/batches/bulk` (201) → `BulkResult`. Errors via `guarded`.

- [ ] **Step 1: Write failing tests** using real temp folders: `test_preview_marks_will_create_already_batched_and_no_videos`, `test_preview_counts_non_matching`, `test_bulk_creates_one_batch_per_new_folder_in_name_order` (check batch ids ascend with names and each has pass 1 queued), `test_bulk_names_come_from_the_template` (`"{1} coach"`), `test_bulk_skips_already_batched_and_lists_them`, `test_include_creates_an_already_batched_folder_again`, `test_bulk_never_creates_for_a_folder_without_videos`, `test_bulk_refuses_everything_when_the_pipeline_is_invalid` (no batch created), `test_bulk_refuses_more_than_200`, `test_bulk_with_nothing_to_create_is_a_plain_error`, `test_two_bulk_requests_at_once_create_each_folder_once` (threads), `test_bulk_rejects_unknown_template_placeholder`, `test_batches_made_in_bulk_use_the_shared_settings_and_output_root`. API: `test_preview_route`, `test_bulk_route_201_and_422_and_shape`.
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement.** Hold the existing service `RLock` around the re-read-and-create step.
- [ ] **Step 4: Run** `.venv/bin/pytest -q`; expect PASS.
- [ ] **Step 5: Commit** `"Preview and create batches from the folders inside a folder"`. Then QA gate 1 (odd folder trees, large folders, symlinks, hostile patterns and names, concurrency).

### Task 3: Watch storage

**Files:**
- Create: `production/watch_models.py`, `production/watch_schema.py`, `production/watch_repository.py`
- Modify: `production/schema.py` (call `ensure_watch_schema`) or `wiring.py`
- Test: `tests/production/test_watch_repository.py`

**Interfaces:**
- Produces:
  - `WatchCreate(name: str, parent_folder: str, pattern: str, name_template: str = "{name}", steps: list[StageStep], run_on: str = "any", output_root: str | None = None, interval_minutes: int = 5, settle_minutes: int = 10, max_per_check: int = 20, include_existing: bool = False, enabled: bool = True)` with field limits (above).
  - `Watch(id, name, parent_folder, pattern, name_template, steps, run_on, output_root: str | None, interval_minutes, settle_minutes, max_per_check, enabled, created_at, last_checked_at: str | None, last_error: str | None, waiting: list[str], created_total: int)`.
  - Tables `production_watches` and `production_watch_seen(watch_id REFERENCES production_watches ON DELETE CASCADE, folder_path TEXT, seen_at TEXT, PRIMARY KEY (watch_id, folder_path))`, created idempotently.
  - `WatchRepository(db)`: `create(data: WatchCreate, now: str) -> Watch`, `get(id)`, `list()`, `update(id, data: WatchCreate)` (keeps the seen list, last check and totals), `delete(id)`, `set_enabled(id, enabled)`, `record_check(id, at: str, error: str | None, waiting: list[str], created_now: int)` (adds to `created_total`), `seen(id) -> set[str]`, `mark_seen(id, paths: list[str], at: str)`.

- [ ] **Step 1: Write failing tests:** `test_schema_is_idempotent`, `test_watch_round_trips_every_field_and_steps`, `test_update_keeps_seen_list_and_counts`, `test_delete_removes_the_seen_list`, `test_set_enabled`, `test_record_check_adds_to_the_total_and_stores_waiting_and_error`, `test_mark_seen_is_idempotent_and_per_watch`, `test_field_limits_are_enforced` (interval 0 and 1441, settle -1, cap 0 and 101, long name).
- [ ] **Step 2: Run**; expect FAIL. **Step 3: Implement.** **Step 4: Run** the file and `tests/test_architecture.py`; expect PASS.
- [ ] **Step 5: Commit** `"Add watch storage"`.

### Task 4: Watch service, scheduler and routes

**Files:**
- Create: `production/watch_service.py`, `production/watch_scheduler.py`
- Modify: `production/api.py`, `production/wiring.py`, `production/models.py`
- Test: `tests/production/test_watch_service.py`, `tests/production/test_watch_scheduler.py`, `tests/production/test_watch_api.py`, extend `tests/production/test_end_to_end.py`

**Interfaces:**
- `WatchService(watches: WatchRepository, service: ProductionService, clock: Callable[[], float], now: Callable[[], str])`:
  - `create(data: WatchCreate) -> Watch` — validates (pattern, name template, steps, run_on, output_root, parent exists) with the same checks as bulk; baseline: all folders matching now are marked seen unless `include_existing` is true, in which case an immediate `check` runs.
  - `update(id, data)`, `delete(id)`, `set_enabled(id, enabled)`, `list() -> list[WatchView]`, `get(id)`.
  - `check(id) -> CheckResult(created: list[Batch], waiting: list[str], error: str | None)`: under a per-watch lock; lists candidates; for each matching folder not in `seen` and not already batched: no videos → skipped (not marked); newest change younger than `settle_minutes` → `waiting`; otherwise create a batch via the service (name from the template), mark seen, until `max_per_check` created (the rest wait for the next check); a folder already batched but not seen is marked seen without creating; any `InvalidInputError` or `OSError` is stored as `last_error`; always `record_check`.
  - `WatchView = Watch + status: Literal["watching","waiting","paused","problem"] + status_line: str` where `problem` when `last_error`, `paused` when disabled, `waiting` when `waiting` is non-empty, else `watching`; the line reads like the design ("Last checked 10:42 · created 2 batches in total · next check in 3 minutes", "Waiting for <folder> to settle: it changed 4 minutes ago and needs 10 quiet minutes", "Paused · last checked …", "Problem: <error>. Checking again in 5 minutes.").
- `WatchScheduler(watches: WatchRepository, service: WatchService, clock)`: `tick() -> list[int]` checks every enabled watch whose `last_checked_at` is empty or older than its interval, one at a time, catching and storing any exception per watch so one failure never stops the rest; returns the ids checked.
- `Production.tick()` (in `wiring.py`) also calls `scheduler.tick()` (after the queue tick, each guarded by its own try/except with `logging.exception`).
- Routes `/api/production/watches`: `GET` → `list[WatchView]`; `POST` (201) `WatchCreate`; `PUT /{id}`; `DELETE /{id}` (204); `POST /{id}/enabled {enabled}`; `POST /{id}/check` → `CheckResult`. Unknown id 404; invalid input 422.

- [ ] **Step 1: Write failing tests** (real temp folders, fake clock and `now`): service — `test_new_matching_folder_gets_a_batch`, `test_folder_still_changing_is_waiting_and_named`, `test_folder_batches_once_it_has_settled`, `test_nothing_is_batched_twice_across_checks`, `test_deleting_the_batch_does_not_bring_the_folder_back`, `test_existing_folders_are_baselined_by_default`, `test_include_existing_creates_for_settled_existing_folders`, `test_folder_without_videos_is_not_marked_seen_so_it_can_be_batched_later`, `test_cap_per_check_leaves_the_rest_for_the_next_check`, `test_already_batched_folder_is_marked_seen_not_duplicated`, `test_missing_parent_sets_a_problem_and_recovers_when_it_returns`, `test_an_invalid_pattern_or_settings_is_refused_on_create`, `test_edit_keeps_what_was_seen`, `test_two_checks_at_once_create_each_folder_once` (threads), `test_status_and_status_line_for_each_state`. Scheduler — `test_only_due_enabled_watches_are_checked`, `test_one_watch_failing_does_not_stop_the_others`, `test_a_paused_watch_is_never_checked`, `test_interval_is_respected_with_the_fake_clock`. API — one test per route for status codes and body keys, plus 404 and 422 shapes. End to end — `test_a_new_folder_appears_is_batched_runs_and_reaches_review` (`@requires_ffmpeg`, real clips, drive `Production.tick` and the queue).
- [ ] **Step 2: Run**; expect FAIL. **Step 3: Implement.** **Step 4: Run** `.venv/bin/pytest -q`; expect PASS.
- [ ] **Step 5: Commit** `"Watch folders and create batches for new folders"`. Then QA gate 2 (races between checks and bulk create, clock changes, NAS unmounted, huge folders, symlinks, API bounds, many watches).

### Task 5: Web: column order and API client

**Files:**
- Modify: `src/production/lib/board.ts`, `board.test.ts`, `types.ts`, `api.ts`, `api.test.ts`, `Board.tsx`, board component tests, `Production.integration.test.tsx`
- Create: `src/production/lib/watches.ts`, `watches.test.ts`

**Interfaces:**
- `COLUMNS = ['queued','running','attention','review']`; `Board` renders them in that order; `subtitle()` lists "N batches · N queued · N running · N need attention · N ready to review" (zero parts omitted); every test that asserts the old order or subtitle is updated.
- Types: `PreviewStatus`, `PreviewItem`, `FolderPreview`, `BulkCreate`, `BulkResult`, `WatchCreate`, `WatchView`, `CheckResult` mirroring the server models (camelCase).
- `ProductionApi`: `previewFolders(parentFolder, pattern)`, `createBatches(body)`, `watches()`, `createWatch(body)`, `updateWatch(id, body)`, `deleteWatch(id)`, `setWatchEnabled(id, enabled)`, `checkWatch(id)`; `deleteWatch` uses `HttpClient.remove`.
- `watches.ts`: `watchTone(view): Tone` (watching ok, waiting warn, paused info, problem bad), `watchLabel(view)` ("Watching", "Waiting", "Paused", "Problem").

- [ ] **Step 1: Write failing tests:** the board puts Queued first and Ready to review last (region order in the DOM); subtitle order; every API method's URL, verb and body with a fake fetch; `watchTone`/`watchLabel` for each status.
- [ ] **Step 2: Run**; expect FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run src/production` and `npm run typecheck`; expect PASS.
- [ ] **Step 5: Commit** `"Show the board in the new column order and add the folder and watch API client"`.

### Task 6: Web: dialog modes and the many-folders form

**Files:**
- Create: `features/new/BatchSettingsFields.tsx`, `ManyFoldersForm.tsx`, `FolderPreview.tsx`, `hooks/useFolderPreview.ts`, tests for each
- Modify: `features/new/NewBatchDialog.tsx`, `lib/presets.ts`, `lib/presets.test.ts`, `BoardPage.tsx`

**Interfaces:**
- `BatchSettingsFields({ form, onChange, defaults, browse })` — the shared settings (order, fit, max length with hint, max size with hint, run on, output folder) extracted unchanged from `NewBatchDialog`; the single-folder form keeps working exactly as before (existing tests pass untouched).
- `NewBatchDialog` gets a segmented control "One folder | Folders inside a folder" (`SegmentedControl`); the title and button follow the mode.
- `presets.ts`: `PATTERN_PRESETS = [{id:'date', label:'Date first, like 2026-11-07_…', pattern:'^\\d{4}-\\d{2}-\\d{2}_.+$'}, {id:'any', label:'Any folder', pattern:'^.+$'}, {id:'custom', label:'Custom pattern', pattern:''}]`; `ManyForm {parentFolder; pattern; presetId; nameTemplate; include: string[]; ...shared settings}`; `toBulkRequest(form): BulkCreate`.
- `useFolderPreview(api, parentFolder, pattern, delayMs = 400)` — debounced; returns `{ state: LoadState<FolderPreview> | idle }`, cancels stale answers, shows the server's message for a bad pattern, does not call the server for an empty parent or pattern.
- `FolderPreview({ preview, include, onToggle })` — the header counts line ("4 will be created · 1 already batched · 1 has no videos · 1 does not match"), one row per folder (checkbox, folder icon, name, clip count, `StatusChip`: Will create ok, Already batched info, No videos warn); will-create rows are ticked and fixed on, already-batched rows can be ticked to include, no-videos rows have no checkbox; the "Folders already batched are skipped…" hint.
- `ManyFoldersForm` — parent folder with Browse, pattern field (monospace) with the preset select, "Name each batch" template, the preview, `BatchSettingsFields`; Create button label "Create N batches" (N = will create + ticked), disabled when N is 0 or while busy; errors in an alert.
- `BoardPage` posts `api.createBatches`, closes on success and reloads the board.

- [ ] **Step 1: Write failing tests:** mode switch shows the right form and keeps each form's own state when switching back; selecting a preset fills the pattern and choosing Custom clears it; typing a pattern calls the preview once after the delay (fake timers), not for an empty parent; a failed preview shows the server message and disables Create; rows and chips per status; ticking an already-batched row changes the count and the button label ("Create 5 batches"); the request body is exact (steps, `include` names, template, null output folder omitted); double click sends one request; Escape closes; the existing single-folder tests still pass.
- [ ] **Step 2: Run**; expect FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run src/production` and `npm run typecheck`; expect PASS.
- [ ] **Step 5: Commit** `"Create many batches from the folders inside a folder"`.

### Task 7: Web: watch options and the Watches panel

**Files:**
- Create: `features/new/WatchOptions.tsx`, `features/watches/{WatchesPanel,WatchRow}.tsx`, `hooks/useWatches.ts`, tests
- Modify: `ManyFoldersForm.tsx`, `NewBatchDialog.tsx`, `BoardPage.tsx` (Watches button, panel state), `lib/presets.ts`

**Interfaces:**
- `WatchOptions({ value, onChange, folderCount })` — "Keep watching this folder" `Toggle`; when on: Check every (minutes), Wait until nothing has changed for (minutes), At most per check (batches), and "Also create batches for the N folders already there" toggle (default off); numeric fields use the same plain-number hints as the settings fields; ranges per Limits.
- In the form: with watching on the button reads "Create N batches and start watching" (or "Start watching" when N is 0); submit creates the checked batches through `createBatches` and then the watch through `createWatch` (with `includeExisting` false, so nothing is created twice); a failure of the second call reports that the batches were created but the watch was not.
- `useWatches(api, intervalMs = 15000, enabled)` — loads, refreshes quietly while enabled, returns `{ state, reload }`.
- `WatchesPanel({ api, browse, onClose })` — dialog listing `WatchRow`s: name, status chip, folder, pattern, status line, `Toggle`, Check now (shows "Checking…" and the result line: "Created 2 batches" / "Nothing new" / the error), Edit (opens the many-folders form in watch mode, prefilled, button "Save watch", no batch creation), Delete (a confirmation row "Delete this watch? Its batches stay."); empty state ("No watches yet. Add one to batch new folders automatically."); "Add watch" opens the form in watch mode with watching locked on.
- `BoardPage` header: "Watches" button (eye icon) left of "New batch".

- [ ] **Step 1: Write failing tests:** options show or hide with the toggle; defaults 5, 10, 20 and off; invalid numbers disable the button with hints; combined create calls bulk then watch in order with the exact bodies; second-call failure message; panel rows per status with the designed chips and lines; toggle posts enabled; Check now posts, shows the result and reloads; Edit prefills every field and saves with PUT; Delete asks first and then deletes; empty state; the panel refreshes quietly and keeps a half-made edit; Escape closes only the top-most dialog.
- [ ] **Step 2: Run**; expect FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run src/production` and `npm run typecheck`; expect PASS.
- [ ] **Step 5: Commit** `"Add watching folders and the Watches panel"`. Then QA gate 3 (odd data, polling while editing, double clicks, status text overflow, accessibility).

### Task 8: End to end, visual check, docs

**Files:**
- Create: `src/Production.folders.integration.test.tsx`
- Modify: `src/production/README.md`, `docs/superpowers/specs/2026-11-17-production-design.md` (build order note: plan 3 is this, workers and settings become plan 4)

- [ ] **Step 1: Write the failing integration test** through `App` with a fake server: preview then create many (exact requests, board reloads in the new order); create with watching on (bulk then watch); open Watches, toggle, Check now, edit, delete; a watch in each status shows its chip and line; a bad pattern shows the server message.
- [ ] **Step 2: Run**; expect FAIL where behaviour is missing; fix. **Step 3:** `npm test`, `npm run typecheck`, `.venv/bin/pytest -q`, `npm run build` (restore `dist/`), expect all pass.
- [ ] **Step 4: Visual check.** Scratch server (port 8001, scratch DB and output, folders of tiny clips including a half-copied one) and a temporary Vite config; compare the board order, the many-folders dialog, and the Watches panel with the Pencil frames; fix differences. Delete the temporary config and stop the scratch servers.
- [ ] **Step 5: Commit** `"Prove batches from folders and watches end to end"`. Then QA gate 4 if the visual check changed code, and the whole-branch review.

---

## Later plans

4 Workers and settings (cog, Settings screen, SSH workers, queue pause); 5 Batch detail (D2, thumbnails, proxies, logs, pass history, open batch); 6 AI Detect; 7 Manual trims and the clip editor; 8 Stage editor (Layout E, per-stage settings, Add stage, FFmpeg command, Pipelines button). An improvement for later: the collector tells production when it has finished a folder, so watching needs no polling.
