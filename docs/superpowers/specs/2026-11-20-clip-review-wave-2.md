# Spec: Clip library, trim editor and first-frame pictures — wave 2

Status: built, awaiting review
Modules of: `2026-11-20-clip-review-capability-map.md` (`clip-library`, `trim-editor`), plus the first-frame pictures for the render timeline, which were requested after the map was approved.

## Objective

- **Clip library:** the Clips panel shows each clip as a picture with its tag and length, filtered by All, Action found, No action, or Edited by me. Opening a clip puts its editor in the right sidebar.
- **Trim editor:** the sidebar shows the selected clip's video, its own timeline, its parts with typed start and end, filters AI parts / My trims / Whole clip, Save trims, and Reset to AI. On the timeline you add a part by dragging across empty space, move a part's start or end by dragging its ends, and remove a selected part with Delete. Start and end can also be set from the video's playhead.
- **Render timeline:** each blue box shows the picture of its first frame.

## Decisions taken (from the capability map)

- Saving stores the trims; the next run renders with them. Saving never starts a render.
- Saving a list equal to the AI's parts removes the clip's trims, so "My trims" only ever holds real edits.
- "Edited by me" is a clip with at least one trim of its own.
- "Whole clip" is one part covering the clip. Deleting an AI part removes it from the render; Reset to AI brings it back.

## Interfaces

Server:
- `GET /api/production/passes/{id}/clip?clip=` — the clip's video file, served with byte ranges so the player can seek. Only clips the scan found; 404 otherwise.
- `PUT /api/production/passes/{id}/trims` and `DELETE /api/production/passes/{id}/trims/{clip}` — from wave 1.

Web:
- `lib/trims.ts`: `dragEdge`, `addRange`, `removeRange`, `sameRanges`, `isWhole`, `sortRanges`, `seconds`, `MIN_LENGTH` (0.1 s).
- `lib/clips.ts`: `clipRows(stages, overrides)` → one row per clip (length, AI parts, own trims, still time, found state); `filterClips(rows, filter)`.
- `features/review/ClipLibrary.tsx`, `ClipEditor.tsx`, `TrimTimeline.tsx`; `RenderTimeline` takes `passId`.
- `ReviewPage` takes an `editor` slot that replaces the output panel in the sidebar while a clip is open.

## Testing

- Server: `test_clip_media.py` (serving, range requests, refusal of other names); full production suite passes with `--full` (538).
- Web: `trims.test.ts`, `clips.test.ts`, `ClipLibrary.test.tsx`, `ClipEditor.test.tsx` (including the timeline's selection and Delete), `RenderTimeline.test.tsx` (picture per box), `ReviewRoute.test.tsx` (open a clip, go back).
- Not tested in jsdom: the pointer drag itself. Its rules are tested as pure functions in `trims.test.ts`. It needs a browser check.

## Known limits

- Clips are matched by file name, as in wave 1.
- The pointer drag was not exercised in a browser in this session.
- The sidebar shows the editor instead of the output panel while a clip is open. Approve stays on the output panel; use "Back to output" first.
- Stage icons remain deferred.
