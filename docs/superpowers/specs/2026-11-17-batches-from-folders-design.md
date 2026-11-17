# Batches from folders and watches

Addendum to `2026-11-17-production-design.md`. Designs (approved): `designs/video-editor.pen` — Layout B2 (new column order and the Watches button), "New batch – one folder", "New batches – many folders", "Watches panel".

## Intent

The collection stage writes one dated folder per day (`2026-11-07_Sat_coach`). Production should turn a whole parent folder of such folders into batches in one go, and keep an eye on the parent folder so each new day's folder gets a batch without anyone clicking.

## Decisions (agreed with the user)

1. **Board order:** Queued → Running → Needs attention (blocked and failed) → Ready to review. Approved stays in a row under the board. The subtitle lists counts in the same order.
2. **Matching:** a regular expression matched against the whole name of each folder directly inside the parent folder. Presets fill it in: "Date first" (`^\d{4}-\d{2}-\d{2}_.+$`) and "Any folder" (`^.+$`). The form shows a live preview of every sub-folder: Will create, Already batched, No videos, plus a count of folders that do not match.
3. **Shared settings:** every batch in a group uses one set of pipeline settings (order, fit, max length, max size, run on, output folder). Each batch is named from a template; `{name}` is the folder name and regex groups are `{1}`, `{2}` or `{group_name}`. Batches are created, and so queued, in folder-name order.
4. **Already batched:** a folder that already has a batch (same real path) is skipped and shown as such; the user can tick it to include it again. A folder with no videos is shown but never created.
5. **Watches:** a watch is a parent folder, a pattern, the shared settings, an on/off switch, a check interval (default 5 minutes), a settle time (default 10 minutes), a cap per check (default 20) and an "include folders already there" choice (default off). They are managed from a Watches panel opened from the Production page header (status, switch, Check now, Edit, Delete). The same form creates and edits a watch.
6. **Settling:** a new folder gets its batch only when no file inside it has changed for the settle time and it contains at least one video, because collection may still be copying. Until then the watch says it is waiting.
7. **Memory:** a watch remembers every folder it has handled in its own "seen" list. Deleting a batch never makes the watch create it again. Creating a watch with "include folders already there" off marks everything that matches now as seen.
8. **Automatic running:** the batches a watch creates queue and run like any other; the one-job-per-worker queue still applies.

## Goals

- Create many batches from one dialog, with a preview that shows exactly what will happen.
- Watch folders reliably: never create a batch twice, never batch a half-copied folder, never flood the queue.
- Everything the watch does is visible: last check, what it created, what it is waiting for, what went wrong.

## Non-goals

- No recursion deeper than direct sub-folders. No per-folder settings. No feed from the collection stage (a later improvement: the collector could tell production directly instead of being polled).
- No new dependencies.

## Anti-goals

- A mistaken pattern must not flood the queue (cap per check, cap per bulk create).
- A user-written regular expression must not hang the server (length cap, nested-quantifier check, short names only).
- A watch must never touch folders outside its parent folder.

## Approaches considered

1. **A watch is stored data checked by a timer in the existing production loop (chosen).** Same loop and database as the rest, and every action visible in the UI.
2. A file-system event watcher. Fast, but unreliable on network drives (the NAS) and would need a dependency.
3. Collection tells production when it finishes. Cleanest, but ties the stages together and does not cover folders that arrive any other way.

## Left to the builder

Table and column names, the exact status wording beyond the designs, and how the preview debounces.
