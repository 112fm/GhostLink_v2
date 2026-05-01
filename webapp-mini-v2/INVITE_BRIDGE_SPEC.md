# Invite / Bridge Spec v1

Статус: draft, зафиксировано 2026-04-20.

## 1) Режимы приглашения

### A. Direct Entry

- Назначение: у гостя Telegram уже работает.
- UX-текст: "Для тех, кто уже в сети. Ссылка ведет сразу в бота."
- Действие: "Скопировать ссылку".
- Ссылка: `t.me/GhostLinkBot?start=<token_id>`.

### B. Rescue Bridge

- Назначение: у гостя Telegram недоступен.
- UX-текст: "Для тех, кто в изоляции. Ссылка на веб-сайт, который выдаст временный ключ для оживления Telegram."
- Действие: "Создать Мост".
- Результат: QR + короткая ссылка.
- Ссылка: `https://ghostlink.tech/join/<token_id>`.

## 2) Гостевой путь (Bridge)

1. Страница моста: логотип + короткий текст + кнопка "Получить временный ключ".
2. После запроса: вывести временный VLESS-ключ + кнопка "Копировать" + 3 шага инструкции.
3. Переход в Telegram: кнопка "Войти в клуб (Telegram)" с переходом в бот по токену.
4. После `/start`: бот завершает bridge-сессию, удаляет временный профиль и выдает постоянный.

## 3) Backend контракт

## 3.1 Таблицы

- `invites`:
  - `token` (UNIQUE),
  - `inviter_id`,
  - `type` (`direct` | `bridge`),
  - `created_at`,
  - `expires_at`,
  - `status` (`active` | `used` | `revoked` | `expired`).
- `bridge_sessions`:
  - `token`,
  - `inviter_id`,
  - `guest_id` (nullable до `/start`),
  - `temp_client_uuid`,
  - `temp_key_vless`,
  - `traffic_limit_mb` (по умолчанию 500),
  - `ttl_hours` (по умолчанию 3),
  - `status` (`issued` | `handshake_done` | `cleaned` | `expired`),
  - `created_at`,
  - `expires_at`,
  - `cleaned_at`.

## 3.2 API (целевой контракт)

- `POST /api/invite/create`
  - input: `type`, `ttl` (для invite link)
  - output: `token`, `invite_link`, `bridge_link`, `expires_at`, `status`.
- `GET /api/invite/list`
  - output: список инвайтов пользователя + статусы.
- `POST /api/invite/revoke`
  - input: `token`
  - output: `ok`.
- `GET /bridge/i/{token}`
  - проверка валидности bridge-токена и рендер гостевой страницы.
- `POST /bridge/i/{token}/temp-key`
  - создает временного клиента в 3X-UI (`temp_<token>`) с лимитом `500MB / 3h`.
  - output: `vless`, `expires_at`, `telegram_start_link`.

Примечание:
- Если нужно совместить с текущей идеей `/bridge/{token}` и `/get-temp-key`, используем либо alias, либо редирект на канонические маршруты выше.

## 4) Bot handshake

- На `/start <token>`:
  - проверить bridge-сессию,
  - удалить временного клиента в 3X-UI,
  - создать постоянного клиента,
  - закрыть bridge-сессию (`handshake_done`),
  - продолжить обычный onboarding.
- Реф-бонус: начислять inviter только после первой успешной оплаты приглашенного.

## 5) Безопасность

- Rate limit: максимум 3 активных invite на пользователя.
- TTL bridge-ссылки: 12 часов.
- Auto-cleanup (cron): удалять просроченные временные bridge-клиенты и закрывать сессии.
- Логи событий: `invite_created`, `bridge_issued`, `bridge_handshake_done`, `bridge_cleaned`.

## 6) Ограничение запуска

Реализацию Bridge начинать только после закрытия P0 стабилизации прода в активном плане.

## 7) Реализация в mini-v2 (порядок)

1. Пустой `screen-ref` -> чистый UI двух режимов.
2. Подключение `POST /api/invite/create` и `GET /api/invite/list`.
3. Bridge-экран (`/bridge/i/{token}`) + выдача временного ключа.
4. Bot handshake + cleanup + финальный smoke.
