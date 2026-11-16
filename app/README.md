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

Server: `cron.py` (parser and next-run), `schedule.py` (draft to cron and summary), `scheduler.py` (due slots, catch-up once, no overlap, source check),
`*_repository.py` (SQLite access), `service.py` (presentation), `api.py` (routes). Collaborators (`Clock`, `SourceChecker`, `Mover`) are injected.
Web: `components/ui` (Button, Toggle, StatusChip, FormField, Checkbox, SegmentedControl), `components/shell`, `features/{collectors,runs,schedule}`, `lib/api.ts`.

## Not built yet

Transfer engine (`UnavailableMover` fails runs visibly), SSH sources, filters, group-by, naming, dry-run, undo, Production/Output tabs,
status badges derived from run history (`statusNote` is always null).
