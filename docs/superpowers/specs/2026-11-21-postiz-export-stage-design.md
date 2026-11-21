# Post-iz export stage: design

Status: approved in conversation, not yet built. Terms follow `CONTEXT.md`.

## Intent

Send each card's finished video out of the app to the user's Postiz installation (`postiz.londonparkour.com`), so the media lands in the right Postiz media folder and, if wanted, goes into a Postiz pipeline's queue with a caption and per-channel settings. v2 did this with hard-coded channels, folders and pipeline IDs. v3 makes all of it settings.

## Goals

- A new export stage kind. Post-iz is the first. Other destinations can follow without changing the shape.
- Everything v2 hard-coded is a stage setting: media folder, channels, Postiz pipeline, caption, post type.
- The stage works with nothing set beyond the connection: it uploads to the Postiz root and skips the queue.
- A card never posts twice, and an unclear result is never retried blindly.

## Non-goals

- Other export destinations (a later spec).
- Choosing the post time in v3. When scheduling, the Postiz pipeline picks its next free slot.
- Per-card overrides of anything except the caption.
- Listing Postiz pipelines in a dropdown (see "What the live check found").

## Decisions

**Header.** The Output tab stays and is enabled in this build. It lists each card's export result: time, Postiz pipeline, media ID, queue ID, status. It replaces the disabled placeholder at `App.tsx:18`.

**Stage shape.** One stage, key `postiz_export`, in `production/stages/postiz_export.py`. `transitions` is video to video (the video passes through unchanged), `position` is last. A `mode` setting selects *upload only* or *upload and queue*.

**Connection.** The Postiz URL and API key live in App Settings, beside the OpenRouter key, never in stage settings or pipeline records. The URL is stored as a full address; `https://` and `/api` are added when missing. Every request sends `User-Agent: ldnpk-video-editor/1.0`. A **Test connection** button on the stage lists the channels it finds (my call).

**Live lists.** The channel picker is fed by `GET {base}/public/v1/integrations` and the media folder picker by `GET {base}/media/folders`. Both are optional. The Postiz pipeline is a typed ID.

**Channels.** Chosen from Postiz's full list, independent of the Postiz pipeline. Each chosen channel gets a settings block for its platform (`identifier`), with defaults taken from v2:

- Instagram: post type, collaborators, trial reel.
- YouTube: title (default: first 100 characters of the caption), visibility (default: public).
- Other platforms: no extra fields.

These live on the stage only.

**Caption.** A template on the stage using the same `{{name}}`, `{{id}}` and `{{date}}` tags as the batch output folder name. In manual approval mode it can be edited for one card at approval time.

**Approval mode.** A stage setting, `auto` (default) or `manual`. Auto posts when the card reaches the stage. Manual holds the card until a person approves it. Batches inherit it and cannot override it.

**Post type.** A stage setting, `schedule` (default) or `draft`. Schedule means the Postiz pipeline places the post in its next free slot. If it has none, the card goes to Blocked with that message.

**Failure and duplicates.** If Postiz fails, or returns no queue ID, the card goes to Blocked with the message. A retry is allowed only after someone checks the saved export record, as in v2. Each export saves a fingerprint (SHA-256) of the video; a second post of the same video is refused and shown on the card.

## What the live check found

Checked on 2026-11-21 with read-only GETs and the key from the project `.env` (git-ignored):

- Cloudflare blocked Python's default client name (error 1010). A WAF skip rule for the API paths and the client name above fixed it.
- The API sits under `/api`. The bare host returns the web app.
- `GET /api/public/v1/integrations` returns `id`, `name`, `identifier`, `picture`, `disabled`, `profile` per channel.
- `GET /api/media/folders` returns folders with `id`, `name`, `parentId` and `deletedAt`.
- Postiz pipelines cannot be listed with the API key (`/api/public/v1/pipelines` is 404, `/api/pipelines` is 401). Hence the typed ID.

## Assumptions to settle with a real test post

- `/pipelines/enqueue` accepts a scheduled post as well as a draft. v2 only sent drafts.
- What it returns when the Postiz pipeline has no free slot.
- The upload sequence from v2 still holds: `POST /public/v1/upload` (multipart), then `POST /media/move` to the folder, then `POST /pipelines/enqueue`.

## Left to the builder

Settings schema field names and titles, how the Output tab is laid out, the manual-approval UI on the card, how the export record is stored, and test structure. Follow the existing stage conventions (`settings_model` with titled fields, one file per stage).
