# GhostLink Handoff 2026-06-16

## Purpose

This file is a working handoff for continuing GhostLink work on another machine, specifically the MacBook.

## Current Environment

- Main local workspace on Windows: `E:\VPN GhostLink`
- Secondary machine: MacBook
- Current servers:
  - `Aeza` - old production / warm reserve
  - `Hetzner` - target primary production

## Server Access

- MacBook SSH access has been configured and verified for:
  - `ghost-aeza`
  - `ghost-hetzner`
- Hetzner access is using SSH key auth for `ghostadmin`
- Aeza access from Mac also works

## Active Product State

### Bridge 2.0

- Bridge 2.0 was reworked toward subscription-based flow
- Inviter-side extra "Open Telegram bot" button was removed
- Duplicate "Applications and steps" block in Mini App was removed
- Bridge screen now positions VPN apps before bridge issuance
- Current business direction:
  - INCY = recommended client
  - Karing = keep as additional client, do not remove

### Bot / App Messaging

- App mentions are still mixed across bot, Mini App, and legacy bridge backend page
- INCY is not yet fully propagated everywhere
- Karing still remains primary in several bot texts and handlers

### Admin Panel Proxy

- Proxy panel access through `/panel` was debugged
- `backend/routes/proxy.py` was patched so panel token propagation is less dependent on referer/cookie only
- API successfully restarted after proxy patch on server
- Panel visual behavior still needs final live verification after reopen from Mini App

### Migration Direction

- Strategy chosen:
  - Hetzner = primary
  - Aeza = warm manual reserve
- Automatic failover is intentionally postponed
- Simpler recovery target:
  - prepare one-command manual failover on Aeza later
  - DNS rollback + service start + admin alert

## Important Files

- Active plan:
  - `docs/plans/active/BUGFIX_AND_IMPROVEMENTS_PLAN.md`
- Proxy panel logic:
  - `backend/routes/proxy.py`
- Bridge UI:
  - `webapp-mini-v2/index.html`
  - `webapp-mini-v2/src/modules/invites.js`
- Bot app texts and app menu:
  - `bot/modules/handlers.py`
  - `bot/config.py`

## Open Priorities

1. Finish Hetzner hardening:
   - SSH policy
   - firewall
   - fail2ban
   - swap
2. Migrate production services from Aeza to Hetzner
3. Re-verify panel opening through Mini App after migration
4. Update app recommendations everywhere:
   - INCY recommended
   - Karing retained as secondary/manual client
5. Define admin visibility matrix:
   - which admins see what in Mini App
   - which bot notifications go to which role

## Known Constraints

- Repo on Windows is dirty and contains many untracked server-side files
- Not everything in working production is committed to git
- Mini App is git-driven
- Server-side changes have often been uploaded manually
- Care is required not to confuse repo state with live server state

## Recommended Resume Order On MacBook

1. Open this repo on MacBook
2. Read:
   - `docs/handoff/HANDOFF_2026-06-16_MACBOOK.md`
   - `docs/plans/active/BUGFIX_AND_IMPROVEMENTS_PLAN.md`
3. Continue with Hetzner hardening and migration, not with Aeza feature work
4. Only after migration, return to:
   - panel UX
   - INCY rollout
   - Hysteria2 evaluation
