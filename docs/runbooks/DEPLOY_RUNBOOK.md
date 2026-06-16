# GhostLink Deploy Runbook

Прод-деплой выполняется только через `deploy_safe.sh`.

## 0) Один раз после загрузки скриптов
```bash
cd /root/ghostlink
sed -i '1s/^\xEF\xBB\xBF//' deploy_safe.sh rollback_last.sh
sed -i 's/\r$//' deploy_safe.sh rollback_last.sh
chmod +x deploy_safe.sh rollback_last.sh
```

## 0.1) Encoding baseline (обязательно перед деплоем)
```bash
locale
```

Ожидаемо:
- `LANG=en_US.UTF-8` или `LANG=ru_RU.UTF-8`
- `LC_ALL=en_US.UTF-8` или `LC_ALL=ru_RU.UTF-8`

Если не UTF-8, временно выставить:
```bash
export PYTHONIOENCODING=utf8
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
```

Для постоянной фиксации в systemd-сервисах добавить:
```ini
Environment=PYTHONIOENCODING=utf8
Environment=LANG=en_US.UTF-8
Environment=LC_ALL=en_US.UTF-8
```

## 1) Обычный деплой
После загрузки новых `/root/ghostlink/api_server.py` и `/root/ghostlink/ghost_final.py`:
```bash
bash /root/ghostlink/deploy_safe.sh; echo "exit_code=$?"
```

Коды:
- `0` — деплой успешен.
- `2` — деплой не прошел, авто-rollback выполнился успешно.
- `1` — критическая ошибка (смотри вывод и логи).

## 2) Ручной откат (если нужен)
```bash
bash /root/ghostlink/rollback_last.sh; echo "exit_code=$?"
```

## 3) Правило эксплуатации
- Не использовать ручной боевой `systemctl restart ...` для деплоя.
- Любое боевое обновление выполнять только через `deploy_safe.sh`.
- `systemctl restart` допустим только для диагностики, не как сценарий релиза.
