# ACCESS_AND_INCIDENT_RUNBOOK

## Цель

Быстро диагностировать типовые проблемы прода без хаоса: вход на сервер, SSH, выдача ключей, недоступность API, оплаты.

## Быстрая триада проверки (первые 2 минуты)

1. Проверить сеть и VPN на клиентской машине.
2. Проверить доступность SSH/API портов.
3. Проверить статус сервисов на сервере.

## 1) Не удается зайти по SSH

### Симптом
- `Connection closed by ... port 22`
- `kex_exchange_identification`
- `Test-NetConnection ... Waiting for response`

### Причины (по приоритету)
1. Подключение через VPN/прокси на ПК (маршрут ломается).
2. Блок по сети/ACL/Firewall до сервера.
3. Ошибки в `sshd_config`.
4. Лок/баны (`fail2ban`, `faillock`).

### Проверка

На ПК:

```powershell
(Invoke-WebRequest -UseBasicParsing https://ifconfig.me/ip).Content
Test-NetConnection <SERVER_IP> -Port 22
```

На сервере через VNC:

```bash
systemctl status sshd --no-pager
ss -ltnp | grep ':22'
tcpdump -ni any tcp port 22 -c 20
```

### Быстрый фикс

1. Отключить VPN на ПК и повторить вход.
2. Если пакеты не приходят в `tcpdump` -> править сетевой ACL/панель провайдера.
3. Если `sshd` не стартует -> проверить `sshd -t`, откатить конфиг из бэкапа.

## 2) SSH-ключ/конфиг клиента сломан

### Симптом
- OpenSSH ругается на `Bad configuration option`.
- Не тот порт/юзер/ключ в `~/.ssh/config`.

### Проверка

```powershell
ssh -F NUL -vvv -4 root@<SERVER_IP>
```

### Быстрый фикс

Подключаться временно с игнором локального конфига:

```powershell
ssh -F NUL -4 -o PreferredAuthentications=password -o PubkeyAuthentication=no root@<SERVER_IP>
```

## 3) Ключи у клиента не работают

### Симптом
- `sub/<token>` -> `404 not_found`
- В клиент не импортируется ссылка.

### Причины
1. Токен не существует/устарел.
2. Устройство удалено/пересоздано.
3. Несинхронная БД или не тот `GHOST_DB_FILE` у сервиса.

### Проверка

```bash
curl -ki --max-time 15 "https://api.112prd.ru:2053/sub/<token>"
PID=$(pgrep -f ghost_final.py | head -n1); tr '\0' '\n' < /proc/$PID/environ | grep GHOST_DB_FILE
PIDA=$(pgrep -f "uvicorn api_server:app" | head -n1); tr '\0' '\n' < /proc/$PIDA/environ | grep GHOST_DB_FILE
```

### Быстрый фикс

Попросить пользователя в mini app:
1. `Мои ключи` -> `Обновить ключ`.
2. Скопировать новую ссылку.
3. Импортировать в V2RayTun.

## 4) Оплата не попадает в pending

### Симптом
- Пользователь нажал `Я перевел деньги`, но в админке пусто.

### Проверка

```bash
journalctl -u ghostlink-api -n 120 --no-pager | grep -E "/api/payment/report|500|payment"
sqlite3 /root/ghostlink/GhostLink_panel.db "PRAGMA table_info(users);"
```

### Быстрый фикс

1. Проверить нужные колонки `payment_*` в `users`.
2. Проверить, что API и бот смотрят в одну БД.
3. Перезапустить `ghostlink-api` и `ghostlink-bot`.

## 5) Перед любыми правками

Обязательно:

```bash
cp /root/ghostlink/GhostLink_panel.db /root/ghostlink/GhostLink_panel.db.bak.$(date +%F-%H%M)
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%F-%H%M)
```

## 6) Мини-чек после фикса

1. SSH вход с ПК.
2. `/api/health` отвечает `{"ok":true}`.
3. Новый ключ создается и импортируется.
4. Тестовая оплата уходит в pending.
5. Подтверждение продлевает срок.
