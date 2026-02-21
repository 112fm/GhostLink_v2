import os
import json
import time
import hmac
import hashlib
import datetime
import sqlite3
import logging
import shutil
from urllib.parse import parse_qsl
import logging
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

DB_FILE = os.getenv("GHOST_DB_FILE", "ghost_users.db")
LEGACY_JSON = os.getenv("GHOST_DB_LEGACY", "ghost_users.json")
BOT_TOKEN = os.getenv("GHOST_API_TOKEN", "")
PANEL_URL = os.getenv("GHOST_PANEL_URL", "")
PANEL_URL_LOCAL = os.getenv("GHOST_PANEL_URL_LOCAL", "")
PANEL_URL_EFFECTIVE = (PANEL_URL_LOCAL or PANEL_URL).strip()
PANEL_USER = os.getenv("GHOST_PANEL_USERNAME", "")
PANEL_PASS = os.getenv("GHOST_PANEL_PASSWORD", "")
SERVER_IP = os.getenv("GHOST_SERVER_IP", "")
PBK = os.getenv("GHOST_PBK", "")
SID = os.getenv("GHOST_SID", "")
SID_VALUE = SID.split(",")[0].strip() if "," in SID else SID
SNI = os.getenv("GHOST_SNI", "")
LINK_TEMPLATE = os.getenv("GHOST_LINK_TEMPLATE", "")
FLOW = os.getenv("GHOST_FLOW", "").strip()
INBOUND_ID = int(os.getenv("GHOST_INBOUND_ID", "1"))
BOT_USERNAME = os.getenv("GHOST_BOT_USERNAME", "").lstrip("@")
ADMIN_ID = os.getenv("GHOST_ADMIN_ID", "")
PANEL_PORT = int(os.getenv("GHOST_PANEL_PORT", "11277"))
BACKUP_DIR = os.getenv("GHOST_BACKUP_DIR", "backups")

ALLOWED_ORIGINS = os.getenv("GHOST_WEBAPP_ORIGINS", "*")
ORIGINS = [o.strip() for o in ALLOWED_ORIGINS.split(",") if o.strip()]

app = FastAPI()
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("uvicorn.error")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS if ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _db_connect():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def _db_init(conn):
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            tg_id TEXT PRIMARY KEY,
            uuid TEXT,
            expiry TEXT,
            expiry_ts INTEGER,
            status TEXT,
            balance INTEGER,
            device_limit INTEGER,
            tariff_name TEXT,
            name TEXT,
            last_request_ts INTEGER,
            ref_by TEXT,
            ref_by_username TEXT,
            discount INTEGER,
            first_paid INTEGER,
            ref_paid INTEGER,
            member_tier TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    cur.execute("PRAGMA table_info(users)")
    cols = {r[1] for r in cur.fetchall()}
    for col, ddl in {
        "ref_by": "ALTER TABLE users ADD COLUMN ref_by TEXT",
        "ref_by_username": "ALTER TABLE users ADD COLUMN ref_by_username TEXT",
        "discount": "ALTER TABLE users ADD COLUMN discount INTEGER",
        "first_paid": "ALTER TABLE users ADD COLUMN first_paid INTEGER",
        "ref_paid": "ALTER TABLE users ADD COLUMN ref_paid INTEGER",
        "member_tier": "ALTER TABLE users ADD COLUMN member_tier TEXT",
    }.items():
        if col not in cols:
            cur.execute(ddl)
    conn.commit()


def _migrate_json(conn):
    if not os.path.exists(LEGACY_JSON):
        return
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS cnt FROM users")
    if cur.fetchone()["cnt"] > 0:
        return
    try:
        with open(LEGACY_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
        for k, v in data.items():
            if k == "_meta":
                for mk, mv in v.items():
                    cur.execute("INSERT OR REPLACE INTO meta(key, value) VALUES(?,?)", (mk, json.dumps(mv)))
                continue
            cur.execute("""
                INSERT OR REPLACE INTO users
                (tg_id, uuid, expiry, expiry_ts, status, balance, device_limit, tariff_name, name, last_request_ts, ref_by, ref_by_username, discount, first_paid, ref_paid, member_tier)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                k,
                v.get("uuid"),
                v.get("expiry"),
                v.get("expiry_ts"),
                v.get("status"),
                v.get("balance", 0),
                v.get("device_limit", 3),
                v.get("tariff_name"),
                v.get("name"),
                v.get("last_request_ts"),
                v.get("ref_by"),
                v.get("ref_by_username"),
                v.get("discount", 0),
                v.get("first_paid", 0),
                v.get("ref_paid", 0),
                v.get("member_tier", "regular"),
            ))
        conn.commit()
    except Exception:
        pass


def load_db():
    conn = _db_connect()
    _db_init(conn)
    _migrate_json(conn)
    cur = conn.cursor()
    cur.execute("SELECT * FROM users")
    users = {}
    for row in cur.fetchall():
        users[row["tg_id"]] = dict(row)
    cur.execute("SELECT key, value FROM meta")
    meta = {}
    for row in cur.fetchall():
        try:
            meta[row["key"]] = json.loads(row["value"])
        except Exception:
            meta[row["key"]] = row["value"]
    if meta:
        users["_meta"] = meta
    conn.close()
    return users


def save_db(data):
    conn = _db_connect()
    _db_init(conn)
    cur = conn.cursor()
    cur.execute("DELETE FROM users")
    cur.execute("DELETE FROM meta")
    meta = data.get("_meta", {})
    for mk, mv in meta.items():
        cur.execute("INSERT OR REPLACE INTO meta(key, value) VALUES(?,?)", (mk, json.dumps(mv)))
    for k, v in data.items():
        if k == "_meta":
            continue
        cur.execute("""
            INSERT OR REPLACE INTO users
            (tg_id, uuid, expiry, expiry_ts, status, balance, device_limit, tariff_name, name, last_request_ts, ref_by, ref_by_username, discount, first_paid, ref_paid, member_tier)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            k,
            v.get("uuid"),
            v.get("expiry"),
            v.get("expiry_ts"),
            v.get("status"),
            v.get("balance", 0),
            v.get("device_limit", 3),
            v.get("tariff_name"),
            v.get("name"),
            v.get("last_request_ts"),
            v.get("ref_by"),
            v.get("ref_by_username"),
            v.get("discount", 0),
            v.get("first_paid", 0),
            v.get("ref_paid", 0),
            v.get("member_tier", "regular"),
        ))
    conn.commit()
    conn.close()


def verify_init_data(init_data: str) -> Optional[dict]:
    if not BOT_TOKEN:
        return None
    try:
        data = dict(parse_qsl(init_data, strict_parsing=True))
        if "hash" not in data:
            return None
        received_hash = data.pop("hash")
        check_arr = [f"{k}={data[k]}" for k in sorted(data.keys())]
        data_check_string = "\n".join(check_arr)
        # Telegram WebApp signature algorithm
        secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        h = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(h, received_hash):
            return None
        # parse user
        user_json = json.loads(data["user"]) if "user" in data else None
        return {"user": user_json, "auth_date": data.get("auth_date")}
    except Exception:
        return None


