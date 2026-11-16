# Short Editor (Collection)

Local web app: `server/` (FastAPI + SQLite, stdlib only otherwise) and `web/` (React, Vite, TypeScript, Tailwind 4, daisyUI 5).
Design source: `../designs/video-editor.pen` (Style Guide, Components, Collection light and dark).

## Run

    cd server && .venv/bin/uvicorn collector_server.main:app --port 8000
    cd web && npm run dev          # proxies /api to :8000

## Test

    cd server && .venv/bin/python -m pytest
    cd web && npm test && npm run typecheck

## Layout

Server: `server/collector_server/{collection,shared}` plus `main.py` as the app root. `shared` holds `database`, `clock`, `camel_model` and `handoff`; `collection` holds everything else (cron, schedule, scheduler, repositories, service, api). Tests are under `server/tests/{collection,shared}`.
Web: `web/src/{collection,shared,production,output}` with `App.tsx` and `main.tsx` as the app root. `collection` has `features/`, `hooks/`, `lib/` and `test/`; `shared` has `components/{ui,shell}`, `hooks/`, `lib/` (including `http.ts`), `contracts/` and `test/setup.ts`; `production` and `output` are empty placeholders with a README.
Stages may import only themselves and `shared`, enforced by `src/architecture.test.ts` and `tests/test_architecture.py`. Stages hand data to each other through `shared/contracts` (web) and `collector_server/shared/handoff.py` (server).

## Runs

Dry run scans the input folder (video files only, recursive, hidden files and the output folder skipped), groups clips by day, week or month using file modified time, renders the folder structure tokens and shows the plan without touching anything.
Run now shows the same plan and starts the run only after you confirm. Runs execute in the background with live progress, never overlap, and every file operation is logged so Undo can reverse it.
Same-device moves are renames. Cross-device moves copy, verify (blake2b checksum), then delete. Existing folders and file names get a -2 suffix.

## Filters

A Collector has filter groups. A clip is collected if it matches any group; inside a group every rule must match, and any rule can be an exclude.
Rules: name contains, glob, regex, date range (inclusive), weekday, and weekday + time window (start inclusive, end exclusive).
Random selection (N clips or X percent, overall or per folder, with a seed) runs last and is repeatable. Clips that don't match, or aren't picked, stay in place and are listed in the dry run.
Date source is an ordered fallback: video metadata (MP4/MOV creation time), filename pattern (for example GX_YYYYMMDD_HHmmss), then file modified time.

## Not built yet

SSH sources (dry run and run say so), window grouping, cancel, xxhash (blake2b is used),
Production/Output tabs, status badges derived from run history (`statusNote` is always null).
