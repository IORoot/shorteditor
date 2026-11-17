import re
import time

import pytest

from collector_server.production.errors import InvalidInputError
from collector_server.production.pattern import check_template, compile_pattern, render_name


def test_valid_pattern_compiles():
    assert compile_pattern(r"^\d{4}-\d{2}-\d{2}_.+$").fullmatch("2026-11-07_Sat_coach")


def test_too_long_pattern_is_refused():
    with pytest.raises(InvalidInputError, match="too long"):
        compile_pattern("a" * 201)


def test_invalid_syntax_is_refused_with_the_reason():
    with pytest.raises(InvalidInputError, match="not valid"):
        compile_pattern("([a-z")


@pytest.mark.parametrize("text", ["(a+)+", "(.*)*", "(a|aa)+", r"(\d+)*x", "(?:a*)+b", "(x+x+)+y", "((a+))+"])
def test_runaway_shapes_are_refused(text):
    with pytest.raises(InvalidInputError, match="far too long"):
        compile_pattern(text)


@pytest.mark.parametrize("text", [r"^(\d{4})-(\d{2})_(?P<who>[a-z]+)$", r"^\d+_(Sat|Sun)_coach$", r"^cam-[AB]_\d{8}$", r"^[(+*]+$", r"^\(a\+\)\+$"])
def test_ordinary_patterns_are_allowed(text):
    compile_pattern(text)


def test_a_group_followed_by_a_repeat_with_nothing_repeating_inside_is_allowed():
    compile_pattern(r"^(ab)+$")


def test_pathological_input_against_an_allowed_pattern_is_fast():
    pattern = compile_pattern(r"^(\d{4})-(\d{2})_(?P<who>[a-z]+)$")
    started = time.monotonic()
    pattern.fullmatch("2026-11_" + "a" * 190 + "!")
    assert time.monotonic() - started < 0.5


def match_of(text, name):
    return compile_pattern(text).fullmatch(name)


def test_name_template_uses_name_numbers_and_group_names():
    m = match_of(r"^(\d{4})-(\d{2})_(?P<who>[a-z]+)$", "2026-11_coach")
    assert render_name("{name}", m, "2026-11_coach") == "2026-11_coach"
    assert render_name("{who} {1}/{2}", m, "2026-11_coach") == "coach 2026/11"


def test_an_optional_group_that_did_not_match_is_empty():
    m = match_of(r"^(a)?(b)$", "b")
    assert render_name("[{1}]{2}", m, "b") == "[]b"


@pytest.mark.parametrize("template", ["{nope}", "{3}", "{0}"])
def test_unknown_placeholders_are_refused(template):
    with pytest.raises(InvalidInputError, match="does not have"):
        check_template(template, compile_pattern(r"^(a)(b)$"))


def test_known_placeholders_pass_the_check():
    check_template("{name} {1} {who}", compile_pattern(r"^(a)(?P<who>b)$"))


def test_rendered_names_are_cleaned_and_cut():
    m = match_of(r"(?s)^(.+)$", "x\ny")
    assert render_name("  {1}\t!  ", m, "x\ny") == "x y !"
    assert len(render_name("{name}" * 100, match_of(r"^.+$", "abc"), "abc")) == 120


def test_a_blank_result_falls_back_to_the_folder_name():
    m = match_of(r"^(a)?(b)$", "b")
    assert render_name("{1}", m, "b") == "b"


@pytest.mark.parametrize(
    "text",
    [
        "a*a*a*a*a*a*b",
        r".*.*.*.*.*.*.*.*x",
        r"\d*\d*\d*\d*\d*\d*\d*x",
        "[ab]*[ab]*[ab]*[ab]*[ab]*[ab]*c",
        "(a*?)(a*?)(a*?)(a*?)(a*?)b",
        "(?:a*)(?:a*)(?:a*)(?:a*)(?:a*)(?:a*)b",
        "(a?){30}a{30}",
        "(?:a?){30}" + "a" * 30,
        "a?" * 30 + "a" * 30,
        "(?x)(a+) +b",
        "(?x:a+) {1,}b",
        "(a+)(?#c)+b",
        "(?ix)(a|a)+b",
    ],
)
def test_more_runaway_shapes_are_refused(text):
    with pytest.raises(InvalidInputError):
        compile_pattern(text)


@pytest.mark.parametrize("text", [r"^\d{4}-\d{2}-\d{2}_.+$", r"^(cam|dslr)_\d{8}$", r"^[A-Z]+_\d+_.*$", r"^2026-.*-coach$"])
def test_the_usual_folder_patterns_are_still_allowed(text):
    compile_pattern(text)


def test_template_with_non_ascii_digits_is_a_plain_error():
    for bad in ("{²}", "{①}", "{" + "9" * 5000 + "}"):
        with pytest.raises(InvalidInputError):
            check_template(bad, compile_pattern(r"^(a)$"))
