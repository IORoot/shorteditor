# Render size limit, visible size, per-stage details, and kept output

Status: ready-for-agent. Drafted as a GitHub issue body for IORoot/shorteditor (label `ready-for-agent`). `gh` is not installed on this machine, so it was not posted.

## Problem Statement

A card failed in "Post-iz" with a Cloudflare 413 on upload. While looking into it, four problems showed up:

1. I cannot see how big the rendered video is without opening the collapsed "Stage details" accordion.
2. "Stage details" is one big accordion for the whole pipeline, not one per stage with only that stage's details.
3. After the failure the rendered video was nowhere on disk. Any failed, blocked, stopped or paused pass deletes its whole result folder, so the expensive render is lost and cannot be inspected.
4. The Render stage's "Max file size" (default 150 MB) is not enforced. It only sets a bitrate target for one encode and the real size is never checked, so the file can come out over the limit and nothing says so.

## Solution

- Show the rendered size on the Render stage box, in its own details, and on the card in the batch board.
- Give each stage box its own details toggle. Opening it shows a full-width panel under the stage row with only that stage's details.
- Keep a pass's output folder when the pass fails, is blocked, stopped or paused. It is removed only when I delete the card or batch, or press a new "Clear output" button.
- Make the Render stage enforce its limit: check the real size after encoding; if over, re-encode once at a lower bitrate; if still over, fail the stage with the sizes. Tell me when it re-rendered.

The 413 itself is a Cloudflare request-size cap in front of Postiz (the user will raise it). Postiz's own limit is 150 MB, so the render default stays 150 MB and Post-iz gets no new size check.

## User Stories

1. As an editor, I want to see the rendered file size on the Render stage box, so that I know whether it will fit before it is posted.
2. As an editor, I want the rendered size shown in the Render stage's details, so that I can read it with length, picture and frame rate.
3. As an editor, I want the rendered size shown on the card in the batch board, so that I can spot large renders without opening a card.
4. As an editor, I want each stage box to have its own details toggle, so that I open only the stage I care about.
5. As an editor, I want opening a stage's details to show a full-width panel under the stage row, so that long clip lists stay readable.
6. As an editor, I want that panel to show only the chosen stage's details, so that I am not scrolling through every stage.
7. As an editor, I want stages with no details to have no toggle, so that I am not offered empty panels.
8. As an editor, I want the open toggle and its stage box visibly linked, so that I can tell which stage the panel belongs to.
9. As an editor, I want the Render stage to check the real size after encoding, so that the "Max file size" setting is actually a limit.
10. As an editor, I want an over-limit render to be re-encoded once at a lower bitrate scaled by the overshoot, so that it usually fits without my help.
11. As an editor, I want the stage to fail with the rendered size and the limit (for example "Rendered 163 MB, over the 150 MB limit") when the second attempt also misses, so that I know what to change.
12. As an editor, I want a log line when a re-render happens because of size, so that the console explains the extra time.
13. As an editor, I want a note on the Render stage box ("Re-rendered once to fit the limit"), so that I see it without opening the console.
14. As an editor, I want the number of render attempts in the stage details, so that I can see how many encodes it took.
15. As an editor, I want an empty "Max file size" to still mean no limit and no re-render, so that existing settings keep working.
16. As an editor, I want the rendered video to stay on disk when a later stage (such as Post-iz) fails, so that I can open it and check it.
17. As an editor, I want the output folder kept when a pass is blocked waiting for me, so that a manual approval does not delete the render.
18. As an editor, I want the output folder kept when I stop or pause a card, so that stopping is not destructive.
19. As an editor, I want output deleted only when I delete the card or batch, or press "Clear output", so that nothing disappears unless I said so.
20. As an editor, I want a "Clear output" button on a failed or finished card, so that I can free disk space without deleting the card.
21. As an editor, I want "Clear output" to say what it will delete, so that I do not clear the wrong folder.
22. As an editor, I want re-running a pass to reuse the same `pass-N` folder and replace its files, so that old and new renders do not pile up.
23. As an editor, I want re-running to stop refusing with "already holds files" for its own kept folder, so that retry works after a failure.
24. As an editor, I want a retry after a Post-iz failure to start again from the first stage, so that behaviour is simple and predictable (no mid-pipeline resume).
25. As an editor, I want the card to show where the kept output folder is, so that I can find the file in the output root.
26. As an editor, I want a stage that crashes half way to leave no half-written file counted as a finished result, so that a kept folder never looks complete when it is not.
27. As an editor, I want deleting a batch to clear the output of all its cards, so that no orphaned folders remain.

