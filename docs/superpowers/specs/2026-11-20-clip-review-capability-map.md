# Capability Map: Clip review and trimming

Status: approved 2026-11-20 (map and four defaults)

| Module id | Responsibility | Depends on |
|---|---|---|
| `stills` | Server endpoint that returns a JPEG of one frame of a card's clip, cached. Used for clip tiles and for the first frame of each cut section | — |
| `pipeline-visual` | Restyle the stage boxes on the card page to match node `Fvtvp` | — |
| `trim-storage` | Stores each clip's user trims per card, applies them before Join, and restores the AI result on reset | — |
| `clip-library` | The Clips panel: image tiles and filters All, Action found, No action, Edited by me | `stills` |
| `trim-editor` | Right sidebar for the selected clip: its timeline with add, delete and drag of trims, its parts with start and end, filters AI parts / My trims / Whole clip, Save trims, Reset to AI | `stills`, `trim-storage` |

Build order: `stills`, `pipeline-visual` and `trim-storage` can start together. Then `clip-library`. Then `trim-editor`.

## Decisions taken with this map

1. Saving trims stores them. The next "Run this card again" renders with them. Saving never starts a render.
2. A new trim is set from the video player's current position, with both times editable by typing.
3. "Edited by me" and "My trims" are the same: a clip with at least one user trim.
4. "Whole clip" is a list filter. A whole clip becomes a trim with the same start and end controls.
5. On the timeline, dragging across empty space adds a trim. Select and Delete removes one. Dragging a trim's edge changes its start or end.
6. Deleting an AI part removes it from the render. Reset to AI restores it. Deleting one of your own trims removes it for good.

## Specs

- `2026-11-20-clip-review-stills.md`
- `2026-11-20-clip-review-pipeline-visual.md`
- `2026-11-20-clip-review-trim-storage.md`
- `clip-library` and `trim-editor` follow after the first wave is approved.
