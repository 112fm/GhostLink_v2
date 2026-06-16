# GhostLink Cleanup TODO

Обновлено: 18.03.2026

## A. Frontend Safe Cleanup (mini + pwa)

- [x] A1.1 Вынесены классы кнопок вкладок админки в константы + helper.
- [x] A1.2 Вынесены классы кнопок устройств (скопировать/обновить/удалить) в константы.
- [x] A1.3 Вынесены API routes устройств (`list/add/rotate/remove/reset`) в константы.
- [x] A1.4 Вынесены ключевые API routes (`/api/user`, `/api/tariffs`, proxy admin routes) в константы.
- [x] A1.5 Вынесены классы контейнеров карточки устройства в константы.
- [x] A1.6 Добавлен единый helper `copyToClipboard()` и заменены дубли копирования.
- [x] A1.7 Вынести payment-константы (route + fallback settings) без изменения логики.
- [x] A1.8 Свести однотипные notify-ошибки в device/payment в компактные helpers.

## B. PWA cache/update

- [ ] B1 Проверка `sw.js`: кодировка + комментарии.
- [ ] B2 Проверка стратегии кэша и version key.

## C. HTML/CSS tidy

- [ ] C1 Аккуратная чистка `index.html` (без изменения дизайна).
- [ ] C2 Аккуратная чистка `styles.css` (без регрессий).

## D. Server cleanup

- [ ] D1 Карта блоков `api_server.py`.
- [ ] D2 Микрорефактор блоками (без изменения бизнес-логики).

## E. Bot cleanup

- [ ] E1 Карта блоков `ghost_final.py` и `bot/*`.
- [ ] E2 Микрорефактор блоками (без изменения бизнес-логики).

## F. Docs and structure

- [ ] F1 Проверить кодировку docs в UTF-8.
- [ ] F2 Обновить `.gitignore`.
- [ ] F3 Перенос docs/data по согласованной схеме.

## G. Access/Payment control checks

- [ ] G1 Проверить сценарий: при `days_left = 0` доступ к VPN блокируется до оплаты, после подтверждения оплаты доступ восстанавливается.