## Implementation Decisions

- **Render stage**: after the encode, read the real file size. If a size limit is set and the file is over it, compute a lower bitrate by scaling the first bitrate by limit / actual size (with the existing safety factor) and encode once more. Fail with a stage error that names both sizes if the second file is still over. A limit that is too small for the length keeps its existing error.
- The render stage reports its attempt count in the details it records, and logs the re-render line. With no limit set, behaviour is unchanged.
- **Stage details**: the recorded details for a video stage already include size, length, picture and frame rate; add attempts for Render. Stage details stay a per-stage field, as now.
- **Runner**: stop discarding the result folder on failure, blocked, stopped or paused. A discarded-on-change case (the pass was edited while it ran) stays discarded, since its result is not valid. Only a stage's own partial files are cleaned up. The work folder is still removed every time.
- **Re-run guard**: the "already holds files" check is replaced by clearing and reusing the same `pass-N` folder when a pass is re-run. The refusal remains only for a folder that does not belong to this pass.
- **New action**: "Clear output" for a card, as a server action with a UI button on failed and finished cards. It removes the card's `pass-N` folder inside the output root only, through the existing safe-removal helper. Deleting a card or batch also clears its output.
- **Web**: the stage row gets a per-stage toggle and a single full-width details panel below the row for the open stage, replacing the one "Stage details" accordion. The stage box summary shows the size for a finished render. The batch board card shows the rendered size. The re-render note shows on the Render stage box.
- **Settings and limits**: default max file size stays 150 MB (decimal megabytes). No new Post-iz check or setting.
- No file paths or code are recorded here on purpose.

## Testing Decisions

- A good test checks behaviour you can observe (files on disk, saved pass state, what the screen shows), not how the code does it.
- **Seam 1, pass runner end to end** (prior art: the end-to-end, queue and output-path tests, with the fake Postiz): output kept after failure, blocked, stop and pause; re-run replaces the same folder; Clear output and card delete remove only that folder; the stage details saved on the pass include size and attempts.
- **Seam 2, Render stage run** (prior art: the render output tests, including the "stays under the limit exactly" case): a render over the limit triggers one lower-bitrate re-encode; a second miss fails with both sizes; no limit means no re-render; the attempt count and log line are present.
- **Web component tests** (prior art: the stage details, pass flow and review route tests): size on the stage box and card; the per-stage toggle and panel show only that stage; stages without details have no toggle; the Clear output button; the re-render note.
- No new seams. Do not run the full web suite on every change: run only the relevant tests, and the full suite only when asked.

## Out of Scope

- A size check or a new limit setting in Post-iz, and raising the Cloudflare request cap (the user is doing that).
- Resuming a re-run from the render stage without re-encoding (a retry runs from the first stage).
- Two-pass encoding or other encoder changes beyond the single lower-bitrate retry.
- Automatic clean-up of old kept output by age or disk use.

## Further Notes

- The failure reported was `Postiz said 413 for /public/v1/upload` from Cloudflare, whose default request-body cap is 100 MB on Free and Pro plans.
- Today's cause of the missing file: the runner deletes the pass result folder on any non-successful end, so the Post-iz failure removed the render along with it. The path would have been under the output root, in the batch folder, in `pass-N`.
- Decimal megabytes (1 MB = 1,000,000 bytes) are used for the limit and for the displayed size.
