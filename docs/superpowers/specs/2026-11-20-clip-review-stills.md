# Spec: Clip stills (`stills`) — V1

Status: draft for approval
Module of: `2026-11-20-clip-review-capability-map.md`

## Objective

The card page shows each clip and each cut section as a picture, so the user can see what is in the clip without playing it. The clip tiles show the clip's frame at the start of its first kept part, and each blue box in the timeline shows the frame at the box's start. One endpoint serves both.

Success for the user: a clip tile and a blue box show a picture of the moment they stand for, and the picture appears without the user waiting for a video to load.

## Tech Stack

Existing: Python 3 FastAPI server (`app/server`), ffmpeg via the existing `_binary("ffmpeg")` helper, React 19 web (`app/web`). No new dependencies.

## Commands

- Server test: `cd app/server && pytest tests/production -q`
- Web test (touched files only): `cd app/web && npx vitest run src/production/lib src/production/features/review`
- Dev: `cd app/server && <existing dev command>` and `cd app/web && npm run dev`

## Project Structure

- `app/server/collector_server/production/stills.py` (new): frame extraction and cache path.
- `app/server/collector_server/production/api.py`: one new route.
- `app/server/collector_server/production/service.py`: resolves a clip and time for a pass, calls `stills.py`.
- `app/server/tests/production/test_stills.py` (new).
- `app/web/src/production/lib/api.ts`: `stillUrl(passId, clip, at)` builder.

## Interfaces

Produces:
- `GET /api/production/passes/{pass_id}/still?clip={name}&at={seconds}` returns `image/jpeg`.
  - `clip` is the clip's file name as it appears in the pass's scan stage details. The client never sends a path.
  - `at` is a number of seconds into the clip, `0 <= at < clip_duration`. Values outside the range are a 400.
  - Unknown pass or clip name is a 404.
- Cache file: `<output_root>/.thumbnails/still-<pass_id>-<sha1(clip)>-<at in milliseconds>.jpg`.

Consumes: the pass's scan stage details (`ClipDetail` list), which give the clip names and their lengths.

## Code Style

```python
def still_path(output_root: str, pass_id: int, clip: str, at: float) -> str:
    """The cache file for one frame. Same inputs always give the same file."""
```

Keep the same error and `guarded` pattern as `card_thumbnail` in `api.py`.

## Testing Strategy

- Server unit tests with a real short clip generated in the test (ffmpeg `testsrc`), checking the output is a JPEG and the cache file is reused on a second call.
- Server tests for the 400 and 404 cases.
- Web: `stillUrl` builds the URL with both parameters encoded.
- No browser test in this module.

## Boundaries

- Always: decode the frame at `at` with `-ss` before `-i` so seeking is fast, and scale the width to 320 px.
- Ask first: changing the thumbnail width used by the existing card and batch thumbnails.
- Never: accept a file path from the client; let a request read a file outside the pass's input folder.

## Success Criteria

- `GET .../still?clip=a.mp4&at=2.5` returns a JPEG for a valid clip.
- A second identical request does not run ffmpeg again (checked by the cache file's modification time not changing).
- A `clip` name not in the pass's scan result returns 404.
- An `at` at or beyond the clip length returns 400.
- Existing card and batch thumbnail tests still pass.

## Out of Scope (Deferred)

- Stills at a chosen size or quality setting. Fixed at 320 px wide.
- Animated previews (hover-scrub). Would need many frames per clip.

## Open Questions

- None. The cache folder follows the existing `.thumbnails` convention.

## Build notes (added on build)

- Errors: a time outside the clip is 422 (the app maps invalid input to 422, not 400). An unknown clip is 404.
- The clip's full path is found by walking the card's folder for its file name, because stage details store only file names. Two clips with the same file name in one card are not supported in V1: the first one in scan order is used.
- Files: `production/stills.py`, `ProductionService.still_path`, the `/passes/{id}/still` route, `lib/api.ts` `stillUrl`.
