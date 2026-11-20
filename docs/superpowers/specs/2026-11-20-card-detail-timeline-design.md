# Card detail page: breadcrumbs and render timeline

Status: draft for approval
Date: 2026-11-20
Design: "Card Detail – Layout D2" frame in `designs/video-editor.pen` (node `Fvtvp`), with the render timeline in node `ZLJDZ`. The design is a copy of Layout D2 (`b6xaF`) with the changes below. The timeline numbers are samples.

## Intent

A card is one folder of source videos. The card page is where the user checks what the render will contain before approving it. Today it shows the pipeline and the clip list but not where the final render's parts come from. The user needs to see every source video in order, with the parts the AI kept highlighted, so they can judge the render at a glance. Breadcrumbs let them see where they are in Production → batch → card, and move back up without the Back button.

## Goals

- Breadcrumbs on the Production pages: Production › batch name › card folder name. Each crumb except the last is a link.
- The card page follows Layout D2: the batch header with the card folder name as title, the pipeline flow card, the clip editor, and the console.
- A full-width render timeline below the pipeline flow card, showing:
  - every source video of the card, back to back, in the order the Join stage uses;
  - each video at its true length, scaled to fill the card width;
  - each video's name above its block, and its start and end times under the block;
  - the detected action pieces as blue boxes inside their video, at their real start and end times, with padding and merging applied (the parts the render uses);
  - videos with no action pieces as a grey block with the name, so the whole source stays visible.
- Totals in the timeline header: source total → rendered total (sum of the blue boxes).
- Hovering a blue box shows its action label and its start and end time.

## Non-goals

- No change to how pieces are detected, padded or merged. The timeline reads the stored result.
- No change to the review, approve or re-run behaviour of a card.
- No manual trim editing from the timeline in this change. The Clip Editor stays as it is.
- Breadcrumbs on pages other than the card page and the batch board are not covered here. They use the same component, so adding them later is small.

## Anti-goals

- The timeline must never show a blue box that the render does not use. If the stored result and the render disagree, the timeline follows the stored result and a test pins it.
- A video must never be missing from the timeline because it had no pieces.

## Constraints

- Web: React 19, Tailwind design tokens (`bg-fill-2`, `bg-fill-3`, `text-text-2`, `bg-accent-soft`, `border-line`). Hash routes through `cardHash`, `batchHash` and `goTo`. Tests use Vitest and Testing Library, with `full` tags for the slow suites.
- Server: the detect stage stores pieces per source video (`PiecesData`, `Piece` with `clip`, `clipDuration`, `start`, `end`) in `app/server/collector_server/production/pieces.py`. The timeline reads the card's stage data. It needs the source duration of each video, which is `clipDuration` on its pieces, and a video with no pieces must still be listed from the card's input clips.
- A blue box is never narrower than 4 px, so a short piece stays visible. Its exact time is in the hover label.
- Scale: the timeline width is the card width. Blocks use `fill_container` for the row and the box widths are computed from seconds at render time.
- Layout must hold at phone width without horizontal page scroll; the timeline strip may scroll inside its own frame.

## Approaches

**A. Proportional strip, full width (chosen).** Each video's width is its length divided by the total length, times the available width. Blue boxes are positioned by seconds inside their video. It shows the whole card at once and matches the render's real timing.
- Short videos and pieces get thin. The 4 px minimum and the hover label cover this.

**B. Fixed scale with horizontal scrolling.** One pixel per second, inside a scrolling frame. Exact at any length, but a 15-minute card needs a long scroll and the overview is lost.

**C. One row per video.** Each video is its own line with its pieces. Easy to read for a few videos, but the back-to-back order and total length are hard to see.

Chosen: A. The user picked full-width scale and labels above the blocks in the design review.

## Design

### Breadcrumbs

- A `Breadcrumbs` row is the first child of the page's main column. It replaces the Back button in the batch header.
- Crumbs: `Production` (link to the Production list), the batch name (link to the batch board), the card folder name (current page, not a link).
- Separator: a chevron-right icon, `text-text-3`.

### Card header

- Title: the card folder name. Subtitle: `path · N clips · stage kinds · where it runs · pass`.
- Thumbnail: the card's first clip, as the batch cards already show.

### Render timeline

- A `Render Timeline` card, full width, below the pipeline flow card and above the clip editor.
- Header: `Final render timeline` on the left; `N videos · source total → rendered total` on the right.
- Strip: one column per source video, in the Join order, gap 2 px. Each column has the video name above, then a block 64 px tall with `bg-fill-2`, rounded 8 px, clipped.
- Blue boxes: `bg-accent-soft` with a 2 px `accent` border, rounded 6 px, full block height, placed at `(start / length) * width` and sized `((end - start) / length) * width`, with a 4 px minimum.
- Ruler: under the strip, each video's start `00:00` and end time, aligned to its block.
- Legend: `Action clip in render` and `Not used`.
- Empty state: no source videos → the card does not show the timeline. No pieces yet (detection not run) → grey blocks, no blue boxes.

## Plan

### Task 1: Breadcrumb component

**Files:** Create `app/web/src/production/features/shared/Breadcrumbs.tsx`; Test `app/web/src/production/features/shared/Breadcrumbs.test.tsx`.

**Interfaces:** Produces `Breadcrumbs({ crumbs: { label: string; onOpen?: () => void }[] })`. The last crumb is the current page and has no `onOpen`.

