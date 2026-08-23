import tempfile
import unittest
from pathlib import Path

from support_lab.mock_api import SupportMockAPI
from support_lab.runtime import FakeAiogramBot, LocalFastAPIRouteDouble, dependency_status


class SupportRuntimeDoubleTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        api = SupportMockAPI(str(Path(self.tmpdir.name) / "support-runtime.db"))
        self.api = api
        self.routes = LocalFastAPIRouteDouble(api, FakeAiogramBot())
        self.bot = self.routes.bot
        self.user_a = api.login("user-a")
        self.user_b = api.login("user-b")
        self.admin = api.login("test-admin", admin=True)

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_route_auth_storage_and_redacted_bot_delivery(self):
        denied = self.routes.post_user_support("bad-session", "hello", "auth-1")
        self.assertEqual(denied.status_code, 401)

        created = self.routes.post_user_support(
            self.user_a,
            "Не работает; Authorization: Bearer route-secret",
            "route-1",
        )
        self.assertEqual(created.status_code, 200)
        self.assertEqual(len(self.bot.notifications), 1)
        safe = self.bot.notifications[0]["text"]
        self.assertIn("Не работает", safe)
        self.assertIn("Authorization: Bearer [REDACTED]", safe)
        self.assertNotIn("route-secret", safe)
        self.assertEqual(self.routes.get_user_support(self.user_a).status_code, 200)

    def test_timeout_commits_once_and_retry_replays_without_duplicate_message(self):
        self.bot.timeout_next = True
        first = self.routes.post_user_support(self.user_a, "Timeout-safe", "timeout-1")
        self.assertEqual(first.status_code, 202)
        self.assertEqual(first.body["delivery"], "pending")
        retry = self.routes.post_user_support(self.user_a, "Timeout-safe", "timeout-1")
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(first.body["message"]["message_id"], retry.body["message"]["message_id"])
        self.assertEqual(len(self.api.store.messages_for_owner("user-a")), 1)

    def test_route_acl_close_delivery_and_two_topics_stay_separate(self):
        first = self.routes.post_user_support(self.user_a, "A topic", "topic-1")
        first_ticket = first.body["message"]["ticket_id"]
        second_user = self.routes.post_user_support(self.user_b, "B topic", "topic-2")
        second_ticket = second_user.body["message"]["ticket_id"]

        self.assertEqual(self.routes.get_admin_ticket(self.admin, first_ticket).status_code, 403)
        self.assertEqual(self.routes.open_admin_ticket(self.admin, first_ticket).status_code, 200)
        self.assertEqual(self.routes.post_admin_reply(self.admin, first_ticket, "A answer", "reply-1").status_code, 200)
        self.assertEqual(self.routes.get_admin_ticket(self.admin, first_ticket).status_code, 200)
        self.assertEqual(self.routes.get_admin_ticket(self.admin, second_ticket).status_code, 403)
        self.assertEqual(self.routes.post_admin_reply(self.admin, second_ticket, "wrong topic", "reply-2").status_code, 403)
        self.assertEqual(self.routes.post_admin_close(self.admin, first_ticket).status_code, 200)
        self.assertEqual(self.routes.post_admin_reply(self.admin, first_ticket, "late", "reply-3").status_code, 409)

        client_history = self.routes.get_user_support(self.user_a, first_ticket)
        self.assertEqual(client_history.status_code, 200)
        self.assertEqual(client_history.body["items"][-1]["author_type"], "system")
        self.assertNotIn("B topic", {item["text"] for item in client_history.body["items"]})

        new_topic = self.routes.post_user_support(self.user_a, "A new topic", "topic-3")
        self.assertNotEqual(new_topic.body["message"]["ticket_id"], first_ticket)
        old_texts = {item["text"] for item in self.routes.get_admin_ticket(self.admin, first_ticket).body["items"]}
        self.assertNotIn("A new topic", old_texts)
        self.assertEqual(self.routes.get_user_support(self.user_b, first_ticket).status_code, 404)

    def test_dependency_probe_is_explicit_about_test_doubles(self):
        status = dependency_status()
        self.assertEqual(set(status), {"fastapi", "aiogram", "httpx", "starlette"})
        self.assertIsInstance(status["fastapi"], bool)
        self.assertIsInstance(status["aiogram"], bool)


if __name__ == "__main__":
    unittest.main()
