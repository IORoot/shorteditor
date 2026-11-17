# Pipeline stage

Addendum to `2026-11-17-production-design.md`, and a change to the stage list in `2026-11-16-stage-separation-design.md`. Designs (draft, to be updated in plan 2): `designs/video-editor.pen` — "Pipelines List" and "Pipeline Edit" (light and dark).

## Intent

Production currently does two jobs: it decides what happens to the clips (order, length limit, fit, size) and which folder it happens to. Every batch and every watch carries its own copy of the steps, and the New batch dialog edits them inline.

The app gets a fourth stage, **Pipeline**, between Collection and Production. There the user builds and names pipelines. Production then only chooses a folder (or a parent folder) and a pipeline. Editing a pipeline in one place changes how every batch that uses it runs from then on.

Success: the user can create, edit, switch off and delete pipelines in the Pipeline tab; the New batch dialog and the watches ask only for folders, a pipeline, where to run and where to write; and a pipeline switched off stops everything that depends on it, visibly.

## Decisions (agreed with the user)

1. **Own stage.** Pipeline is a stage like Collection and Production, with its own tab, web folder and server package. Tab order: Collection, Pipeline, Production, Output.
2. **Live link.** A batch or watch points at a pipeline by id. It does not hold a copy of the steps. Saving a pipeline applies to the next pass of every batch that uses it, including passes already waiting in the queue. A pass that is already running is not touched.
3. **Hard switch.** A pipeline has an on/off switch. Off means everything using it stops: a pass that tries to start becomes Needs attention ("Pipeline 'X' is off. Switch it on, then run again."), and the watches using it show "paused: pipeline off". Switching it on lets watches resume by themselves; a blocked pass needs Run again. A pass that is already running finishes. The switch is checked when a pass would start and on each watch check; nothing is sent to Production at the moment of switching, so a waiting pass moves to Needs attention when its turn comes.
4. **List page.** One row per pipeline: on/off switch, name and description, number of stages, max length, max size, how many batches and watches use it, last updated. Clicking a row opens the editor.
5. **Edit page.** Like Layout E: a stages column (reorder, on/off per stage, Add stage), the selected stage's settings in the middle, a checks panel on the right (is the order valid, and what uses this pipeline), and a list of recent batches that used it. Save and Cancel; Duplicate.
6. **Production's dialogs.** The New batch dialog (one folder and many folders) and the watch form ask for: input folder(s), pipeline, run on, output folder. Order, fit, max length and max size leave them. "Run on" and the output folder stay per batch and per watch.

## My calls (the user can overrule these)

- Each pass records the steps it ran with (`stepsUsed`), saved when the pass starts. That keeps old passes explainable, which the live link would otherwise lose.
- **What "uses" a pipeline.** Every batch that points at it, however old, and every watch that points at it. So a pipeline that has ever been used cannot be deleted; the error lists what uses it, and the way to retire it is the off switch. Deleting becomes possible for such a pipeline once batches can be deleted (not built yet). This means a batch never points at a missing pipeline.
- Turning off a pipeline that is in use asks first. It counts the enabled watches that use it and the batches whose newest pass is waiting in the queue; a running pass finishes.
- **A pipeline that has become invalid.** Stage files can be added or removed after a pipeline is saved. The pass runner already checks the steps when a pass starts; if the check fails the pass fails with the message (it shows under Needs attention). The pipeline is not switched off. The editor shows a stage that no longer exists as "Missing stage" with its settings read-only, and lets the user remove it.
- **Custom batches and watches.** With no pipeline, the runner uses the batch's stored steps and still records `stepsUsed`. Custom batches count toward no pipeline. A Custom watch keeps running until it is edited, and the batches it creates are Custom too, with a copy of its steps. Nothing is converted automatically.
- **The test panel is cut down.** The folder "dry run" in the draft design needs to scan a folder, which is Production's job, so it is not part of this work. The right-hand panel shows the live check of the steps (valid, or the plain message) and the "used by" list. The draft design is updated to match in plan 2.
- "Run again" uses the batch's pipeline and can switch the batch to another pipeline (to compare two approaches). Editing steps in a re-run is removed. A pass blocked because its pipeline is off can be run again (today a blocked batch must be resolved first; that rule applies only when the block has choices).
- Pipeline names are unique ignoring case, 1 to 120 characters, no control characters. The description is optional, up to 300 characters.
- The settings form is drawn from the stage's own settings schema (number, whole number, choice, yes/no, text; a choice that can be empty reads as "ask each time"), so a new stage file gets a form without web changes. Settings the form cannot draw are shown read-only.
- Stage defaults have one source: the stage's own settings model. Those become 900 s (limit length) and 150 MB (render output), as the user asked earlier. The web's duplicate defaults go away.
- A new pipeline starts as the five-stage Join pipeline (Scan folder, Order clips, Limit length, Join in order, Render output) with those defaults.
- The first start with this version seeds one pipeline called "Join clips" so Production works at once, also on an existing install. It needs a saved marker so it is seeded once and never again after the user deletes it.
- The list's max length and max size columns are read from the `limit_length` and `render_output` stages and show a dash when the pipeline has no such stage.
- Existing batches and watches keep their own steps and show as "Custom". A Custom batch can be pointed at a pipeline on its next Run again; a Custom watch must be given a pipeline when it is next edited. Nothing is converted behind the user's back.
- "Runs on" and the default output folder come out of the pipeline designs.

