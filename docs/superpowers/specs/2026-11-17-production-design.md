# Production stage design

## Intent

Production is the core of the app. It takes the folders the Collection stage produced, runs them through a pipeline of stages, and makes a finished video (usually for social media). The user can queue many batches, watch their progress, review the output and run a batch again.

Designs (approved): `designs/video-editor.pen` — Layout B2 (board and review), D2 (batch detail), E and its per-stage copies (stage editor), Settings, Add stage dialog.

## Goals

- Pick an input folder (subfolders allowed) and a pipeline; run it as a **batch**.
- Pipelines are an ordered list of **stages** chosen from a library. Each stage has its own settings.
- Stages are **plugins**: one self-contained file declaring its name, settings, what it takes and what it makes. New stages are added by dropping in a file, with no change to the core.
- One job runs per **worker** at a time; other batches wait in one first-in-first-out queue. A batch can be pinned to a worker (default: any).
- A worker is "This computer" or an SSH host that sees the same clips through a shared mount, with a path mapping. Scripts are copied over for a job and removed afterwards.
- Every run is a **pass**. Running again starts a new pass from the original clips; earlier passes stay for comparison.
- The AI step (Nemotron VL by default, via OpenRouter) gets a 360p proxy video made on the worker. The API key lives only on the host. Matching AI results are reused between passes unless "Run AI again" is on.
- The user's manual trims belong to the clip in the batch, beat the AI, and survive new passes.
- Over-length results make the batch **Blocked**, with choices. File size is met by choosing the render bitrate.
- Statuses: Queued, Running (with the current stage), Ready to review, Blocked, Failed, Approved.
- Logs per pass: pipeline log and FFmpeg log.

## Non-goals

- No parallel jobs on one worker. No agents installed on workers. No cloud rendering.
- No new dependencies unless a phase says so (FFmpeg and ffprobe are already installed).

## Anti-goals

- The AI key must never reach a worker, a log or an API response.
- A stage must never be able to put the pipeline into an invalid order silently.

## Core model

Every stage works on typed data:

- `none` → `pieces` (Scan makes whole clips as pieces)
- `pieces`: an ordered list of (clip, start, end)
- `video`: one rendered file

A stage declares `transitions` such as `{"pieces": "video"}` for Join and `{"pieces": "pieces", "video": "video"}` for FFmpeg command. A pipeline is valid when the kinds chain from `none`, Scan is first and Render is last. The editor and the API both refuse an invalid order with a plain message ("Trim needs pieces; add Detect action or Review by hand before it.").

First-release library: Scan folder, Order clips, Detect action (AI), Review by hand, Trim to action, Limit length, FFmpeg command (optional), Join in order, Render.

## Where it lives

- Server: `collector_server/production/` (imports only itself and `shared`). Stages in `production/stages/`, one file each, each exposing `STAGE`. A user stages folder is scanned too.
- Web: `app/web/src/production/`. Imports only itself and `shared`.
- Handoff: when a pass is approved, production writes its output folder and exposes it as a `StageHandoff` (stage `production`) for Output. `run_id` and `size_bytes` get tightened (non-negative) in phase 1.

## Approaches considered

1. **Plugin stages over typed data, jobs on a queue with workers (chosen).** Matches the request to extend stages later and to choose where work happens.
2. A fixed set of hard-coded pipelines (Join, Action). Smaller to build, but cannot be extended and forces a rewrite when stages are added.
3. A general workflow engine or task queue library. More than a single-user local app needs, and adds dependencies.

## Build order (each is its own plan)

1. **Server core** — pieces, plugin API and registry, pipeline validation, FFmpeg runner, stages Scan/Order/Limit length/Join/Render, batches/passes/logs storage, pass runner, queue, API, handoff. Result: a Join pipeline works end to end through the API. (`docs/superpowers/plans/2026-11-17-production-1-server-core.md`)
2. **Web board** — B2 board, new batch dialog, review slide-in, approve and run again, the Settings cog.
3. **Workers and settings** — SSH workers with path mapping, per-job script copy and cleanup, Settings screen, queue pause.
4. **Batch detail** — D2: clip grid, 540p proxies and posters served with range requests, pipeline and FFmpeg logs, pass history.
5. **AI Detect** — OpenRouter key in settings, 360p proxy upload, editable prompt, JSON segments, result reuse, token use.
6. **Manual trims and clip editor** — per-clip trims stored with the batch, Review by hand stage.
7. **Stage editor** — Layout E and per-stage settings screens, Add stage dialog, user stages folder, FFmpeg command stage.

## Left to the builder

- Table and column names, file layout inside `production/`, and test fixtures.
- Worker scripts and exact FFmpeg flags, provided the output matches the settings.
