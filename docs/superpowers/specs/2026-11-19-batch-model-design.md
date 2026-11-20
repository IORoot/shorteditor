# Batch model: batches, runs and cards

Status: draft for approval
Date: 2026-11-19

## Intent

A batch is the thing the user works with: named, edited, run, re-run and listed. Today a batch is one input folder, and each board card is one run of that folder. The user needs a batch to hold several pieces of work, one per folder, so a batch with sub-folders shows one card per sub-folder. The Production tab becomes a list of batches. Opening a batch shows its cards on the board, grouped by stage.

## Goals

- A batch can be edited (name, output folder; pipeline, steps and folder for the next run), run, re-run and listed.
- A batch's input folder may hold sub-folders. Each immediate sub-folder is one card. A folder with no sub-folders is one card.
- A re-run replaces the cards of the previous run. Output files on disk are never deleted by a re-run.
- The Production tab opens to the batch list (layout C, Pencil node `wMC1e` in `designs/video-editor.pen`). Clicking a batch opens the board (layout B2, node `oYRtv`) filtered to that batch's cards.
- A batch's status is derived from its cards: Approved when every card is approved, Failed when any card failed.
- Existing batches and their history survive the change.

## Non-goals

- No change to how a card is reviewed, approved or re-run by itself. The review page works per card as it does now.
- No change to the watch feature. Watches still create batches and do not change a batch's size on their own.
- No deeper sub-folder handling: folders below a sub-folder stay part of that card.

## Anti-goals

- A re-run must not delete anything the user approved from disk.
- Adding a sub-folder must not change a batch's cards until the user starts a run.

## Constraints

- The server is FastAPI with SQLite (`app/server/collector_server/production/`). Schema changes are additive, through `_NEW_COLUMNS` in `schema.py`, because `CREATE TABLE IF NOT EXISTS` never changes an old table.
- The duplicate-folder check (`taken_folders` in `service.py`) and the watch scheduler both assume one batch per input folder. This must stay true, or be changed on purpose (see open questions).
- The runner processes passes today. It records stages, logs and output per pass, and will move to cards.
- Approach A creates new tables and moves data into them, so the migration is a one-time copy, not only additive columns. Old data must be copied before the old table is dropped.

## Approaches

**A. New card table (chosen).** Add `production_runs` and `production_cards`. A card holds its folder, status, output and log. Each old pass becomes a run with one card.
- Clean separation of batch, run and card.
- Largest change: a migration of every table, and a rewrite of the runner, the API and the board.

**B. Passes as cards.** A pass already belongs to a batch and holds its status, output, stages and log. Add a `folder` column and a `run` number to `production_passes`. One pass is one card. A re-run deletes the old run's pass rows and leaves the output files on disk.
- Smallest change: additive columns and one migration rule. The runner, logs and review page keep working.
- The table keeps the name `production_passes`, so the code says "pass" where the UI says "card".

**C. Compute cards on the fly.** List the folders when the board loads and store only batch-level status.
- Least storage, but card status (review outcome, approval) has nowhere to live. Rejected.

**Chosen: A.** You picked A over B, which I had recommended, so the table split is your call. B would have kept the runner and review work unchanged with fewer migrations; A needs the runner to read and write cards instead of passes.

## Design

### Data

- `production_batches`: unchanged columns. Name and output folder are edited in place. Folder, pipeline and steps are changed for the next run only.
- `production_runs` (new): `id`, `batch_id` (cascades from batches), `number`, `created_at`. One row per run.
- `production_cards` (new): `id`, `run_id` (cascades from runs), `folder` (absolute path), `status`, `stage_index`, `stage_key`, `stages`, `blocked_reason`, `blocked_choices`, `blocked_items`, `overrides`, `error`, `output`, `steps_used`, timestamps. This is today's pass row, moved and renamed.
- `production_logs`: its `pass_id` becomes `card_id`, cascading from cards.
- Old `production_passes` is kept until the migration has run, then dropped. Migration: each existing batch gets one run (number 1) holding one card per old pass. The old pass's `folder` is the batch's input folder. Its latest pass is the card shown, as now.

### Runs and cards

