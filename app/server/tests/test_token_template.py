from datetime import datetime

import pytest

from collector_server.token_template import ClipContext, FolderTemplate

SAT = datetime(2026, 11, 14, 18, 40)


def render(text: str, **kw) -> str:
    return FolderTemplate(text).render(ClipContext(when=SAT, **kw))


def test_default_date_format():
    assert render("{date}") == "2026-11-14"


def test_custom_date_formats():
    assert render("{date:YYYY-MM-DD}") == "2026-11-14"
    assert render("{date:YY.MM.DD_HHmm}") == "26.11.14_1840"


def test_weekday_short_and_long():
    assert render("{weekday}") == "Sat"
    assert render("{weekday:long}") == "Saturday"


def test_the_design_example():
    assert render("{date:YYYY-MM-DD}_{weekday}_{suffix}", suffix="coach") == "2026-11-14_Sat_coach"


def test_nested_paths_are_kept():
    assert render("{date:YYYY}/{date:MM}/{weekday}") == "2026/11/Sat"


def test_window_and_counter_tokens():
    assert render("{window:name}_{window:start}_{counter}", window_name="Morning", window_start="09-00", counter=3) == "Morning_09-00_03"


def test_empty_segments_are_dropped_and_unsafe_chars_replaced():
    assert render("a//{suffix}/b:c", suffix="") == "a/b-c"


def test_uses_window_detection():
    assert FolderTemplate("{window:name}").uses_window()
    assert not FolderTemplate("{date}").uses_window()


@pytest.mark.parametrize(
    "text,message",
    [
        ("", "empty"),
        ("{nope}", "Unknown token"),
        ("{date:YYYY/MM}", "Invalid date format"),
        ("{weekday:short}", "weekday"),
        ("{window}", "window"),
        ("{suffix:x}", "no argument"),
        ("{date", "braces"),
        ("date}", "braces"),
        ("/abs/{date}", "relative"),
        ("a/../b", "'..'"),
    ],
)
def test_invalid_templates_raise(text, message):
    with pytest.raises(ValueError, match=message):
        FolderTemplate(text)
