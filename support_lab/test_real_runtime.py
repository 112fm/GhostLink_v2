"""Dependency-complete local audit; never uses production config or transport."""

from __future__ import annotations

import asyncio
import datetime as dt
import tempfile
import unittest
from collections import defaultdict
from pathlib import Path
from unittest.mock import patch

try:
    from aiogram import Bot, Dispatcher, types
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient

    from backend.routes.admin import create_admin_router
    from backend.routes.support import create_support_router
    from backend.storage.support import SupportStore
    from bot.modules.handlers import register_handlers
except ModuleNotFoundError:
    REAL_RUNTIME_AVAILABLE = False
else:
    REAL_RUNTIME_AVAILABLE = True


@unittest.skipUnless(REAL_RUNTIME_AVAILABLE, "dependency-complete local runtime is unavailable")
class LocalRealRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "runtime-support.db")
        self.db = {
            "user-a": {"name": "Test A"},
            "user-b": {"name": "Test B"},
            "admin-1": {"name": "Test Admin"},
            "_meta": {},
        }
        self.auth = {"token-a": "user-a", "token-b": "user-b", "admin-token": "admin-1"}
        self.telegram_payloads = []
        self.telegram_timeout = False

        def resolve_auth_user(initdata, pwa_token):
            user_id = self.auth.get(initdata or pwa_token)
            return {"tg_id": user_id} if user_id else None

        def require_admin_access(initdata, pwa_token):
            if (initdata or pwa_token) != "admin-token":
                raise HTTPException(status_code=401, detail="unauthorized")
            return "admin-1"

        def load_db():
            return self.db

        def save_db(value):
            self.db.clear()
            self.db.update(value)

        def get_admins(_db):
            return ["admin-1"]

        self.request_patch = patch("requests.post", side_effect=self._telegram_post)
        self.request_patch.start()
        self.addCleanup(self.request_patch.stop)

        support_ctx = {
            "resolve_auth_user": resolve_auth_user,
            "load_db": load_db,
            "save_db": save_db,
            "get_admins": get_admins,
            "bot_token": "local-test-token",
            "db_file": self.db_path,
        }

        admin_ctx = defaultdict(lambda: self._noop)
        admin_ctx.update(
            {
                "require_admin_access": require_admin_access,
                "load_db": load_db,
                "save_db": save_db,
                "admin_id": "admin-1",
                "bot_token": "local-test-token",
                "db_file": self.db_path,
                "get_free_mem_mb": lambda: 1024,
                "vapid_private_key_path": "",
                "vapid_claims": {},
                "webpush_fn": None,
            }
        )
        self.app = FastAPI()
        self.app.include_router(create_support_router(support_ctx))
        self.app.include_router(create_admin_router(admin_ctx))
        self.client = TestClient(self.app)

    @staticmethod
    def _noop(*_args, **_kwargs):
        return False

    def tearDown(self):
        self.tmpdir.cleanup()

    def _headers(self, token):
        return {"X-Telegram-Initdata": token}

    def _telegram_post(self, _url, *, json, timeout):
        if self.telegram_timeout:
            raise TimeoutError("offline Telegram transport timeout")
        self.telegram_payloads.append({"json": json, "timeout": timeout})
        return type("Response", (), {"status_code": 200})()

    def test_real_fastapi_user_route_auth_history_redaction_and_retry(self):
        self.assertEqual(self.client.get("/api/user/support").status_code, 401)
        created = self.client.post(
            "/api/user/support",
            headers={**self._headers("token-a"), "X-Request-ID": "real-1"},
            json={"text": "Не работает Authorization: Bearer real-secret", "request_id": "real-1"},
        )
        self.assertEqual(created.status_code, 200)
        self.assertIn("Не работает", created.json()["msg"]["text"])
        self.assertNotIn("real-secret", created.text)
        self.assertEqual(len(self.telegram_payloads), 1)
        self.assertNotIn("real-secret", self.telegram_payloads[0]["json"]["text"])

        replay = self.client.post(
            "/api/user/support",
            headers=self._headers("token-a"),
            json={"text": "Не работает Authorization: Bearer real-secret", "request_id": "real-1"},
        )
        conflict = self.client.post(
            "/api/user/support",
            headers=self._headers("token-a"),
            json={"text": "another", "request_id": "real-1"},
        )
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(len(SupportStore(self.db_path).list_messages("user-a")), 1)

        own = self.client.get("/api/user/support", headers=self._headers("token-a"))
        other = self.client.get("/api/user/support", headers=self._headers("token-b"))
        self.assertEqual(own.status_code, 200)
        self.assertEqual(len(own.json()["items"]), 1)
        self.assertEqual(other.json()["items"], [])

    def test_real_fastapi_timeout_keeps_message_and_retention_dry_run_is_read_only(self):
        self.telegram_timeout = True
        response = self.client.post(
            "/api/user/support",
            headers=self._headers("token-a"),
            json={"text": "Timeout and retention", "request_id": "real-timeout"},
        )
        self.assertEqual(response.status_code, 200)
        store = SupportStore(self.db_path)
        self.assertEqual(len(store.list_messages("user-a")), 1)
        topic = store.list_topics("user-a")[0]
        store.close_topic("user-a", "admin-1", now=100)
        before = len(store.list_messages("user-a"))
        self.assertEqual(store.purge_expired(now=100 + 2 * 365 * 86400, dry_run=True), 1)
        self.assertEqual(len(store.list_messages("user-a")), before)
        self.assertEqual(topic["status"], "open")

    def test_real_admin_routes_expose_current_user_scoped_not_ticket_scoped_contract(self):
        created = self.client.post(
            "/api/user/support",
            headers=self._headers("token-a"),
            json={"text": "A topic", "request_id": "admin-a"},
        )
        ticket_id = created.json()["msg"]["ticket_id"]
        tickets = self.client.get("/api/admin/support_tickets", headers=self._headers("admin-token"))
        self.assertEqual(tickets.status_code, 200)
        self.assertIn(ticket_id, {item["messages"][0]["ticket_id"] for item in tickets.json()["items"]})

        # Audit fact: current production-shaped admin API accepts user_id, not ticket_id.
        reply = self.client.post(
            "/api/admin/support_reply",
            headers=self._headers("admin-token"),
            json={"user_id": "user-a", "text": "Reply", "request_id": "admin-reply"},
        )
        close = self.client.post(
            "/api/admin/support_close",
            headers=self._headers("admin-token"),
            json={"user_id": "user-a"},
        )
        self.assertEqual(reply.status_code, 200)
        self.assertEqual(close.status_code, 200)
        self.assertIn("ticket_id", close.json())
        # The exact-ticket ACL is therefore proven by support_lab, not by this legacy route.

    def test_real_conversation_routes_list_reply_close_and_reopen(self):
        created = self.client.post(
            "/api/user/support",
            headers={**self._headers("token-a"), "X-Request-ID": "conversation-real-1"},
            json={"text": "Conversation question", "request_id": "conversation-real-1"},
        )
        self.assertEqual(created.status_code, 200)
        conversation_id = created.json()["conversation_id"]

        listed = self.client.get("/api/admin/support_conversations", headers=self._headers("admin-token"))
        self.assertEqual(listed.status_code, 200)
        self.assertIn(conversation_id, {item["conversation_id"] for item in listed.json()["items"]})
        foreign = self.client.get(
            f"/api/admin/support_conversations/{conversation_id}",
            headers=self._headers("token-a"),
        )
        self.assertEqual(foreign.status_code, 401)

        history = self.client.get(
            f"/api/admin/support_conversations/{conversation_id}",
            headers=self._headers("admin-token"),
        )
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.json()["items"]), 1)

        reply = self.client.post(
            f"/api/admin/support_conversations/{conversation_id}/reply",
            headers={**self._headers("admin-token"), "X-Request-ID": "conversation-real-2"},
            json={"text": "Conversation answer", "request_id": "conversation-real-2"},
        )
        self.assertEqual(reply.status_code, 200)
        close = self.client.post(
            f"/api/admin/support_conversations/{conversation_id}/close",
            headers=self._headers("admin-token"),
        )
        self.assertEqual(close.status_code, 200)

        client_history = self.client.get("/api/user/support", headers=self._headers("token-a"))
        self.assertEqual(client_history.json()["conversation_id"], conversation_id)
        self.assertEqual(client_history.json()["items"][-1]["is_admin"], True)

        reopened = self.client.post(
            "/api/user/support",
            headers={**self._headers("token-a"), "X-Request-ID": "conversation-real-3"},
            json={"text": "New topic in same chat", "request_id": "conversation-real-3"},
        )
        self.assertEqual(reopened.status_code, 200)
        self.assertEqual(reopened.json()["conversation_id"], conversation_id)

    def test_real_aiogram_registers_project_support_handler_offline(self):
        bot = Bot("123456:ABCdefGHIjklMNOpqrSTUvwxYZ")
        dispatcher = Dispatcher(bot)
        db = self.db
        notifications = []

        async def notify_admins(_bot, text, **_kwargs):
            notifications.append(text)

        class Deps(defaultdict):
            def __missing__(self, _key):
                return lambda *_args, **_kwargs: False

        deps = Deps()
        deps.update(
            {
                "bot": bot,
                "ADMIN_ID": "admin-1",
                "APP_ANDROID": "",
                "APP_IOS": "",
                "APP_MAC": "",
                "APP_WINDOWS": "",
                "WEBAPP_URL": "",
                "WEBAPP_CACHE_TOKEN": "",
                "PANEL_PROXY_TTL_SEC": 0,
                "TRIAL_DAYS": 7,
                "VAPID_CLAIMS": {},
                "VAPID_PRIVATE_KEY_PATH": "",
                "webpush": None,
                "load_db": lambda: db,
                "save_db": lambda value: db.update(value),
                "is_admin": lambda user_id: str(user_id) == "admin-1",
                "notify_admins": notify_admins,
                "admin_state": {},
                "user_kb": lambda *_args, **_kwargs: None,
                "_int_or_zero": lambda value: int(value or 0),
                "support_store": SupportStore(self.db_path),
                "db_file": self.db_path,
            }
        )
        register_handlers(dispatcher, deps)
        support_handler = next(
            item.handler
            for item in dispatcher.message_handlers.handlers
            if item.handler.__name__ == "handle_user_support_message"
        )
        self.assertEqual(len(dispatcher.message_handlers.handlers), 8)

        message = types.Message(
            message_id=1,
            **{"from": {"id": 1001, "is_bot": False, "first_name": "Test"}},
            chat=types.Chat(id=1001, type="private"),
            date=int(dt.datetime.now(dt.timezone.utc).timestamp()),
            text="Ошибка Cookie: sid=bot-secret",
        )

        async def no_network(*_args, **_kwargs):
            return None

        with patch.object(Bot, "send_message", new=no_network):
            Bot.set_current(bot)
            asyncio.run(support_handler(message))
        self.assertEqual(len(notifications), 1)
        self.assertNotIn("bot-secret", notifications[0])
        self.assertEqual(len(SupportStore(self.db_path).list_messages("1001")), 1)


if __name__ == "__main__":
    unittest.main()