## Goals

- Define a pipeline once, use it for many batches and watches.
- One place shows what a pipeline is and what depends on it.
- Anything that stops or changes a run because of a pipeline says so on screen.
- Adding a stage file to `production/stages/` still needs no change to the core: it appears in the editor's Add stage list with a working form.

## Non-goals

- No pipeline history or versions, no import or export, no sharing between machines.
- No per-batch tweaking of a pipeline's settings. The only per-pass setting stays the choice made on a blocked pass.
- The AI stages, the user stages folder, the FFmpeg command stage and the per-stage screens for them (build order items 6 and 8 of the production design) are not part of this work. The editor must not need rework when they arrive.
- No new dependencies.

## Anti-goals

- Saving a pipeline must never store an invalid order (the same check Production uses today), so a queued pass never starts from a broken pipeline.
- Changing, switching off or deleting a pipeline must never touch finished output or its passes.
- Production must never need a pipeline's code, and Pipeline must never need Production's code. They meet only through `shared/`.
- The switch must not stall unattended work silently: every stopped batch and paused watch says why.

## Constraints

- **Stage rules.** A stage imports only itself and `shared/`. `shared/` imports no stage. The architecture tests on both sides list the stages by name; they gain `pipeline`. `main.py` and `App.tsx` may import any stage.
- **Contract in `shared/`.** Moves out of `production/`: `StageStep`, `StageInfo`, and the pipeline check. New: a `StageCatalog` (list the stages, check a list of steps), a `PipelineSource` (get one pipeline's id, name, on/off and steps; list the enabled ones), and a `PipelineUsage` (what batches and watches use a pipeline, and the recent ones). Production implements `StageCatalog` and `PipelineUsage` and consumes `PipelineSource`. Pipeline does the reverse. `main.py` connects them at start-up.
- **Web.** Pipeline gets `app/web/src/pipeline/` and calls only `/api/pipeline/...`. Production's web calls only `/api/production/...`; the enabled pipelines for its picker come from a Production route that reads the `PipelineSource`. A "Manage pipelines" link in the dialog is passed in from `App.tsx`.
- **Database.** One new table for pipelines. Production's tables gain a nullable `pipeline_id` on batches and watches, and `steps_used` on passes. The tables already exist in the user's database and the schema code only creates tables that are missing, so the plan needs a small, safe "add the column if absent" step.
- **Limits stay as they are:** at most 30 steps, 4000 characters of settings per step.
- **Runner.** The pass runner reads steps from the batch today. It must read them from the pipeline when a pass starts, check the switch first, and record `stepsUsed`.

## API sketch (names are the builder's)

Pipeline: list (with stage count, usage count, updated time), create, get (with steps and recent batches), save (name, description, steps), switch on/off, duplicate, delete (409 when in use), the stage library, and "check these steps".

Production: batch, bulk and watch creation take `pipelineId` instead of `steps`; a route lists the enabled pipelines; board cards carry the pipeline name; passes carry `stepsUsed`.

## Approaches considered

1. **A separate stage joined through a small contract in `shared/` (chosen).** Follows the stage rules and the user's picture of the app. It costs some wiring.
2. Pipelines inside Production's code, with a Pipeline tab. Least wiring, but it contradicts the separate stage the user asked for and would have to be pulled apart later.
3. Pipelines as JSON files in a folder. Hand-editable, but "in use" checks, renames and the on/off rules are harder without a database.

On the link between a batch and its pipeline, the user chose the **live link** over a snapshot (the recommendation). A snapshot keeps old runs exactly reproducible; the live link is simpler to explain and means one edit fixes every batch. The recorded `stepsUsed` covers the main downside.

## Build order (each is its own plan)

1. **Pipeline server core.** The contract in `shared/`, the pipelines table and storage, create/save/duplicate/delete, the stage library and check, the in-use and on/off rules, stage defaults, seeding, architecture test updates. A pipeline can be managed through the API.
2. **Pipeline web.** The tab, the list page, the editor with the form drawn from settings schemas, Add stage, the test panel, the turn-off confirmation, and the design updates. Production is unchanged and still works.
3. **Production integration.** `pipelineId` on batches, bulk create and watches, the pipeline picker and the "no pipelines yet" state in the dialogs, the runner and queue checks, the hard switch behaviour, `stepsUsed`, Run again with a pipeline, Custom batches and watches, removal of Production's own stage routes and inline settings.

Each plan leaves the app working. After plan 1 nothing visible changes; after plan 2 the user can build pipelines that Production does not use yet; plan 3 connects them.

## Left to the builder

Table and column names, route names, the file layout inside `pipeline/`, how the web drags to reorder stages, the wording of messages beyond those quoted here, and fixtures.

## Open for later

Pipeline versions, a "dry run" of a pipeline against a sample folder (needs a way for Production to offer it), telling Production directly when a pipeline changes so the board updates at once, and deleting batches (which also frees used pipelines to be deleted).
