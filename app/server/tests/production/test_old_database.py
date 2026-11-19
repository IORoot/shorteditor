import pytest

from collector_server.production.schema import ensure_schema
from collector_server.shared.database import Database


@pytest.mark.full
def test_a_database_from_before_blocked_items_gets_the_column(tmp_path):
    db = Database(str(tmp_path / "old.db"))
    ensure_schema(db)
    db.execute("ALTER TABLE production_cards DROP COLUMN blocked_items")  # what an old file looks like
    ensure_schema(db)
    columns = {row["name"] for row in db.query("PRAGMA table_info(production_cards)")}
    assert "blocked_items" in columns
    assert db.query("SELECT COUNT(*) AS n FROM production_cards")[0]["n"] == 0
