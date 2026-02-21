# PWA Migration Plan

## Цель
Разделить Telegram Mini App и PWA, не ломая текущий прод.

## Структура
- `webapp-mini/` — текущий Mini App (Telegram WebApp)
- `webapp-pwa/` — отдельная PWA-витрина/кабинет
- `webapp-shared/` — общие правила/утилиты

## Этапы
1. Заморозка текущего Mini App
   - бот продолжает использовать существующий URL
2. Запуск PWA-витрины
   - `webapp-pwa/index.html` + manifest + service worker
3. Авторизация и заявка
   - PWA принимает `?ref=<id>` и ведет в Telegram `/start ref_<id>`
4. Интеграция кабинета
   - после одобрения в боте открывать полноценный кабинет
5. Резервная админка
   - добавить веб-админку поверх API (fallback без Telegram UI)

## Текущее состояние
- Этап 1 выполнен: `webapp-mini` создан копией `webapp`
- Этап 2 выполнен: `webapp-pwa` создана базовая витрина
- Этапы 3-5 в работе
