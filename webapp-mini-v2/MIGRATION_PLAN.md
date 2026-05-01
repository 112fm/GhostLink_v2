# Mini v2 Migration Plan (mini-1 -> mini-2)

## Progress snapshot (actual)

- [x] Step 1-5 completed (scaffold, API/auth/navigation/home binding).
- [x] Step 6 completed in code (`devices`: list/add/remove/reset + rotate + user error mapping).
- [x] Step 7 completed in code (`payments`: 1/2/3 months, report flow, payer validation).
- [x] Step 8 completed for current scope (`invite/bridge/referral` flows).
- [ ] Step 9 pending: final end-to-end smoke on server.
- [ ] Step 10 pending: controlled switch to mini-v2 + rollback window.

## Core process rule

For every migration step:

1. Take one logic block from `webapp-mini/app.js`.
2. Move it to the correct module in `webapp-mini-v2`.
3. Verify immediately.
4. Only then move to next block.

No parallel uncontrolled edits.

---

## Step 1 - Preparation

1. Freeze `mini-1` as reference source.
2. Keep only clean scaffold files in `mini-2`.
3. Track progress in `webapp-mini-v2/TODO.md`.

Done when:
- structure is clean and stable
- no random copied legacy blocks in v2

---

## Step 2 - API base layer (`src/api/client.js`)

1. Move `apiFetch` and shared error handling from mini-1.
2. Keep business logic out of API client.

Done when:
- test call to `/api/user` works through new client

---

## Step 3 - Auth layer (`src/modules/auth.js`)

1. Move Telegram init/bootstrap (`initData`, user identity, admin check).
2. Move initial user load (`/api/user`).

Done when:
- home screen renders real user data
- no device/payment actions yet

---

## Step 4 - UI navigation (`src/ui/screens.js`)

1. Move `pushScreen/popScreen/showScreen` logic.
2. Move back-button flow.

Done when:
- screen transitions work the same as mini-1
- no API regressions

---

## Step 5 - Home screen binding (`index.html` + `src/main.js`)

1. Bind auth and screen router to home UI.
2. Render balance/tariff/expiry/status fields from real user data.

Done when:
- home metrics match mini-1 behavior

---

## Step 6 - Devices module (`src/modules/devices.js`)

1. Move device list/add/remove/refresh/reset logic in small chunks.
2. Keep clear user-facing errors:
   - `device_limit_reached`
   - `access_closed`
   - `panel_add_failed:*`

Done when:
- all device actions pass smoke checks

---

## Step 7 - Payments module (`src/modules/payments.js`)

1. Move Solo/Flex tariff logic.
2. Move payment report submit with `target_device_limit`.
3. Move payer validation and safe retry logic.

Done when:
- report creates correct pending record
- admin notification includes correct tariff/amount/target limit

---

## Step 8 - Secondary screens (referrals/extra/help)

1. Migrate only after devices + payments are stable.
2. Preserve UX parity with mini-1.

Done when:
- no critical user flows depend on old mini

---

## Step 9 - Final smoke before switch

Run full checks:

1. Payment -> approve -> +30 days from current expiry.
2. Flex 5 -> after approve limit becomes 5.
3. Add/remove/refresh/reset key actions.
4. No raw `Failed to fetch` in user notifications.

Done when:
- all critical cases pass in production-like conditions

---

## Step 10 - Switch to mini-v2

1. Keep `mini-1` active until `mini-2` smoke is green on separate URL.
2. Confirm backend compatibility for both minis during switch window.
3. Update Telegram mini app URL to v2.
4. Observe logs for at least 24 hours.
5. Keep fast rollback to `mini-1` during observation.
6. Archive old mini only after stable window.

Done when:
- v2 is stable and old mini is no longer needed

---

## Deployment discipline

1. One commit = one logical fix.
2. Do not mix UI redesign and business logic in one commit.
3. Always run smoke check before pushing to production URL.
