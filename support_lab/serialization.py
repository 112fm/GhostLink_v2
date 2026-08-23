"""Response mapping for the local support API."""

from support_lab.redaction import redact


def message_view(message: dict) -> dict:
    return {
        "message_id": message["message_id"],
        "ticket_id": message["ticket_id"],
        "conversation_id": message.get("conversation_id", ""),
        "author_type": message["author_type"],
        "text": redact(message.get("body", message.get("text", ""))),
        "created_at": message["created_at"],
    }