- Test: renders the crumbs in order; crumbs with `onOpen` are buttons; the last crumb is text with `aria-current="page"`.
- Implement with a `nav` element labelled "Breadcrumb".

### Task 2: Use breadcrumbs on the card page and the batch board

**Files:** Modify `app/web/src/production/features/review/ReviewRoute.tsx` (remove the "Back to Production" button, add the crumbs); Modify `app/web/src/production/features/batches/BatchBoardPage.tsx` (add the crumbs, batch name from the batch).

**Interfaces:** Consumes `Breadcrumbs` from Task 1. Calls `onBack(null)` for Production and `onBack(batchId)` for the batch.

- Test: the card page shows `Production`, the batch name and the card folder name; clicking `Production` calls `onBack(null)`.

### Task 3: Timeline layout function

**Files:** Create `app/web/src/production/lib/timeline.ts`; Test `app/web/src/production/lib/timeline.test.ts`.

**Interfaces:** Produces `timelineLayout(videos, pieces, width)` returning, per video, `{ name, widthPx, startLabel, endLabel, blocks: { leftPx, widthPx, label, start, end }[] }`. Consumes `videos: { name, length }[]` (in Join order) and `pieces: { clip, start, end, action }[]`.

- Test: widths sum to `width` minus the gaps; a piece's `leftPx + widthPx` stays inside its video; a piece shorter than 4 px is drawn at 4 px; a video with no pieces returns an empty `blocks` list; piece times outside the video are clamped (pins the anti-goal).
- Test: the sample from the design (three videos of 300, 200 and 280 seconds, two pieces each) lays out to the widths in the design.

### Task 4: Render timeline component

**Files:** Create `app/web/src/production/features/review/RenderTimeline.tsx`; Test `app/web/src/production/features/review/RenderTimeline.test.tsx`.

**Interfaces:** Consumes `timelineLayout` from Task 3. Props: `{ videos, pieces, totals }`.

- Test: each video name is shown above its block; start and end labels are shown; each blue box has a hover label with its action and times; a card with no videos renders no timeline.

### Task 5: Wire the timeline into the card page

**Files:** Modify `app/web/src/production/features/review/PassDetail.tsx` (place `RenderTimeline` below the pipeline flow card); Test `app/web/src/production/features/review/review.test.tsx` (add a case).

**Interfaces:** Consumes the card's stage data and its input clips from the existing card detail response. If the response does not carry each video's length, Task 6 adds it.

- Test: a card with two videos and three pieces shows two video names and three blue boxes.

### Task 6: Server: source lengths on the card detail

**Files:** Modify `app/server/collector_server/production/service.py` (the card detail includes each source video's name and length); Test `app/server/tests/production/test_service.py` (add a case).

- Test: a card with two source clips returns both, in Join order, with their lengths, even when one has no pieces.

### Task 7: Card header layout and breadcrumbs check

**Files:** Modify `app/web/src/production/features/review/ReviewPage.tsx` (header uses the card folder name as title).

- Test: the title is the card folder name, not the batch name.

### Verification

- Run the new unit tests and the touched suites only: `npx vitest run src/production/lib/timeline src/production/features/shared src/production/features/review` in `app/web`, and `pytest tests/production/test_service.py` in `app/server`.
- Run the full web suite only when the user asks for it.
- Check the card page in the browser at 1440 px and 390 px wide.

## What is left to the builder

- Exact crumb label truncation when the folder name is long.
- Whether the timeline header totals use the same rounding as the card list.

## Calls made in this spec (check these)

1. Breadcrumbs are built now for the card page and the batch board only.
2. The 4 px minimum box width.
3. Hover shows the action label; no click action on the timeline in this change.
4. Videos with no pieces show grey, and before detection runs no boxes show.

## Build notes (added on build)

- **Task 6 dropped (no server change).** The stage details already carry what the timeline needs. The `order_clips` stage (or `scan_folder` when order-clips did not run before detection) lists every whole video with its full length, in the Join order. The `detect_action` stage (or `limit_length`, when it ran after detection) lists the kept pieces in source time. The web maps these in `lib/timelineSource.ts`.
- **Hover label shows times, not the action name.** The stage details do not store the AI's action label, so a blue box's hover shows its start and end times (for example `00:30–01:30`).
- **Placement.** The timeline sits full width under the two-column grid on the card page, not inside the pipeline column.
- **Card title.** The card page's title and middle crumb use the card's folder name. `BatchCard.name` is the batch's name, so the page no longer shows it as the title.
- **Layout scale.** Video widths and piece positions are percentages of the strip. Pieces have a 4 px minimum width set in CSS.
- **Batch board.** Its header uses the crumbs `Production › batch name`; the title below it still shows the batch name.
- **Files.** `features/shared/Breadcrumbs.tsx`, `lib/timeline.ts`, `lib/timelineSource.ts`, `features/review/RenderTimeline.tsx`, plus changes to `ReviewPage.tsx`, `ReviewRoute.tsx` and `BatchBoardPage.tsx`, and tests for each.
- **Page rebuilt to the design (second pass).** The card page now follows node `Fvtvp`: breadcrumbs, a header with the folder name, thumbnail, status and actions, the pipeline as a row of stage cards, the render timeline, a clips card with the output player on the right, and the pipeline and FFmpeg logs side by side at the bottom. Live reads are in `features/review/usePassLive.ts`. Not built, because the app has no data or feature for them: the clip editor and its segment list, the "Edit pipeline" button, and clip thumbnails (the clips card shows a tag and duration instead).
