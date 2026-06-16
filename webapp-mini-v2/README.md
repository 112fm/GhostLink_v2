# webapp-mini-v2

Current production Telegram Mini App.

Current state:
- modular frontend is active in production contour;
- home screen, payments, devices, admin, support, and invite/bridge modules exist;
- API client lives in `src/api/client.js`;
- screen routing lives in `src/ui/screens.js`;
- entrypoint lives in `src/main.js`.

Important modules:
- `src/modules/payments.js` - tariffs, payment draft, payment report flow;
- `src/modules/devices.js` - device list/add/remove/rotate UI;
- `src/modules/admin.js` - admin dashboard/actions;
- `src/modules/invites.js` - invite and Bridge UI;
- `src/modules/auth.js` - Telegram auth bootstrap.

Docs:
- `RULES.md` - development constraints
- `TODO.md` - staged migration plan
