I reproduced the blank Edit screen in the browser. Your backend (port 8000) is still the old code, started at 13:17, and it sends no filters. The new Filters section crashed on that, which took the whole page down.

What I fixed

Old backend responses: the web app now fills in any missing filter settings. The Edit screen opens against your current backend, with Filters showing “No filters: every video file in the input folder is collected.” I confirmed this in the browser against your servers, and I did not press Save, so your data is untouched.
No more blank pages: if any screen crashes, you now get a “Something went wrong” message with the error text and a Reload button.
Saving to an old backend: it used to drop filters silently. It now shows an error: “The backend is out of date and did not save the filters. Restart the backend, then save again.”
You still need to restart your backend. Until then, filters can’t be saved, and Dry run, Run now and Undo return 404.

cd /Volumes/NasDrive02/Code/ldnpk-video-editor-v3/app/server && .venv/bin/uvicorn collector_server.main:app --port 8000
I haven’t touched that process, since it’s yours.

The web typecheck and build are clean, and 157 web and 200 server tests pass. Nothing is committed.

In the live preview on the filter edit page, I would like an animation where you have a grid and list of multiple files represented by squares. As I change the filters, the live preview will shade out the files that are not relevant and keep the ones that would be hit by that particular filter.

Have maybe 10 files in the live preview: a grid of 2 by 5, and each entry has the file name and the date/time on it. As I change the filter or add filter groups and add filters, you would have a live view of which ones of those files would actually get selected.

do the design first and wait for my review

Reading the existing Edit Collector design so the new filter grid matches it. Nothing is built or changed yet, and I’ll stop for your review once the design is in.

Building two reusable “Clip Tile” components (kept and filtered out) in the Components frame first, then the Filter preview card.

Components are in. Now the Filter preview card in the Light screen, above the existing Live preview.

The Filter preview design is ready for your review in designs/video-editor.pen. It’s on both Edit Collector screens (light and dark), and I haven’t written any app code.

Where it sits: a new “Filter preview” card at the top of the right column. The existing “Live preview” card moved down beneath it.

The card:

Grid: 2 columns by 5 rows, so 10 sample clips.
Tiles: each shows a film icon, the file name in mono, and the date and time (for example “Sat 14 Nov · 09:12”).
Collected clips: accent-tinted with an accent border and a check icon.
Filtered-out clips: greyed out and faded with a minus icon.
Count chip: shows how many are selected, for example “4 of 10”.
Legend: a “Collected / Filtered out” key at the bottom.
Mockup state: it shows a “Saturday mornings” style filter with 4 of 10 clips selected.

Components: the two tile styles are reusable components, “Clip Tile Kept” and “Clip Tile Dimmed”, in the Components frame.

How I plan to build it:

Real filter engine: the server will run the same filter engine as a real run, including groups, exclude rules and random selection. The preview can’t disagree with an actual run.
Sample clips: the 10 files are fixed samples with varied names, weekdays and times, so every rule type has something to hit.
Live updates: the grid will update as you edit, with a short delay while you type. Tiles will fade between collected and filtered-out.
Invalid rules: a half-finished rule, such as an empty regex, will show its error message instead of changing the grid.
Let me know if you want any layout or style changes before I build it.

The Filter preview design is in the Pen file for both Edit Collector screens (light and dark) and saved. No app code is written yet, since you asked to review the design first.
Approve the filter grid design?
could place the icon to the left of the filename and remove the top right icon for the selected ones. This will make the boxes shorter. Then add in 10 more, but with different filetypes, naming conventions, non-video files - md, css, js, etc... use hypens and spaces as well in the filenames. These should all help create the better filter.

The tiles in designs/video-editor.pen are shorter now, and the grid has 20 files. It’s in both the light and dark Edit Collector screens, saved, with no app code yet.

Tile changes:

Icon beside the name: the icon now sits to the left of the file name, and the top-right check and minus icons are gone.
Date line: the date and time sit underneath the name.
The 20 sample files:

Existing clips: the first 10 are the same video clips as before (GX, IMG, DJI and a screen recording).
New non-video files: notes.md, styles.css, app.js, beach-day.png, backup.zip and plan 2026.pdf, each with its own icon (text, code, image or archive).
New names with spaces and hyphens: IMG 2210.JPG, voice over.wav, my raw clip.mov, edit v2.mp4 and beach-day.png. .JPG is upper case on purpose, so case-insensitive matching gets tested.
Mockup state: a “Saturday morning videos” filter, shown as 6 of 20 selected.
In the app, long file names will be cut off with an ellipsis, and the full name will show on hover.

Let me know if you want changes, otherwise I’ll build it next.

The Filter preview card in the Pen design now has the shorter tiles and 20 sample files, in both light and dark. It's saved, and no app code is written yet.
Approve the updated design?
Actually, have the filter preview list all of the files from the input source folder. This way, it's actually a better representation of what the filters are going to do.

Have the file list, instead of a 2x10 grid, be a 1x20 or maybe 1x10 scrollable list. If it goes past 10 and there are like 100 files in the input folder, then list it, but have that filter preview box be scrollable rather than push the live preview box downwards.

I want the icon and file name on the left and the timestamp on the right, and list all of the files. Create the design first before letting me review it.

Five tests fail for the right reasons. Making the fixes now: the file: prefix on probe paths, shortened tail lines, and no dangling colon in the error message.

Task 4 is built and green; the review is running, and I’m waiting for it before committing.

Task 3 is committed on production-core. The first QA, performance and security gate turned up several real problems in the FFmpeg runner, and I fixed them test-first:

Dash-leading file names: a file named -version was read as an option, so the length check broke. Probe paths now get a file: prefix.
Dying logger: if the log callback raised an error, FFmpeg kept running with nobody reading it. The process is now stopped.
Unreadable length: a clip with an unreadable duration now gives a plain FFmpeg error instead of a crash.
Long output: error messages cut long output lines and no longer end in a stray colon.
The plan now says paths given to the runner must be absolute, and that the service must reject a non-absolute input folder or output root. I added that so the dash-name problem can’t come back through the API.

Task 4 is built: the Scan folder and Order clips stages. The full server suite passes with 319 tests. It is not committed yet because its code review is still running. The Scan stage:

skips clips that are too short or unreadable, and logs each one
fails with a plain message for a missing or empty folder
The Order stage sorts by capture time, created date, name, duration or a seeded shuffle.

I’ll commit after the review, then start Task 5 (Limit length and Join).


Background command completed
· grep -n "def duration\|def capture_time" -A14 collector_server/production/ffmpeg.py | head -60; sed -n 1,40p collector_server/production/pieces.py; .venv/bin/pytest -q 2>&1 | tail -3; grep -n "Task 4" -A40 ../../docs/superpowers/plans/2026-11-17-production-1-server-core.md | head -80
The QA check on the watch feature was stopped before it reported, so I have no results from it. The model is now set to Haiku 5.5, and I’m not picking up any work from this message.

Where things stand on batches-from-folders, which is not merged or pushed:

Done: the server side of folders and watches (including the preview, bulk creation, the watch checks and their routes), and the web column order, the API client and the “Folders inside a folder” form with its live preview. The server suite passes with 703 tests, and the web tests for these parts pass.
Not done: the Watches panel and watch options in the web app, the end-to-end test and visual check, the full web suite and build, the QA check on the watch feature (stopped before it reported), and the final review before any merge.
Next step when work resumes: build the watch panel and options (Task 7), then the end-to-end test, then the review and merge question.