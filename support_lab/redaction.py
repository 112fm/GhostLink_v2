"""Small redaction filter used only by the local integration lab."""

from __future__ import annotations

import re


_PATTERNS = (
    (
        re.compile(
            r"(?im)(Authorization\s*:\s*(?:Bearer|Basic)\s+)"
            r"(?:(?!\s+(?:Authorization|Cookie|Set-Cookie)\s*:|\r?\n).)+"
        ),
        r"\1[REDACTED]",
    ),
    (
        re.compile(
            r"(?im)(Cookie\s*:\s*)"
            r"(?:(?!\s+(?:Authorization|Cookie|Set-Cookie)\s*:|\r?\n).)+"
        ),
        r"\1[REDACTED]",
    ),
    (
        re.compile(
            r"(?im)(Set-Cookie\s*:\s*)"
            r"(?:(?!\s+(?:Authorization|Cookie|Set-Cookie)\s*:|\r?\n).)+"
        ),
        r"\1[REDACTED]",
    ),
    (
        re.compile(
            r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----.*?"
            r"-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
            re.IGNORECASE | re.DOTALL,
        ),
        "[REDACTED: PRIVATE KEY]",
    ),
    (re.compile(r"(?i)\b(?:vless|vmess|trojan|ss|socks5)://[^\s<]+"), "[скрыто: ссылка]"),
    (re.compile(r"(?i)\b[0-9a-f]{8}-[0-9a-f-]{27,}@[^\s/:]+:\d{2,5}(?:[^\s<]*)?"), "[скрыто: VLESS]"),
    (re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)"), "[скрыто: карта]"),
    (re.compile(r"(?i)[\"']?(?:password|пароль|token|secret|api[_ -]?key|cvc|cvv)[\"']?\s*[:=]\s*[\"']?[^\"'\s,;}]+[\"']?"), "[скрыто: секрет]"),
    (re.compile(r"(?i)\b(?:tgWebAppData|initData)\s*=\s*[^\s]+"), "[скрыто: initData]"),
    (re.compile(r"(?i)(?:query_id|user|auth_date|hash)=[^\s&]+(?:&[^\s]+)+"), "[скрыто: initData]"),
)


def redact(text: str) -> str:
    current = str(text or "")
    for pattern, replacement in _PATTERNS:
        current = pattern.sub(replacement, current)
    return current


def redact_error(detail: object) -> str:
    """Use the same filter for user-visible error details."""
    return redact(str(detail))


def redact_log(detail: object) -> str:
    """Use the same filter for local diagnostic/log text."""
    return redact(str(detail))
