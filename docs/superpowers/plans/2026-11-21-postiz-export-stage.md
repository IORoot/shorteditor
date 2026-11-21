# Post-iz export stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a last-position export stage, `postiz_export`, that uploads each card's finished video to the user's Postiz, optionally queues it on a Postiz pipeline, and shows the results on the Output tab.

**Architecture:** A small Postiz HTTP client in `production/`, a stage plugin file that uses it through `StageContext`, a table of export records (for duplicate refusal and the Output tab), connection settings in App Settings, and three web changes: a Settings section, two settings-form widgets plus a caption box on a blocked card, and the Output tab. The runner is not restructured.

**Tech Stack:** Python 3.14, FastAPI, pydantic v2, stdlib `urllib`; React 19, TypeScript, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-21-postiz-export-stage-design.md`. Terms: `CONTEXT.md`.

## Global Constraints

- Stage rule (`test_architecture.py`, `architecture.ts`): `production/stages/*.py` may import `production/stage_api.py`, `pieces.py` and their own folder; `output/` (web) imports only itself and `shared/`.
- Client name sent on every Postiz request: `User-Agent: ldnpk-video-editor/1.0`. Auth: `Authorization: <key>` (no `Bearer`).
- Stored URL form: `https://<host>/api` (`https://` added when missing, trailing `/` and a trailing `/public/v1` removed, `/api` added when missing). Calls: `GET {base}/public/v1/integrations`, `GET {base}/media/folders`, `POST {base}/public/v1/upload` (multipart, field `file`), `POST {base}/media/move` (`{"id","folderId"}`), `POST {base}/pipelines/enqueue`.
- The API key is never returned by any endpoint, never logged, never put in stage settings. Settings endpoints return `key_set` and `key_hint` (last four characters) only.
- Post type values: `schedule` (default), `draft`. Approval values: `auto` (default), `manual`. Mode values: `upload_only`, `upload_and_queue` (default).
- A failed or unclear Postiz result is never retried automatically.
- Stage settings limit 4000 characters of JSON per step (existing rule).
- Tests: essential tests by default; extra tests marked `@pytest.mark.full` / `@tags full` as elsewhere. Tests use fakes for HTTP; no test calls the real Postiz.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A card whose first attempt got no readable answer from Postiz is blocked, and a second attempt without the user's "I checked Postiz" choice never calls Postiz.
2. A blocked pass is rerun from the start and its video is re-rendered, so its fingerprint differs: duplicates must also be refused by card, not only by fingerprint.
3. `https://postiz.example`, `postiz.example`, `postiz.example/`, `https://postiz.example/api` and `https://postiz.example/api/public/v1` all become the same base.
4. An empty channel list or empty pipeline ID in `upload_and_queue` mode uploads and stops, with a log line saying the queue was skipped.
5. The key never appears in an error message, a log line or a stage detail (the v2 code replaced it with `[REDACTED]`).

---

### Task 1: Postiz client

**Files:**
- Create: `app/server/collector_server/production/postiz_client.py`
- Test: `app/server/tests/production/test_postiz_client.py`

**Interfaces:**
- Produces:
  - `class PostizError(Exception)`: a refusal; nothing was created.
  - `class PostizUnclear(PostizError)`: no readable answer, or a network failure after the request was sent; Postiz may have acted.
  - `@dataclass(frozen=True) class Channel: id: str; name: str; identifier: str; disabled: bool`
  - `@dataclass(frozen=True) class Folder: id: str; name: str`
  - `@dataclass(frozen=True) class Media: id: str; path: str`
  - `@dataclass(frozen=True) class ChannelPost: id: str; identifier: str; settings: dict`
  - `@dataclass(frozen=True) class Enqueued: id: str; group: str`
  - `def base_url(raw: str) -> str`
  - `class PostizClient: __init__(self, url: str, key: str, opener: Callable = urllib.request.urlopen)`; `channels() -> list[Channel]` (skips disabled); `folders() -> list[Folder]` (skips `deletedAt` set); `upload(path: str) -> Media`; `move(media_id: str, folder_id: str) -> None`; `enqueue(pipeline_id: str, post_type: str, caption: str, media: Media, channels: list[ChannelPost]) -> Enqueued`

- [ ] **Step 1: Write the failing tests** in `test_postiz_client.py`, with a fake `opener` that records the request and returns canned bytes:
  - `test_base_url_forms`: the five inputs in Review Focus 3 all equal `"https://postiz.example/api"`.
  - `test_requests_carry_agreed_headers`: `channels()` sends `User-Agent == "ldnpk-video-editor/1.0"` and `Authorization == "KEY"`.
  - `test_channels_skips_disabled_and_reads_identifier` and `test_folders_skips_deleted`.
  - `test_upload_then_move_use_v2_paths`: URLs end `/public/v1/upload` and `/media/move`; the move body is `{"id": "m1", "folderId": "f1"}`.
  - `test_enqueue_body_matches_v2`: body is `{"pipelineId": "p1", "post": {"type": "draft", "tags": [], "shortLink": False, "posts": [...]}}`, one post per channel with `settings["__type"] == identifier` and the channel's own settings merged in.
  - `test_http_error_is_postiz_error_without_key`: a 400 body that contains the key raises `PostizError` whose message does not contain the key.
  - `test_network_error_after_send_is_unclear` and `test_unreadable_answer_is_unclear` raise `PostizUnclear`; a network error on a `GET` is a plain `PostizError`.
  - `test_enqueue_without_id_is_unclear`: a 200 with `{}` raises `PostizUnclear`.
- [ ] **Step 2:** Run `cd app/server && .venv/bin/pytest tests/production/test_postiz_client.py -q`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `postiz_client.py` with the signatures above. One private `_request(method, path, body, content_type)` does the headers, timeout (30 s for GET, 180 s for upload), JSON decode, and the error mapping; it replaces the key in any text it puts into a message. Build the multipart upload body by hand as v2's `upload_body` does (`Content-Type: video/mp4`, file name from the path).
- [ ] **Step 4:** Re-run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `git add app/server/collector_server/production/postiz_client.py app/server/tests/production/test_postiz_client.py && git commit -m "Add a Postiz client"`

---

### Task 2: Export records and the exports endpoint

**Files:**
- Modify: `app/server/collector_server/production/schema.py` (new table in `_TABLES`, no semicolons inside defaults)
- Create: `app/server/collector_server/production/export_repository.py`
- Modify: `app/server/collector_server/production/models.py`, `api.py`, `service.py`, `wiring.py` (whichever builds the repositories; read it first)
- Test: `app/server/tests/production/test_exports.py`

**Interfaces:**
- Produces:
  - Table `production_exports (id INTEGER PRIMARY KEY AUTOINCREMENT, card_id INTEGER NOT NULL REFERENCES production_cards(id) ON DELETE CASCADE, sha256 TEXT NOT NULL, status TEXT NOT NULL, media_id TEXT, queue_id TEXT, pipeline_id TEXT, folder TEXT, post_type TEXT, caption TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`. Status is one of `uploading`, `uploaded`, `queued`, `unclear`, `failed`.
  - `class ExportRecord(CamelModel)` with those fields plus `batch_name: str`, `card_number: int` (filled by `list_all`).
  - `class ExportRepository: __init__(self, db, now: Callable[[], str])`; `for_card(card_id) -> ExportRecord | None` (newest); `by_sha(sha256) -> ExportRecord | None` (newest with status `uploaded` or `queued`); `start(card_id, sha256, caption) -> int`; `update(record_id, **fields)` (sets `updated_at` from `now`); `delete(record_id)`; `list_all(limit=200) -> list[ExportRecord]`, newest first, joined to the batch name and card number.
  - `GET /api/production/exports -> list[ExportRecord]`.
  - `StageContext` gains `exports: ExportStore | None = None` where `ExportStore` is a `Protocol` in `stage_api.py` with `for_card`, `by_sha`, `start`, `update`, `delete`. The runner passes the repository in (Task 3 wires its construction).

- [ ] **Step 1: Failing tests** in `test_exports.py`: `test_start_then_update_round_trips`; `test_by_sha_ignores_unclear_and_failed`; `test_for_card_returns_newest`; `test_list_all_has_batch_name_and_card_number`; `test_deleting_a_card_removes_its_records` (cascade); `test_exports_endpoint_lists_records` (TestClient, as `test_api.py` does).
- [ ] **Step 2:** Run `cd app/server && .venv/bin/pytest tests/production/test_exports.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** the table, repository, model, `ProductionService.exports() -> list[ExportRecord]` and the route. Follow `PassRepository` style.
- [ ] **Step 4:** Re-run. Expected: PASS. Also run `tests/production/test_old_database.py` (schema change must apply to an old database).
- [ ] **Step 5: Commit** `git commit -m "Record exports and list them"` (add the files).

---

### Task 3: Connection settings, live lists and context plumbing

**Files:**
- Create: `app/server/collector_server/settings/postiz_settings.py`
- Modify: `app/server/collector_server/settings/app_settings.py` (nothing but constants if wanted), `app/server/collector_server/production/stage_api.py` (`StageContext`), `production/runner.py`, `production/wiring.py`, `app/server/collector_server/main.py`
- Test: `app/server/tests/settings/test_postiz_settings.py`, `app/server/tests/production/test_runner.py` (one new test)

**Interfaces:**
- Consumes: `PostizClient`, `base_url`, `PostizError` (Task 1); `ExportRepository` (Task 2); `AppSettings.get/put`.
- Produces:
  - App Settings keys `postiz_url`, `postiz_key`.
  - `PostizView(CamelModel): url: str | None; key_set: bool; key_hint: str | None`; `PostizUpdate(CamelModel): url: str | None = None; key: str | None = None` (None leaves it alone, empty string removes it).
  - Routes under `/api/settings/postiz`: `GET` (view), `PUT` (update, returns view; the stored URL is `base_url(raw)`), `POST /test` (`{"channels": [{id, name, identifier}], "folders": N}` or 400 with the Postiz message), `GET /channels`, `GET /folders` (live lists; 409 `Postiz is not set up` when URL or key missing, 400 with the Postiz message on a refusal).
  - `StageContext` gains `postiz: Callable[[], PostizClient | None] = lambda: None`, `card_id: int = 0` (the card being run) and `labels: dict[str, str] = field(default_factory=dict)` (keys `name`, `id`, `date`).
  - `PassRunner.__init__` gains `postiz: Callable[[], PostizClient | None]` and `exports: ExportStore`; the runner passes them into `StageContext`, and fills `labels` with the batch name, the batch id as text and `self._now()[:10]`.

- [ ] **Step 1: Failing tests:**
  - `test_put_stores_full_url_and_hides_key`: `PUT {"url": "postiz.example", "key": "abcd1234"}` returns `url == "https://postiz.example/api"`, `keySet`, `keyHint == "...1234"`, and the response text does not contain `abcd1234`.
  - `test_empty_string_removes_key`.
  - `test_channels_requires_setup`: 409 with no settings saved.
  - `test_channels_and_folders_use_client` (inject a fake client factory): returns the lists; a `PostizError` becomes 400 with its message.
  - `test_runner_context_has_labels_and_postiz` in `test_runner.py`: a fake stage records `ctx.labels == {"name": <batch name>, "id": "<batch id>", "date": <date>}` and that `ctx.postiz()` returns the fake client.
- [ ] **Step 2:** Run `cd app/server && .venv/bin/pytest tests/settings/test_postiz_settings.py tests/production/test_runner.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** `build_postiz_router(settings: AppSettings, make_client: Callable[[str, str], PostizClient] = PostizClient) -> APIRouter` and register it in `main.py` next to the AI router. Build the runner's `postiz` callable in `main.py` from `AppSettings` (`None` when url or key is missing). Update every place that constructs `PassRunner` (grep for it; tests included) with the new arguments, defaulting where a test does not care.
- [ ] **Step 4:** Re-run those tests, then `tests/production/test_wiring.py` and `tests/production/test_main.py`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Postiz connection settings and live lists"`.

---

### Task 4: The Post-iz stage

**Files:**
- Create: `app/server/collector_server/production/stages/postiz_export.py`
- Modify: `app/server/collector_server/production/service.py` (`resolve_block` takes an optional caption), `api.py` (`Resolve` body gains `caption: str | None`), `models.py` (`Resolve`), `builtin.py` (add `"postiz_export"` at the end of `LIBRARY_ORDER`)
- Test: `app/server/tests/production/test_postiz_export.py`, `tests/production/test_service.py` (one test for the caption override)

**Interfaces:**
- Consumes: `PostizClient`, `ChannelPost`, `Media`, `PostizError`, `PostizUnclear` (Task 1); `ctx.exports`, `ctx.postiz`, `ctx.labels` (Tasks 2 and 3); `BlockedError`, `StageError`, `VideoData`.
- Produces:
  - `class ChannelChoice(CamelModel): id: str; identifier: str; name: str = ""; settings: dict = {}`
  - `class PostizSettings(CamelModel)` with titled fields: `mode: Literal["upload_only","upload_and_queue"] = "upload_and_queue"`; `folder_id: str | None = None` (`json_schema_extra={"widget": "postiz_folder"}`); `pipeline_id: str | None = None` (max length 100, titled "Postiz pipeline ID"); `channels: list[ChannelChoice] = []` (`json_schema_extra={"widget": "postiz_channels"}`); `caption: str = "{{name}}"` (max length 2000); `approval: Literal["auto","manual"] = "auto"`; `post_type: Literal["schedule","draft"] = "schedule"`; hidden `choice: str | None`; hidden `caption_override: str | None`.
  - `STAGE` with `key = "postiz_export"`, `title = "Post-iz"`, `transitions = {"video": "video"}`, `position = "last"`.
  - `def render_caption(template: str, labels: dict[str, str]) -> str` (tags `{{name}}`, `{{id}}`, `{{date}}`; an unknown tag raises `StageError` naming it).
  - `def channel_defaults(identifier: str) -> dict`: instagram gives `{"post_type": "post", "collaborators": [], "is_trial_reel": False}`; youtube gives `{"title": "", "type": "public"}`; anything else `{}`. A YouTube channel with an empty title uses `caption[:100]` when the post is built.
  - Constants `POST_IT = "Post it"` and `TRY_AGAIN = "I checked Postiz: try again"`.
  - `ProductionService.resolve_block(pass_id, choice, picks=None, caption=None)`: when `caption` is given, the override is `{"choice": choice, "caption_override": caption}`.

Run behaviour, in order:
1. Input must be `VideoData` (the registry already enforces the transition). `ctx.postiz()` of `None` raises `StageError("Postiz is not set up. Add the URL and key in Settings")`.
2. Fingerprint the file (SHA-256, streamed). If `ctx.exports.for_card(card)` or `by_sha` shows status `queued` or `uploaded`, raise `StageError("Already posted: ...")` with the queue or media ID.
3. If the card's newest record is `unclear` and `settings.choice != TRY_AGAIN`: raise `BlockedError("Postiz may already have this video. Check Postiz first", [TRY_AGAIN])`. With `TRY_AGAIN`, delete that record and carry on.
4. Caption is `caption_override` if set, else `render_caption`. In `manual` mode with `choice not in (POST_IT, TRY_AGAIN)`: raise `BlockedError("Ready to post", [POST_IT], [caption])`.
5. Record `uploading`, upload, record `uploaded` with the media ID; move to `folder_id` if set; in `upload_and_queue` with a `pipeline_id` and at least one channel, enqueue and record `queued` with the queue ID. Otherwise log that the queue was skipped and why.
6. `PostizError` records `failed` and raises `StageError(str(error))`. `PostizUnclear` records `unclear` and raises `BlockedError` as in step 3. The card then needs the user's choice before it can try again.
7. Return the input video unchanged. Log each step; never log the key.

- [ ] **Step 1: Failing tests** in `test_postiz_export.py`, with a fake client and an in-memory `ExportStore` (reuse `ExportRepository` on the test database):
  - `test_render_caption_tags_and_unknown_tag`.
  - `test_channel_defaults_for_instagram_youtube_other`.
  - `test_auto_uploads_moves_and_queues`: calls happen in order upload, move, enqueue; final record is `queued` with the queue ID; the returned video is the input.
  - `test_upload_only_never_enqueues`; `test_no_pipeline_or_no_channels_skips_queue_with_log`.
  - `test_manual_blocks_with_caption_as_item_then_posts_on_choice`: first run raises `BlockedError` with `items == [caption]`; second run with `choice=POST_IT` posts, and with `caption_override` posts that text.
  - `test_unclear_blocks_and_second_run_without_choice_calls_nothing`; `test_try_again_clears_unclear_record_and_posts`.
  - `test_already_queued_card_or_same_fingerprint_is_refused`.
  - `test_refusal_is_failed_record_and_stage_error`.
  - `test_missing_connection_is_stage_error`.
  - `test_key_not_in_logs_or_errors`.
  - In `test_service.py`: `test_resolve_block_saves_caption_override`.
- [ ] **Step 2:** Run `cd app/server && .venv/bin/pytest tests/production/test_postiz_export.py tests/production/test_service.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** the stage file as specified and the `resolve_block` and `Resolve` changes.
- [ ] **Step 4:** Re-run those tests plus `tests/production/test_registry.py tests/production/test_builtin.py tests/test_architecture.py -q`. Expected: PASS (the new stage must register as last-position and pass the architecture test).
- [ ] **Step 5: Commit** `git commit -m "Add the Post-iz export stage"`.

---

### Task 5: Settings page, Postiz section

**Files:**
- Modify: `app/web/src/settings/lib/api.ts`, `app/web/src/settings/SettingsPage.tsx`
- Test: `app/web/src/settings/settings.test.tsx`

**Interfaces:**
- Consumes: the `/api/settings/postiz` routes from Task 3.
- Produces in `SettingsApi`: `postiz(): Promise<PostizState>`, `savePostiz(update: { url?: string; key?: string }): Promise<PostizState>`, `testPostiz(): Promise<{ channels: { id: string; name: string; identifier: string }[]; folders: number }>`, `postizChannels()`, `postizFolders()` (used by Task 6). `PostizState = { url: string | null; keySet: boolean; keyHint: string | null }`. `SettingsPage`'s `api` prop `Pick` gains `postiz | savePostiz | testPostiz`.

- [ ] **Step 1: Failing tests** in `settings.test.tsx`: `shows the saved address and a key hint, never the key`; `saves a new address and key`; `removes the key`; `Test connection shows the channels found`; `Test connection shows the error text on a refusal`.
- [ ] **Step 2:** Run `cd app/web && npx vitest run src/settings/settings.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** a second `SectionCard` titled "Post-iz" below the AI card, using the same `FormField` and `Button` pieces and the same `save` pattern. The key field is `type="password"`. Test connection is disabled until an address and key are saved.
- [ ] **Step 4:** Re-run. Expected: PASS. Run `npx tsc --noEmit -p .` and expect no new errors beyond the known `vite.config.ts` ones.
- [ ] **Step 5: Commit** `git commit -m "Postiz connection on the Settings page"`.

---

### Task 6: Stage form widgets and the caption box on a blocked card

**Files:**
- Modify: `app/web/src/pipeline/lib/schemaForm.ts` (new `FieldKind` `'widget'` with a `widget: string` property), `app/web/src/pipeline/features/edit/StageSettings.tsx`
- Create: `app/web/src/pipeline/features/edit/PostizPickers.tsx` (`PostizFolderField`, `PostizChannelsField`)
- Modify: `app/web/src/production/features/review/BlockedChoices.tsx`, `ReviewPage.tsx`, `ReviewRoute.tsx`, `app/web/src/production/lib/api.ts` (`resolve(passId, choice, picks?, caption?)`)
- Test: `app/web/src/pipeline/lib/schemaForm.test.ts`, `app/web/src/pipeline/features/edit/edit.test.tsx`, `app/web/src/production/features/review/review.test.tsx`

**Interfaces:**
- Consumes: `settingsApi.postizChannels()` and `postizFolders()` (Task 5); the stage's `settings_schema` carrying `widget` on a property (Task 4); `card.stageKey` and `card.blockedItems` (existing).
- Produces:
  - `fieldOf` returns `{kind: 'widget', widget: 'postiz_folder' | 'postiz_channels'}` when a property has a string `widget`, before any other kind check.
  - `PostizFolderField({ value: string | null, onChange })`: a select of the live folders plus "Postiz root" (null); on a load error it shows the message and a text box for the folder ID.
  - `PostizChannelsField({ value: ChannelChoice[], onChange })`: a checkbox per live channel; ticking adds `{id, identifier, name, settings: defaults}`; each ticked channel shows its settings block: Instagram has "Post type" (choice), "Collaborators" (comma list), "Trial reel" (checkbox); YouTube has "Title" (empty uses the caption) and "Visibility" (choice). Defaults mirror `channel_defaults` in Task 4.
  - On a blocked card whose `stageKey === 'postiz_export'`, `BlockedChoices` shows a "Caption" textarea filled with `blockedItems[0]` and passes its text as the fourth argument when the choice is "Post it".

- [ ] **Step 1: Failing tests:** `schemaForm.test.ts`: `a property with a widget becomes a widget field`. `edit.test.tsx`: `the Post-iz settings draw the folder and channel pickers from the live lists`, `ticking Instagram shows its three fields and saves them in the step settings`, `a failed list load shows the message and a folder ID box`. `review.test.tsx`: `a blocked Post-iz card shows the caption and sends it with Post it`, `a blocked card of any other stage shows no caption box`.
- [ ] **Step 2:** Run `cd app/web && npx vitest run src/pipeline src/production/features/review`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement** the widget kind, the two pickers, and the caption box. The pickers take their API as a prop so tests can fake it.
- [ ] **Step 4:** Re-run the same command. Expected: PASS. Type check as in Task 5.
- [ ] **Step 5: Commit** `git commit -m "Post-iz pickers and the caption on a blocked card"`.

---

### Task 7: Output tab

**Files:**
- Create: `app/web/src/output/OutputPage.tsx`, `app/web/src/output/lib/api.ts`, `app/web/src/output/output.test.tsx`
- Modify: `app/web/src/App.tsx` (the `output` tab `enabled: true`; a `Section` of `'output'`; render `OutputPage`), `app/web/src/output/README.md`, `app/web/src/App.test.tsx` (the tab is no longer "Soon")

**Interfaces:**
- Consumes: `GET /api/production/exports` (Task 2) through `HttpClient` from `shared/lib/http`.
- Produces: `OutputApi.exports(): Promise<ExportRecord[]>`; `OutputPage({ api })` renders a table: Time, Batch, Card, Status, Postiz pipeline, Media ID, Queue ID, with a plain empty state "Nothing has been posted yet" and each `unclear` row marked "Check Postiz before trying again".

- [ ] **Step 1: Failing tests** in `output.test.tsx`: `lists each export with its IDs`, `shows the empty state`, `marks an unclear export`. In `App.test.tsx`: `the Output tab opens the Output page`.
- [ ] **Step 2:** Run `cd app/web && npx vitest run src/output src/App.test.tsx src/architecture.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the page and wire the tab. `output/` imports only `shared/`.
- [ ] **Step 4:** Re-run. Expected: PASS (including `architecture.test.ts`).
- [ ] **Step 5: Commit** `git commit -m "Show export results on the Output tab"`.

---

## Self-review

- **Spec coverage:** header Output tab (7); one stage with mode (4); connection in App Settings with full URL and client name (1, 3, 5); live folder and channel lists, typed Postiz pipeline ID (3, 6); channel settings with v2 defaults (4, 6); caption template with the folder-name tags, per-card edit in manual mode (4, 6); approval and post type settings (4); failure, unclear and duplicate rules (2, 4, 7); Test connection (3, 5).
- **Not covered, on purpose:** scheduling time choice, other export types, listing Postiz pipelines (spec non-goals).
- **Known cost:** a blocked pass is discarded and rerun from the start (`runner.py` `_discard`), so manual approval and the unclear retry both re-render the video. The detect cache keeps the AI step cheap. If that is too slow in use, a later change can hold the finished video between approval and posting.
- **Assumptions to settle with a real draft post** (spec): `schedule` accepted by `/pipelines/enqueue`; the no-slot response; the v2 upload sequence. Until then, `schedule` is sent exactly as `draft` is, with only the `type` value changed.
