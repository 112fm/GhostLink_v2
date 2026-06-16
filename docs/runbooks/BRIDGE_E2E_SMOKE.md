# Bridge E2E Smoke (Production)

## Preconditions
- Deploy `api_server.py` + `ghost_final.py` with current changes.
- Set CORS allowlist in `GHOST_WEBAPP_ORIGINS` to the real mini-app origin.
- Ensure bot is running with same DB file as API (`GHOST_DB_FILE`).

## Scenario
1. In Mini App v2, open "Пригласить в клуб" -> tab "Мост".
2. Create bridge invite and copy `join/<token>` link.
3. Open bridge page from external network and request temp key.
4. Confirm API returns temp key and Telegram start link.
5. Open bot via `/start <token>`.
6. Confirm bridge session switches to `pending_cleanup`.
7. Confirm temporary key stays alive for 1 hour grace.
8. Approve first payment for invited user.
9. Confirm `ref_by` is set and referral bonus is applied to inviter discount.
10. After grace timeout, confirm temp key is removed and session becomes `cleaned`.

## Verify points
- API:
  - `/api/invite/create`
  - `/api/invite/list`
  - `/api/invite/revoke`
  - `/bridge/i/<token>`
  - `/bridge/i/<token>/temp-key`
- Bot:
  - `/start <token>` handshake path
  - inline payment approve (`payok_*`) path
- CORS:
  - no preflight errors for production origin
  - no `Access-Control-Allow-Origin` mismatch