def get_user_record(tg_id: str):
    db = load_db()
    return db.get(tg_id), db


def ensure_user_record(tg_id: str, name: str):
    db = load_db()
    if tg_id not in db:
        db[tg_id] = {
            "uuid": None,
            "expiry": None,
            "expiry_ts": None,
            "status": "none",
            "balance": 0,
            "device_limit": 3,
            "tariff_name": None,
            "name": name,
            "ref_by": None,
            "ref_by_username": None,
            "discount": 0,
            "first_paid": 0,
            "ref_paid": 0,
            "member_tier": "regular",
        }
        save_db(db)
    return db[tg_id]


def make_vless_link(u_id: str, label: str):
    if LINK_TEMPLATE:
        return LINK_TEMPLATE.replace("{uuid}", u_id).replace("{label}", label)
    return (
        f"vless://{u_id}@{SERVER_IP}:443"
        f"?type=tcp&encryption=none&security=reality&pbk={PBK}"
        f"&fp=chrome&sni={SNI}&sid={SID_VALUE}&spx=%2F#{label}"
    )


def get_cookies():
    import requests
    if not PANEL_URL_EFFECTIVE:
        return None
    res = requests.post(f"{PANEL_URL_EFFECTIVE}login", data={"username": PANEL_USER, "password": PANEL_PASS}, timeout=10)
    return res.cookies


def is_admin(init_data: str) -> bool:
    if not ADMIN_ID:
        return False
    data = verify_init_data(init_data or "")
    if not data or not data.get("user"):
        return False
    return str(data["user"].get("id")) == str(ADMIN_ID)


def get_free_mem_mb():
    try:
        with open("/proc/meminfo", "r") as f:
            lines = f.readlines()
        meminfo = {line.split(":")[0]: line.split(":")[1].strip() for line in lines if ":" in line}
        if "MemAvailable" in meminfo:
            free_kb = int(meminfo["MemAvailable"].split()[0])
        elif "MemFree" in meminfo:
            free_kb = int(meminfo["MemFree"].split()[0])
        else:
            free_kb = 0
        return free_kb // 1024
    except Exception:
        return 0


def _format_ru_date(date_str: Optional[str]) -> Optional[str]:
    if not date_str:
        return None
    try:
        d = datetime.datetime.strptime(str(date_str), "%Y-%m-%d").date()
        return d.strftime("%d.%m.%Y")
    except Exception:
        return str(date_str)


def _days_left(date_str: Optional[str]) -> Optional[int]:
    if not date_str:
        return None
    try:
        d = datetime.datetime.strptime(str(date_str), "%Y-%m-%d").date()
        return (d - datetime.date.today()).days
    except Exception:
        return None


def firewalld_active():
    import subprocess
    try:
        r = subprocess.run(["systemctl", "is-active", "firewalld"], capture_output=True, text=True)
        return r.returncode == 0
    except Exception:
        return False


def fw_run(args):
    import subprocess
    return subprocess.run(["firewall-cmd"] + args, capture_output=True, text=True)


def fw_add_rule(rule):
    return fw_run(["--permanent", "--add-rich-rule", rule])


def fw_remove_rule(rule):
    return fw_run(["--permanent", "--remove-rich-rule", rule])


def _fw_ok(res, allow_already=False, allow_missing=False):
    if res.returncode == 0:
        return True
    err = (res.stderr or "") + " " + (res.stdout or "")
    if allow_already and "ALREADY_ENABLED" in err:
        return True
    if allow_missing and "NOT_ENABLED" in err:
        return True
    return False


def _cleanup_panel_allow_rules():
    res = fw_run(["--permanent", "--list-rich-rules"])
    if res.returncode != 0:
        return
    for raw in (res.stdout or "").splitlines():
        rule = raw.strip()
        if not rule:
            continue
        if f'port port="{PANEL_PORT}"' not in rule:
            continue
        if "accept" not in rule:
            continue
        if 'source address="127.0.0.1"' in rule:
            continue
        fw_remove_rule(rule)


def _cleanup_panel_reject_rules():
    res = fw_run(["--permanent", "--list-rich-rules"])
    if res.returncode != 0:
        return
    for raw in (res.stdout or "").splitlines():
        rule = raw.strip()
        if not rule:
            continue
        if f'port port="{PANEL_PORT}"' not in rule:
            continue
        if "reject" not in rule:
            continue
        fw_remove_rule(rule)


def notify_admin(text: str):
    if not BOT_TOKEN or not ADMIN_ID:
        return
    try:
        import requests
        requests.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            data={"chat_id": str(ADMIN_ID), "text": text},
            timeout=10,
        )
    except Exception:
        pass


def auto_backup_snapshot(reason: str) -> dict:
    result = {"ok": False, "files": []}
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        safe_reason = "".join(ch for ch in reason if ch.isalnum() or ch in ("_", "-"))[:32] or "action"

        if os.path.exists(DB_FILE):
            bot_path = os.path.join(BACKUP_DIR, f"bot_{safe_reason}_{ts}.db")
            shutil.copy2(DB_FILE, bot_path)
            result["files"].append(bot_path)

        cookies = get_cookies()
        if cookies:
            import requests
            resp = requests.get(f"{PANEL_URL_EFFECTIVE}panel/api/server/getDb", cookies=cookies, timeout=20)
            if resp.ok and resp.content:
                panel_path = os.path.join(BACKUP_DIR, f"panel_{safe_reason}_{ts}.db")
                with open(panel_path, "wb") as f:
                    f.write(resp.content)
                result["files"].append(panel_path)
        result["ok"] = len(result["files"]) > 0
    except Exception:
        pass
    return result


def panel_lock():
    if not firewalld_active():
        return False, "firewalld не запущен"
    try:
        db = load_db()
        meta = db.get("_meta", {})
        last_ip = str(meta.get("panel_ip") or "").strip()
        if last_ip:
            fw_remove_rule(f'rule family="ipv4" source address="{last_ip}" port port="{PANEL_PORT}" protocol="tcp" accept')
            meta["panel_ip"] = ""
            db["_meta"] = meta
            save_db(db)
    except Exception:
        pass
    _cleanup_panel_allow_rules()
    # На всякий случай убираем глобально открытый порт панели.
    _fw_ok(fw_run(["--permanent", "--remove-port", f"{PANEL_PORT}/tcp"]), allow_missing=True)
    _cleanup_panel_reject_rules()
    localhost_rule = f'rule family="ipv4" source address="127.0.0.1" port port="{PANEL_PORT}" protocol="tcp" accept'
    reject_rule4 = f'rule family="ipv4" port port="{PANEL_PORT}" protocol="tcp" reject'
    reject_rule6 = f'rule family="ipv6" port port="{PANEL_PORT}" protocol="tcp" reject'
    ok1 = _fw_ok(fw_add_rule(localhost_rule), allow_already=True)
    ok2 = _fw_ok(fw_add_rule(reject_rule4), allow_already=True)
    ok3 = _fw_ok(fw_add_rule(reject_rule6), allow_already=True)
    ok4 = _fw_ok(fw_run(["--reload"]))
    if ok1 and ok2 and ok3 and ok4:
        return True, "Панель заперта"
    return False, "Не удалось применить правила firewalld"


