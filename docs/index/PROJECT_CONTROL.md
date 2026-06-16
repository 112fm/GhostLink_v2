# PROJECT CONTROL

## Current Status

- Active plan (only one): `docs/plans/active/BUGFIX_AND_IMPROVEMENTS_PLAN.md`
- Work mode: bugfix + stabilization in current prod.
- Focus: payment/device-limit consistency + network egress split (RU direct, AI via WARP).
- Current cleanup note: Solo regular prices updated to `150/290/430` on 2026-06-16; network resilience/VPSUS comparison moved to backlog.
- Migration plan: canceled.
- Frontend prod contour: `webapp-mini-v2/` (single active mini app).
- Bridge status: MVP invite/bridge flow is in runtime; further expansion stays in backlog.

## Plan Registry

### Active
- `docs/plans/active/BUGFIX_AND_IMPROVEMENTS_PLAN.md`

### Backlog
- `docs/plans/backlog/AI_TODO.md`
- `docs/plans/backlog/BRIDGE_SHADOW_PLAN.md`
- `docs/plans/backlog/NETWORK_RESILIENCE_AND_VPSUS_BENCHMARK_PLAN.md`

### Frozen (paused)
- `docs/plans/frozen/CLEANUP_MASTER_PLAN.md`
- `docs/plans/frozen/CLEANUP_TODO.md`
- `docs/plans/frozen/SECURITY_STACK_PLAN.md`

## Navigation Docs

- `docs/index/PROJECT_MAP.md`
- `docs/index/PROJECT_RULES.md`
- `docs/index/PROJECT_STATUS_AUDIT_2026-06-16.md`

## Operational Runbooks

- `docs/runbooks/DEPLOY_RUNBOOK.md`
- `docs/runbooks/RECOVERY_RUNBOOK.md`
- `docs/runbooks/ACCESS_AND_INCIDENT_RUNBOOK.md`

## Logs

- `docs/logs/VPN_DIAGNOSTICS_LOG.md`

## Local Notes (non-tracked)

- `Gemini/` is a local working journal (TODO + reports), not part of tracked repo code.

## Update Protocol

1. Keep exactly one file in `docs/plans/active/`.
2. Move completed plans to `docs/archive/`.
3. Move paused plans to `docs/plans/frozen/`.
4. Update this file after every status change.
