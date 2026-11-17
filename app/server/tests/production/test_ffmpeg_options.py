import pytest

from collector_server.production.ffmpeg_options import check_options, fill_placeholders, split_options
from collector_server.production.stage_api import StageError


REFUSED = [
    "-i other.mp4",
    "-f concat",
    "-vf movie=/etc/passwd",
    "-vf eq=brightness=0.1:textfile=x",
    "-protocol_whitelist file",
    "-vf {other}",
    "-filter_script:v f.txt",
    "-vpre x",
    "-passlogfile x",
    "-report",
    "extra.mp4",
    "-an extra.mkv",
    "-vf drawtext=text=a:fontfile=a.ttf",
]


def test_refused_options_never_pass_the_check():
    for text in REFUSED:
        with pytest.raises(StageError):
            check_options(split_options(text))


def test_ordinary_options_pass_and_placeholders_fill_in():
    args = split_options("-vf eq=brightness=0.06 -c:a copy {output}")
    check_options(args)
    assert fill_placeholders(args, "in.mp4", "out.mp4")[-1] == "out.mp4"


@pytest.mark.full
def test_unclosed_quote_says_so():
    with pytest.raises(StageError, match="unclosed quote"):
        split_options('-vf "eq=brightness=0.1')
