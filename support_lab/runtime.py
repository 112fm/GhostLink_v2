"""Local route and bot doubles for dependency-free support integration tests."""

from __future__ import annotations

from support_lab.mock_api import MockResponse, SupportMockAPI
from support_lab.serialization import message_view


def dependency_status() -> dict[str, bool]:
    """Report optional runtime dependencies without importing production code."""
    result = {}
    for name in ("fastapi", "aiogram", "httpx", "starlette"):
        try:
            __import__(name)
        except ImportError:
            result[name] = False
        else:
            result[name] = True
    return result


class FakeAiogramBot:
    """Test double for an aiogram notifier; it records only redacted payloads."""

    def __init__(self):
        self.notifications: list[dict] = []
        self.timeout_next = False

    def notify_admin(self, message: dict) -> None:
        if self.timeout_next:
            self.timeout_next = False
            raise TimeoutError("telegram notifier timeout")
        safe = message_view(message)
        self.notifications.append(safe)


class LocalFastAPIRouteDouble:
    """Route-shaped adapter used when FastAPI is not installed locally."""

    def __init__(self, api: SupportMockAPI, bot: FakeAiogramBot):
        self.api = api
        self.bot = bot

    def post_user_support(self, session: str, text: str, request_id: str) -> MockResponse:
        response = self.api.user_send(session, text, request_id)
        if response.status_code != 200:
            return response
        try:
            self.bot.notify_admin(response.body["message"])
        except TimeoutError:
            return MockResponse(
                202,
                {
                    "ok": True,
                    "message": response.body["message"],
                    "delivery": "pending",
                },
            )
        return response

    def get_user_support(self, session: str, ticket_id: str = "") -> MockResponse:
        return self.api.user_history(session, ticket_id)

    def open_admin_ticket(self, session: str, ticket_id: str) -> MockResponse:
        return self.api.admin_open_ticket(session, ticket_id)

    def get_admin_ticket(self, session: str, ticket_id: str) -> MockResponse:
        return self.api.admin_history(session, ticket_id)

    def post_admin_reply(self, session: str, ticket_id: str, text: str, request_id: str) -> MockResponse:
        return self.api.admin_reply(session, ticket_id, text, request_id)

    def post_admin_close(self, session: str, ticket_id: str) -> MockResponse:
        return self.api.admin_close(session, ticket_id)
