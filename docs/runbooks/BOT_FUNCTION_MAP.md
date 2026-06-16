# Карта Функций Бота

Обновлено: 2026-04-20
Охват: рантайм Telegram-бота (`ghost_final.py` + `bot/modules/*`).

## 1) Точки входа рантайма

1. `ghost_final.py`:
- общие helper-функции
- wiring зависимостей (`bind_*_deps`)
- startup (`on_startup`)
- запуск polling (`executor.start_polling`)
2. `bot/modules/handlers.py`:
- все aiogram handlers (команды/callbacks/сообщения/webapp)
3. `bot/modules/admin_ops.py`:
- все `admin_do_*` операции и `admin_state`
4. `bot/modules/background_tasks.py`:
- все долгоживущие фоновые задачи

## 2) Функции в `ghost_final.py` (ядро)

1. `get_admins`, `is_admin` - определение админов.
2. `_int_or_zero` - безопасное приведение к числу.
3. `extract_target_limit_from_label`, `resolve_payment_target_limit` - разбор Flex-лимита устройств.
4. `payment_is_pending`, `payment_can_recover_inline_approve` - проверки состояния оплаты.
5. `apply_payment_approve_state`, `apply_payment_reject_state` - переходы состояний после approve/reject.
6. `notify_admins` - рассылка сообщений админам.
7. `msk_now`, `_is_quiet_hours_msk` - helper-функции по времени.
8. `_cleanup_proxy_sessions`, `extend_proxy_sessions_for_admin`, `monitor_proxy_panel_sessions` - жизненный цикл сессий панели.
9. `build_link` - генерация VLESS-ссылки.
10. `default_traffic_limit_gb`, `ensure_traffic_defaults` - дефолты лимитов трафика.
11. `parse_expiry_date` - разбор даты истечения.
12. `user_kb`, `quick_commands_kb`, `key_html` - UI helper-функции.
13. `ensure_user_trial` - выдача trial и создание клиента в панели.
14. `chunk_text` - безопасная нарезка длинного текста.
15. `on_startup` - установка команд бота и запуск мониторинга.

## 3) Функции в `bot/modules/background_tasks.py`

1. `anti_rkn_task` - фоновый шум трафика.
2. `xray_health_check` - проверка/перезапуск xray.
3. `expiry_check_task` - истечение подписок, предупреждения, push.
4. `traffic_limit_task` - учет трафика и пороговые уведомления.
5. `pending_payment_reminder_task` - напоминания админам по pending-оплатам.
6. `scheduled_db_backup_task` - плановый бэкап БД.

## 4) Функции в `bot/modules/admin_ops.py`

1. `admin_state` - state-machine админских текстовых сценариев.
2. `get_free_mem_mb` - helper свободной памяти.
3. `admin_do_stats` - статистика нагрузки и онлайна.
4. `admin_do_add_slots` - увеличение `max_users`.
5. `admin_do_backup` - отправка backup-файла БД.
6. `admin_do_restart_xray` - перезапуск xray.
7. `admin_do_panel_lock`, `admin_do_panel_unlock`, `admin_do_panel_ip` - управление доступом к панели.
8. `admin_do_ban_user`, `admin_do_unban_user`, `admin_do_delete_user` - модерация пользователей.
9. `admin_do_delete_vip`, `admin_do_vip_show`, `admin_do_vip_inc`, `admin_do_vip_dec`, `admin_do_vip_rotate` - VIP-операции.
10. `schedule_panel_autolock` - таймер автозакрытия панели и предупреждение.

## 5) Handlers в `bot/modules/handlers.py`

1. Команды: `/start`, `/pwa`, `/panel`, `/cancel`.
2. User callbacks: `support`, `club_rules`.
3. Support flow: сообщение юзера -> админам -> `reply_*` -> ответ юзеру.
4. Approve flow: `approve_*`, `deny_*`.
5. Payment flow: `payok_*`, `payno_*`.
6. Admin menu and categories: `admin_panel`, `admin_cat_*`.
7. Admin action callbacks: `admin_stats`, `admin_add_slots`, `admin_backup`, `admin_restart_xray`, `admin_panel_lock`, `admin_panel_ip`, `admin_extend_panel`, `vip_*` и т.д.
8. Admin text-state workflows: `broadcast`, `panel_ip`, `ban_user`, `unban_user`, `delete_user`, `trial7_user`, `unlimited_user`, `extend_user`, `traffic_limit_user`, `delete_vip`, `reply`.
9. WebApp admin bridge: `WEB_APP_DATA` -> `admin_do_*`.

## 6) Базовый пользовательский путь (`/start` -> доступ)

1. `/start` без инвайта -> доступ запрещен.
2. `/start ref_*` -> создается pending-заявка + уведомление админам.
3. Админ `approve_*` -> выдается trial (`ensure_user_trial`) + включается клиент панели.
4. Пользователь получает `trial`/`active`; далее управление через Mini App/API + callbacks бота.
