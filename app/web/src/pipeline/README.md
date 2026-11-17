# Pipeline (web)

Imports only itself and `shared/`; calls only `/api/pipeline/...`.

- `lib/` — API client, types, the settings form drawn from a stage's JSON schema, step edits.
- `features/list/` — the Pipelines page: one row per pipeline with its on/off switch.
- `features/edit/` — the editor: stages, the selected stage's settings, the live check and "used by".