- Starting a run: list the batch's immediate sub-folders (or the folder itself if there are none), create a run with the next number, and one card per folder, queued.
- Re-run: create the new run as above, then delete the previous run row, which cascades to its cards and logs. Output files are not touched.
- The runner claims cards, not passes. Stage loop, logs, output and review work per card, as they do for passes now.

### API

- `GET /batches`: the batch list with derived status, card counts per stage, and last run time.
- `GET /batches/{id}`: the batch and its cards (latest run only).
- `POST /batches/{id}/runs`: start a new run (replaces the previous run).
- `PATCH /batches/{id}`: name and output folder now; folder, pipeline and steps stored for the next run.
- Existing card endpoints keep their shape, keyed by card id (the old pass id becomes the card id in the migration).

### Web

- Production tab opens to layout C: a table of batches with name, folder count, status, and a Run/Re-run action.
- Clicking a batch opens layout B2 with that batch's cards. The review drawer and review page work per card as they do now.
- Board columns are unchanged: Queued, Running, Review, Approved.

## Migration and compatibility

- Existing databases open without a reset: the migration copies passes into cards and runs, then drops the old table.
- Each existing batch becomes one batch with one run holding its old passes as cards.
- Batches 1 to 6 may already be gone from the user's database. That is not caused by this change, and the change must not delete rows.

## The calls I made (check these)

1. A batch with no sub-folders is one card, the folder itself.
2. Only immediate sub-folders become cards.
3. A run is started by the user only. New sub-folders appear on the next run.
4. Output files are never deleted by a re-run or by deleting a batch.
5. Each existing pass becomes its own run with one card, numbered as the pass was. The original draft said one run per batch; that would have shown every old pass on the board, which the board never did.
6. The table split (approach A) and the runner moving from passes to cards, which you chose over my recommended B.

## Open questions for the user

1. **Bulk create (answered: one batch).** The user chose one batch for the parent folder, with each matching folder as a card. See the implementation note below.
2. **Watches.** A watch creates one batch per new folder today. Should a watch add cards to an existing batch instead? I have left watches unchanged.

## What is left to the builder

- Exact column types and indexes for the new pass fields.
- Route names beyond those listed above, provided they match this design.
- The exact layout C table columns, matching the design node.

## Implementation notes (added on build)

- **Names kept in code:** the Python model and repository are still `Pass` and `PassRepository`, and the card endpoints are still under `/passes/{id}`. Only the SQL tables changed, and the UI says "card". The card's JSON id is `passId`.
- **Card keeps `batch_id`:** cards also hold `batch_id` alongside `run_id`, so the batch's cards can be counted without a join. Runs and cards both cascade from the batch.
- **Migration:** `ensure_schema` renames `production_passes` to `production_cards`, renames the log column to `card_id`, creates the runs table, and gives every card its own run. It is safe to run twice. It was tested on a copy of the real database.
- **New routes:** `GET /batch-list` (layout C rows), `POST /batches/{id}/runs` (re-run, returns the batch and its new cards), `PATCH /batches/{id}` (name, and output folder while no card has a finished video).
- **Scanning:** the sub-folder scan for a batch runs before the lock is taken, the same as the bulk create's scan.
- **Web:** the Production tab opens to the batch list. A batch opens its board (`#/production/batches/{id}`), and a card opens its review page by card id (`#/production/cards/{id}`). Re-running from a review page returns to the batch board, because the old card is gone.
- **Layout C:** the table columns are Batch, Pipeline, Cards, Status, Result and Last run. The filter tabs are All, Running, Queued, Review, Failed and Approved. The design's Stages and Updated columns and its "Needs attention" tab are not built.
- **Not changed:** the bulk create and the watches still make one batch per folder, as the open questions above describe.
- **Bulk create (decided by the user):** one batch per parent folder. Its input folder is the parent and its cards are the folders the pattern matches that have videos. The pattern is stored on the batch (`folder_pattern`), so a re-run picks up the folders that match now. A parent that already has a batch is refused, and a folder already covered by another batch (as an input folder or as a card) is left out and listed as already batched. The name template may only use `{name}`, the parent folder's name. There is no 200-batch cap any more.
- **Watches: still one batch per folder.** Not changed yet. The user's answer may also cover watches; decide before changing them.