def panel_unlock(ip):
    if not firewalld_active():
        return False, "firewalld не запущен"
    try:
        db = load_db()
        meta = db.get("_meta", {})
        old_ip = str(meta.get("panel_ip") or "").strip()
        if old_ip and old_ip != ip:
            fw_remove_rule(f'rule family="ipv4" source address="{old_ip}" port port="{PANEL_PORT}" protocol="tcp" accept')
    except Exception:
        pass
    _cleanup_panel_allow_rules()
    # На всякий случай убираем глобально открытый порт панели.
    _fw_ok(fw_run(["--permanent", "--remove-port", f"{PANEL_PORT}/tcp"]), allow_missing=True)
    _cleanup_panel_reject_rules()
    localhost_rule = f'rule family="ipv4" source address="127.0.0.1" port port="{PANEL_PORT}" protocol="tcp" accept'
    ip_rule = f'rule family="ipv4" source address="{ip}" port port="{PANEL_PORT}" protocol="tcp" accept'
    ok1 = _fw_ok(fw_add_rule(localhost_rule), allow_already=True)
    ok2 = _fw_ok(fw_add_rule(ip_rule), allow_already=True)
    ok3 = _fw_ok(fw_run(["--reload"]))
    if ok1 and ok2 and ok3:
        try:
            db = load_db()
            meta = db.get("_meta", {})
            meta["panel_ip"] = ip
            db["_meta"] = meta
            save_db(db)
        except Exception:
            pass
        return True, f"Доступ открыт для {ip}"
    return False, "Не удалось применить правила firewalld"


def is_valid_ipv4(ip):
    parts = ip.split(".")
    if len(parts) != 4:
        return False
    try:
        return all(0 <= int(p) <= 255 for p in parts)
    except Exception:
        return False


def panel_add_client(client_id, email, limit_ip, tg_id):
    import requests
    cookies = get_cookies()
    if not cookies:
        return False
    client = {
        "id": client_id,
        "email": email,
        "limitIp": int(limit_ip),
        "enable": True,
        "tgId": tg_id,
    }
    if FLOW:
        client["flow"] = FLOW
    data = {
        "id": INBOUND_ID,
        "settings": json.dumps({
            "clients": [client]
        })
    }
    res = requests.post(f"{PANEL_URL_EFFECTIVE}panel/api/inbounds/addClient", data=data, cookies=cookies, timeout=10)
    return res.ok


def panel_update_client_enable(client_id, enable):
    import requests
    cookies = get_cookies()
    if not cookies:
        return False
    res = requests.get(f"{PANEL_URL_EFFECTIVE}panel/api/inbounds/list", cookies=cookies, timeout=10)
    obj = res.json().get("obj", [])
    inbound_id = None
    client = None
    for inbound in obj:
        inbound_id = inbound.get("id")
        settings = inbound.get("settings")
        if isinstance(settings, str):
            try:
                settings = json.loads(settings)
            except Exception:
                continue
        for c in (settings or {}).get("clients", []):
            if c.get("id") == client_id:
                client = c
                break
        if client:
            break
    if not inbound_id or not client:
        return False
    client_data = dict(client)
    client_data["enable"] = enable
    data = {"id": inbound_id, "settings": json.dumps({"clients": [client_data]})}
    res = requests.post(f"{PANEL_URL_EFFECTIVE}panel/api/inbounds/updateClient/{client_id}", data=data, cookies=cookies, timeout=10)
    return res.ok

def panel_update_client_limit(client_id, limit_ip):
    import requests
    cookies = get_cookies()
    if not cookies:
        return False
    res = requests.get(f"{PANEL_URL_EFFECTIVE}panel/api/inbounds/list", cookies=cookies, timeout=10)
    obj = res.json().get("obj", [])
    inbound_id = None
    client = None
    for inbound in obj:
        inbound_id = inbound.get("id")
        settings = inbound.get("settings")
        if isinstance(settings, str):
            try:
                settings = json.loads(settings)
            except Exception:
                continue
        for c in (settings or {}).get("clients", []):
            if c.get("id") == client_id:
                client = c
                break
        if client:
            break
    if not inbound_id or not client:
        return False
    client_data = dict(client)
    client_data["limitIp"] = int(limit_ip)
    data = {"id": inbound_id, "settings": json.dumps({"clients": [client_data]})}
    res = requests.post(f"{PANEL_URL_EFFECTIVE}panel/api/inbounds/updateClient/{client_id}", data=data, cookies=cookies, timeout=10)
    return res.ok


def panel_get_onlines():
    import requests
    cookies = get_cookies()
    if not cookies:
        return None
    try:
        res = requests.post(
            f"{PANEL_URL_EFFECTIVE}panel/api/inbounds/onlines",
            data={"id": INBOUND_ID},
            cookies=cookies,
            timeout=10
        )
        if not res.ok:
            return None
        data = res.json()
        return data.get("obj", data)
    except Exception:
        return None


def panel_get_inbounds():
    import requests
    cookies = get_cookies()
    if not cookies:
        return None
    try:
        res = requests.get(f"{PANEL_URL_EFFECTIVE}panel/api/inbounds/list", cookies=cookies, timeout=10)
        if not res.ok:
            return None
        return res.json().get("obj", [])
    except Exception:
        return None


def panel_list_clients():
    inbounds = panel_get_inbounds()
    if not inbounds:
        return []
    inbound = None
    for item in inbounds:
        if int(item.get("id", 0)) == INBOUND_ID:
            inbound = item
            break
    if not inbound:
        return []

    settings = inbound.get("settings")
    if isinstance(settings, str):
        try:
            settings = json.loads(settings)
        except Exception:
            settings = {}
    clients = (settings or {}).get("clients", [])

    stats = inbound.get("clientStats", []) or []
    stats_map = {}
    for st in stats:
        email = st.get("email") or st.get("name")
        if email:
            stats_map[email] = st

    onlines = panel_get_onlines() or []
    online_set = set()
    if isinstance(onlines, dict):
        online_set = set(onlines.keys())
    elif isinstance(onlines, list):
        for item in onlines:
            if isinstance(item, dict):
                email = item.get("email") or item.get("name")
                if email:
                    online_set.add(email)
            else:
                online_set.add(str(item))

    def _to_int(v):
        try:
            if v is None:
                return 0
            if isinstance(v, str):
                return int(float(v))
            return int(v)
        except Exception:
            return 0

    out = []
    for c in clients:
        email = c.get("email") or ""
        st = stats_map.get(email, {})
        up = _to_int(st.get("up", 0))
        down = _to_int(st.get("down", 0))
        total = _to_int(st.get("total", 0))
        if total <= 0:
            total = up + down
        out.append(
            {
                "uuid": c.get("id"),
                "email": email,
                "enable": bool(c.get("enable", True)),
                "online": email in online_set,
                "up": up,
                "down": down,
                "total": total,
                "expiry": st.get("expiryTime") or st.get("expiry"),
                "tg_id": str(c.get("tgId") or "").strip(),
                "limit_ip": int(c.get("limitIp") or 0),
            }
        )
    return out


