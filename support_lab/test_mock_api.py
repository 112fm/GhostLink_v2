import tempfile
import unittest
from pathlib import Path

from support_lab.mock_api import SupportMockAPI
from support_lab.redaction import redact, redact_error, redact_log


class SupportMockApiTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "support-lab.db")
        self.api = SupportMockAPI(self.db_path)
        self.a = self.api.login("user-a")
        self.b = self.api.login("user-b")
        self.admin = self.api.login("test-admin", admin=True)

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_authorized_owner_reads_only_own_topic(self):
        created = self.api.user_send(self.a, "A first", "a-1")
        self.assertEqual(created.status_code, 200)
        ticket_id = created.body["message"]["ticket_id"]

        self.assertEqual(self.api.user_history(self.a).status_code, 200)
        self.assertNotIn("owner_id", self.api.user_history(self.a).body["items"][0])
        self.assertEqual(self.api.user_history(self.b).body["items"], [])
        self.assertEqual(self.api.user_history(self.b, ticket_id).status_code, 404)
        self.assertEqual(self.api.user_message(self.b, created.body["message"]["message_id"]).status_code, 404)
        self.assertEqual(self.api.user_history("not-a-session").status_code, 401)

    def test_admin_reply_and_history_are_ticket_scoped(self):
        a_created = self.api.user_send(self.a, "A first", "a-1")
        b_created = self.api.user_send(self.b, "B first", "b-1")
        a_ticket = a_created.body["message"]["ticket_id"]
        b_ticket = b_created.body["message"]["ticket_id"]

        self.assertEqual(self.api.admin_history(self.admin, a_ticket).status_code, 403)
        self.assertEqual(self.api.admin_open_ticket(self.admin, a_ticket).status_code, 200)
        self.assertEqual(self.api.admin_reply(self.admin, a_ticket, "A answer", "admin-a-1").status_code, 200)
        a_history = self.api.admin_history(self.admin, a_ticket)
        self.assertEqual(self.api.admin_reply(self.admin, b_ticket, "B answer", "admin-b-1").status_code, 403)
        self.assertEqual(a_history.status_code, 200)
        self.assertEqual({item["text"] for item in a_history.body["items"]}, {"A first", "A answer"})
        self.assertEqual(self.api.admin_history(self.admin, b_ticket).status_code, 403)
        self.assertEqual(self.api.admin_history(self.admin, "missing-ticket").status_code, 404)
        self.assertEqual(self.api.admin_history(self.a, a_ticket).status_code, 403)

    def test_only_admin_closes_correct_ticket_and_client_sees_system_message(self):
        created = self.api.user_send(self.a, "Question", "q-1")
        ticket_id = created.body["message"]["ticket_id"]
        self.assertEqual(self.api.admin_close(self.b, ticket_id).status_code, 403)
        self.assertEqual(self.api.admin_close(self.admin, "missing-ticket").status_code, 404)
        self.assertEqual(self.api.admin_open_ticket(self.admin, ticket_id).status_code, 200)

        closed = self.api.admin_close(self.admin, ticket_id)
        self.assertEqual(closed.status_code, 200)
        self.assertEqual(closed.body["status"], "closed")
        client_history = self.api.user_history(self.a, ticket_id)
        self.assertEqual(client_history.status_code, 200)
        self.assertEqual(client_history.body["items"][-1]["author_type"], "system")
        self.assertIn("Тему закрыли", client_history.body["items"][-1]["text"])

        new = self.api.user_send(self.a, "Follow-up", "q-2")
        self.assertNotEqual(new.body["message"]["ticket_id"], ticket_id)
        self.assertEqual(len(self.api.admin_history(self.admin, ticket_id).body["items"]), 2)

    def test_admin_reply_cannot_reopen_or_write_into_closed_ticket(self):
        created = self.api.user_send(self.a, "Question", "closed-1")
        ticket_id = created.body["message"]["ticket_id"]
        self.assertEqual(self.api.admin_open_ticket(self.admin, ticket_id).status_code, 200)
        self.assertEqual(self.api.admin_close(self.admin, ticket_id).status_code, 200)

        reply = self.api.admin_reply(self.admin, ticket_id, "Late answer", "closed-2")

        self.assertEqual(reply.status_code, 409)
        self.assertEqual(reply.body["detail"], "ticket_closed")
        self.assertEqual(len(self.api.admin_history(self.admin, ticket_id).body["items"]), 2)
        self.assertEqual(len(self.api.store.messages_for_owner("user-a")), 2)

    def test_one_durable_conversation_contains_reopened_topics(self):
        first = self.api.user_send(self.a, "Первая тема", "conversation-1")
        conversation_id = first.body["message"]["conversation_id"]
        first_ticket = first.body["message"]["ticket_id"]
        self.assertEqual(self.api.user_conversation(self.a, conversation_id).status_code, 200)
        self.assertEqual(self.api.user_conversation(self.b, conversation_id).status_code, 404)
        listed = self.api.admin_list_conversations(self.admin)
        self.assertEqual(listed.status_code, 200)
        self.assertIn(conversation_id, {item["conversation_id"] for item in listed.body["items"]})
        self.assertEqual(self.api.admin_conversation_history(self.admin, conversation_id).status_code, 403)
        self.assertEqual(self.api.admin_open_conversation(self.admin, conversation_id).status_code, 200)
        self.assertEqual(self.api.admin_conversation_reply(self.admin, conversation_id, "Ответ", "conversation-2").status_code, 200)
        self.assertEqual(self.api.admin_conversation_close(self.admin, conversation_id).status_code, 200)

        closed = self.api.user_conversation(self.a, conversation_id)
        self.assertEqual(closed.body["conversation"]["conversation_id"], conversation_id)
        self.assertEqual(closed.body["items"][-1]["author_type"], "system")

        reopened = self.api.user_send(self.a, "Новая тема в том же чате", "conversation-3")
        self.assertEqual(reopened.body["message"]["conversation_id"], conversation_id)
        self.assertNotEqual(reopened.body["message"]["ticket_id"], first_ticket)
        history = self.api.admin_conversation_history(self.admin, conversation_id)
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.body["items"]), 4)
        self.assertIn("Новая тема в том же чате", {item["text"] for item in history.body["items"]})
        self.assertEqual(self.api.user_conversation(self.b).body["items"], [])

    def test_duplicate_request_restart_and_retention_dry_run(self):
        self.api.store.retention_days = 1
        first = self.api.user_send(self.a, "Retry me", "same-id")
        replay = self.api.user_send(self.a, "Retry me", "same-id")
        conflict = self.api.user_send(self.a, "Changed", "same-id")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(first.body["message"]["message_id"], replay.body["message"]["message_id"])
        self.assertEqual(conflict.status_code, 409)

        ticket_id = first.body["message"]["ticket_id"]
        self.api.store.close_ticket(ticket_id, "test-admin", now=100)
        result = self.api.retention(dry_run=True, now=100 + 2 * 86400)
        self.assertEqual(result.body["expired_topics"], 1)
        self.assertEqual(self.api.user_history(self.a, ticket_id).status_code, 200)

        restarted = SupportMockAPI(self.db_path)
        new_a = restarted.login("user-a")
        self.assertEqual(len(restarted.user_history(new_a, ticket_id).body["items"]), 2)

    def test_redaction_masks_credentials_and_preserves_normal_text(self):
        response = self.api.user_send(
            self.a,
            "Не работает vless://secret@example.com:443 пароль=letmein "
            'карта 4111 1111 1111 1111 cvc=123 query_id=q&user=u&auth_date=1&hash=h '
            'json={"password":"json-pass","token":"json-token","api_key":"json-key"} '
            "tgWebAppData=query_id%3Dq%26user%3Du%26hash%3Dh",
            "redact-1",
        )
        self.assertEqual(response.status_code, 200)
        text = response.body["message"]["text"]
        self.assertTrue(text.startswith("Не работает"))
        self.assertNotIn("secret@example.com", text)
        self.assertNotIn("letmein", text)
        self.assertNotIn("4111 1111 1111 1111", text)
        self.assertNotIn("query_id=", text)
        self.assertNotIn("json-pass", text)
        self.assertNotIn("json-token", text)
        self.assertNotIn("json-key", text)
        self.assertNotIn("tgWebAppData=", text)

    def test_redaction_masks_headers_and_all_pem_private_key_variants(self):
        message = (
            "Диагностика запроса:\n"
            "Authorization: Bearer bearer-secret\n"
            "Authorization: Basic basic-secret\n"
            "Cookie: session=secret-cookie; theme=dark\n"
            "Set-Cookie: session=secret-set-cookie; HttpOnly\n"
            "-----BEGIN PRIVATE KEY-----\n"
            "generic-private-material\n"
            "-----END PRIVATE KEY-----\n"
            "-----BEGIN RSA PRIVATE KEY-----\n"
            "rsa-private-material\n"
            "-----END RSA PRIVATE KEY-----\n"
            "-----BEGIN EC PRIVATE KEY-----\n"
            "ec-private-material\n"
            "-----END EC PRIVATE KEY-----\n"
            "-----BEGIN OPENSSH PRIVATE KEY-----\n"
            "openssh-private-material\n"
            "-----END OPENSSH PRIVATE KEY-----\n"
        )
        safe = redact(message)

        self.assertIn("Authorization: Bearer [REDACTED]", safe)
        self.assertIn("Authorization: Basic [REDACTED]", safe)
        self.assertIn("Cookie: [REDACTED]", safe)
        self.assertIn("Set-Cookie: [REDACTED]", safe)
        self.assertEqual(safe.count("[REDACTED: PRIVATE KEY]"), 4)
        for secret in (
            "bearer-secret",
            "basic-secret",
            "secret-cookie",
            "secret-set-cookie",
            "generic-private-material",
            "rsa-private-material",
            "ec-private-material",
            "openssh-private-material",
        ):
            self.assertNotIn(secret, safe)
        self.assertIn("Диагностика запроса:", safe)

        compact = redact(
            "Authorization: Bearer bearer-secret Cookie: session=secret-cookie "
            "Set-Cookie: session=secret-set-cookie"
        )
        self.assertIn("Authorization: Bearer [REDACTED]", compact)
        self.assertIn("Cookie: [REDACTED]", compact)
        self.assertIn("Set-Cookie: [REDACTED]", compact)
        self.assertNotIn("bearer-secret", compact)
        self.assertNotIn("secret-cookie", compact)
        self.assertNotIn("secret-set-cookie", compact)

    def test_redaction_applies_before_storage_and_both_history_shapes(self):
        raw = "Authorization: Bearer stored-secret\nCookie: sid=stored-cookie"
        response = self.api.user_send(self.a, raw, "stored-redact-1")
        self.assertEqual(response.status_code, 200)
        ticket_id = response.body["message"]["ticket_id"]

        with self.api.store._connect() as conn:
            stored = conn.execute("SELECT body FROM support_messages").fetchone()["body"]
        self.assertNotIn("stored-secret", stored)
        self.assertNotIn("stored-cookie", stored)
        self.assertNotIn("stored-secret", self.api.user_history(self.a).body["items"][0]["text"])
        self.assertNotIn("stored-cookie", self.api.user_history(self.a, ticket_id).body["items"][0]["text"])
        self.assertNotIn("stored-secret", self.api.user_history(self.a, ticket_id).body["items"][0]["text"])
        self.assertNotIn("stored-cookie", self.api.user_history(self.a, ticket_id).body["items"][0]["text"])
        self.assertEqual(
            self.api.user_message(self.a, response.body["message"]["message_id"]).status_code,
            200,
        )

    def test_error_and_log_redaction_keep_context_without_secret(self):
        raw = "request failed: Authorization: Bearer error-secret, Cookie: sid=log-secret"
        for safe in (redact_error(raw), redact_log(raw)):
            self.assertIn("request failed:", safe)
            self.assertIn("Authorization: Bearer [REDACTED]", safe)
            self.assertIn("Cookie: [REDACTED]", safe)
            self.assertNotIn("error-secret", safe)
            self.assertNotIn("log-secret", safe)


if __name__ == "__main__":
    unittest.main()
