# MacBook Transfer Checklist 2026-06-16

## Goal

Move enough local project state to the MacBook so work can continue cleanly.

## Transfer Now

1. Project workspace:
   - copy `E:\VPN GhostLink`
2. SSH config on MacBook:
   - already prepared
3. Any local notes or screenshots that matter for operations:
   - copy them into this repo under `docs/` if they must be preserved

## Do Not Blindly Transfer

1. Random server backups or DB snapshots without labeling
2. Old patch files unless still needed
3. Private SSH keys from Windows, because MacBook already has its own key

## Strongly Recommended Before Continuing On MacBook

1. Create one clean folder on MacBook for the repo
2. Open the repo there in VS Code
3. Confirm SSH access:
   - `ssh ghost-aeza`
   - `ssh ghost-hetzner`
4. Confirm this handoff exists in the copied repo

## If You Want A Cleaner Portable Bundle

Create a reduced archive from Windows that includes:

- tracked repo files
- `docs/`
- `webapp-mini-v2/`
- any server upload manifests you still use

Avoid bundling:

- live `.db` files unless you explicitly need them
- temporary patch files
- `__pycache__`
- local venvs

## Best Next Step On MacBook

After copying the repo, continue from:

- `docs/handoff/HANDOFF_2026-06-16_MACBOOK.md`
- `docs/plans/active/BUGFIX_AND_IMPROVEMENTS_PLAN.md`
