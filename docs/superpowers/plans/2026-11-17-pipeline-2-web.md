# Pipeline Stage 2: Web Implementation Plan

**Goal:** A Pipeline tab between Collection and Production with a list page and an editor, using the `/api/pipeline` routes from plan 1. Production's web is untouched.

**Spec:** `docs/superpowers/specs/2026-11-17-pipeline-stage-design.md` (decisions 4 and 5, "My calls"). **Server plan:** `2026-11-17-pipeline-1-server-core.md` (built, branch `pipeline-stage`).

**Architecture:** New folder `app/web/src/pipeline/` that imports only itself and `shared/`. `App.tsx` adds the tab and mounts `PipelinePage`. The settings form is drawn from each stage's JSON schema, so a new stage file needs no web change. No new dependencies.

## Global Constraints

- Web stage rule: `pipeline/` imports only `pipeline/` and `shared/` (the architecture test gains `pipeline`).
- Same style as Production's web: `HttpClient` subclass, `useAction`, `useLoad`, daisyUI + the existing `shared/components/ui` pieces, plain-sentence messages, labelled controls so tests use roles.
- Reorder with Up and Down buttons (no drag). Settings numbers stay text while typing.
- Work on the current branch `pipeline-stage`. Do not commit `app/web/tsconfig.tsbuildinfo` or `chat.md`. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Checks: `cd app/web && npx vitest run` and `npx tsc -b --noEmit`. Baseline before starting: record the passing count.

## Review Focus

- Switching a used pipeline off must ask first, with the counts from `/impact`; switching on never asks.
- The editor must not save while the live check reports errors or the name is empty, and must show the server's refusal (duplicate name, 409 on delete).
- A stage that no longer exists shows as "Missing stage", read-only, and can be removed.
- A settings field the form cannot draw is shown read-only and kept unchanged on save.
- An empty "choice that can be empty" or "number that can be empty" is stored as `null` (the setting then reads "Ask each time" / "No limit").

---

### Task 1: API, types, tab, page shell, architecture test

**Files:** Create `pipeline/lib/types.ts`, `pipeline/lib/api.ts`, `pipeline/lib/api.test.ts`, `pipeline/PipelinePage.tsx`, `pipeline/README.md`. Modify `App.tsx`, `App.test.tsx`, `architecture.test.ts`.

- Types mirror the server: `StageStep`, `StageInfo`, `UsageItem`, `OffImpact`, `PipelineSummary`, `Pipeline`, `PipelineDetail`, `PipelineSave`.
- `PipelineApi extends HttpClient` with `list`, `get(id)`, `create(body)`, `save(id, body)`, `setEnabled(id, enabled)`, `impact(id)`, `duplicate(id)`, `remove(id)`, `template()`, `stages()`, `check(steps)`. Tests assert exact URLs, methods and bodies.
- Tabs: Collection, Pipeline, Production, Output. App test: the Pipeline tab opens the list.
- Commit "Pipeline web: api, tab and page shell".

### Task 2: The list page

**Files:** Create `pipeline/features/list/PipelineList.tsx`, `PipelineRow.tsx`, `list.test.tsx`. Modify `PipelinePage.tsx`.

- Rows: switch, name and description, stage count, max length ("15 min", dash when none), max size, "used by N", updated. Click or "Edit" opens the editor. "New pipeline" button. Empty state text.
- Off switch: ask `impact`; if anything uses it show "Switching off «X» stops N watches and M waiting batches. A pass that is running finishes." with "Switch off" and "Keep it on"; unused pipelines switch off at once. Errors from the server are shown.
- Commit "Pipeline web: list page".

### Task 3: Settings form from a schema (pure functions)

**Files:** Create `pipeline/lib/schemaForm.ts`, `schemaForm.test.ts`.

- `fieldsOf(schema) -> Field[]` where `Field = { name, label, kind: 'boolean' | 'number' | 'integer' | 'choice' | 'text' | 'list' | 'readonly', choices?: string[], nullable: boolean, min?, max?, defaultValue }`. Label from the name ("maxSeconds" to "Max seconds"). A choice with `anyOf` enum + null is `nullable` (empty reads "Ask each time"); a number with `anyOf` number + null is `nullable` (empty reads "No limit"); arrays of strings are `list`; anything else is `readonly`.
- `toText(field, value)` and `fromText(field, text) -> { value } | { error }` (numbers: plain numbers only, bounds and integer checked with plain messages; empty on a nullable field is `null`; empty on others is an error; lists split on commas).
- Commit "Pipeline web: settings fields from a schema".

### Task 4: The editor

**Files:** Create `pipeline/features/edit/PipelineEditor.tsx`, `StageColumn.tsx`, `StageSettings.tsx`, `ChecksPanel.tsx`, `lib/steps.ts`, `lib/steps.test.ts`, `edit.test.tsx`. Modify `PipelinePage.tsx`.

- Layout like Layout E: name and description on top; stages column (select, Up, Down, per-stage switch, Remove, "Add stage" select + button); the selected stage's settings in the middle; right panel with the live check (debounced `check`, "The order is valid" or the messages) and "Used by" (kind, name, status).
- `steps.ts`: `move(rows, i, dir)`, `addStage(info)` (settings from the schema defaults), `removeAt`, `setEnabled`, `setSetting`; tests for each.
- A new pipeline starts from `template()`. Save is disabled while the name is empty, the check has errors or a number field is invalid. Save then returns to the list. Cancel returns without saving. Existing pipelines also have Duplicate (opens the copy) and Delete (confirm; a 409 message is shown as is).
- Commit "Pipeline web: the editor".

### Task 5: Designs and verification

- Update `designs/video-editor.pen`: remove the "Runs on" column and the "Test on a folder" panel, add the checks panel and "Used by" list (light and dark). Commit the design file with this task.
- Run the full web suite, typecheck, `npx vite build`. Tell the user to refresh the dev server.
