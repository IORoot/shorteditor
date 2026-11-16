# Stage Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give collection, production and output their own folders on the web and server, with one shared folder, an import rule that fails the build when a stage reaches into another, and a handoff contract between stages.

**Architecture:** Pure file moves first (`git mv`, no logic changes), then generic code moves to `shared/`, then an architecture test enforces the import boundaries, then handoff types go in `shared/contracts`. Each task is one commit and must leave all tests green.

**Tech Stack:** React 19 + Vite + TypeScript + vitest (web, `app/web`), FastAPI + pytest (server, `app/server`, run with `.venv/bin/python -m pytest`).

**Spec:** `docs/superpowers/specs/2026-11-16-stage-separation-design.md`

## Global Constraints

- No behavior change in tasks 1-3. Baseline before starting: web `npx vitest run` = 21 files / 187 tests; server = 235 tests. Both counts must be identical after tasks 1, 2 and 3 (task 3 adds its own test files, so add them to the count).
- No new dependencies. The lint rule is a test, not ESLint (the web app has no ESLint, and the standing rule is minimal dependencies). This replaces the ESLint line in the spec.
- Use `git mv` so history follows the files. Do not commit `app/web/tsconfig.tsbuildinfo`.
- `shared/` imports from no stage. A stage imports only from itself and `shared/`. `App.tsx`, `main.tsx` and `main.py` are the app root and may import any stage.
- Commit message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- The user's uvicorn on port 8000 loads `collector_server.main:create_default_app`. Keep that path working; do not kill the process. Tell the user to restart it after task 1.

## Review Focus

- A moved test file silently stops running (wrong glob/path). Check: test file and test counts match the baseline.
- `vite.config.ts` `setupFiles` points at `./src/test/setup.ts`. When that file moves (task 2), the whole web suite fails to start.
- Stale `.pyc` or `__pycache__` hides a missing server import. Check: run pytest after `find app/server -name __pycache__ -prune -exec rm -rf {} +`.
- The architecture test passes because it scans nothing (wrong root path). Pin it: it must fail on a planted bad import (see task 3).
- A handoff JSON from the server uses camelCase; the TS type and the pydantic model must agree on names (task 4 round-trip test).

---

### Task 1: Folders (web and server)

**Files:**
- Move (web): `src/features/*`, `src/hooks/useFilterPreview.ts`, `src/hooks/useFolderPreview.ts`, `src/hooks/hooks.test.tsx` (split by hand if it also tests `useLoad`/`useDebouncedValue`; otherwise move whole), `src/lib/{api,filters,normalize,tokens,types}.ts` and their `*.test.ts`, `src/test/fixtures.ts` -> `src/collection/` keeping the same sub-paths (`collection/features/...`, `collection/hooks/...`, `collection/lib/...`, `collection/test/fixtures.ts`).
- Stay for now (moved in task 2): `src/components/**`, `src/hooks/{useLoad,useDebouncedValue}.ts` and their tests, `src/lib/format.ts` and test, `src/test/setup.ts`.
- Stay as app root: `src/App.tsx`, `src/App.test.tsx`, `src/main.tsx`, `src/index.css`.
- Create: `src/production/README.md`, `src/output/README.md` (one line each: what the stage will hold, and that it may import only itself and `shared/`).
- Move (server): every `collector_server/*.py` except `__init__.py`, `main.py` -> `collector_server/collection/` (add an empty `collection/__init__.py`). Tests: `tests/test_*.py` -> `tests/collection/` (add `tests/collection/__init__.py`); `conftest.py` and `helpers.py` stay in `tests/`.
- Modify: `collector_server/main.py` (imports `from .collection.x import ...`), every moved test (imports `collector_server.collection.x`), and any web file whose imports break.

**Interfaces:**
- Consumes: nothing.
- Produces: package `collector_server.collection` (same module names as today); web folder `src/collection/{features,hooks,lib,test}`. Relative imports between moved files stay valid because the sub-structure is preserved; only imports into `components/`, `lib/format`, `hooks/useLoad`, `test/` and from `App.tsx`/`main.tsx` change.

