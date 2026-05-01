# Mini-v2 Rules

## Scope

- `webapp-mini-v2` is rebuilt from scratch.
- Design and UX must match current working `webapp-mini`.
- Only one screen at a time is rebuilt and validated.

## Development Rules

1. No direct edits in production mini during v2 rebuild.
2. Keep files modular (`api`, `modules`, `ui`).
3. Every behavior migrated from old mini must be copied first, then cleaned.
4. No new features before parity with old mini.
5. Every step must be manually checked in Live Server.

## Quality Rules

1. No duplicated logic across modules.
2. API errors must be user-friendly.
3. All text in Russian, no mojibake.
4. Keep code readable with small functions.
5. Preserve Telegram WebApp compatibility.

## Rollout Rules (mini-1 -> mini-2)

1. Do not disable `webapp-mini` before `webapp-mini-v2` is fully smoke-tested.
2. Keep backend API backward-compatible with `webapp-mini` during migration.
3. Test `webapp-mini-v2` on separate URL first.
4. Switch Telegram Mini App URL only after successful smoke.
5. Keep rollback path to `webapp-mini` until at least 24h stable window.

## Security Baseline (mandatory)

1. VPN panel must be reachable only from backend host (firewall allowlist).
2. Frontend may use only public API routes (`/api/...`), never panel URL/logins.
3. Secrets/tokens/keys are stored only in `.env` on server, never in Git.
4. Every protected backend route must validate Telegram auth server-side.
5. Invite/bridge flow must enforce rate limit, TTL and revoke.
6. If any secret was exposed before, rotate it and clean Git history.

## Strict Encoding (mandatory)

1. Entire mini-v2 stack must use UTF-8 only.
2. Any Windows-1251/ASCII fallback is forbidden.
3. New files must be saved as UTF-8 without BOM.
4. First meta in `<head>` must be `<meta charset="UTF-8">`.
5. Currency symbol must be rendered as `₽` (no substitutions).
6. Mojibake in UI/API text is a critical bug and must be fixed at root-cause level, not by one-off text patch.