def panel_del_client(client_id):
    import requests
    cookies = get_cookies()
    if not cookies:
        return False
    try:
        res = requests.post(f"{PANEL_URL_EFFECTIVE}panel/api/inbounds/delClient/{client_id}", cookies=cookies, timeout=10)
        if res.ok:
            data = res.json()
            if bool(data.get("success", False)):
                return True
    except Exception:
        pass
    return False


def _name_invalid(name: str, uid: str) -> bool:
    if not name:
        return True
    return name == uid or name.isdigit() or name.lower().startswith("user_") or name.lower().startswith("tg_")


def _backfill_user_names_from_panel(db: dict, clients: list) -> bool:
    changed = False
    for c in clients:
        uid = str(c.get("tg_id") or "").strip()
        email = str(c.get("email") or "").strip()
        if not uid or uid not in db or not email:
            continue
        rec = db.get(uid) or {}
        raw = str(rec.get("name") or "").strip()
        if _name_invalid(raw, uid):
            rec["name"] = email
            db[uid] = rec
            changed = True
    return changed

TARIFFS = {
    "regular": {1: 150, 2: 225, 3: 300, 4: 375, 5: 450},
    "own": {1: 100, 2: 150, 3: 200, 4: 250, 5: 300},
}


def _norm_tier(value: Optional[str]) -> str:
    v = str(value or "regular").strip().lower()
    if v in ("own", "vip"):
        return "own" if v == "own" else "vip"
    return "regular"


def calc_price(devices: int, tier: str):
    tier = _norm_tier(tier)
    devices = max(1, min(5, int(devices)))
    if tier == "vip":
        # VIP оставляем как особый режим (ручное управление), для расчета UI считаем как own
        tier = "own"
    price = TARIFFS[tier][devices]
    min_pay = price // 2 if tier == "own" else int(round(price * 2 / 3))
    max_discount = max(0, price - min_pay)
    return price, min_pay, max_discount


def calc_max_discount(rec: dict):
    tier = _norm_tier(rec.get("member_tier"))
    devices = int(rec.get("device_limit") or 1)
    _, _, max_discount = calc_price(devices, tier)
    return max_discount


def ensure_key(tg_id: str, name: str):
    user, db = get_user_record(tg_id)
    if not user:
        user = ensure_user_record(tg_id, name)
        db = load_db()
    if user.get("uuid"):
        try:
            panel_update_client_limit(user.get("uuid"), 1)
        except Exception:
            pass
        return user.get("uuid"), user
    u_id = hashlib.sha256(f"{tg_id}-{time.time()}".encode()).hexdigest()[:32]
    ok = panel_add_client(u_id, f"User_{tg_id}", 1, tg_id)
    if not ok:
        raise HTTPException(status_code=502, detail="panel_error")
    expiry = (datetime.datetime.now() + datetime.timedelta(days=7)).strftime("%Y-%m-%d")
    user["uuid"] = u_id
    user["expiry"] = expiry
    user["status"] = "trial"
    db[tg_id] = user
    save_db(db)
    return u_id, user


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/tariffs")
def tariffs(x_telegram_initdata: Optional[str] = Header(None)):
    tier = "regular"
    if x_telegram_initdata:
        data = verify_init_data(x_telegram_initdata)
        if data and data.get("user"):
            tg_id = str(data["user"].get("id"))
            db = load_db()
            rec = db.get(tg_id) or {}
            tier = _norm_tier(rec.get("member_tier"))
            if tier == "vip":
                tier = "own"

    prices = {}
    for d in range(1, 6):
        p, m, md = calc_price(d, tier)
        prices[d] = {"price": p, "min_pay": m, "max_discount": md}
    return {
        "tier": tier,
        "prices": prices,
        "solo": prices[1],
        "flex": {k: prices[k] for k in range(2, 6)},
    }


@app.get("/api/agreement")
def agreement():
    return {
        "title": "Пользовательское соглашение",
        "text": (
            "Настоящее соглашение регулирует использование сервиса GhostLink. "
            "Сервис предоставляется на условиях «как есть». Пользователь обязуется "
            "не использовать сервис для нарушения законодательства. "
            "Оплаченные периоды действуют в пределах выбранного тарифа. "
            "Администрация вправе приостановить доступ при злоупотреблениях."
        )
    }


@app.get("/api/user")
def user(x_telegram_initdata: Optional[str] = Header(None)):
    # debug: безопасный лог длины initData (без полного содержимого)
    if x_telegram_initdata:
        preview = f"{x_telegram_initdata[:10]}...{x_telegram_initdata[-10:]}"
        log.info(f"initData len={len(x_telegram_initdata)} preview={preview}")
    else:
        log.info("initData missing")
    if not x_telegram_initdata:
        raise HTTPException(status_code=401, detail="no_initdata")
    data = verify_init_data(x_telegram_initdata)
    if not data or not data.get("user"):
        raise HTTPException(status_code=401, detail="bad_initdata")
    u = data["user"]
    tg_id = str(u.get("id"))
    name = u.get("first_name", "") + (" " + u.get("last_name", "") if u.get("last_name") else "")
    db = load_db()
    rec = db.get(tg_id)
    if not rec and tg_id == str(ADMIN_ID):
        rec = ensure_user_record(tg_id, name.strip() or "Admin")
        db = load_db()
    if not rec:
        raise HTTPException(status_code=403, detail="access_closed")
    if tg_id != str(ADMIN_ID) and rec.get("status") in ("pending", "denied"):
        raise HTTPException(status_code=403, detail="access_closed")

    status = rec.get("status", "none")
    expiry = rec.get("expiry")
    expiry_ts = rec.get("expiry_ts")
    if expiry_ts:
        try:
            expiry_dt = datetime.datetime.fromtimestamp(expiry_ts)
            expiry = expiry_dt.strftime("%Y-%m-%d")
        except Exception:
            pass
    active = status in ("trial", "active", "vip") and (expiry is None or expiry >= datetime.date.today().strftime("%Y-%m-%d"))
    expiry_human = _format_ru_date(expiry) if expiry else ("Без срока" if active else None)
    days_left = _days_left(expiry) if expiry else None
    ref_link = f"https://t.me/{BOT_USERNAME}?start=ref_{tg_id}" if BOT_USERNAME else ""
    support_link = f"https://t.me/{BOT_USERNAME}" if BOT_USERNAME else ""

    discount = int(rec.get("discount") or 0)
    member_tier = _norm_tier(rec.get("member_tier"))
    max_discount = calc_max_discount(rec)
    if discount > max_discount:
        discount = max_discount
    discount_text = f"{discount} ₽"
    if discount >= max_discount and max_discount > 0:
        discount_text = f"{discount} ₽ (максимум)"

    return {
        "user": {
            "id": tg_id,
            "name": name.strip() or u.get("username", ""),
            "username": u.get("username", ""),
        },
        "balance": rec.get("balance", 0),
        "discount": discount,
        "discount_max": max_discount,
        "discount_text": discount_text,
        "subscription": {
            "active": active,
            "expiry": expiry,
            "expiry_human": expiry_human,
            "days_left": days_left,
            "status": status,
        },
        "device_limit": rec.get("device_limit", 3),
        "tariff_name": rec.get("tariff_name"),
        "member_tier": member_tier,
        "referral_link": ref_link,
        "support_link": support_link,
    }


