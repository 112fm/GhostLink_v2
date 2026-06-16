# PROJECT MAP

## Цель проекта

GhostLink — закрытый VPN-клуб с доступом по инвайтам, Telegram-ботом для управления и Mini App для пользовательских действий.

## Текущий контур

1. Backend API: `api_server.py` (FastAPI).
2. Telegram bot: `ghost_final.py` (aiogram).
3. Data: `GhostLink_panel.db` (SQLite).
4. User frontend (prod): `webapp-mini-v2/`.
5. Bridge invite flow (prod): backend routes `backend/routes/invites.py` + UI в `webapp-mini-v2/`.

## Каталоги в репозитории

1. `docs/index/` — карта, правила, контрольный файл.
2. `docs/plans/active/` — только один активный план.
3. `docs/plans/backlog/` — отложенные/подготовительные планы.
4. `docs/plans/frozen/` — замороженные планы.
5. `docs/runbooks/` — оперативные инструкции.
6. `docs/logs/` — технические логи и диагностические отчеты.
7. `webapp-mini-v2/` — чистая модульная сборка нового Mini App.
8. `Gemini/` — локальные заметки/черновые отчеты (не источник истины по прод-статусу).

## Источник истины по приоритетам

1. `docs/plans/active/BUGFIX_AND_IMPROVEMENTS_PLAN.md` — что делаем сейчас.
2. `docs/plans/backlog/BRIDGE_SHADOW_PLAN.md` — развитие Bridge после текущих P0 задач.
3. `docs/plans/backlog/NETWORK_RESILIENCE_AND_VPSUS_BENCHMARK_PLAN.md` — отложенная диагностика LTE/Wi-Fi устойчивости и сравнение с VPSUS.
4. `docs/runbooks/ACCESS_AND_INCIDENT_RUNBOOK.md` — аварийные действия.

## Что не делать

1. Не смешивать фичи Bridge с текущим прод-потоком, пока не пройдена отдельная сессия согласования.
2. Не пушить чувствительные файлы (`api_server.py`, `ghost_final.py`, БД, ключи) в публичный Git.
3. Не запускать крупный рефакторинг в проде без smoke-проверок.
