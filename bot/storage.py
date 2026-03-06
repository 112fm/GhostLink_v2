import json
import os
import sqlite3


DB_FILE = "ghost_users.db"
LEGACY_JSON = "ghost_users.json"


def _db_connect():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def _db_init(conn):
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            tg_id TEXT PRIMARY KEY,
            uuid TEXT,
            expiry TEXT,
            expiry_ts INTEGER,
            status TEXT,
            balance INTEGER,
            device_limit INTEGER,
            tariff_name TEXT,
            name TEXT,
            last_request_ts INTEGER,
            ref_by TEXT,
            ref_by_username TEXT,
            discount INTEGER,
            first_paid INTEGER,
            ref_paid INTEGER,
            traffic_limit_gb INTEGER,
            traffic_month TEXT,
            traffic_usage_bytes INTEGER,
            traffic_last_total INTEGER,
            traffic_warn80 INTEGER,
            traffic_warn95 INTEGER
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
        """
    )
    cur.execute("PRAGMA table_info(users)")
    cols = {r[1] for r in cur.fetchall()}
    for col, ddl in {
        "ref_by": "ALTER TABLE users ADD COLUMN ref_by TEXT",
        "ref_by_username": "ALTER TABLE users ADD COLUMN ref_by_username TEXT",
        "discount": "ALTER TABLE users ADD COLUMN discount INTEGER",
        "first_paid": "ALTER TABLE users ADD COLUMN first_paid INTEGER",
        "ref_paid": "ALTER TABLE users ADD COLUMN ref_paid INTEGER",
        "traffic_limit_gb": "ALTER TABLE users ADD COLUMN traffic_limit_gb INTEGER",
        "traffic_month": "ALTER TABLE users ADD COLUMN traffic_month TEXT",
        "traffic_usage_bytes": "ALTER TABLE users ADD COLUMN traffic_usage_bytes INTEGER",
        "traffic_last_total": "ALTER TABLE users ADD COLUMN traffic_last_total INTEGER",
        "traffic_warn80": "ALTER TABLE users ADD COLUMN traffic_warn80 INTEGER",
        "traffic_warn95": "ALTER TABLE users ADD COLUMN traffic_warn95 INTEGER",
    }.items():
        if col not in cols:
            cur.execute(ddl)
    conn.commit()


def _migrate_json(conn):
    if not os.path.exists(LEGACY_JSON):
        return
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS cnt FROM users")
    if cur.fetchone()["cnt"] > 0:
        return
    try:
        with open(LEGACY_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
        for k, v in data.items():
            if k == "_meta":
                for mk, mv in v.items():
                    cur.execute("INSERT OR REPLACE INTO meta(key, value) VALUES(?,?)", (mk, json.dumps(mv)))
                continue
            cur.execute(
                """
                INSERT OR REPLACE INTO users
                (tg_id, uuid, expiry, expiry_ts, status, balance, device_limit, tariff_name, name, last_request_ts, ref_by, ref_by_username, discount, first_paid, ref_paid, traffic_limit_gb, traffic_month, traffic_usage_bytes, traffic_last_total, traffic_warn80, traffic_warn95)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    k,
                    v.get("uuid"),
                    v.get("expiry"),
                    v.get("expiry_ts"),
                    v.get("status"),
                    v.get("balance", 0),
                    v.get("device_limit", 3),
                    v.get("tariff_name"),
                    v.get("name"),
                    v.get("last_request_ts"),
                    v.get("ref_by"),
                    v.get("ref_by_username"),
                    v.get("discount", 0),
                    v.get("first_paid", 0),
                    v.get("ref_paid", 0),
                    v.get("traffic_limit_gb"),
                    v.get("traffic_month"),
                    v.get("traffic_usage_bytes", 0),
                    v.get("traffic_last_total", 0),
                    v.get("traffic_warn80", 0),
                    v.get("traffic_warn95", 0),
                ),
            )
        conn.commit()
    except Exception:
        pass


def load_db():
    conn = _db_connect()
    _db_init(conn)
    _migrate_json(conn)
    cur = conn.cursor()
    cur.execute("SELECT * FROM users")
    users = {}
    for row in cur.fetchall():
        users[row["tg_id"]] = dict(row)
    cur.execute("SELECT key, value FROM meta")
    meta = {}
    for row in cur.fetchall():
        try:
            meta[row["key"]] = json.loads(row["value"])
        except Exception:
            meta[row["key"]] = row["value"]
    if meta:
        users["_meta"] = meta
    conn.close()
    return users


def save_db(data):
    conn = _db_connect()
    _db_init(conn)
    cur = conn.cursor()
    cur.execute("DELETE FROM users")
    cur.execute("DELETE FROM meta")
    meta = data.get("_meta", {})
    for mk, mv in meta.items():
        cur.execute("INSERT OR REPLACE INTO meta(key, value) VALUES(?,?)", (mk, json.dumps(mv)))
    for k, v in data.items():
        if k == "_meta":
            continue
        cur.execute(
            """
            INSERT OR REPLACE INTO users
            (tg_id, uuid, expiry, expiry_ts, status, balance, device_limit, tariff_name, name, last_request_ts, ref_by, ref_by_username, discount, first_paid, ref_paid, traffic_limit_gb, traffic_month, traffic_usage_bytes, traffic_last_total, traffic_warn80, traffic_warn95)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                k,
                v.get("uuid"),
                v.get("expiry"),
                v.get("expiry_ts"),
                v.get("status"),
                v.get("balance", 0),
                v.get("device_limit", 3),
                v.get("tariff_name"),
                v.get("name"),
                v.get("last_request_ts"),
                v.get("ref_by"),
                v.get("ref_by_username"),
                v.get("discount", 0),
                v.get("first_paid", 0),
                v.get("ref_paid", 0),
                v.get("traffic_limit_gb"),
                v.get("traffic_month"),
                v.get("traffic_usage_bytes", 0),
                v.get("traffic_last_total", 0),
                v.get("traffic_warn80", 0),
                v.get("traffic_warn95", 0),
            ),
        )
    conn.commit()
    conn.close()

