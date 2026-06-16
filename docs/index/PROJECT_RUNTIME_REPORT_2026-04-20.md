# Project Runtime Report (2026-04-20)

## 1) Top-level runtime files

- `api_server.py`
  Тонкий bootstrap API. Поднимает FastAPI и подключает роуты через `backend/app_factory.py`.
- `ghost_final.py`
  Тонкий bootstrap Telegram-бота. Хранит общие helper-функции, wiring зависимостей, `on_startup`, запуск polling.
- `GhostLink_panel.db`
  SQLite база (локальное состояние бота/мета).
- `deploy_safe.sh`, `rollback_last.sh`
  Операционные скрипты деплоя/отката.

## 2) Backend API (`backend/`)

- `backend/app_factory.py`
  Сборка приложения и регистрация route-модулей.
- `backend/errors.py`
  Централизованные API error codes / detail constants.
- `backend/routes/payments.py`
  Payment settings/report/approve/reject и связанная бизнес-логика.
- `backend/routes/devices.py`
  Device list/add/remove/reset/rotate.
- `backend/routes/admin.py`
  Прочие admin endpoints.
- `backend/routes/proxy.py`
  Proxy/session/auth/reverse-proxy блок.
- `backend/__init__.py`, `backend/routes/__init__.py`
  Пакетная инициализация.

## 3) Telegram bot core (`bot/`)

- `bot/config.py`
  Конфиг и env-параметры.
- `bot/storage.py`
  Работа с БД (`load_db/save_db` и связанные helper-операции).
- `bot/panel_api.py`
  Интеграция с XUI/panel API (клиенты, inbound, online, лимиты и т.д.).
- `bot/security.py`
  IP-валидация, lock/unlock панели и security helper-логика.

## 4) Telegram bot modules (`bot/modules/`)

- `bot/modules/handlers.py`
  Все aiogram handlers: `/start`, callbacks, support, admin UI flows, payment inline approve/reject, WebApp admin actions.
- `bot/modules/admin_ops.py`
  Все `admin_do_*` операции и `schedule_panel_autolock`, плюс общее `admin_state`.
- `bot/modules/background_tasks.py`
  Все фоновые задачи: anti-rkn, health-check, expiry, traffic, payment reminder, scheduled backup.
- `bot/modules/__init__.py`
  Пакетный экспорт.

## 5) Frontend folders

- `webapp-mini-v2/`
  Рабочий Mini App (текущий прод-контур).
- `webapp-shared/`
  Общие заметки/материалы (`SECURITY_NOTES.md`).

## 6) Documentation (`docs/`)

- `docs/index/`
  Карта проекта, правила, контрольные документы.
- `docs/plans/active/`
  Активный план работ.
- `docs/plans/backlog/`
  Backlog-планы (включая декомпозицию `api_server.py` и `ghost_final.py`).
- `docs/plans/frozen/`
  Замороженные планы.
- `docs/runbooks/`
  Runbook-инструкции по деплою/восстановлению/инцидентам.
- `docs/logs/`
  Технические диагностические логи.

## 7) Служебные и вспомогательные папки

- `Gemini/`
  Локальные заметки/черновые отчеты.

## 8) Исключено из этого отчета по твоему правилу

- `PROXY Ghost/` — не анализировал содержимое.