- [ ] **Step 1: Record the baseline.** Run `cd app/web && npx vitest run` and `cd app/server && .venv/bin/python -m pytest -q`. Expected: 187 web tests in 21 files; 235 server tests.
- [ ] **Step 2: `git mv` the web files** listed above into `src/collection/`. Then run `npx tsc -b --noEmit` and fix every import it reports (only paths change; never edit logic).
- [ ] **Step 3: `git mv` the server modules and tests**, rewrite imports in `main.py` and the tests. Run `find app/server -name __pycache__ -prune -exec rm -rf {} +` first, then `.venv/bin/python -m pytest -q`.
- [ ] **Step 4: Verify.** `npx tsc -b --noEmit` clean; `npx vitest run` = 21 files / 187 tests; pytest = 235 passed; `python -c "import collector_server.main"` from `app/server` succeeds.
- [ ] **Step 5: Commit** `git add -A app docs` (excluding `app/web/tsconfig.tsbuildinfo`) with message "Move collection code into its own folders".

### Task 2: Shared code

**Files:**
- Move (web): `src/components/**` -> `src/shared/components/**`; `src/hooks/{useLoad,useDebouncedValue}.ts` (+ tests) -> `src/shared/hooks/`; `src/lib/format.ts` (+ test) -> `src/shared/lib/`; `src/test/setup.ts` -> `src/shared/test/setup.ts`.
- Create: `src/shared/lib/http.ts` and `src/shared/lib/http.test.ts`.
- Modify: `src/collection/lib/api.ts`, `src/collection/lib/types.ts`, `vite.config.ts` (`setupFiles: ['./src/shared/test/setup.ts']`).
- Move (server): `collection/database.py`, `collection/clock.py` -> `collector_server/shared/`; add `shared/camel_model.py` holding `CamelModel` (removed from `collection/models.py`, which imports it). Their tests (`test_source_checker_and_clock.py` clock part, database parts of `test_repositories.py`) stay in `tests/collection/` unless a file tests only shared code; then move it to `tests/shared/`.

**Interfaces:**
- Produces (web): `shared/lib/http.ts` exports `ApiError`, `type FetchLike`, and `class HttpClient { constructor(fetchImpl?: FetchLike); protected send<T>(url: string, method: string, body: unknown): Promise<T>; protected request<T>(url: string, init?: RequestInit): Promise<T>; protected remove(url: string): Promise<void> }`. `remove` is the 204-no-body DELETE now inlined in `deleteCollector`.
- `collection/lib/api.ts`: `export class ApiClient extends HttpClient` with the same public methods as today; `export const api = new ApiClient()`. `ApiError` is imported from `shared/lib/http`, and re-imports are updated (no re-export).
- `Tone` moves from `collection/lib/types.ts` to `shared/lib/types.ts`; `StatusChip` and `RunRow` import it from there. Anything else tsc flags is updated the same way.
- Produces (server): `collector_server.shared.database.Database`, `collector_server.shared.clock.{Clock, SystemClock}`, `collector_server.shared.camel_model.CamelModel`.

- [ ] **Step 1: Failing test.** `http.test.ts`: `it('remove resolves on 204 and throws ApiError with the server detail on failure')` using a fake `FetchLike` returning `new Response(null, {status: 204})` and then `new Response(JSON.stringify({detail: 'in progress'}), {status: 409})`; assert resolves, then rejects with `ApiError` where `status === 409` and `message === 'in progress'`. Run: expect FAIL (module missing).
- [ ] **Step 2: Create `HttpClient` and make `ApiClient` extend it**; `deleteCollector` calls `this.remove(...)`. The existing `api.test.ts` cases must still pass unchanged.
- [ ] **Step 3: `git mv` the shared web files**, update `vite.config.ts`, then fix imports with `npx tsc -b --noEmit`.
- [ ] **Step 4: Move the server shared modules**, fix imports with `.venv/bin/python -m pytest -q` (clear `__pycache__` first).
- [ ] **Step 5: Verify.** tsc clean; web = baseline files/tests plus the new `http.test.ts`; pytest = 235 passed.
- [ ] **Step 6: Commit** "Move shared code into shared/".

