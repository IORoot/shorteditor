from collector_server.shared.database import Database


def test_executemany_inserts_all_rows_in_one_call(tmp_path):
    db = Database(str(tmp_path / "t.db"))
    db.execute("CREATE TABLE t (n INTEGER)")
    db.executemany("INSERT INTO t (n) VALUES (?)", [(1,), (2,), (3,)])
    assert [r["n"] for r in db.query("SELECT n FROM t ORDER BY n")] == [1, 2, 3]
    db.close()
