from __future__ import annotations

import hashlib
import re
from typing import Literal

from pydantic import Field

from collector_server.shared.camel_model import CamelModel

from ..pieces import VideoData
from ..postiz_client import ChannelPost, PostizError, PostizUnclear
from ..stage_api import POST_IT, TRY_AGAIN, BlockedError, StageContext, StageError
_TAG = re.compile(r"\{\{\s*(\w+)\s*\}\}")
_TAGS = {"name", "id", "date"}
_YOUTUBE_TITLE = 100


class ChannelChoice(CamelModel):
    id: str = Field(max_length=100)
    identifier: str = Field(max_length=50)  # the platform, for example instagram
    name: str = Field("", max_length=200)
    settings: dict = {}  # this channel's own options, over the platform's defaults


class PostizSettings(CamelModel):
    mode: Literal["upload_only", "upload_and_queue"] = Field("upload_and_queue", title="What to do", description="Upload only puts the video in your Postiz media library. Upload and queue also adds it to a Postiz pipeline.")
    folder_id: str | None = Field(None, max_length=100, title="Media folder", description="The Postiz media folder for the video. Empty uses the Postiz root.", json_schema_extra={"widget": "postiz_folder"})
    pipeline_id: str | None = Field(None, max_length=100, title="Postiz pipeline", description="The Postiz pipeline whose queue gets the post. Empty skips the queue.", json_schema_extra={"widget": "postiz_pipeline"})
    channels: list[ChannelChoice] = Field([], max_length=20, title="Channels", description="The channels come from the pipeline. Set each channel's options here.", json_schema_extra={"widget": "postiz_channels"})
    caption: str = Field("{{name}}", max_length=2000, title="Caption", description="The text sent with the post. Tags: {{name}}, {{id}}, {{date}}.")
    approval: Literal["auto", "manual"] = Field("auto", title="Approval", description="Auto posts when the card reaches this stage. Manual waits for you to approve each post.")
    post_type: Literal["schedule", "draft"] = Field("schedule", title="Post type", description="Schedule puts the post in the next free slot of the Postiz pipeline. Draft saves it for you to schedule in Postiz.")
    choice: str | None = Field(None, json_schema_extra={"hidden": True})  # set from the blocked card, not by hand
    caption_override: str | None = Field(None, max_length=2000, json_schema_extra={"hidden": True})  # the caption edited for one card


def render_caption(template: str, labels: dict[str, str]) -> str:
    def swap(match: re.Match) -> str:
        tag = match.group(1)
        if tag not in _TAGS:
            raise StageError(f"The caption has an unknown tag {{{{{tag}}}}}. Use {{{{name}}}}, {{{{id}}}} or {{{{date}}}}")
        return labels.get(tag, "")

    return _TAG.sub(swap, template)


def channel_defaults(identifier: str) -> dict:
    if identifier == "instagram":
        return {"post_type": "post", "collaborators": [], "is_trial_reel": False}
    if identifier == "youtube":
        return {"title": "", "type": "public"}
    return {}


def _sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as video:
        for block in iter(lambda: video.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _posts(settings: PostizSettings, caption: str) -> list[ChannelPost]:
    posts = []
    for channel in settings.channels:
        options = {**channel_defaults(channel.identifier), **channel.settings}
        if channel.identifier == "youtube" and not options.get("title"):
            options["title"] = caption[:_YOUTUBE_TITLE]
        posts.append(ChannelPost(channel.id, channel.identifier, options))
    return posts


class PostizExport:
    key = "postiz_export"
    title = "Post-iz"
    description = "Sends the finished video to Postiz, and can add it to a Postiz pipeline."
    settings_model = PostizSettings
    transitions = {"video": "video"}
    position = "last"
    export = True  # an export stage comes after every other stage that must be last, and a pipeline may hold only one

    def run(self, data: VideoData, settings: PostizSettings, ctx: StageContext) -> VideoData:
        postiz, exports = ctx.postiz(), ctx.exports
        if postiz is None or exports is None:
            raise StageError("Postiz is not set up. Add the address and key in Settings")
        sha = _sha256(data.path)
        earlier = exports.for_card(ctx.card_id)
        posted = (earlier if earlier and earlier.status in ("uploaded", "queued") else None) or exports.by_sha(sha)
        if posted:  # the new video still goes on to review; it is just not sent again
            ctx.log(f"Already posted ({'queue ID ' + posted.queue_id if posted.queue_id else 'media ID ' + str(posted.media_id)}). Not sent again")
            return data
        if earlier and earlier.status == "unclear":
            raise BlockedError("Postiz may already have this video. Check Postiz first", [TRY_AGAIN])  # choosing try again marks it checked
        if earlier and earlier.status == "checked":
            exports.delete(earlier.id)
        caption = settings.caption_override or render_caption(settings.caption, ctx.labels)
        if settings.approval == "manual" and settings.choice not in (POST_IT, TRY_AGAIN):
            raise BlockedError("Ready to post", [POST_IT], [caption])
        record = exports.start(ctx.card_id, sha, caption)
        try:
            ctx.log("Uploading the video to Postiz")
            media = postiz.upload(data.path)
            exports.update(record, status="uploaded", media_id=media.id, folder=settings.folder_id, post_type=settings.post_type)
            ctx.log(f"Uploaded as media {media.id}")
            if settings.folder_id:
                postiz.move(media.id, settings.folder_id)
                ctx.log("Moved it into the media folder")
            if settings.mode == "upload_and_queue" and settings.pipeline_id and settings.channels:
                queued = postiz.enqueue(settings.pipeline_id, settings.post_type, caption, media, _posts(settings, caption))
                exports.update(record, status="queued", queue_id=queued.id, pipeline_id=settings.pipeline_id)
                ctx.log(f"Queued as {queued.id} ({settings.post_type})")
            elif settings.mode == "upload_and_queue":
                ctx.log("Queue skipped: no Postiz pipeline ID or no channels are set")
        except PostizUnclear as error:
            exports.update(record, status="unclear", message=str(error))
            raise BlockedError("Postiz may already have this video. Check Postiz first", [TRY_AGAIN]) from None
        except PostizError as error:
            exports.update(record, status="failed", message=str(error))
            raise StageError(str(error)) from None
        return data


STAGE = PostizExport()
