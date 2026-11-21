import hashlib

import pytest

from collector_server.production.export_repository import ExportRepository
from collector_server.production.pieces import VideoData
from collector_server.production.postiz_client import Enqueued, Media, PostizError, PostizUnclear
from collector_server.production.repositories import BatchRepository, PassRepository
from collector_server.production.schema import ensure_schema
from collector_server.production.stage_api import BlockedError, StageError
from collector_server.production.stages.postiz_export import POST_IT, STAGE, TRY_AGAIN, channel_defaults, render_caption
from tests.production.helpers import make_ctx

NOW = "2026-11-21T10:00:00+00:00"
LABELS = {"name": "Saturday class", "id": "7", "date": "2026-11-21"}
INSTAGRAM = {"id": "c1", "identifier": "instagram", "name": "London Parkour", "settings": {"post_type": "reel", "collaborators": [], "is_trial_reel": False}}
YOUTUBE = {"id": "c2", "identifier": "youtube", "name": "Channel", "settings": {"title": "", "type": "public"}}


class FakeClient:
    def __init__(self):
        self.calls = []
        self.upload_error = self.enqueue_error = None

    def upload(self, path):
        self.calls.append(("upload", path))
        if self.upload_error:
            raise self.upload_error
        return Media("m1", "https://x/m1.mp4")

    def move(self, media_id, folder_id):
        self.calls.append(("move", media_id, folder_id))

    def enqueue(self, pipeline_id, post_type, caption, media, channels):
        self.calls.append(("enqueue", pipeline_id, post_type, caption, media, [(c.id, c.identifier, dict(c.settings)) for c in channels]))
        if self.enqueue_error:
            raise self.enqueue_error
        return Enqueued("q1", "g1")

    @property
    def names(self):
        return [call[0] for call in self.calls]


class Env:
    def __init__(self, db, tmp_path):
        ensure_schema(db)
        batch = BatchRepository(db).create("Saturday class", str(tmp_path), 1, [], "any", str(tmp_path / "o"), NOW)
        self.passes = PassRepository(db)
        self.card = self.passes.create(batch.id, NOW)
        self.other = self.passes.create(batch.id, NOW)
        self.exports = ExportRepository(db, lambda: NOW)
        self.client = FakeClient()
        self.log = []
        self.video_path = tmp_path / "final.mp4"
        self.video_path.write_bytes(b"the finished video")
        self.video = VideoData(path=str(self.video_path), duration=2.0, size_bytes=18)
        self.tmp_path = tmp_path

    def ctx(self, card=None, connected=True):
        ctx = make_ctx(self.tmp_path, log=self.log)
        ctx.log = self.log.append
        ctx.exports = self.exports
        ctx.card_id = (card or self.card).id
        ctx.labels = dict(LABELS)
        ctx.postiz = (lambda: self.client) if connected else (lambda: None)
        return ctx

    def run(self, card=None, connected=True, **settings):
        values = {"folderId": "f1", "pipelineId": "p1", "channels": [INSTAGRAM, YOUTUBE], **settings}
        return STAGE.run(self.video, STAGE.settings_model(**values), self.ctx(card, connected))

    def sha(self):
        return hashlib.sha256(self.video_path.read_bytes()).hexdigest()


@pytest.fixture
def env(db, tmp_path):
    return Env(db, tmp_path)


def test_stage_shape():
    assert (STAGE.key, STAGE.position, STAGE.transitions) == ("postiz_export", "last", {"video": "video"})


def test_render_caption_tags_and_unknown_tag():
    assert render_caption("{{name}} #{{id}} on {{date}}", LABELS) == "Saturday class #7 on 2026-11-21"
    assert render_caption("{{ name }}", LABELS) == "Saturday class"
    with pytest.raises(StageError, match="colour"):
        render_caption("{{colour}}", LABELS)


def test_channel_defaults_for_instagram_youtube_other():
    assert channel_defaults("instagram") == {"post_type": "post", "collaborators": [], "is_trial_reel": False}
    assert channel_defaults("youtube") == {"title": "", "type": "public"}
    assert channel_defaults("facebook") == {}


def test_auto_uploads_moves_and_queues(env):
    result = env.run()
    assert result is env.video
    assert env.client.names == ["upload", "move", "enqueue"]
    assert env.client.calls[1] == ("move", "m1", "f1")
    _, pipeline, post_type, caption, media, channels = env.client.calls[2]
    assert (pipeline, post_type, caption, media) == ("p1", "schedule", "Saturday class", Media("m1", "https://x/m1.mp4"))
    assert channels[0] == ("c1", "instagram", {"post_type": "reel", "collaborators": [], "is_trial_reel": False})
    assert channels[1] == ("c2", "youtube", {"title": "Saturday class", "type": "public"})  # an empty YouTube title uses the caption
    record = env.exports.for_card(env.card.id)
    assert (record.status, record.media_id, record.queue_id, record.pipeline_id, record.folder, record.post_type) == ("queued", "m1", "q1", "p1", "f1", "schedule")
    assert record.sha256 == env.sha() and record.caption == "Saturday class"


