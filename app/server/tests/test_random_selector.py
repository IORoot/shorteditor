import pytest

from collector_server.models import RandomSelection
from collector_server.random_selector import RandomSelector

ITEMS = [f"clip{i:02d}" for i in range(20)]


def selector(**kw) -> RandomSelector:
    return RandomSelector(RandomSelection(enabled=True, **kw))


def test_disabled_returns_everything():
    sel = RandomSelector(RandomSelection(enabled=False))
    assert sel.pick(ITEMS, "x") == ITEMS and not sel.enabled


def test_count_mode_picks_exactly_n_in_original_order():
    picked = selector(mode="count", value=5, seed=7).pick(ITEMS, "overall")
    assert len(picked) == 5 and picked == sorted(picked)
    assert set(picked) <= set(ITEMS)


def test_percent_mode_rounds_and_never_picks_zero():
    assert len(selector(mode="percent", value=25).pick(ITEMS, "x")) == 5
    assert len(selector(mode="percent", value=1).pick(ITEMS, "x")) == 1
    assert len(selector(mode="percent", value=100).pick(ITEMS, "x")) == 20
    assert selector(mode="count", value=99).count_for(3) == 3
    assert selector().count_for(0) == 0


def test_the_same_seed_gives_the_same_picks_and_other_seeds_differ():
    a = selector(mode="count", value=5, seed=42).pick(ITEMS, "overall")
    assert a == selector(mode="count", value=5, seed=42).pick(ITEMS, "overall")
    assert a != selector(mode="count", value=5, seed=43).pick(ITEMS, "overall")


def test_the_salt_gives_each_folder_its_own_picks():
    sel = selector(mode="count", value=5, seed=42)
    assert sel.pick(ITEMS, "folder-a") != sel.pick(ITEMS, "folder-b")


def test_scope_flags():
    assert selector(scope="overall").overall and not selector(scope="overall").per_folder
    assert selector(scope="folder").per_folder and not selector(scope="folder").overall


def test_empty_input_is_fine():
    assert selector().pick([], "x") == []


@pytest.mark.parametrize("kw,message", [({"value": 0}, "at least 1"), ({"mode": "percent", "value": 101}, "more than 100")])
def test_invalid_values_raise_only_when_enabled(kw, message):
    with pytest.raises(ValueError, match=message):
        selector(**kw)
    RandomSelector(RandomSelection(enabled=False, **kw))
