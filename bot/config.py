import datetime
import logging
import os
import sys


def load_dotenv(path=".env"):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def require_env(name, cast=str):
    value = os.getenv(name)
    if value is None or value == "":
        logging.error("Отсутствует обязательная переменная окружения: %s", name)
        sys.exit(1)
    try:
        return cast(value)
    except Exception:
        logging.error("Неверный формат переменной окружения: %s", name)
        sys.exit(1)


load_dotenv()

API_TOKEN = require_env("GHOST_API_TOKEN")
PANEL_URL = require_env("GHOST_PANEL_URL")  # Обязательно / в конце
PANEL_URL_LOCAL = os.getenv("GHOST_PANEL_URL_LOCAL", "")
USERNAME = require_env("GHOST_PANEL_USERNAME")
PASSWORD = require_env("GHOST_PANEL_PASSWORD")
ADMIN_ID = require_env("GHOST_ADMIN_ID", int)

# Данные Reality
SERVER_IP = require_env("GHOST_SERVER_IP")
PBK = require_env("GHOST_PBK")
SID = require_env("GHOST_SID")
SNI = require_env("GHOST_SNI")
FLOW = os.getenv("GHOST_FLOW", "").strip()
INBOUND_ID = int(os.getenv("GHOST_INBOUND_ID", "1"))
VIP_LIMIT_DEFAULT = int(os.getenv("GHOST_VIP_LIMIT", "10"))
WEBAPP_URL = os.getenv("GHOST_WEBAPP_URL", "")
PANEL_PORT = int(os.getenv("GHOST_PANEL_PORT", "11277"))
XRAY_SERVICE = os.getenv("GHOST_XRAY_SERVICE", "x-ui")
LINK_TEMPLATE = os.getenv("GHOST_LINK_TEMPLATE", "")
SID_VALUE = SID.split(",")[0].strip() if "," in SID else SID

# Ссылки на приложение
APP_IOS = os.getenv("GHOST_APP_IOS", "https://apps.apple.com/us/app/v2raytun/id6476628951?l=ru")
APP_ANDROID = os.getenv("GHOST_APP_ANDROID", "https://play.google.com/store/apps/details?id=com.v2raytun.android")
APP_WINDOWS = os.getenv("GHOST_APP_WINDOWS", "https://github.com/mdf45/v2raytun/releases/download/v3.7.10/v2RayTun_Setup.exe")
APP_MAC = os.getenv("GHOST_APP_MAC", "https://apps.apple.com/us/app/v2raytun/id6476628951?l=ru")

# Глобальные лимиты
MAX_USERS_DEFAULT = 50
TRIAL_DAYS = 7
SERVER_EXPIRY = datetime.datetime(2026, 3, 16)
DEFAULT_TRAFFIC_LIMIT_GB = 100
