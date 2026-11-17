The production stage. It may import only itself and `shared/`.

- `lib/` — API client (`api.ts`), types that mirror the server, pure board logic (`board.ts`), the Join clips preset (`presets.ts`)
- `hooks/` — `useBoard` (load and keep the board fresh), `useAction` (one action at a time), `useFolderPreview` (the folders a pattern finds), `useWatches` (the watches, refreshed while the panel is open)
- `features/board/` — the Production page: columns, batch cards, approved row
- `features/review/` — the slide-in to play, approve, run again, or settle a blocked batch
- `features/new/` — the New batch dialog: one folder, subfolders (with the live preview), and the watch options (`WatchOptions`)
- `features/watches/` — the Watches panel and its rows

The server side lives in `app/server/collector_server/production/`.
