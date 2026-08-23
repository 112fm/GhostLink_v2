"""Self-contained SQLite store for the Git-visible support laboratory."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import uuid
from pathlib import Path

from support_lab.redaction import redact


class LabStore:
    def __init__(self, db_path: str | Path, retention_days: int = 365):
        self.db_path = str(db_path)
        self.retention_days = int(retention_days)
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

    def _ensure_schema(self):
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS support_conversations (
                    conversation_id TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL UNIQUE,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS support_topics (
                    ticket_id TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL,
                    conversation_id TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL CHECK(status IN ('open','closed')),
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    closed_at INTEGER NOT NULL DEFAULT 0,
                    closed_by TEXT NOT NULL DEFAULT '',
                    retention_until INTEGER NOT NULL DEFAULT 0
                );
                CREATE UNIQUE INDEX IF NOT EXISTS lab_one_open_topic
                    ON support_topics(owner_id) WHERE status='open';
                CREATE TABLE IF NOT EXISTS support_messages (
                    message_id TEXT PRIMARY KEY,
                    ticket_id TEXT NOT NULL REFERENCES support_topics(ticket_id) ON DELETE CASCADE,
                    owner_id TEXT NOT NULL,
                    request_id TEXT NOT NULL DEFAULT '',
                    payload_hash TEXT NOT NULL,
                    author_type TEXT NOT NULL CHECK(author_type IN ('user','admin','system')),
                    body TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS lab_request_id
                    ON support_messages(owner_id, request_id) WHERE request_id<>'';
                """
            )
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(support_topics)")}
            if "conversation_id" not in columns:
                conn.execute("ALTER TABLE support_topics ADD COLUMN conversation_id TEXT NOT NULL DEFAULT ''")
            owners = conn.execute(
                "SELECT DISTINCT owner_id FROM support_topics WHERE owner_id<>''"
            ).fetchall()
            now = int(time.time())
            for owner in owners:
                conn.execute(
                    "INSERT OR IGNORE INTO support_conversations(conversation_id,owner_id,created_at,updated_at) VALUES(?,?,?,?)",
                    (str(uuid.uuid4()), owner["owner_id"], now, now),
                )
            conn.execute(
                "UPDATE support_topics SET conversation_id=(SELECT conversation_id FROM support_conversations c WHERE c.owner_id=support_topics.owner_id) WHERE conversation_id=''"
            )

    @staticmethod
    def _message(row):
        return dict(row)

    def _open_topic(self, conn, owner_id: str, now: int) -> str:
        conversation = conn.execute(
            "SELECT conversation_id FROM support_conversations WHERE owner_id=?", (owner_id,)
        ).fetchone()
        if not conversation:
            conversation_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO support_conversations(conversation_id,owner_id,created_at,updated_at) VALUES(?,?,?,?)",
                (conversation_id, owner_id, now, now),
            )
        else:
            conversation_id = conversation["conversation_id"]
        row = conn.execute(
            "SELECT ticket_id FROM support_topics WHERE owner_id=? AND status='open'", (owner_id,)
        ).fetchone()
        if row:
            return row["ticket_id"]
        ticket_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO support_topics(ticket_id,owner_id,conversation_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            (ticket_id, owner_id, conversation_id, "open", now, now),
        )
        conn.execute("UPDATE support_conversations SET updated_at=? WHERE conversation_id=?", (now, conversation_id))
        return ticket_id

    def append(
        self,
        owner_id: str,
        text: str,
        author_type: str,
        request_id: str = "",
        now: int | None = None,
        ticket_id: str = "",
    ):
        now = int(time.time()) if now is None else int(now)
        safe = redact(text)
        request_id = str(request_id or "")
        payload_hash = hashlib.sha256(json.dumps([author_type, safe], ensure_ascii=False).encode()).hexdigest()
        with self._connect() as conn:
            if request_id:
                old = conn.execute(
                    "SELECT * FROM support_messages WHERE owner_id=? AND request_id=?", (owner_id, request_id)
                ).fetchone()
                if old:
                    if old["payload_hash"] != payload_hash:
                        raise ValueError("request_id_conflict")
                    return self._message(old)
            if ticket_id:
                topic = conn.execute(
                    "SELECT * FROM support_topics WHERE ticket_id=?", (ticket_id,)
                ).fetchone()
                if not topic:
                    raise ValueError("ticket_not_found")
                if topic["owner_id"] != owner_id:
                    raise ValueError("ticket_owner_mismatch")
                if topic["status"] != "open":
                    raise ValueError("ticket_closed")
            else:
                ticket_id = self._open_topic(conn, owner_id, now)
            message_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO support_messages VALUES(?,?,?,?,?,?,?,?)",
                (message_id, ticket_id, owner_id, request_id, payload_hash, author_type, safe, now),
            )
            conn.execute("UPDATE support_topics SET updated_at=? WHERE ticket_id=?", (now, ticket_id))
            conn.execute(
                "UPDATE support_conversations SET updated_at=(SELECT updated_at FROM support_topics WHERE ticket_id=?) WHERE conversation_id=(SELECT conversation_id FROM support_topics WHERE ticket_id=?)",
                (ticket_id, ticket_id),
            )
            return self._message(conn.execute("SELECT * FROM support_messages WHERE message_id=?", (message_id,)).fetchone())

    def conversation_for_owner(self, owner_id: str):
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM support_conversations WHERE owner_id=?", (owner_id,)).fetchone()
            return dict(row) if row else None

    def conversation(self, conversation_id: str):
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM support_conversations WHERE conversation_id=?", (conversation_id,)).fetchone()
            return dict(row) if row else None

    def conversations(self):
        with self._connect() as conn:
            return [dict(row) for row in conn.execute(
                "SELECT * FROM support_conversations ORDER BY updated_at DESC, conversation_id"
            ).fetchall()]

    def current_topic_for_conversation(self, conversation_id: str):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM support_topics WHERE conversation_id=? AND status='open' ORDER BY updated_at DESC LIMIT 1",
                (conversation_id,),
            ).fetchone()
            return dict(row) if row else None

    def messages_for_conversation(self, conversation_id: str):
        with self._connect() as conn:
            return [self._message(row) for row in conn.execute(
                "SELECT m.*, t.conversation_id FROM support_messages m JOIN support_topics t ON t.ticket_id=m.ticket_id WHERE t.conversation_id=? ORDER BY m.created_at,m.rowid",
                (conversation_id,),
            ).fetchall()]

    def topic(self, ticket_id: str):
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM support_topics WHERE ticket_id=?", (ticket_id,)).fetchone()
            return dict(row) if row else None

    def messages_for_ticket(self, ticket_id: str):
        with self._connect() as conn:
            return [self._message(row) for row in conn.execute(
                "SELECT m.*, t.conversation_id FROM support_messages m JOIN support_topics t ON t.ticket_id=m.ticket_id WHERE m.ticket_id=? ORDER BY m.created_at,m.rowid", (ticket_id,)
            ).fetchall()]

    def messages_for_owner(self, owner_id: str):
        with self._connect() as conn:
            return [self._message(row) for row in conn.execute(
                "SELECT m.*, t.conversation_id FROM support_messages m JOIN support_topics t ON t.ticket_id=m.ticket_id WHERE m.owner_id=? ORDER BY m.created_at,m.rowid", (owner_id,)
            ).fetchall()]

    def message(self, message_id: str):
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM support_messages WHERE message_id=?", (message_id,)).fetchone()
            return self._message(row) if row else None

    def close_ticket(self, ticket_id: str, closed_by: str, now: int | None = None):
        now = int(time.time()) if now is None else int(now)
        with self._connect() as conn:
            topic = conn.execute("SELECT * FROM support_topics WHERE ticket_id=?", (ticket_id,)).fetchone()
            if not topic:
                raise ValueError("ticket_not_found")
            if topic["status"] == "closed":
                return dict(topic)
            retention_until = now + self.retention_days * 86400
            conn.execute(
                "UPDATE support_topics SET status='closed',updated_at=?,closed_at=?,closed_by=?,retention_until=? WHERE ticket_id=?",
                (now, now, closed_by, retention_until, ticket_id),
            )
            conn.execute(
                "UPDATE support_conversations SET updated_at=? WHERE conversation_id=?",
                (now, topic["conversation_id"] or ""),
            )
            body = "✅ Тему закрыли. Если вопрос остался — напиши снова."
            message_id = str(uuid.uuid4())
            payload_hash = hashlib.sha256(json.dumps(["system", body], ensure_ascii=False).encode()).hexdigest()
            conn.execute(
                "INSERT INTO support_messages VALUES(?,?,?,?,?,?,?,?)",
                (message_id, ticket_id, topic["owner_id"], "", payload_hash, "system", body, now),
            )
            return dict(conn.execute("SELECT * FROM support_topics WHERE ticket_id=?", (ticket_id,)).fetchone())

    def purge(self, now: int | None = None, dry_run: bool = False) -> int:
        now = int(time.time()) if now is None else int(now)
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT ticket_id FROM support_topics WHERE status='closed' AND retention_until>0 AND retention_until<=?",
                (now,),
            ).fetchall()
            if not dry_run:
                conn.executemany("DELETE FROM support_topics WHERE ticket_id=?", [(row["ticket_id"],) for row in rows])
            return len(rows)
