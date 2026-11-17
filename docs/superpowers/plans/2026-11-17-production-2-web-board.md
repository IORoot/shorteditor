# Production 2: Web Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user chose a native builder (see Build Workflow).

**Goal:** The Production tab works: a board of batches by status (Layout B2), a new-batch dialog, and a review slide-in where the user plays the result, approves it, runs it again as a new pass, or settles a blocked batch.

**Architecture:** A new `app/web/src/production/` stage (imports only itself and `shared/`) that talks to the plan-1 API `/api/production/*`. The shell gets working tabs. The folder picker moves to `shared/` so both stages use it. Two small server additions give the form its defaults and serve the result video for playback.

**Tech Stack:** React 19, TypeScript, Tailwind + daisyUI (existing tokens and components), lucide-react, Vitest + Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-17-production-design.md` (see "Notes carried into the next plans"). Design: `designs/video-editor.pen`, frame "Layout B2 – Board and review" (`oYRtv`) and its "Review Drawer".

## Global Constraints

- `production/` imports only itself and `shared/`; `src/architecture.test.ts` and `tests/test_architecture.py` stay green. `App.tsx` may import any stage.
- No new dependencies. Reuse `shared/components/ui/*` (Button, StatusChip, FormField, SelectField, SectionCard, SegmentedControl, Toggle) and the existing Tailwind tokens (`bg-surface`, `bg-fill-2`, `text-text-2`, `text-text-3`, `bg-ok-soft`, `text-ok`, `bg-warn-soft`, `bg-bad-soft`, `bg-accent-soft`, `text-primary`, `rounded-full`, text sizes `text-h1 text-h3 text-body text-small text-caption text-label`). No new colours or fonts.
- Match the approved design; where this plan departs from it, the departure is listed under "Departures from the design" and nothing else may differ.
- Every user-facing error shows the server's `detail` string when it is a string. A FastAPI request-shape error (422 with `detail` as a list) shows "The request was not accepted" plus the first message.
- Components are small and single-purpose; hooks hold logic; tests for everything (component tests with Testing Library, pure logic with plain Vitest, API client with a fake `fetch`).
- Run web tests per file with `npx vitest run <path>` from `app/web`; the whole suite (`npm test`), `npm run typecheck` and `npm run build` run at gates. Server tests: `.venv/bin/pytest -q` from `app/server`.
- Never commit `app/web/tsconfig.tsbuildinfo`. Never kill the user's uvicorn on port 8000; tell the user to restart it after server changes.

## Departures from the design (decided here)

1. **Thumbnails:** cards show a neutral film tile, not a poster frame. Posters and proxies arrive with plan 4 (Batch detail).
2. **Settings cog and Pipelines button:** not shown yet. The cog arrives with the Settings screen in plan 3, the Pipelines button with plan 7. A dead button would mislead.
3. **Approved batches:** the design has four columns. Approved batches are listed in a compact "Approved" row under the board (collapsed to the newest 5, "Show all").
4. **"Open batch"** in the review slide-in is hidden until plan 4 builds the batch detail page.
5. **"Send back from a stage"** is replaced by "Run again" (a new pass from the original clips), as agreed in the grilling. Changing the prompt first arrives with plan 5.

## Review Focus

- The board refreshes while anything is queued or running and the user is mid-action (a dialog open, a choice half made): polling must not close the drawer, reset a form, or flicker to "Loading".
- A batch card for a pass with no output (failed, blocked, queued) never shows a broken player or a negative/NaN size.
- The backend being down or restarting: the board shows a clear error with Retry and recovers by itself when the server returns.
- Double clicks on Approve, Run again and Create must not send two requests.
- A very long batch name, folder path or error message does not break the card layout.
- Playback of a video the server no longer has (folder deleted) shows a readable message, not a blank player.

## Build Workflow (chosen by the user)

- **Builder:** one native agent on Sonnet 5.5, test-first (`superpowers:test-driven-development`): write the failing test, watch it fail for the right reason, minimal code, watch it pass, run the neighbouring tests, commit. Branch `production-board`.
- **Per-task review:** before each commit a subagent runs `ponytail:ponytail-review` on the task's diff, told the plan's rules. Only "must fix" blocks; the rest go on a list for the user.
- **QA gates:** after tasks 2, 5 and 7 a separate subagent does QA, performance and security checks (time-boxed to 10 minutes, no edits to project files) and reports; confirmed problems are fixed test-first.
- **Visual check (task 7):** run the app against a temporary server and compare the board and drawer with the Pencil design (`TakeScreenshot` of `oYRtv`) side by side in the built-in browser.
- **Final:** a whole-branch review on the most capable model; then merge to master with the user's OK. Nothing is pushed.

---

## File Structure

Server (`app/server/collector_server/production/`): modify `service.py`, `api.py`, `models.py`; tests in `tests/production/`.

Web:
- `src/shared/lib/fsApi.ts` — `FsApi.browse(path?)`; `src/shared/components/FolderPicker.tsx` (moved, `browse` injected); `BrowseResult`/`BrowseEntry` types move to `src/shared/lib/types.ts`
- `src/shared/components/shell/AppHeader.tsx` — tabs become clickable (`onSelect`)
- `src/production/lib/types.ts` — mirrors of the API models
- `src/production/lib/api.ts` — `ProductionApi`
- `src/production/lib/board.ts` — pure grouping/labels (columns, subtitle, chip tone, stage strip)
- `src/production/lib/presets.ts` — the "Join clips" pipeline preset and the form → request mapping
- `src/production/hooks/useBoard.ts` — load + polling
- `src/production/features/board/{BoardPage,Board,BoardColumn,BatchCard,StageStrip,ApprovedRow}.tsx`
- `src/production/features/review/{ReviewDrawer,OutputMeta,VideoPlayer,BlockedChoices}.tsx`
- `src/production/features/new/{NewBatchDialog,FolderField}.tsx`
- `src/App.tsx` — section state and routing between Collection and Production

---

### Task 1: Server: defaults and playback

**Files:**
- Modify: `collector_server/production/service.py`, `api.py`, `models.py`
- Test: `tests/production/test_service.py`, `tests/production/test_api.py`

**Interfaces:**
- Produces:
  - `ProductionService.defaults() -> Defaults` with `Defaults(output_root: str, workers: list[WorkerInfo])` and `WorkerInfo(id: str, label: str)`; workers are `[{"id": "local", "label": "This computer"}]` (the label is looked up from a `labels: dict[str, str]` constructor argument defaulting to the id).
  - `ProductionService.output_path(pass_id: int) -> str` — the pass's `output.path`, only for passes with an output whose file exists and lies inside the batch's output root (`os.path.realpath` prefix check against `batch.output_root`); otherwise `NotFoundError("There is no video for this pass")`.
  - Routes: `GET /api/production/defaults` → `Defaults`; `GET /api/production/passes/{pass_id}/output` → `FileResponse(media_type="video/mp4")` (supports range requests), 404 via `guarded` when there is none.

- [ ] **Step 1: Write failing tests.** Service: `test_defaults_report_the_output_root_and_workers`, `test_output_path_of_a_finished_pass`, `test_output_path_refuses_a_pass_without_output`, `test_output_path_refuses_a_missing_file`, `test_output_path_refuses_a_file_outside_the_output_root` (a pass whose recorded path points at `/etc/hosts`). API: `test_defaults_route`, `test_output_route_streams_the_file_with_range` (request `Range: bytes=0-3` → 206 and 4 bytes), `test_output_route_404_without_video`.
- [ ] **Step 2: Run** them; expect FAIL.
- [ ] **Step 3: Implement** as above (`guarded` already maps `NotFoundError`).
- [ ] **Step 4: Run** `.venv/bin/pytest -q`; expect PASS.
- [ ] **Step 5: Commit** `"Add production defaults and result playback to the API"`.

### Task 2: Share the folder picker and fs client

**Files:**
- Create: `src/shared/lib/fsApi.ts`, `src/shared/components/FolderPicker.tsx`, `src/shared/components/FolderPicker.test.tsx` (move and adapt the existing picker test if there is one)
- Modify: `src/shared/lib/types.ts` (add `BrowseEntry`, `BrowseResult`), `src/collection/lib/types.ts` (re-export removed; import from shared), `src/collection/features/editor/FolderField.tsx` and `SourceSection.tsx`/`OutputSection.tsx` (wherever the picker is used)
- Delete: `src/collection/features/editor/FolderPicker.tsx`

**Interfaces:**
- Produces: `FsApi extends HttpClient { browse(path?: string): Promise<BrowseResult> }` and `export const fsApi`; `FolderPicker({ startPath: string; browse: (path?: string) => Promise<BrowseResult>; onChoose(path: string): void; onClose(): void })` with exactly the behaviour and markup of today's picker.

- [ ] **Step 1: Write the failing test** `FolderPicker.test.tsx`: renders the folder names from an injected `browse`, `..` goes to the parent, clicking a folder then "Choose this folder" calls `onChoose` with that path, a rejected `browse` shows the error and "Go to parent folder".
- [ ] **Step 2: Run** it; expect FAIL (module missing).
- [ ] **Step 3: Move** the picker to `shared/components`, replacing `api.browse` with the injected prop; add `fsApi`; update collection call sites to pass `(p) => api.browse(p)` (or `fsApi.browse`) and import the types from shared.
- [ ] **Step 4: Run** `npx vitest run src/collection src/shared src/architecture.test.ts`, then `npm run typecheck`; expect PASS with no behaviour change.
- [ ] **Step 5: Commit** `"Move the folder picker to shared so production can use it"`.

### Task 3: Production types, API client, board logic

**Files:**
- Create: `src/production/lib/types.ts`, `api.ts`, `board.ts`, `api.test.ts`, `board.test.ts`

**Interfaces:**
- Produces (types mirror the server, camelCase): `PassStatus = 'queued'|'running'|'review'|'blocked'|'failed'|'approved'`; `StageStep {key; settings; enabled}`; `VideoData {path; duration; sizeBytes}`; `BatchCard {batchId; passId; name; inputFolder; pipeline: string[]; status; stageTitle; stagePosition; stageCount; passNumber; queuePosition: number|null; runOn; startedAt: string|null; blockedReason; blockedChoices: string[]; error; output: VideoData|null}`; `Batch`, `Pass`, `BatchDetail`, `StageHandoff` (import from `shared/contracts/handoff`), `Defaults`, `BatchCreate {name; inputFolder; steps; runOn; outputRoot?}`.
- `ProductionApi extends HttpClient`: `cards()`, `defaults()`, `createBatch(body)`, `approve(passId)`, `runAgain(batchId, steps?)`, `resolve(passId, choice)`, `validate(steps)`, plus `outputUrl(passId): string` (`/api/production/passes/${id}/output`). Errors use `HttpClient`'s message, extended so a list `detail` becomes "The request was not accepted: <first msg>".
- `board.ts`: `COLUMNS = ['review','attention','running','queued']`; `columnOf(card): 'review'|'attention'|'running'|'queued'|'approved'` (blocked and failed → attention); `groupCards(cards): Record<column, BatchCard[]>` (running keeps API order, queued sorted by `queuePosition`, others newest first); `subtitle(cards): string` such as "9 batches · 2 ready to review · 2 need attention · 1 running · 4 queued" (omits zero parts); `toneOf(card): Tone` (review `ok`, failed `bad`, blocked `warn`, running `info`, queued `info`, approved `ok`); `chipLabel(card)` ("Ready" for review, "Blocked", "Failed", "Running", "Queued", "Approved"; a running card's stage title is shown beside it, not in the chip); `stageSegments(card): ('done'|'run'|'todo')[]` from `stagePosition`/`stageCount`/status; `queueCaption(card)`: "Next" for position 0 else "Starts after N batch(es)".

- [ ] **Step 1: Write failing tests.** `api.test.ts` with a fake `fetch`: each method calls the right URL/method/body; error mapping for string detail, list detail and a network failure. `board.test.ts`: `columnOf` for every status; `groupCards` ordering; `subtitle` with all parts and with only some; `stageSegments` for running at stage 3 of 5 (`['done','done','run','todo','todo']`), review (all done), blocked at stage 3 (`done,done,run,todo,todo` with the run segment marked), queued (all todo); `queueCaption` 0, 1, 2.
- [ ] **Step 2: Run** the two files; expect FAIL.
- [ ] **Step 3: Implement** types, client and pure functions.
- [ ] **Step 4: Run** the two files, then `npm run typecheck`; expect PASS.
- [ ] **Step 5: Commit** `"Add the production API client and board logic"`.

### Task 4: Working tabs and the page shell with polling

**Files:**
- Modify: `src/shared/components/shell/AppHeader.tsx`, `src/App.tsx`, `src/shared/components/ui/ui.test.tsx` (or add `AppHeader.test.tsx`)
- Create: `src/production/hooks/useBoard.ts`, `src/production/features/board/BoardPage.tsx`, `src/production/hooks/useBoard.test.tsx`, `src/production/features/board/BoardPage.test.tsx`

**Interfaces:**
- `AppHeaderProps` gains `onSelect?: (id: string) => void`; an enabled tab renders `onClick={() => onSelect?.(tab.id)}`.
- `useBoard(api: Pick<ProductionApi, 'cards'>, intervalMs?: number)` returns `{ state: LoadState<BatchCard[]>, reload(): void }`; it loads once, then re-loads quietly (no "Loading" flash, previous data kept) every `intervalMs` (default 2000) while any card is queued or running, otherwise every 10000; a failed refresh keeps the last data and sets `stale: true` plus `error`; it recovers on the next success; timers are cleared on unmount.
- `BoardPage({ api })` renders the shell (page header: title "Production", subtitle from `subtitle()`, "New batch" button), loading, error with Retry, empty state ("No batches yet. Create one to start.") and, for now, a plain list of card names (replaced in task 5).
- `App.tsx`: `section` state; tabs Collection and Production enabled, Output "Soon"; Production renders `<BoardPage api={productionApi} />` inside the same header.

- [ ] **Step 1: Write failing tests.** Header: clicking an enabled tab calls `onSelect('production')`; the disabled Output tab does not. `useBoard` (fake timers + fake api): first load, quiet refresh keeps data and never returns to `loading`, fast interval when something runs and slow when idle, a failed refresh keeps data and flags `stale`, recovery, unmount stops polling. `BoardPage`: loading text, error with a Retry button that reloads, empty state, subtitle text. `App`: clicking Production shows the board and Collection returns.
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the new files plus `npx vitest run src/App.test.tsx src/shared`; then `npm run typecheck`; expect PASS.
- [ ] **Step 5: Commit** `"Make the tabs work and add the Production page with live refresh"`.

### Task 5: The board: columns, cards, approved row

**Files:**
- Create: `src/production/features/board/{Board,BoardColumn,BatchCard,StageStrip,ApprovedRow}.tsx` and `board.components.test.tsx`
- Modify: `BoardPage.tsx` (render `Board`)

**Interfaces:**
- `BatchCard({ card, selected, onOpen(card) })`: film tile with the clip-free placeholder, name (truncated with the full name in `title`), `inputFolder` basename and pipeline summary (`"5 stages"` or the joined titles), `StageStrip`, caption row (left: stage title for running, `queueCaption` for queued, the blocked reason or error text for attention (single line, truncated), size and length for review (`formatBytes`, `mm:ss`); right: `StatusChip`). The whole card is one button (`aria-label` = name + status).
- `StageStrip({ segments })`; `BoardColumn({ title, count, children })`; `Board({ cards, selectedPassId, onOpen })` renders the four columns (empty columns show a muted "Nothing here"), `ApprovedRow({ cards, onOpen })` shows the newest five with "Show all (N)".

- [ ] **Step 1: Write failing tests:** each column gets the right cards; counts; a running card shows its stage and a strip with the right classes (`data-state` attributes `done|run|todo`); a queued card says "Next" / "Starts after 2 batches"; a blocked card shows the reason and a "Blocked" chip; a failed card shows its error; a review card shows size and length and no NaN when `output` is null; a 200-character name stays in the DOM with a truncating class; clicking a card calls `onOpen`; approved cards appear only in the approved row, newest five, "Show all" reveals the rest.
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement** with the design's classes (`rounded-2xl bg-surface shadow`, `grid-cols-4 gap-4`, selected card `ring-2 ring-primary`).
- [ ] **Step 4: Run** the file, the BoardPage tests and `npm run typecheck`; expect PASS.
- [ ] **Step 5: Commit** `"Add the board columns and batch cards"`. Then run QA gate 1 (the board with odd data: 300 cards, huge names, nulls).

### Task 6: Review drawer

**Files:**
- Create: `src/production/features/review/{ReviewDrawer,OutputMeta,VideoPlayer,BlockedChoices}.tsx`, `src/production/hooks/useAction.ts`, `review.test.tsx`, `useAction.test.tsx`
- Modify: `BoardPage.tsx` (state: opened pass id; actions)

**Interfaces:**
- `useAction()` returns `{ run(fn: () => Promise<unknown>): Promise<boolean>; busy: boolean; error: string | null; clear(): void }`; while `busy`, further `run` calls are ignored (double-click guard); errors become `error`.
- `ReviewDrawer({ card, outputUrl, busy, error, onApprove, onRunAgain, onResolve(choice), onClose })` — header with the batch name and "Pass N"; by status: **review** → `VideoPlayer` (a `<video controls preload="metadata" src>` with an `onError` message "The video is not available on the server any more"), `OutputMeta` (file name, length, size, input folder), buttons Approve (primary) and Run again; **blocked** → the reason and `BlockedChoices` (one button per choice, labels: `drop_shortest` "Drop the shortest parts", `keep_first` "Keep the first parts and trim the last"; unknown choices show their key) and nothing else; **failed** → the error text and Run again; **running/queued** → a stage line and nothing actionable; **approved** → the player and "Approved". Escape and the close button close it; focus returns to the opened card.
- `BoardPage` opens the drawer for the clicked card, keeps it open across polls (matched by `batchId`; the card's newest pass can change, the drawer then shows the new pass), shows `error` inside the drawer, and after any action calls `reload()`.

- [ ] **Step 1: Write failing tests:** per status the right controls exist and the wrong ones do not (no Approve for blocked/failed/queued; no player without output); Approve and Run again call their handlers once even when clicked twice quickly (`useAction`); a server error shows inside the drawer and keeps it open; choices call `onResolve` with the raw key; the drawer stays open and keeps its scroll/focus when the board refreshes with new data; a video error shows the readable message; Escape closes; a pass change (running → review) while open swaps the content.
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/production` and `npm run typecheck`; expect PASS.
- [ ] **Step 5: Commit** `"Add the review slide-in with approve, run again and blocked choices"`. Then QA gate 2 (double clicks, polling while the drawer is open, unusual statuses, accessibility of focus and keyboard).

### Task 7: New batch dialog, integration and visual check

**Files:**
- Create: `src/production/lib/presets.ts`, `presets.test.ts`, `src/production/features/new/{NewBatchDialog,FolderField}.tsx`, `new.test.tsx`, `src/production/Production.integration.test.tsx`
- Modify: `BoardPage.tsx` (open the dialog, create, reload, open the new batch's drawer is NOT required), `src/production/README.md`, `README` for the web app if one exists

**Interfaces:**
- `presets.ts`: `JOIN_PRESET_ID = 'join'`; `buildSteps(form: NewBatchForm): StageStep[]` producing `scan_folder`, `order_clips {orderBy, direction}`, `limit_length {maxSeconds}`, `join_pieces {fit}`, `render_output {maxSizeMb}` (camelCase settings); `NewBatchForm {name; inputFolder; outputRoot; runOn; orderBy; maxSeconds; maxSizeMb; fit}`; `defaultForm(defaults): NewBatchForm` (`maxSeconds 60`, `maxSizeMb 50`, `orderBy capture_time`, `fit crop`, `runOn 'any'`); `toRequest(form): BatchCreate` (an empty `outputRoot` is omitted so the server default applies).
- `FolderField({ label, value, onChange, browse })`: text input plus a Browse button that opens the shared `FolderPicker` (`startPath = value`).
- `NewBatchDialog({ defaults, busy, error, onCreate(form), onClose, browse })`: fields Name, Input folder (FolderField), Pipeline (select with one entry "Join clips"; Action clips is greyed "Coming with AI detect"), Order clips by (Capture time, Created date, Name, Duration, Random), Max length (s), Max size (MB), Fit (Crop to centre / Blurred background), Run on (Any worker + the worker list), Output folder (FolderField, placeholder = `defaults.outputRoot`). Create is disabled until name and folder are filled and numbers are positive; busy disables it; the server `error` shows in an alert.

- [ ] **Step 1: Write failing tests.** presets: `buildSteps` produces the five stages in order with exact settings; `toRequest` omits an empty output folder; numbers are sent as numbers. Dialog: Create disabled until valid; submit calls `onCreate` with the form once; error shown; Browse opens the picker and choosing fills the field; Action clips is disabled. Integration (fake fetch behind a real `ProductionApi`, rendered through `App`): the Production tab shows a board from fake cards in the right columns; creating a batch posts the exact JSON and the board reloads; a review card opens the drawer, Approve posts and the card moves to the approved row; a blocked card's choice posts `{choice}`; server down shows the error with Retry; a second poll updates a running card's stage without closing the open drawer.
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build`; expect all pass.
- [ ] **Step 5: Visual check.** Start a temporary server (`SHORT_EDITOR_DB` and `SHORT_EDITOR_OUTPUT` under the scratchpad, port 8001, not the user's 8000) and the Vite dev server pointed at it (override the proxy with an environment variable or a temporary config outside the repo); seed three batches from generated clips; open the built-in browser, compare the board and drawer with the Pencil screenshot of `oYRtv`, and fix visible differences that are not in "Departures from the design".
- [ ] **Step 6: Commit** `"Add the new batch dialog and prove the board end to end"`. Then QA gate 3 and the whole-branch review.

---

## Later plans

3 Workers and settings (cog, Settings screen, SSH workers, queue pause); 4 Batch detail (D2, thumbnails, proxies, logs, pass history, open batch); 5 AI Detect; 6 Manual trims and the clip editor; 7 Stage editor (Layout E, per-stage settings, Add stage, user stages folder, FFmpeg command, the Pipelines button).
