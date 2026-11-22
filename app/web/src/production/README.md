The production stage. It may import only itself and `shared/`.

- `lib/` — API client (`api.ts`), types that mirror the server, pure board logic (`board.ts`), the Join clips preset (`presets.ts`)
- `hooks/` — `useBoard` (load and keep the board fresh), `useAction` (one action at a time), `useFolderPreview` (the folders a pattern finds)
- `features/board/` — the Production page: columns, batch cards, approved row
- `features/review/` — the slide-in to play, approve, run again, or settle a blocked batch
- `features/new/` — the New batch dialog: the batch name, the subfolders (with the live preview) and the ignore-subfolders switch, and the watch options (`WatchOptions`)

The server side lives in `app/server/collector_server/production/`.
