# Stage separation design

## Intent

Collection, production and output will each be built and changed separately. A change to one stage should not be able to break another. The collection stage is working now and must stay that way while production is built.

## Pipeline

Collection finishes and leaves folders on disk. Production reads those folders as its input, and writes its own folders. The Output section reads production's folders. Stages hand off through folders and a small description of them, not through shared code.

## Goals

- Each stage lives in its own folder and owns its screens, hooks, logic and tests.
- Stages never import from each other. A wrong import fails the build.
- Code used by more than one stage lives in one shared place.
- The stage handoff is written down as a contract, so a stage can change without breaking the next one.

## Non-goals

- No separate packages or monorepo workspaces.
- No event bus or message queue.
- No behavior changes. Each step is a move or a rule, verified by the existing tests.

## Approaches

1. **Folders with architecture tests, then shared code, then contracts (chosen).** Each step is small and testable. Protection comes from the architecture tests, so nobody has to remember the rule.
2. **Separate packages per stage.** Strongest separation, but adds build setup and more moving parts than a single-user local app needs.
3. **Folders only, no enforcement.** Cheapest, but protects nothing once work is under time pressure.
4. **Contracts first.** Defines the handoff before the code is moved. Reasonable, but it designs an interface for a stage that does not exist yet.

Chosen: option 1, with the order changed as described below.

## Order of work

1. **Folders.** Move the web files into `collection/`, `production/`, `output/` and `shared/`. Move the Python server modules into matching packages. Pure moves: no logic changes, all tests pass before and after.
2. **Shared code.** Move code used by more than one stage into `shared/`: the UI kit, the API client, the shared types, the hooks. Decide each file's home by who imports it.
3. **Architecture tests.** Add tests (not ESLint, to avoid a new dependency) that fail on any import from one stage folder into another, and any import from a stage into `app/`. It must come after step 2. The shared types file is imported everywhere, so the rule would fail on it if step 2 had not moved it first.
4. **Contracts.** Write down the handoff types in `shared/contracts`: the folders a stage produced, the clip list, and the run that made them. Stages import only these types across the boundary.

Order change from the request: the lint rule moves after shared code, not before it. Otherwise it would fail as soon as it was switched on.

## Constraints

- The app must behave exactly the same after each step.
- Keep new files small and focused.
- No new dependencies.

## Left to the builder (my calls)

- Server stage packages are mirrored from the web folders, using the same names.
- The import rule is enforced by architecture tests, not ESLint, to avoid a new dependency.
- Each step is committed separately, once its tests pass.

## Open question

Where the editor's Output section lives: it stays with the collector for now, unless you decide it moves to `output/` during step 1.