def test_post_type_draft_is_sent(env):
    env.run(postType="draft")
    assert env.client.calls[2][2] == "draft"


def test_upload_only_never_enqueues(env):
    env.run(mode="upload_only")
    assert env.client.names == ["upload", "move"]
    assert env.exports.for_card(env.card.id).status == "uploaded"


def test_no_folder_skips_the_move(env):
    env.run(folderId=None)
    assert env.client.names == ["upload", "enqueue"]


def test_no_pipeline_or_no_channels_skips_queue_with_log(env):
    env.run(pipelineId=None)
    assert env.client.names == ["upload", "move"] and any("queue" in line.lower() and "skipped" in line.lower() for line in env.log)
    env.client.calls.clear()
    env.log.clear()
    env.video_path.write_bytes(b"another video")
    env.run(card=env.other, channels=[])
    assert env.client.names == ["upload", "move"] and any("skipped" in line.lower() for line in env.log)


def test_manual_blocks_with_caption_as_item_then_posts_on_choice(env):
    with pytest.raises(BlockedError) as blocked:
        env.run(approval="manual", caption="Hello {{name}}")
    assert blocked.value.choices == [POST_IT] and blocked.value.items == ["Hello Saturday class"] and env.client.calls == []
    env.run(approval="manual", caption="Hello {{name}}", choice=POST_IT)
    assert env.client.calls[2][3] == "Hello Saturday class"


def test_manual_uses_the_caption_the_user_changed(env):
    env.run(approval="manual", choice=POST_IT, caption_override="My own words")
    assert env.client.calls[2][3] == "My own words"
    assert env.exports.for_card(env.card.id).caption == "My own words"


def test_unclear_blocks_and_second_run_without_choice_calls_nothing(env):
    env.client.enqueue_error = PostizUnclear("no queue id")
    with pytest.raises(BlockedError) as blocked:
        env.run()
    assert blocked.value.choices == [TRY_AGAIN]
    assert env.exports.for_card(env.card.id).status == "unclear"
    env.client.calls.clear()
    with pytest.raises(BlockedError):
        env.run()
    assert env.client.calls == []


def test_try_again_clears_unclear_record_and_posts(env):
    env.client.enqueue_error = PostizUnclear("no queue id")
    with pytest.raises(BlockedError):
        env.run()
    env.client.enqueue_error = None
    env.client.calls.clear()
    env.run(choice=TRY_AGAIN)
    assert env.client.names == ["upload", "move", "enqueue"]
    assert env.exports.for_card(env.card.id).status == "queued"


def test_try_again_also_counts_as_the_approval_in_manual_mode(env):
    env.client.upload_error = PostizUnclear("no answer")
    with pytest.raises(BlockedError):
        env.run(approval="manual", choice=POST_IT)
    env.client.upload_error = None
    env.run(approval="manual", choice=TRY_AGAIN)
    assert env.exports.for_card(env.card.id).status == "queued"


def test_already_queued_card_is_refused(env):
    env.run()
    env.client.calls.clear()
    env.video_path.write_bytes(b"re-rendered, so different bytes")
    with pytest.raises(StageError, match="Already posted.*q1"):
        env.run()
    assert env.client.calls == []


def test_same_fingerprint_on_another_card_is_refused(env):
    env.run()
    env.client.calls.clear()
    with pytest.raises(StageError, match="Already posted"):
        env.run(card=env.other)
    assert env.client.calls == []


def test_refusal_is_failed_record_and_stage_error(env):
    env.client.upload_error = PostizError("Postiz said 401 for /upload")
    with pytest.raises(StageError, match="401"):
        env.run()
    assert env.exports.for_card(env.card.id).status == "failed"
    assert env.exports.for_card(env.card.id).message == "Postiz said 401 for /upload"


def test_a_failed_try_can_be_repeated(env):
    env.client.upload_error = PostizError("Postiz said 500")
    with pytest.raises(StageError):
        env.run()
    env.client.upload_error = None
    env.run()
    assert env.exports.for_card(env.card.id).status == "queued"


def test_missing_connection_is_stage_error(env):
    with pytest.raises(StageError, match="not set up"):
        env.run(connected=False)


def test_a_pipeline_may_end_with_render_then_post_iz():
    from collector_server.production.builtin import build_registry
    from collector_server.production.stage_api import StageStep
    from collector_server.production.validation import validate_pipeline

    registry = build_registry()
    keys = ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output", "postiz_export"]
    assert validate_pipeline(registry, [StageStep(key=k) for k in keys]) == []
    assert any("must be last" in m for m in validate_pipeline(registry, [StageStep(key=k) for k in [*keys, "ffmpeg"]]))
