# Security Stack Plan (Reality + IPv6 + Egress + Fingerprint)

## Цель
Проверить и зафиксировать безопасную сетевую конфигурацию без поломки рабочего VPN.

## Что уже есть (подтверждено по коду)
1. Ссылки/ключи формируются как `vless + reality`:
   - `security=reality`
   - `sni=${GHOST_SNI}`
   - `sid=${GHOST_SID}`
   - `pbk=${GHOST_PBK}`
   - `fp=chrome`
2. Параметр `flow` поддерживается через `GHOST_FLOW` (если задан).

Файлы:
- `api_server.py`
- `ghost_final.py`
- `bot/config.py`

## Что не подтверждено по репозиторию (нужно проверять на сервере)
1. Что inbound в `x-ui` реально `Reality` с корректными `serverNames/dest/shortIds`.
2. Что egress split (IPv6/WARP) реально применён и не ломает fallback.
3. Что IPv6 действительно используется как исходящий маршрут для выбранных потоков.
4. Что нет циклов маршрутизации и деградации latency.

## Отдельно про IPv6 (явный блок)
### Что именно проверяем
1. На сервере есть рабочий глобальный IPv6 и default route.
2. Xray/outbound может выходить через IPv6.
3. Для выбранной группы трафика используется IPv6 egress.
4. При проблеме с IPv6 трафик не падает полностью (есть fallback).

### Быстрые проверки на сервере
1. Сетевой стек:
```bash
ip -6 addr
ip -6 route
```
2. Проверка выхода в интернет по IPv6:
```bash
curl -6 --max-time 10 https://ifconfig.co
curl -6 --max-time 10 https://api64.ipify.org
```
3. Проверка, что сервис жив:
```bash
curl -fsS http://127.0.0.1:2054/api/health
```

### Безопасный rollout IPv6
1. Бэкап конфига.
2. Включаем IPv6 только для небольшой тест-группы.
3. Смотрим метрики/ошибки 15–30 минут.
4. Если всё ок — расширяем на всех.
5. Любая деградация — немедленный rollback.

## 30-минутный чек перед изменениями
### Шаг 1. Бэкап рабочего конфига
```bash
cp /usr/local/x-ui/bin/config.json /usr/local/x-ui/bin/config.json.bak.$(date +%F-%H%M)
```

### Шаг 2. Подтвердить Reality inbound
Проверить в `x-ui/config.json`:
- `streamSettings.security = reality`
- есть `realitySettings`
- корректные `serverNames`
- есть `privateKey` и `shortIds`

### Шаг 3. Подтвердить fingerprint на клиенте
Проверить, что в выдаваемых ссылках есть `fp=chrome` и `security=reality`.

### Шаг 4. Подтвердить flow
Проверить `GHOST_FLOW` в `.env` и соответствие flow в выдаваемых ссылках.

### Шаг 5. Подтвердить egress policy
Если включен split egress:
- WARP только как отдельный outbound
- нет глобального default route в WARP
- есть fallback

### Шаг 6. Smoke test
1. Подключение новым ключом.
2. Проверка скорости/доступа.
3. Проверка админки/API.
4. Проверка логов `ghostlink-api`, `x-ui`.

## Важно (ожидания)
1. Это снижает риски и повышает стабильность, но не дает 100% гарантий.
2. ASN дата-центра всё равно виден сервисам.
3. Только staged rollout: изменение -> проверка -> откат при проблеме.

## Status 2026-03-29 (Checkpoint)
- SSH access restored and stable via root+password on port 22.
- `sshd` is active and listening on `0.0.0.0:22` and `[::]:22`.
- VPN baseline confirmed working for users.
- IPv4/IPv6 baseline from client VPN:
  - IPv4: `84.22.150.155`
  - IPv6: `2a01:e5c0:3c0a::2`
- WARP installed and connected in proxy mode (MASQUE).
- Local WARP proxy validated:
  - listener: `127.0.0.1:40000`
  - test egress via SOCKS: `104.28.222.17`
- Important finding: x-ui rewrites `/usr/local/x-ui/bin/config.json` on restart.
  - manual edits (warp outbound/routing, xray log block) are lost after `x-ui restart`.

### Current stop point
- Do NOT modify production routing tonight.
- Next step: configure WARP outbound + routing rule via x-ui UI (or x-ui DB/API), not by direct file patch.
- Canary plan for next session:
  1. Add outbound `warp` -> `socks 127.0.0.1:40000`.
  2. Add routing only for `openai.com` and `chat.openai.com`.
  3. Verify traffic appears in `ss -ntp | grep 127.0.0.1:40000`.
  4. Keep `api.112prd.ru` and all GhostLink control traffic on direct path.
  5. If issue: rollback immediately.

## Status 2026-03-31 (Hotfix)
- Payment incident hotfix applied in code:
  - `/api/payment/report` now keeps request successful even if Telegram admin notify fails.
  - `admin_notified` / `admin_notify_error` returned for diagnostics.
  - Pending payments list now accepts legacy status values (`pending_verification`, `pending`).
- Bot UX emergency change:
  - Removed `🌟 Открыть приложение` CTA from bot keyboard and onboarding texts (temporary).
- Subscription link stability:
  - VLESS label in generated links is URL-encoded to prevent import failures in clients.
- Expiry behavior:
  - Bot expires access only when `days_left < 0` (not at `0` day boundary).
