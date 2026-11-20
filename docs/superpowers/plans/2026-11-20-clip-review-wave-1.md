# Clip review, wave 1: stills, pipeline visual, trim storage — Plan

Status: draft for approval
Specs: `docs/superpowers/specs/2026-11-20-clip-review-capability-map.md`, `…-stills.md`, `…-pipeline-visual.md`, `…-trim-storage.md`

## Approach

Three tasks with no dependency on each other. Each is test-first and ends with its own tests passing. The server tasks change different files from the web task, so they can run in parallel. Task 3 has two steps: the stage, then the API.

## Global constraints

- No new dependencies; no database migration.
- Client never sends a file path. Clip names come from the pass's scan result.
- Tests: `cd app/server && pytest tests/production -q` for server; `cd app/web && npx vitest run src/production/features/review src/production/lib` for web.
- Do not run the full web suite unless asked.

## Task 1: Clip stills endpoint (`stills`)

**Files**
- Create: `app/server/collector_server/production/stills.py`
- Modify: `app/server/collector_server/production/service.py` (add `still_path`, beside `card_thumbnail_path`)
- Modify: `app/server/collector_server/production/api.py` (add `GET /passes/{pass_id}/still`)
- Create: `app/server/tests/production/test_stills.py`
- Modify: `app/web/src/production/lib/api.ts` (add `stillUrl`)
- Create: `app/web/src/production/lib/stillUrl.test.ts`

**Interfaces**
- Produces `stills.still_path(output_root, pass_id, clip, at) -> str` and `stills.make_still(clip_path, at, target) -> bool` (ffmpeg, `-ss` before `-i`, width 320).
- Service `still_path(pass_id, clip, at) -> str`: looks up the clip in the pass's scan stage details; raises `NotFoundError` if absent; raises `InvalidInputError` if `at` is outside `[0, clip_duration)`.
- Route: `GET /api/production/passes/{pass_id}/still?clip=&at=` → `FileResponse` `image/jpeg`.
- Web `stillUrl(passId: number, clip: string, at: number): string` → `/api/production/passes/{id}/still?clip=…&at=…` with both values encoded.

**Steps**
1. Test: `make_still` on a generated 2 s `testsrc` clip writes a JPEG; a second call with the same arguments does not rewrite the file (mtime unchanged).
2. Run it; expect failure (module missing).
3. Implement `stills.py` to pass.
4. Test: service raises 404 for unknown clip name and 400 for `at = clip_duration`.
5. Implement in service; add the route; test the route returns `image/jpeg` for a valid clip and 404 for an unknown one.
6. Web test: `stillUrl(7, 'a b.mp4', 2.5)` equals `/api/production/passes/7/still?clip=a%20b.mp4&at=2.5`.
7. Verify: `pytest tests/production/test_stills.py -q` and `npx vitest run src/production/lib/stillUrl`. Expected: all pass.

**Review focus**
- A clip name with spaces or `../` must not read outside the input folder: the name is looked up in scan results, never joined to a path.

## Task 2: Pipeline stage boxes (`pipeline-visual`)

**Files**
- Modify: `app/web/src/production/features/review/PassFlow.tsx`
- Modify: `app/web/src/production/features/review/PassFlow.test.tsx`

**Interfaces**
- No change. Props stay `{ card, pass, now }`.

**Steps**
1. Test: a running stage has `aria-current="step"` on its `li` and the accent classes on its box.
2. Test: a done stage shows the "Done" chip and a time line with "took".
3. Test: a waiting stage shows "Not started".
4. Run; expect the class and text assertions to fail.
5. Restyle the box to the design's Node frame: `rounded-[14px]`, padding `10px 12px`, `gap-1.5`, running `border-accent bg-accent-soft`, others `bg-fill-2`. Keep `aria-label="Stages"` and the scroll container.
6. Verify: `npx vitest run src/production/features/review/PassFlow`. Expected: all pass.
7. Browser: card page at 1440 px and 390 px. The flow card scrolls inside itself; the page does not scroll sideways from it.

## Task 3: Trim storage (`trim-storage`)

Two steps, each test-first.

### Task 3a: `apply_trims` stage

**Files**
- Create: `app/server/collector_server/production/stages/apply_trims.py`
- Modify: `app/server/collector_server/production/builtin.py` (add `"apply_trims"` to `LIBRARY_ORDER` between `limit_length` and `join_pieces`; register the stage like the others)
- Create: `app/server/tests/production/test_apply_trims.py`

**Interfaces**
- Produces `ApplyTrims` (key `apply_trims`, position `any`, transitions `{"pieces": "pieces"}`), settings `TrimSettings` with `trims: dict[str, list[TrimRange]]`, `TrimRange(start: float, end: float)`.
- `run(data: PiecesData, settings, ctx) -> PiecesData`: clips with no trims keep their pieces; a clip with trims becomes one `Piece(clip, clip_duration, start, end)` per trim. Trims for clips not in `data` are logged with `ctx.log` and skipped.

**Steps**
1. Test: no trims → output equals input.
2. Test: one clip with a trim → that clip's pieces are replaced; other clips unchanged; order kept.
3. Test: trim for a clip not in data → logged, not an error.
4. Test: `builtin` order contains `apply_trims` between `limit_length` and `join_pieces`.
5. Run; expect failures. Implement; run; expect pass.
6. Verify: `pytest tests/production/test_apply_trims.py tests/production/test_builtin.py -q`.

### Task 3b: Save and reset trims (API)

**Files**
- Modify: `app/server/collector_server/production/service.py` (`save_trims`, `reset_trims`)
- Modify: `app/server/collector_server/production/api.py` (`PUT /passes/{pass_id}/trims`, `DELETE /passes/{pass_id}/trims/{clip}`)
- Create: `app/server/tests/production/test_trims_api.py`

**Interfaces**
- `save_trims(pass_id, clip, trims: list[TrimRange]) -> Pass`: validates each trim is `0 <= start < end <= clip_duration`, no overlaps, sorted; writes into `overrides["apply_trims"]["trims"][clip]` via the existing `_passes.update`; empty list removes the clip's entry.
- `reset_trims(pass_id, clip) -> Pass`: removes the clip's entry.
- Both raise `ConflictError` (409) when the pass status is `running`; `InvalidInputError` (400) on bad ranges, naming the clip.

**Steps**
1. Test: PUT then GET shows the saved trims in the pass's overrides.
2. Test: overlapping trims → 400 whose message names the clip.
3. Test: PUT on a running pass → 409.
4. Test: DELETE removes the clip's trims; the pass's other clips keep theirs.
5. Run; expect failures. Implement; run; expect pass.
6. Integration test: one clip, a saved trim, `apply_trims` then `join_pieces` with ffmpeg stubbed → the joined length equals the trim length.
7. Verify: `pytest tests/production -q`. Expected: all pass.

**Review focus**
- A trim's end beyond the clip length must be rejected on the server, even if the web sends it. Covered by 3b step 2 (add an out-of-range case to that test).

## Order and parallelism

- Parallel: Task 1, Task 2, Task 3a.
- After 3a: Task 3b.

## Checkpoints

- After each task: its tests pass, and the diff touches only its listed files.
- After all: `pytest tests/production -q` passes, and the card page renders with the new boxes.

## Open questions

- None for this wave. Stage icons (pipeline visual) remain deferred per that spec.
