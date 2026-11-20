# Spec: Pipeline stage boxes (`pipeline-visual`) — V1

Status: draft for approval
Module of: `2026-11-20-clip-review-capability-map.md`
Design: node `Fvtvp`, the "Node Scan folder" / "Node Detect action" frames inside "Flow Card" (`FpwSm`).

## Objective

The stage boxes on the card page match the design. The current row of boxes is plain; the design shows each stage as a card with its name in bold, a status chip, and a short line of detail, with the running stage highlighted and chevrons between them.

Success for the user: the row looks like the design at 1440 px and still reads at 390 px.

## Tech Stack

React 19, Tailwind design tokens (`bg-fill-2`, `bg-accent-soft`, `border-accent`, `text-text-2`, `bg-surface`). No new dependencies.

## Commands

- Web test: `cd app/web && npx vitest run src/production/features/review/PassFlow`
- Dev: `cd app/web && npm run dev`, then the card page at `#/production/cards/<pass id>`.

## Project Structure

- `app/web/src/production/features/review/PassFlow.tsx`: the only file changed.
- `app/web/src/production/features/review/PassFlow.test.tsx`: keep existing cases, add the visual states.

## Interfaces

No interface change. `PassFlow` keeps its props `{ card, pass, now }`.

## Code Style

The stage box follows the design's "Node" frame: `rounded-[14px]`, padding `10px 12px`, `gap-1.5`. Running uses `border-accent bg-accent-soft`; other stages use `bg-fill-2` with no border.

## Testing Strategy

- Keep the four existing `PassFlow` cases passing.
- Add: a running stage has `aria-current="step"` and the accent classes; a done stage shows the "Done" chip and its times; a waiting stage shows "Not started".
- Browser check at 1440 px and 390 px against node `Fvtvp`.

## Boundaries

- Always: keep `aria-label="Stages"` on the list and `aria-current="step"` on the running stage. Keep the horizontal scroll inside the flow card, not on the page.
- Ask first: adding stage icons (the design has icons; they need a mapping from stage key to icon).
- Never: change the stage data or the "Stage details" disclosure behaviour.

## Success Criteria

- The row of stage cards matches the design's structure: bold name, status chip, time line, chevrons between.
- At 390 px the page does not scroll sideways because of the flow card.
- The existing tests and the new visual tests pass.

## Out of Scope (Deferred)

- Stage icons. The design has them. They need a stage-key-to-icon table; deferred to keep this module to layout.
- Clicking a stage to jump to its log. Not in the design.

## Open Questions

- Stage icons: include them in this module, or defer? Recommendation: defer (see Out of Scope).

## Build notes (added on build)

- Restyled in `PassFlow.tsx`: the stage box uses the design's node frame, the running stage is accent-bordered, and the row scrolls inside the flow card at phone width.
- The design's stage icons are still missing, as the spec deferred. This is the main visible difference from node `Fvtvp` left after this module.