@app.get("/api/referrals")
def referrals(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata:
        raise HTTPException(status_code=401, detail="no_initdata")
    data = verify_init_data(x_telegram_initdata)
    if not data or not data.get("user"):
        raise HTTPException(status_code=401, detail="bad_initdata")
    u = data["user"]
    tg_id = str(u.get("id"))
    db = load_db()
    rec = db.get(tg_id)
    if not rec and tg_id == str(ADMIN_ID):
        rec = ensure_user_record(tg_id, "Admin")
        db = load_db()
    if not rec or (tg_id != str(ADMIN_ID) and rec.get("status") in ("pending", "denied")):
        raise HTTPException(status_code=403, detail="access_closed")
    panel_clients = panel_list_clients()
    tgid_to_email = {}
    for c in panel_clients:
        tgid = str(c.get("tg_id") or "").strip()
        if tgid and tgid not in tgid_to_email:
            tgid_to_email[tgid] = c.get("email") or ""

    items = []
    paid_count = 0
    for uid, rec in db.items():
        if uid == "_meta":
            continue
        if str(rec.get("ref_by") or "") == tg_id:
            name = str(rec.get("name") or "").strip()
            if not name or name.isdigit() or name.lower().startswith("user_"):
                name = tgid_to_email.get(uid) or f"ID {uid}"
            status = "paid" if int(rec.get("first_paid") or 0) == 1 else "pending"
            if status == "paid":
                paid_count += 1
            items.append({"id": uid, "name": name, "status": status})
    return {
        "items": items,
        "total": len(items),
        "paid": paid_count,
        "pending": len(items) - paid_count,
    }


@app.post("/api/key")
def key(x_telegram_initdata: Optional[str] = Header(None)):
    if x_telegram_initdata:
        preview = f"{x_telegram_initdata[:10]}...{x_telegram_initdata[-10:]}"
        log.info(f"initData len={len(x_telegram_initdata)} preview={preview}")
    else:
        log.info("initData missing")
    if not x_telegram_initdata:
        raise HTTPException(status_code=401, detail="no_initdata")
    data = verify_init_data(x_telegram_initdata)
    if not data or not data.get("user"):
        raise HTTPException(status_code=401, detail="bad_initdata")
    u = data["user"]
    tg_id = str(u.get("id"))
    name = u.get("first_name", "")
    u_id, rec = ensure_key(tg_id, name)
    link = make_vless_link(u_id, "GhostUser")
    return {"key": link}

@app.post("/api/subscribe")
def subscribe(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata:
        raise HTTPException(status_code=401, detail="no_initdata")
    data = verify_init_data(x_telegram_initdata)
    if not data or not data.get("user"):
        raise HTTPException(status_code=401, detail="bad_initdata")
    u = data["user"]
    tg_id = str(u.get("id"))

    tariff_id = str(payload.get("tariff_id") or "").strip()
    devices = int(payload.get("devices", 1))
    if tariff_id not in ("solo", "flex"):
        raise HTTPException(status_code=400, detail="bad_tariff")
    if tariff_id == "solo":
        devices = 1
    if tariff_id == "flex" and (devices < 2 or devices > 5):
        raise HTTPException(status_code=400, detail="bad_devices")

    db = load_db()
    rec = db.get(tg_id)
    if not rec and tg_id == str(ADMIN_ID):
        rec = ensure_user_record(tg_id, "Admin")
        db = load_db()
    if not rec or (tg_id != str(ADMIN_ID) and rec.get("status") in ("pending", "denied")):
        raise HTTPException(status_code=403, detail="access_closed")
    now = datetime.datetime.now()
    if rec.get("expiry_ts"):
        try:
            current_exp = datetime.datetime.fromtimestamp(rec["expiry_ts"])
        except Exception:
            current_exp = now
    elif rec.get("expiry"):
        try:
            current_exp = datetime.datetime.strptime(rec["expiry"], "%Y-%m-%d")
        except Exception:
            current_exp = now
    else:
        current_exp = now
    start = current_exp if current_exp > now else now
    new_exp = start + datetime.timedelta(days=30)

    rec["device_limit"] = 1 if tariff_id == "solo" else devices
    tier = _norm_tier(rec.get("member_tier"))
    price, min_pay, max_discount = calc_price(int(rec["device_limit"]), tier)

    rec["tariff_name"] = tariff_id
    rec["expiry_ts"] = int(new_exp.timestamp())
    rec["expiry"] = new_exp.strftime("%Y-%m-%d")
    rec["status"] = "active"

    if rec.get("uuid"):
        # Один ключ = одно устройство. Для дополнительных устройств используются отдельные ключи.
        panel_update_client_limit(rec["uuid"], 1)

    # Первая оплата фиксируется здесь
    if int(rec.get("first_paid") or 0) == 0:
        rec["first_paid"] = 1
        # Бонус рефереру — только после первой оплаты
        ref_by = rec.get("ref_by")
        if ref_by and int(rec.get("ref_paid") or 0) == 0 and ref_by in db:
            bonus = int(round(price * 0.15))
            ref = db.get(ref_by)
            ref_discount = int(ref.get("discount") or 0)
            ref_max = calc_max_discount(ref)
            ref_discount = min(ref_discount + bonus, ref_max)
            ref["discount"] = ref_discount
            db[ref_by] = ref
            rec["ref_paid"] = 1
    db[tg_id] = rec
    save_db(db)

    return {
        "ok": True,
        "expiry": rec["expiry"],
        "device_limit": rec["device_limit"],
        "tariff_name": rec["tariff_name"],
        "price": price,
        "min_pay": min_pay,
        "discount": int(rec.get("discount") or 0),
        "max_discount": max_discount,
    }


@app.post("/api/device/reset")
def reset_device(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata:
        raise HTTPException(status_code=401, detail="no_initdata")
    data = verify_init_data(x_telegram_initdata)
    if not data or not data.get("user"):
        raise HTTPException(status_code=401, detail="bad_initdata")
    u = data["user"]
    tg_id = str(u.get("id"))
    db = load_db()
    rec = db.get(tg_id)
    if not rec or not rec.get("uuid"):
        raise HTTPException(status_code=404, detail="no_key")
    old_uuid = rec.get("uuid")
    panel_update_client_enable(old_uuid, False)
    new_uuid = hashlib.sha256(f"{tg_id}-{time.time()}".encode()).hexdigest()[:32]
    ok = panel_add_client(new_uuid, f"User_{tg_id}", 1, tg_id)
    if not ok:
        raise HTTPException(status_code=502, detail="panel_error")
    rec["uuid"] = new_uuid
    db[tg_id] = rec
    save_db(db)
    link = make_vless_link(new_uuid, "GhostUser")
    return {"key": link}


@app.get("/api/device/list")
def device_list(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata:
        raise HTTPException(status_code=401, detail="no_initdata")
    data = verify_init_data(x_telegram_initdata)
    if not data or not data.get("user"):
        raise HTTPException(status_code=401, detail="bad_initdata")
    u = data["user"]
    tg_id = str(u.get("id"))
    db = load_db()
    rec = db.get(tg_id)
    if not rec:
        raise HTTPException(status_code=404, detail="no_user")

    clients = panel_list_clients()
    my_items = [c for c in clients if str(c.get("tg_id") or "") == tg_id]
    my_items.sort(key=lambda x: (0 if x.get("uuid") == rec.get("uuid") else 1, (x.get("email") or "").lower()))
    return {
        "items": my_items,
        "device_limit": int(rec.get("device_limit") or 1),
        "connected": len(my_items),
    }


@app.post("/api/device/add")
def device_add(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata:
        raise HTTPException(status_code=401, detail="no_initdata")
    data = verify_init_data(x_telegram_initdata)
    if not data or not data.get("user"):
        raise HTTPException(status_code=401, detail="bad_initdata")
    u = data["user"]
    tg_id = str(u.get("id"))
    db = load_db()
    rec = db.get(tg_id)
    if not rec:
        raise HTTPException(status_code=404, detail="no_user")
    if rec.get("status") not in ("trial", "active", "vip"):
        raise HTTPException(status_code=403, detail="access_closed")

    clients = panel_list_clients()
    my_items = [c for c in clients if str(c.get("tg_id") or "") == tg_id]
    limit = int(rec.get("device_limit") or 1)
    if len(my_items) >= limit:
        raise HTTPException(status_code=400, detail="device_limit_reached")

    seq = len(my_items) + 1
    base_name = (u.get("username") and f"@{u.get('username')}") or f"user_{tg_id}"
    email = f"{base_name}_{seq}"
    new_uuid = hashlib.sha256(f"{tg_id}-{time.time()}-{seq}".encode()).hexdigest()[:32]
    ok = panel_add_client(new_uuid, email, 1, tg_id)
    if not ok:
        raise HTTPException(status_code=502, detail="panel_error")
    if not rec.get("uuid"):
        rec["uuid"] = new_uuid
        db[tg_id] = rec
        save_db(db)
    return {"ok": True, "key": make_vless_link(new_uuid, "GhostUser"), "uuid": new_uuid}


@app.post("/api/device/remove")
def device_remove(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata:
        raise HTTPException(status_code=401, detail="no_initdata")
    data = verify_init_data(x_telegram_initdata)
    if not data or not data.get("user"):
        raise HTTPException(status_code=401, detail="bad_initdata")
    u = data["user"]
    tg_id = str(u.get("id"))
    client_id = str(payload.get("uuid") or "").strip()
    if not client_id:
        raise HTTPException(status_code=400, detail="bad_id")

    db = load_db()
    rec = db.get(tg_id)
    if not rec:
        raise HTTPException(status_code=404, detail="no_user")

    clients = panel_list_clients()
    my_ids = {str(c.get("uuid")) for c in clients if str(c.get("tg_id") or "") == tg_id}
    if client_id not in my_ids:
        raise HTTPException(status_code=403, detail="forbidden")

    ok = panel_del_client(client_id)
    if not ok:
        raise HTTPException(status_code=502, detail="panel_error")

    if str(rec.get("uuid") or "") == client_id:
        # Сместим основной UUID на любой оставшийся клиент пользователя
        fresh = panel_list_clients()
        left = [c for c in fresh if str(c.get("tg_id") or "") == tg_id]
        rec["uuid"] = left[0]["uuid"] if left else None
        db[tg_id] = rec
        save_db(db)
    return {"ok": True}


@app.get("/api/admin/stats")
def admin_stats(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    db = load_db()
    total = len([k for k in db.keys() if k != "_meta"])
    meta = db.get("_meta", {})
    max_users = int(meta.get("max_users", 50))
    mem_free_mb = get_free_mem_mb()
    onlines = panel_get_onlines()
    names = []
    if isinstance(onlines, dict):
        names = list(onlines.keys())
    elif isinstance(onlines, list):
        for item in onlines:
            if isinstance(item, dict):
                if "email" in item:
                    names.append(item["email"])
                elif "name" in item:
                    names.append(item["name"])
                elif "id" in item:
                    names.append(str(item["id"]))
            else:
                names.append(str(item))
    names = sorted(set(names))
    return {
        "total": total,
        "max_users": max_users,
        "free_mem_mb": mem_free_mb,
        "online": names,
    }


@app.get("/api/admin/myip")
def admin_myip(request: Request, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    ip = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for") or request.client.host
    if ip and "," in ip:
        ip = ip.split(",")[0].strip()
    return {"ip": ip or ""}


@app.post("/api/admin/panel/lock")
def admin_panel_lock(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    ok, msg = panel_lock()
    notify_admin(f"🔒 Mini App: {msg}")
    return {"ok": ok, "message": msg}


@app.post("/api/admin/panel/unlock")
def admin_panel_unlock(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    ip = str(payload.get("ip", "")).strip()
    if not is_valid_ipv4(ip):
        raise HTTPException(status_code=400, detail="bad_ip")
    ok, msg = panel_unlock(ip)
    notify_admin(f"🔓 Mini App: {msg}")
    return {"ok": ok, "message": msg}


@app.post("/api/admin/xray/restart")
def admin_xray_restart(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    backup = auto_backup_snapshot("admin_restart_xray")
    import os as _os
    service = os.getenv("GHOST_XRAY_SERVICE", "x-ui")
    _os.system(f"systemctl restart {service}")
    return {"ok": True, "backup": backup}


@app.post("/api/admin/user/ban")
def admin_user_ban(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    user_id = str(payload.get("user_id", "")).strip()
    if user_id == str(ADMIN_ID):
        raise HTTPException(status_code=400, detail="cant_ban_admin")
    db = load_db()
    if user_id not in db:
        raise HTTPException(status_code=404, detail="user_not_found")
    u = db[user_id]
    u_uuid = u.get("uuid")
    if u_uuid:
        panel_update_client_enable(u_uuid, False)
    u["status"] = "banned"
    db[user_id] = u
    save_db(db)
    return {"ok": True}


@app.post("/api/admin/user/unban")
def admin_user_unban(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    user_id = str(payload.get("user_id", "")).strip()
    db = load_db()
    if user_id not in db:
        raise HTTPException(status_code=404, detail="user_not_found")
    u = db[user_id]
    u_uuid = u.get("uuid")
    if u_uuid:
        panel_update_client_enable(u_uuid, True)
    expiry = u.get("expiry")
    if expiry and expiry < datetime.date.today().strftime("%Y-%m-%d"):
        u["status"] = "expired"
    else:
        u["status"] = "active"
    db[user_id] = u
    save_db(db)
    return {"ok": True}


@app.post("/api/admin/user/delete")
def admin_user_delete(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    user_id = str(payload.get("user_id", "")).strip()
    if user_id == str(ADMIN_ID):
        raise HTTPException(status_code=400, detail="cant_delete_admin")
    backup = auto_backup_snapshot("admin_user_delete")
    db = load_db()
    if user_id not in db:
        raise HTTPException(status_code=404, detail="user_not_found")
    u_uuid = db[user_id].get("uuid")
    if u_uuid:
        panel_update_client_enable(u_uuid, False)
    db.pop(user_id, None)
    save_db(db)
    return {"ok": True, "backup": backup}


def _ensure_user_uuid(db: dict, user_id: str) -> str:
    rec = db[user_id]
    u_uuid = str(rec.get("uuid") or "").strip()
    if u_uuid:
        return u_uuid
    new_uuid = hashlib.sha256(f"{user_id}-{time.time()}".encode()).hexdigest()[:32]
    display_name = str(rec.get("name") or "").strip()
    if not display_name or display_name.isdigit() or display_name.lower().startswith("user_"):
        display_name = f"tg_{user_id}"
    ok = panel_add_client(new_uuid, display_name, 1, user_id)
    if not ok:
        raise HTTPException(status_code=502, detail="panel_error")
    rec["uuid"] = new_uuid
    db[user_id] = rec
    return new_uuid


@app.post("/api/admin/user/trial7")
def admin_user_trial7(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    user_id = str(payload.get("user_id", "")).strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="bad_user_id")
    db = load_db()
    if user_id not in db:
        raise HTTPException(status_code=404, detail="user_not_found")
    rec = db[user_id]
    rec["expiry"] = (datetime.date.today() + datetime.timedelta(days=7)).strftime("%Y-%m-%d")
    rec["expiry_ts"] = int(time.time()) + 7 * 24 * 3600
    rec["status"] = "trial"
    u_uuid = _ensure_user_uuid(db, user_id)
    panel_update_client_enable(u_uuid, True)
    db[user_id] = rec
    save_db(db)
    return {"ok": True, "expiry": rec["expiry"]}


@app.post("/api/admin/user/extend")
def admin_user_extend(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    user_id = str(payload.get("user_id", "")).strip()
    days = int(payload.get("days", 0))
    if not user_id or days <= 0:
        raise HTTPException(status_code=400, detail="bad_params")
    db = load_db()
    if user_id not in db:
        raise HTTPException(status_code=404, detail="user_not_found")
    rec = db[user_id]
    base = datetime.date.today()
    if rec.get("expiry"):
        try:
            cur = datetime.datetime.strptime(str(rec.get("expiry")), "%Y-%m-%d").date()
            if cur > base:
                base = cur
        except Exception:
            pass
    new_exp = base + datetime.timedelta(days=days)
    rec["expiry"] = new_exp.strftime("%Y-%m-%d")
    rec["expiry_ts"] = int(datetime.datetime.combine(new_exp, datetime.time.min).timestamp())
    if rec.get("status") in ("approved", "expired", "traffic_block", "banned", "pending", "denied", "none"):
        rec["status"] = "active"
    u_uuid = _ensure_user_uuid(db, user_id)
    panel_update_client_enable(u_uuid, True)
    db[user_id] = rec
    save_db(db)
    return {"ok": True, "expiry": rec["expiry"]}


@app.post("/api/admin/user/unlimited")
def admin_user_unlimited(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    user_id = str(payload.get("user_id", "")).strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="bad_user_id")
    db = load_db()
    if user_id not in db:
        raise HTTPException(status_code=404, detail="user_not_found")
    rec = db[user_id]
    rec["expiry"] = None
    rec["expiry_ts"] = None
    rec["status"] = "active"
    u_uuid = _ensure_user_uuid(db, user_id)
    panel_update_client_enable(u_uuid, True)
    db[user_id] = rec
    save_db(db)
    return {"ok": True}


@app.post("/api/admin/user/reset_subscription")
def admin_user_reset_subscription(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    user_id = str(payload.get("user_id", "")).strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="bad_user_id")
    if user_id == str(ADMIN_ID):
        raise HTTPException(status_code=400, detail="cant_reset_admin")
    backup = auto_backup_snapshot("admin_user_reset_subscription")
    db = load_db()
    if user_id not in db:
        raise HTTPException(status_code=404, detail="user_not_found")
    rec = db[user_id]
    u_uuid = str(rec.get("uuid") or "").strip()
    if u_uuid:
        panel_update_client_enable(u_uuid, False)
    rec["expiry"] = None
    rec["expiry_ts"] = None
    rec["status"] = "approved"
    rec["tariff_name"] = None
    db[user_id] = rec
    save_db(db)
    return {"ok": True, "backup": backup}


@app.post("/api/admin/user/tier")
def admin_user_tier(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    user_id = str(payload.get("user_id", "")).strip()
    tier = _norm_tier(payload.get("tier"))
    if tier not in ("regular", "own", "vip"):
        raise HTTPException(status_code=400, detail="bad_tier")
    if not user_id:
        raise HTTPException(status_code=400, detail="bad_user_id")
    db = load_db()
    if user_id not in db:
        raise HTTPException(status_code=404, detail="user_not_found")
    rec = db[user_id]
    rec["member_tier"] = tier
    db[user_id] = rec
    save_db(db)
    return {"ok": True, "member_tier": tier}


@app.post("/api/admin/add_slots")
def admin_add_slots(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    db = load_db()
    meta = db.get("_meta", {})
    max_users = int(meta.get("max_users", 50)) + 5
    meta["max_users"] = max_users
    db["_meta"] = meta
    save_db(db)
    return {"ok": True, "max_users": max_users}


@app.post("/api/admin/vip/show")
def admin_vip_show(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    db = load_db()
    vip = db.get(str(ADMIN_ID), {})
    u_id = vip.get("uuid")
    limit = db.get("_meta", {}).get("vip_limit", 10)
    return {"ok": True, "uuid": u_id, "limit": limit}


@app.post("/api/admin/vip/inc")
def admin_vip_inc(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    db = load_db()
    meta = db.get("_meta", {})
    limit = int(meta.get("vip_limit", 10)) + 1
    if limit > 50:
        raise HTTPException(status_code=400, detail="limit_too_high")
    u_id = db.get(str(ADMIN_ID), {}).get("uuid")
    if not u_id:
        raise HTTPException(status_code=404, detail="vip_not_found")
    panel_update_client_limit(u_id, limit)
    meta["vip_limit"] = limit
    db["_meta"] = meta
    save_db(db)
    return {"ok": True, "limit": limit}


@app.post("/api/admin/vip/dec")
def admin_vip_dec(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    db = load_db()
    meta = db.get("_meta", {})
    limit = int(meta.get("vip_limit", 10)) - 1
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit_too_low")
    u_id = db.get(str(ADMIN_ID), {}).get("uuid")
    if not u_id:
        raise HTTPException(status_code=404, detail="vip_not_found")
    panel_update_client_limit(u_id, limit)
    meta["vip_limit"] = limit
    db["_meta"] = meta
    save_db(db)
    return {"ok": True, "limit": limit}


@app.post("/api/admin/vip/rotate")
def admin_vip_rotate(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    db = load_db()
    old_uuid = db.get(str(ADMIN_ID), {}).get("uuid")
    limit = db.get("_meta", {}).get("vip_limit", 10)
    if old_uuid:
        panel_update_client_enable(old_uuid, False)
    new_uuid = hashlib.sha256(f"{ADMIN_ID}-{time.time()}".encode()).hexdigest()[:32]
    ok = panel_add_client(new_uuid, f"Admin_{ADMIN_ID}", limit, str(ADMIN_ID))
    if not ok:
        raise HTTPException(status_code=502, detail="panel_error")
    db[str(ADMIN_ID)] = {"uuid": new_uuid, "expiry": None, "status": "vip"}
    save_db(db)
    return {"ok": True, "uuid": new_uuid}


@app.post("/api/admin/vip/delete")
def admin_vip_delete(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    backup = auto_backup_snapshot("admin_vip_delete")
    db = load_db()
    vip = db.get(str(ADMIN_ID), {})
    u_uuid = vip.get("uuid")
    if u_uuid:
        panel_update_client_enable(u_uuid, False)
    db.pop(str(ADMIN_ID), None)
    save_db(db)
    return {"ok": True, "backup": backup}


@app.get("/api/admin/clients")
def admin_clients(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    items = panel_list_clients()
    if items is None:
        raise HTTPException(status_code=502, detail="panel_error")
    db = load_db()
    if _backfill_user_names_from_panel(db, items):
        save_db(db)
        db = load_db()
    for item in items:
        tg_id = str(item.get("tg_id") or "").strip()
        rec = db.get(tg_id) if tg_id else None
        raw_name = str((rec or {}).get("name") or "").strip()
        if raw_name and not _name_invalid(raw_name, tg_id):
            item["display_name"] = raw_name
        else:
            item["display_name"] = item.get("email") or item.get("uuid")
    return {"items": items}


@app.post("/api/admin/client/enable")
def admin_client_enable(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    client_id = str(payload.get("uuid", "")).strip()
    enable = bool(payload.get("enable", True))
    if not client_id:
        raise HTTPException(status_code=400, detail="bad_id")
    ok = panel_update_client_enable(client_id, enable)
    if not ok:
        raise HTTPException(status_code=502, detail="panel_error")
    return {"ok": True}


@app.post("/api/admin/client/delete")
def admin_client_delete(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    # Защитный стоп: удаление клиентов из админ-блока Mini App отключено,
    # т.к. на части версий панели это приводило к повреждению inbound-конфига.
    raise HTTPException(status_code=403, detail="client_delete_disabled")


@app.post("/api/admin/client/create")
def admin_client_create(payload: dict, x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    email = str(payload.get("email", "")).strip()
    limit = int(payload.get("limit", 3))
    tg_id = str(payload.get("tg_id", "manual")).strip() or "manual"
    if not email:
        raise HTTPException(status_code=400, detail="bad_email")
    if limit < 1 or limit > 50:
        raise HTTPException(status_code=400, detail="bad_limit")
    client_id = hashlib.sha256(f"{email}-{time.time()}".encode()).hexdigest()[:32]
    ok = panel_add_client(client_id, email, limit, tg_id)
    if not ok:
        raise HTTPException(status_code=502, detail="panel_error")
    return {"ok": True, "uuid": client_id}


@app.get("/api/admin/users")
def admin_users(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    db = load_db()
    panel_clients = panel_list_clients() or []
    if _backfill_user_names_from_panel(db, panel_clients):
        save_db(db)
        db = load_db()
    uuid_to_email = {}
    tgid_to_email = {}
    connected_by_tgid = {}
    for c in panel_clients:
        email = str(c.get("email") or "").strip()
        cid = str(c.get("uuid") or "").strip()
        tgid = str(c.get("tg_id") or "").strip()
        if email and cid and cid not in uuid_to_email:
            uuid_to_email[cid] = email
        if email and tgid and tgid not in tgid_to_email:
            tgid_to_email[tgid] = email
        if tgid:
            connected_by_tgid[tgid] = int(connected_by_tgid.get(tgid, 0)) + 1

    out = []
    for uid, rec in db.items():
        if uid == "_meta":
            continue
        raw_name = str(rec.get("name") or "").strip()
        display_name = raw_name
        if _name_invalid(raw_name, uid):
            from_panel = ""
            u = str(rec.get("uuid") or "").strip()
            if u:
                from_panel = uuid_to_email.get(u, "")
            if not from_panel:
                from_panel = tgid_to_email.get(uid, "")
            display_name = from_panel or f"ID {uid}"
        raw_name = str(rec.get("name") or "").strip()
        tg_username = raw_name if raw_name.startswith("@") else ""
        if not tg_username:
            panel_hint = tgid_to_email.get(uid, "")
            if panel_hint.startswith("@"):
                tg_username = panel_hint

        expiry = rec.get("expiry")
        days_left = _days_left(expiry)
        device_limit = int(rec.get("device_limit") or 0)
        connected_devices = int(connected_by_tgid.get(uid, 0))
        out.append({
            "id": uid,
            "name": display_name,
            "display_name": display_name,
            "status": rec.get("status") or "none",
            "uuid": rec.get("uuid"),
            "expiry": expiry,
            "expiry_human": _format_ru_date(expiry) if expiry else None,
            "days_left": days_left,
            "device_limit": device_limit,
            "connected_devices": connected_devices,
            "devices_ratio": f"{connected_devices}/{device_limit}",
            "tariff_name": rec.get("tariff_name"),
            "member_tier": _norm_tier(rec.get("member_tier")),
            "traffic_limit_gb": int(rec.get("traffic_limit_gb") or 0),
            "tg_username": tg_username,
            "tg_link": (f"https://t.me/{tg_username.lstrip('@')}" if tg_username else ""),
        })
    out.sort(key=lambda x: (x["name"] or "").lower())
    return {"items": out}


@app.get("/api/admin/backup")
def admin_backup(x_telegram_initdata: Optional[str] = Header(None)):
    if not x_telegram_initdata or not is_admin(x_telegram_initdata):
        raise HTTPException(status_code=403, detail="forbidden")
    import requests
    cookies = get_cookies()
    if cookies:
        try:
            resp = requests.get(f"{PANEL_URL_EFFECTIVE}panel/api/server/getDb", cookies=cookies, timeout=20)
            if resp.ok and resp.content:
                return Response(
                    content=resp.content,
                    media_type="application/octet-stream",
                    headers={"Content-Disposition": "attachment; filename=panel.db"},
                )
        except Exception:
            pass
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "rb") as f:
            data = f.read()
        return Response(
            content=data,
            media_type="application/octet-stream",
            headers={"Content-Disposition": "attachment; filename=ghost_users.db"},
        )
    raise HTTPException(status_code=404, detail="no_backup")
