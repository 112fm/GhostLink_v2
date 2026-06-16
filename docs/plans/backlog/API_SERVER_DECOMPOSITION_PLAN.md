# API Server Decomposition Plan

Updated: 2026-04-20
Scope: `api_server.py` only (safe incremental split without API contract changes).

## Goal
- Split monolithic `api_server.py` into clear modules.
- Preserve current endpoints, payloads, and error codes.
- Reduce coupling and make future bugfixes safer.

## Phase 1: Foundation
- [x] Create package skeleton: `backend/`, `backend/routes/`.
- [x] Move reusable error codes to `backend/errors.py`.
- [x] Add `backend/__init__.py` and `backend/routes/__init__.py`.

## Phase 2: Payments (first extracted route module)
- [x] Create `backend/routes/payments.py`.
- [x] Move pure payment response/notification builders into `backend/routes/payments.py`.
- [x] Move payment state helpers (`target_limit` resolve + approve/reject state) into `backend/routes/payments.py`.
- [x] Move payment helpers and endpoints:
  - `/api/payment/settings`
  - `/api/admin/payment/settings`
  - `/api/payment/report`
  - `/api/admin/payment/approve`
  - `/api/admin/payment/reject`
- [x] Wire router back into app while keeping existing paths unchanged.

## Phase 3: Devices
- [x] Create `backend/routes/devices.py`.
- [x] Move:
  - `/api/device/reset`
  - `/api/device/list`
  - `/api/device/add`
  - `/api/device/rotate`
  - `/api/device/remove`
- [x] Wire router back into app while keeping existing paths unchanged.

## Phase 4: Admin
- [x] Create `backend/routes/admin.py`.
- [x] Move remaining `/api/admin/*` (except payment/device/proxy modules).

## Phase 5: Proxy
- [x] Create `backend/routes/proxy.py`.
- [x] Move proxy auth/session/reverse proxy block.

## Phase 6: App assembly
- [x] Introduce app assembly module (`backend/app_factory.py`).
- [x] Keep `api_server.py` as thin bootstrap entrypoint.

## Invariants (must stay true each step)
- Endpoint paths and methods unchanged.
- Response field names unchanged.
- `detail` error codes unchanged.
- Payment/device business logic unchanged.

## Verification after each phase
- Syntax check for touched files.
- Smoke on key endpoints:
  - `/api/health`
  - payment report/approve/reject
  - device list/add/rotate/remove
  - selected admin endpoints
