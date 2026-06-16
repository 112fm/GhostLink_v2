# Project Status Audit 2026-06-16

## Цель

Сверка проектной карты, правил, активного плана, handoff и локальных заметок после переноса работы на MacBook.

## Источник истины

1. Главный контроль: `docs/index/PROJECT_CONTROL.md`.
2. Активный план: `docs/plans/active/BUGFIX_AND_IMPROVEMENTS_PLAN.md`.
3. Карта и правила: `docs/index/PROJECT_MAP.md`, `docs/index/PROJECT_RULES.md`.
4. Handoff MacBook: `docs/handoff/HANDOFF_2026-06-16_MACBOOK.md`.
5. Gemini-заметки: исторический рабочий журнал, не источник истины по прод-статусу.

## Что реализовано

1. Backend API декомпозирован:
   - `backend/app_factory.py`;
   - `backend/routes/core.py`;
   - `backend/routes/payments.py`;
   - `backend/routes/subscription.py`;
   - `backend/routes/devices.py`;
   - `backend/routes/invites.py`;
   - `backend/routes/admin.py`;
   - `backend/routes/proxy.py`;
   - `backend/routes/support.py`.
2. Telegram bot декомпозирован:
   - `bot/modules/handlers.py`;
   - `bot/modules/admin_ops.py`;
   - `bot/modules/background_tasks.py`;
   - `ghost_final.py` стал runtime/bootstrap wiring.
3. Оплаты:
   - `pending_verification`;
   - `target_device_limit`;
   - `payment_period_months`;
   - approve продлевает от текущего срока;
   - approve синхронизирует лимит в БД и панели.
4. Устройства:
   - `device/add`, `device/remove`, `device/rotate`, `device/reset`;
   - подписочные ссылки `/s/<token>`;
   - device-level subscription token map.
5. Bridge MVP:
   - routes в `backend/routes/invites.py`;
   - UI в `webapp-mini-v2/src/modules/invites.js`;
   - дальнейшее расширение остается в backlog.
6. Solo regular prices:
   - `1 мес = 150 ₽`;
   - `2 мес = 290 ₽`;
   - `3 мес = 430 ₽`;
   - backend залит на сервер вручную, Mini App fallback запушен в GitHub.

## Частично реализовано

1. `POST /api/device/add` diagnostics:
   - есть `panel_add_failed:<reason>`;
   - есть server log `device_add panel_add_failed`;
   - пользовательский текст в Mini App стал понятнее, но корневая причина плавающих `502` еще требует live-диагностики.
2. Admin roles:
   - backend roles `owner/admin/moderator` есть;
   - часть endpoints проверяет `allowed_roles`;
   - полная матрица прав и UX/notification matrix еще не оформлены как завершенный продукт.
3. Proxy panel:
   - proxy route существует;
   - token/cookie propagation улучшался;
   - финальная live-проверка открытия панели из Mini App остается открытой.
4. INCY rollout:
   - Mini App уже упоминает INCY как основной кандидат;
   - bot и legacy bridge HTML все еще в значительной степени ориентированы на Karing.

## Открыто

1. Живой smoke-тест 2-3 клиентов:
   - добавление устройства;
   - оплата;
   - approve;
   - импорт ключа.
2. Hetzner hardening and migration:
   - SSH policy;
   - firewall;
   - fail2ban;
   - swap;
   - перенос API/бот/x-ui/БД/сертификатов/DNS.
3. Network egress split:
   - RU direct/bypass;
   - AI via WARP;
   - runtime-проверки трафика.
4. Network resilience benchmark:
   - домашний LTE/Wi-Fi vs мобильный интернет;
   - GhostLink vs VPSUS/VPN Giant;
   - отдельный backlog plan: `docs/plans/backlog/NETWORK_RESILIENCE_AND_VPSUS_BENCHMARK_PLAN.md`.
5. Hysteria2 test:
   - отдельный тестовый протокол без вмешательства в рабочий VLESS.

## Документные расхождения

1. Gemini reports относятся к старому `webapp-mini`; текущий prod frontend: `webapp-mini-v2`.
2. `webapp-mini-v2/README.md` говорит, что реализован только home screen, но по коду уже есть payments/devices/admin/invites modules. Этот README требует отдельного обновления.
3. В рабочей папке много untracked server-side файлов. Перед любым push обязательно проверять staged-файлы вручную.
4. `.venv` перенесена с Windows и не является рабочим окружением Mac. Рабочее окружение Mac: `.venv311`.

## Рекомендованный следующий порядок

1. Закрепить live smoke после изменения Solo-цен.
2. Закрыть или уточнить P0 по device/add `502`.
3. Проверить panel proxy из Mini App.
4. Продолжить Hetzner hardening/migration.
5. После этого вернуться к network resilience/VPSUS benchmark.
