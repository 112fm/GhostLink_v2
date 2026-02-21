# GhostLink Frontend Security Notes

## Никогда не хранить в фронте
- `GHOST_API_TOKEN`
- логин/пароль панели (`GHOST_PANEL_USERNAME`, `GHOST_PANEL_PASSWORD`)
- любые private keys, sid/pbk или админские секреты

## Разрешено хранить
- публичные URL (`https://api.112prd.ru:2053`)
- UI-константы

## PWA правила
- service worker не кэширует `/api/*`
- не хранить ключи пользователей в `localStorage`
- не писать чувствительные поля в `console.log`

## Релиз-чеклист
1. Проверить, что в репо нет `.env`.
2. Проверить поиск по словам: `token`, `password`, `pbk`, `sid`.
3. Проверить CORS на API: только нужные origin.
