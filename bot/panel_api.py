import json

import requests

from bot.config import INBOUND_ID, PANEL_URL, PANEL_URL_LOCAL, PASSWORD, USERNAME


def _panel_urls():
    urls = []
    if PANEL_URL_LOCAL:
        urls.append(PANEL_URL_LOCAL)
    if PANEL_URL and "127.0.0.1" not in PANEL_URL and "localhost" not in PANEL_URL:
        try:
            parts = PANEL_URL.split("://", 1)
            if len(parts) == 2:
                proto, rest = parts
                host_and_path = rest.split("/", 1)
                path = "/" + host_and_path[1] if len(host_and_path) > 1 else "/"
                local = f"{proto}://127.0.0.1{path}"
                urls.append(local)
        except Exception:
            pass
    if PANEL_URL:
        urls.append(PANEL_URL)
    seen = set()
    out = []
    for url in urls:
        if url and url not in seen:
            out.append(url)
            seen.add(url)
    return out


def get_cookies():
    for base_url in _panel_urls():
        try:
            res = requests.post(f"{base_url}login", data={"username": USERNAME, "password": PASSWORD}, timeout=10)
            if res.ok:
                return res.cookies, base_url
        except Exception:
            continue
    return None, None


def panel_get_inbounds(cookies, base_url):
    res = requests.get(f"{base_url}panel/api/inbounds/list", cookies=cookies, timeout=10)
    return res.json().get("obj", [])


def panel_find_client(inbounds, client_id):
    for inbound in inbounds:
        inbound_id = inbound.get("id")
        settings = inbound.get("settings")
        if isinstance(settings, str):
            try:
                settings = json.loads(settings)
            except Exception:
                continue
        clients = (settings or {}).get("clients", [])
        for client in clients:
            if client.get("id") == client_id:
                return inbound_id, client
    return None, None


def panel_update_client_enable(client_id, enable):
    cookies, base_url = get_cookies()
    if not cookies:
        return False
    inbounds = panel_get_inbounds(cookies, base_url)
    inbound_id, client = panel_find_client(inbounds, client_id)
    if not inbound_id or not client:
        return False
    client_data = dict(client)
    client_data["enable"] = enable
    data = {"id": inbound_id, "settings": json.dumps({"clients": [client_data]})}
    res = requests.post(f"{base_url}panel/api/inbounds/updateClient/{client_id}", data=data, cookies=cookies, timeout=10)
    return res.ok


def panel_update_client_limit(client_id, limit_ip):
    cookies, base_url = get_cookies()
    if not cookies:
        return False
    inbounds = panel_get_inbounds(cookies, base_url)
    inbound_id, client = panel_find_client(inbounds, client_id)
    if not inbound_id or not client:
        return False
    client_data = dict(client)
    client_data["limitIp"] = int(limit_ip)
    data = {"id": inbound_id, "settings": json.dumps({"clients": [client_data]})}
    res = requests.post(f"{base_url}panel/api/inbounds/updateClient/{client_id}", data=data, cookies=cookies, timeout=10)
    return res.ok


def panel_get_onlines():
    cookies, base_url = get_cookies()
    if not cookies:
        return None
    try:
        res = requests.post(
            f"{base_url}panel/api/inbounds/onlines",
            data={"id": INBOUND_ID},
            cookies=cookies,
            timeout=10,
        )
        if not res.ok:
            return None
        data = res.json()
        return data.get("obj", data)
    except Exception:
        return None


def panel_add_client(client_id, email, limit_ip, tg_id):
    cookies, base_url = get_cookies()
    if not cookies:
        return False
    client_data = {
        "id": INBOUND_ID,
        "settings": json.dumps(
            {
                "clients": [
                    {
                        "id": client_id,
                        "email": email,
                        "limitIp": int(limit_ip),
                        "enable": True,
                        "tgId": tg_id,
                    }
                ]
            }
        ),
    }
    res = requests.post(f"{base_url}panel/api/inbounds/addClient", data=client_data, cookies=cookies, timeout=10)
    if not res.ok:
        return False
    try:
        payload = res.json()
        return bool(payload.get("success", False))
    except Exception:
        return False

