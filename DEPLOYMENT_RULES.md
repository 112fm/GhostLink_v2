# Правила Деплоя (Deployment Rules)

1. Backend файлы (`api_server.py` и `ghost_final.py`) ВСЕГДА лежат ТОЛЬКО на сервере. Их нельзя пушить в GitHub.
2. Frontend файлы (`webapp-pwa` и `webapp-mini`) лежат в GitHub (они раздаются через GitHub Pages или Vercel).

**Никогда не использовать `git push` для бэкенд файлов.**
