import shutil
import subprocess

from bot.config import PANEL_PORT
from bot.storage import load_db, save_db


def firewalld_active():
    if not shutil.which("firewall-cmd"):
        return False
    try:
        res = subprocess.run(["systemctl", "is-active", "firewalld"], capture_output=True, text=True)
        return res.returncode == 0
    except Exception:
        return False


def fw_run(args):
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


def panel_lock():
    if not firewalld_active():
        return False, "firewalld не запущен"
    try:
        db = load_db()
        meta = db.get("_meta", {})
        last_ip = meta.get("panel_ip")
        if last_ip:
            fw_remove_rule(f'rule family="ipv4" source address="{last_ip}" port port="{PANEL_PORT}" protocol="tcp" accept')
        meta["panel_ip"] = ""
        db["_meta"] = meta
        save_db(db)
    except Exception:
        pass

    _cleanup_panel_allow_rules()
    # Убираем глобально открытый порт панели, если его открыли через --add-port.
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
    # Даже при unlock не держим порт открытым глобально через --add-port.
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