### Task 3: Import boundary tests

**Files:**
- Create: `app/web/src/architecture.test.ts`, `app/server/tests/test_architecture.py`.

**Interfaces:**
- Consumes: the folder layout from tasks 1-2.
- Produces: tests named `no stage imports another stage`, `shared imports no stage`, and `the scan finds files` on each side.

- [ ] **Step 1: Write the web test.** Walk `src/{collection,production,output,shared}` with `node:fs`, read every `.ts`/`.tsx`, extract relative specifiers with the regex `/from\s+['"](\.{1,2}\/[^'"]+)['"]/g`, resolve each against its file's directory, and take the first path segment under `src/`. Assertions: for a file in stage S, every import's top folder is S or `shared`; for a file in `shared`, every import's top folder is `shared`. Export the check as a pure function `violations(files: {path: string; source: string}[]): string[]` so it can be tested on fixture strings.
- [ ] **Step 2: Test the checker itself.** `it('flags a collection file importing production')` passes `{path: 'collection/a.ts', source: "import x from '../production/b'"}` and expects one violation; `it('scans real files')` expects the real file count > 50.
- [ ] **Step 3: Same on the server.** `test_architecture.py` reads every `.py` under `collector_server/{collection,production,output,shared}` (production/output may not exist yet; skip missing ones), parses `from ..x`/`from collector_server.x` imports with `ast`, applies the same rule, and has the same two checker tests plus `test_scan_finds_files` (> 30 files).
- [ ] **Step 4: Run both** and confirm pass: `npx vitest run src/architecture.test.ts`, `.venv/bin/python -m pytest tests/test_architecture.py -q`.
- [ ] **Step 5: Prove it bites.** Temporarily add `import '../../production/x'` to a collection file, confirm the test fails with that path in the message, then revert it.
- [ ] **Step 6: Commit** "Fail the build when a stage imports another stage". Edit `docs/superpowers/specs/2026-11-16-stage-separation-design.md` in this commit: replace the ESLint line with "uses architecture tests, not ESLint, to avoid a new dependency".

### Task 4: Handoff contracts

**Files:**
- Create: `app/web/src/shared/contracts/handoff.ts`, `handoff.test.ts`; `app/server/collector_server/shared/handoff.py`, `app/server/tests/shared/test_handoff.py` (add `__init__.py`).

**Interfaces:**
- Produces (TS): `export type StageName = 'collection' | 'production' | 'output'`; `export interface HandoffClip { name: string; sizeBytes: number }`; `export interface HandoffFolder { path: string; clips: HandoffClip[] }`; `export interface StageHandoff { runId: number; stage: StageName; folders: HandoffFolder[] }`.
- Produces (Python): pydantic models `HandoffClip`, `HandoffFolder`, `StageHandoff` (subclasses of `CamelModel`, same field names, `stage: Literal["collection","production","output"]`).

- [ ] **Step 1: Failing tests.** Python: `test_handoff_round_trips_camel_case` validates `{"runId": 3, "stage": "collection", "folders": [{"path": "/a/2026-11-14", "clips": [{"name": "x.mov", "sizeBytes": 10}]}]}`, asserts `.run_id == 3`, and `model_dump(by_alias=True)` equals the input; `test_unknown_stage_is_rejected` expects `ValidationError` for `"stage": "export"`. TS: `handoff.test.ts` builds a `StageHandoff` literal from the same JSON (type-checks through `tsc`) and asserts `JSON.parse(JSON.stringify(h))` deep-equals it.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** the two files from the interfaces above. **Step 4: Run both suites**, expect PASS; architecture tests still pass (contracts live in `shared/`).
- [ ] **Step 5: Commit** "Add the stage handoff contract". Not wired to any endpoint yet: building a handoff from a finished collection run belongs to the production plan.

---

## Self-review notes

- Spec coverage: step 1-4 map to tasks 1-4; "no behavior change" is enforced by the baseline counts; the ESLint change is recorded in task 3.
- The `hooks.test.tsx` and `test_repositories.py` splits are left to the implementer (marked in the tasks) because they depend on file contents; the rule is: tests follow the code they test.
