# ARCH_CLEAN: аудит и план (RU, UTF-8)

Дата: 2026-04-26
Контур: `api_server.py`, `ghost_final.py`, `backend/routes/*`, `backend/domain/*`, `bot/modules/*`, `bot/storage.py`

## 1) Текущий статус

1. API роуты вынесены в `backend/routes/*`; в `api_server.py` больше нет `@app.get/@app.post` endpoint-блоков.
2. Бот частично разрезан на `bot/modules/*`, но `ghost_final.py` остается крупным orchestration-файлом.
3. Единый Billing Domain уже создан (`backend/domain/billing.py`) и подключен в API/бот.
4. Единый Storage Domain реализован: API и bot используют общий `backend/storage/db.py`.
5. Автотест-контур критичных сценариев пока не реализован.

## 2) Что уже доведено

1. Вынесены роуты: `payments`, `devices`, `invites`, `admin`, `proxy`.
2. Подключена фабрика роутов: `backend/app_factory.py`.
3. Добавлены миграции инвариантов тарифа/лимита устройств на старте API и бота.
4. Закрыты ключевые баги по повторной обработке approve/deny/payment.
5. Удалены дубли прайсинга из `api_server.py` и `ghost_final.py`.
6. `ghost_final.py` дополнительно утончен: доменные функции вынесены в `bot/domain/*` (`admins.py`, `payments.py`, `proxy_panel.py`, `user_access.py`).

## 3) Прогресс по этапу A (Billing Domain)

Выполнено:

1. Создан общий домен `backend/domain/billing.py`.
2. Вынесены:
- матрица цен (`PRICE_MATRIX`),
- базовая цена/минимум/макс-скидка,
- нормализация tier,
- разбор `Flex N` и периода,
- расчет expected/payable,
- approve/reject state transition.
3. `backend/routes/payments.py` переведен на функции домена.
4. `ghost_final.py` переведен на функции домена.
5. `api_server.py` переведен на функции домена (pricing-group/matrix/base/max-discount).

Проверка дублей:

- Константы `TARIFF_BASE`, `TARIFF_FLOOR`, `PRICE_MATRIX` живут только в `backend/domain/billing.py`.
- В `api_server.py` и `ghost_final.py` остались только легкие wrapper-функции для совместимости текущего wiring.

## 4) Открытые зоны

### P2. Утоньшение API entrypoint

Проблема:

1. В `api_server.py` еще остается часть доменных helper-функций (auth/session/notification/subscription utils), хотя сами endpoint-ы уже вынесены.

Что сделать:

1. Дальше выносить доменные helper-блоки в профильные пакеты (`backend/domain/*`, `backend/services/*`).
2. Оставить в `api_server.py` только bootstrap/wiring/startup.

### P2. Дорезка bot entrypoint

Проблема:

1. В `ghost_final.py` доменные функции уже вынесены в `bot/domain/*`, но файл пока содержит обертки для совместимости `deps=globals()`.

Что сделать:

1. Перейти с `deps=globals()` на явный контейнер зависимостей.
2. После этого убрать промежуточные wrapper-функции и оставить `ghost_final.py` как чистый entrypoint.

### P3. Интеграционные тесты

Проблема:

1. Добавлен расширенный автоконтур:
- доменные тесты billing/bot payments,
- API E2E-контур (in-memory) для критических цепочек.

Что сделать:

1. Следующим шагом расширить до runtime E2E на живом окружении:
- `/start -> approve/deny`,
- `payment_report -> payok/payno`,
- `key/subscription/devices`,
- upgrade `solo -> flex` с проверкой лимитов и цен.

## 5) Порядок работ (дальше)

1. Этап C: дорезка API до тонкого entrypoint.
2. Этап D: дорезка бота до тонкого entrypoint.
3. Этап E: минимальный integration-suite.

## 6) Критерии «чисто и предсказуемо»

1. `api_server.py` и `ghost_final.py` выполняют только bootstrap/wiring/startup.
2. Billing-логика имеет один источник правды (`backend/domain/billing.py`).
3. Storage-логика имеет один источник правды (`backend/storage/*`).
4. Критичные сценарии покрыты автотестами.
5. Любое изменение тарифа/лимита/статуса вносится в одном месте без дублирования.
