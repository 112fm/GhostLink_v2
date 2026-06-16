# Ghost Final Decomposition Plan

Updated: 2026-04-20 (evening)
Scope: `ghost_final.py` only (incremental cleanup without behavior regressions).

## Goal
- Keep bot behavior stable while reducing monolith coupling.
- Eliminate dead/duplicate code and fragile inline dependencies.
- Align payment/device/admin behavior with `api_server.py`.

## Phase 1: Hygiene
- [x] Remove obvious dead imports / local duplicate imports.
- [x] Normalize helper placement order (payment/proxy/support).
- [x] Keep one source of truth for common payment helpers.

## Phase 2: Payment block hardening
- [x] Verify Flex label parsing and target-device-limit recovery in bot approve flow.
- [x] Verify inline approve/reject flow parity with API state transitions.
- [ ] Isolate payment admin notifications into a dedicated helper section.

## Phase 3: Admin callbacks grouping
- [x] Group admin callback handlers into coherent sections:
  - users
  - communications
  - security/panel
  - vip
  - backup/system
- [x] Remove repeated boilerplate in admin callbacks.

## Phase 4: Support and notifications
- [x] Isolate support message flow and admin notification flow.
- [ ] Keep push/web notifications in one helper cluster.

## Phase 5: Proxy session block
- [x] Separate proxy-session state helpers from generic bot handlers.
- [x] Keep session TTL/extend/warn logic consistent and testable.

## Phase 6: Runtime decomposition
- [x] Move Telegram handlers to `bot/modules/handlers.py`.
- [x] Move admin operations to `bot/modules/admin_ops.py`.
- [x] Move background tasks to `bot/modules/background_tasks.py`.
- [x] Keep `ghost_final.py` as thin runtime bootstrap + shared helpers.

## Current structure snapshot
- `ghost_final.py`: runtime bootstrap, shared helpers, dependency wiring, startup.
- `bot/modules/handlers.py`: Telegram command/callback/message handlers registration.
- `bot/modules/admin_ops.py`: admin actions and panel lock/autolock workflow.
- `bot/modules/background_tasks.py`: all long-running maintenance/background tasks.

## Invariants
- Callback data and command triggers unchanged.
- User-visible texts unchanged (unless explicitly fixed).
- Payment approve/reject outcomes unchanged.

## Verification after each phase
- Manual smoke in Telegram:
  - payment report -> admin approve/reject
  - device operations after payment approve
  - admin panel core callbacks
  - support reply flow
