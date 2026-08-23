"""Dependency-free, authenticated mock API for the local support lab."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import secrets

from support_lab.serialization import message_view
from support_lab.storage import LabStore


@dataclass(frozen=True)
class MockResponse:
    status_code: int
    body: dict


class SupportMockAPI:
    def __init__(self, db_path: str | Path, admin_id: str = "test-admin"):
        self.db_path = str(db_path)
        self.admin_id = str(admin_id)
        self.store = LabStore(self.db_path)
        self._sessions: dict[str, tuple[str, bool]] = {}
        self._admin_ticket_acl: dict[str, set[str]] = {}

    def login(self, user_id: str, *, admin: bool = False) -> str:
        user_id = str(user_id)
        if admin and user_id != self.admin_id:
            raise ValueError("unknown_admin")
        token = f"lab_{secrets.token_urlsafe(18)}"
        self._sessions[token] = (user_id, admin)
        return token

    def _session(self, token: str, *, admin: bool = False):
        session = self._sessions.get(str(token))
        if not session:
            return None, MockResponse(401, {"detail": "invalid_session"})
        user_id, is_admin = session
        if admin and not is_admin:
            return None, MockResponse(403, {"detail": "admin_required"})
        return (user_id, is_admin), None

    def user_send(self, session_token: str, text: str, request_id: str = "") -> MockResponse:
        session, error = self._session(session_token)
        if error:
            return error
        owner_id = session[0]
        try:
            message = self.store.append(owner_id, text, "user", request_id)
        except ValueError as exc:
            return MockResponse(409 if str(exc) == "request_id_conflict" else 400, {"detail": str(exc)})
        view = message_view(message)
        topic = self.store.topic(message["ticket_id"])
        view["conversation_id"] = topic["conversation_id"]
        return MockResponse(200, {"ok": True, "message": view})

    def user_history(self, session_token: str, ticket_id: str = "") -> MockResponse:
        session, error = self._session(session_token)
        if error:
            return error
        owner_id = session[0]
        if ticket_id:
            topic = self.store.topic(ticket_id)
            if not topic or topic["owner_id"] != owner_id:
                return MockResponse(404, {"detail": "ticket_not_found"})
            messages = self.store.messages_for_ticket(ticket_id)
        else:
            messages = self.store.messages_for_owner(owner_id)
        return MockResponse(200, {"items": [message_view(item) for item in messages]})

    def user_conversation(self, session_token: str, conversation_id: str = "") -> MockResponse:
        session, error = self._session(session_token)
        if error:
            return error
        owner_id = session[0]
        conversation = self.store.conversation_for_owner(owner_id)
        if conversation_id and (not conversation or conversation["conversation_id"] != conversation_id):
            return MockResponse(404, {"detail": "conversation_not_found"})
        if not conversation:
            return MockResponse(200, {"conversation": None, "items": []})
        return MockResponse(200, {
            "conversation": {"conversation_id": conversation["conversation_id"]},
            "items": [message_view(item) for item in self.store.messages_for_conversation(conversation["conversation_id"])],
        })

    def user_message(self, session_token: str, message_id: str) -> MockResponse:
        session, error = self._session(session_token)
        if error:
            return error
        message = self.store.message(message_id)
        if not message or message["owner_id"] != session[0]:
            return MockResponse(404, {"detail": "message_not_found"})
        return MockResponse(200, {"message": message_view(message)})

    def admin_reply(self, session_token: str, ticket_id: str, text: str, request_id: str = "") -> MockResponse:
        session, error = self._admin_ticket(session_token, ticket_id)
        if error:
            return error
        topic = self.store.topic(ticket_id)
        if not topic:
            return MockResponse(404, {"detail": "ticket_not_found"})
        try:
            message = self.store.append(
                topic["owner_id"], text, "admin", request_id, ticket_id=ticket_id
            )
        except ValueError as exc:
            code = str(exc)
            status = 409 if code in {"request_id_conflict", "ticket_closed"} else 404 if code == "ticket_not_found" else 400
            return MockResponse(status, {"detail": code})
        return MockResponse(200, {"ok": True, "message": message_view(message)})

    def admin_history(self, session_token: str, ticket_id: str) -> MockResponse:
        _, error = self._admin_ticket(session_token, ticket_id)
        if error:
            return error
        return MockResponse(200, {"items": [message_view(item) for item in self.store.messages_for_ticket(ticket_id)]})

    def admin_open_ticket(self, session_token: str, ticket_id: str) -> MockResponse:
        session, error = self._session(session_token, admin=True)
        if error:
            return error
        if not self.store.topic(ticket_id):
            return MockResponse(404, {"detail": "ticket_not_found"})
        self._admin_ticket_acl.setdefault(session[0], set()).add(ticket_id)
        return MockResponse(200, {"ok": True, "ticket_id": ticket_id})

    def admin_list_conversations(self, session_token: str) -> MockResponse:
        session, error = self._session(session_token, admin=True)
        if error:
            return error
        items = []
        for conversation in self.store.conversations():
            current = self.store.current_topic_for_conversation(conversation["conversation_id"])
            items.append({
                "conversation_id": conversation["conversation_id"],
                "owner_id": conversation["owner_id"],
                "current_ticket_id": current["ticket_id"] if current else None,
                "status": current["status"] if current else "closed",
            })
        return MockResponse(200, {"items": items})

    def admin_open_conversation(self, session_token: str, conversation_id: str) -> MockResponse:
        session, error = self._session(session_token, admin=True)
        if error:
            return error
        if not self.store.conversation(conversation_id):
            return MockResponse(404, {"detail": "conversation_not_found"})
        self._admin_ticket_acl.setdefault(session[0], set()).add(f"conversation:{conversation_id}")
        return MockResponse(200, {"ok": True, "conversation_id": conversation_id})

    def admin_conversation_history(self, session_token: str, conversation_id: str) -> MockResponse:
        session, error = self._session(session_token, admin=True)
        if error:
            return error
        if f"conversation:{conversation_id}" not in self._admin_ticket_acl.get(session[0], set()):
            return MockResponse(403, {"detail": "conversation_not_opened"})
        if not self.store.conversation(conversation_id):
            return MockResponse(404, {"detail": "conversation_not_found"})
        return MockResponse(200, {"items": [message_view(item) for item in self.store.messages_for_conversation(conversation_id)]})

    def admin_conversation_reply(self, session_token: str, conversation_id: str, text: str, request_id: str = "") -> MockResponse:
        session, error = self._session(session_token, admin=True)
        if error:
            return error
        if f"conversation:{conversation_id}" not in self._admin_ticket_acl.get(session[0], set()):
            return MockResponse(403, {"detail": "conversation_not_opened"})
        topic = self.store.current_topic_for_conversation(conversation_id)
        if not topic:
            return MockResponse(409, {"detail": "conversation_closed"})
        try:
            message = self.store.append(topic["owner_id"], text, "admin", request_id, ticket_id=topic["ticket_id"])
        except ValueError as exc:
            code = str(exc)
            status = 409 if code in {"request_id_conflict", "ticket_closed"} else 404 if code == "ticket_not_found" else 400
            return MockResponse(status, {"detail": code})
        view = message_view(message)
        view["conversation_id"] = conversation_id
        return MockResponse(200, {"ok": True, "message": view})

    def admin_conversation_close(self, session_token: str, conversation_id: str) -> MockResponse:
        session, error = self._session(session_token, admin=True)
        if error:
            return error
        if f"conversation:{conversation_id}" not in self._admin_ticket_acl.get(session[0], set()):
            return MockResponse(403, {"detail": "conversation_not_opened"})
        topic = self.store.current_topic_for_conversation(conversation_id)
        if not topic:
            return MockResponse(409, {"detail": "conversation_closed"})
        try:
            closed = self.store.close_ticket(topic["ticket_id"], session[0])
        except ValueError as exc:
            return MockResponse(404, {"detail": str(exc)})
        return MockResponse(200, {
            "ok": True,
            "ticket_id": closed["ticket_id"],
            "conversation_id": conversation_id,
            "status": closed["status"],
        })

    def admin_close(self, session_token: str, ticket_id: str) -> MockResponse:
        session, error = self._admin_ticket(session_token, ticket_id)
        if error:
            return error
        try:
            topic = self.store.close_ticket(ticket_id, session[0])
        except ValueError as exc:
            return MockResponse(404, {"detail": str(exc)})
        return MockResponse(200, {"ok": True, "ticket_id": topic["ticket_id"], "status": topic["status"]})

    def retention(self, *, dry_run: bool = True, now: int | None = None) -> MockResponse:
        count = self.store.purge(now=now, dry_run=dry_run)
        return MockResponse(200, {"ok": True, "dry_run": dry_run, "expired_topics": count})

    def _admin_ticket(self, token: str, ticket_id: str):
        session, error = self._session(token, admin=True)
        if error:
            return None, error
        if not self.store.topic(ticket_id):
            return None, MockResponse(404, {"detail": "ticket_not_found"})
        if ticket_id not in self._admin_ticket_acl.get(session[0], set()):
            return None, MockResponse(403, {"detail": "ticket_not_opened"})
        return session, None
