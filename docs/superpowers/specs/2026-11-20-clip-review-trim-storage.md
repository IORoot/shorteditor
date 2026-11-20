# Spec: Trim storage (`trim-storage`) — V1

Status: draft for approval
Module of: `2026-11-20-clip-review-capability-map.md`

## Objective

The user can keep their own trims for each clip of a card. Saved trims are used by the next render of that card. Reset to AI removes them and the render goes back to the AI's parts.

Success for the user: after saving trims on a clip and clicking "Run this card again", the output contains exactly the saved parts, and after Reset to AI it contains the AI's parts again.

## Tech Stack

Python 3 FastAPI server, SQLite (existing `production_cards.overrides` JSON column), the existing stage runner and `PiecesData`/`Piece` models. No new dependencies, no schema migration.

## Commands

- Server test: `cd app/server && pytest tests/production -q`
- Dev: `cd app/server && <existing dev command>`

## Project Structure

- `app/server/collector_server/production/stages/apply_trims.py` (new): the stage.
- `app/server/collector_server/production/stage_api.py` or the stage registry (`registry.py`): register the stage (one line, following how `review_by_hand` is registered).
- `app/server/collector_server/production/service.py`: `save_trims` and `reset_trims` methods, plus the route wiring in `api.py`.
- `app/server/tests/production/test_apply_trims.py` (new), `test_trims_api.py` (new).

## Interfaces

Storage: a card's trims live in its existing `overrides` JSON under the stage key `apply_trims`:

```json
{ "apply_trims": { "trims": { "<clip name>": [ { "start": 3.2, "end": 7.8 } ] } } }
```

- A clip name with no entry, or no `apply_trims` key, means that clip uses the AI result.
- Each trim has `0 <= start < end <= clip length`. Trims for one clip do not overlap; they are sorted by start.

Stage: `apply_trims` sits between the last piece-producing stage and `join_pieces` in the pipeline (`position = "any"`, `transitions = {"pieces": "pieces"}`).
- For each clip in the incoming `PiecesData`: if it has trims, its pieces are replaced by one `Piece` per trim; otherwise its pieces are kept.
- Trims are applied in clip time, so a trim on a clip the AI did not keep still applies only if that clip is in the incoming data. Such a trim is logged as skipped.

API:
- `PUT /api/production/passes/{pass_id}/trims` with body `{ "clip": "<name>", "trims": [{ "start": n, "end": n }] }`. Replaces that clip's trims. An empty list removes them. Returns the updated pass. Errors: 400 when a trim is out of range or overlaps another, 404 for an unknown clip, 409 when the pass is running.
- `DELETE /api/production/passes/{pass_id}/trims/{clip}` removes one clip's trims (Reset to AI for that clip). Returns the updated pass. Same 409 rule.

Consumes: `PiecesData`, `Piece` (`app/server/collector_server/production/pieces.py`); `production_cards.overrides`.

## Code Style

```python
class ApplyTrims:
    key = "apply_trims"
    title = "Apply my trims"
    position = "any"
    transitions = {"pieces": "pieces"}
    def run(self, data: PiecesData, settings: TrimSettings, ctx: StageContext) -> PiecesData: ...
```

Follow `review_by_hand.py` for the shape: a settings model, a `STAGE` instance at the bottom.

## Testing Strategy

- Unit: `apply_trims` with no trims returns the input unchanged; with one trim on a clip replaces that clip's pieces; a trim outside the clip is rejected at save time; a trim on a clip not in the data is logged and skipped.
- API: PUT then GET shows the trims; PUT with an overlap returns 400; PUT while running returns 409; DELETE restores the AI result (the stage returns the input unchanged).
- Integration (one test): a card with one clip, saved trim, run through `apply_trims` and `join_pieces` with ffmpeg stubbed, makes a join of exactly the trimmed lengths.

## Boundaries

- Always: validate trim times against the clip length on the server; never trust the client's numbers.
- Ask first: changing the order of stages in the default pipeline.
- Never: edit detect results (`PiecesData` from `detect_action`) in storage. Trims sit on top of the AI result, so Reset to AI is always possible.

## Success Criteria

- Saved trims appear in the next run's render: total output length equals the sum of trim lengths.
- Reset to AI returns the render to the AI parts with no other change.
- Trims are rejected when out of range or overlapping, with a message naming the clip.
- A running pass rejects edits with 409.
- All production tests pass.

## Out of Scope (Deferred)

- Live preview of trims before a render. Requires the stills and a player, deferred to `trim-editor`.
- Automatic re-render on save. Decision 1 keeps saving separate from rendering.
- Undo history. Reset to AI is the only way back in V1.

## Open Questions

- None. Storage and rules follow decisions 1, 5 and 6 of the capability map.

## Build notes (added on build)

- Errors: bad or overlapping trims are 422 with the clip's name in the message (not 400). A running card is 409.
- Trims are keyed by file name, like the stills, with the same two-clips-one-name limit.
- Apply my trims is inserted by the runner before Join when a pass's pipeline does not list it, so every pass applies saved trims and existing pipelines need no change. It shows as an extra node in the card's flow when it runs, so a card with it has one more stage than its pipeline lists.
- Files: `stages/apply_trims.py`, `runner.with_trims_step`, `builtin.LIBRARY_ORDER`, `ProductionService.save_trims` / `reset_trims`, the PUT and DELETE routes, `models.TrimBody` / `TrimsSave`.
- Tests that encoded the old stage list were updated: built-in order, stage count (9 in the library) and the end-to-end done count (6).
