import logging
import asyncio
import datetime
import json
import uuid
import os
import random
import requests
import html
from aiogram import Bot, Dispatcher, types, executor
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ContentType, ReplyKeyboardMarkup, KeyboardButton
from aiogram.utils.exceptions import BotBlocked

from bot.config import (
    ADMIN_ID,
    API_TOKEN,
    APP_ANDROID,
    APP_IOS,
    APP_MAC,
    APP_WINDOWS,
    DEFAULT_TRAFFIC_LIMIT_GB,
    INBOUND_ID,
    LINK_TEMPLATE,
    MAX_USERS_DEFAULT,
    PBK,
    SERVER_EXPIRY,
    SERVER_IP,
    SID_VALUE,
    SNI,
    TRIAL_DAYS,
    USERNAME,
    VIP_LIMIT_DEFAULT,
    WEBAPP_URL,
    XRAY_SERVICE,
)
from bot.storage import DB_FILE, load_db, save_db
from bot.panel_api import (
    get_cookies,
    panel_add_client,
    panel_find_client,
    panel_get_inbounds,
    panel_get_onlines,
    panel_update_client_enable,
    panel_update_client_limit,
)
from bot.security import is_valid_ipv4, panel_lock, panel_unlock

logging.basicConfig(level=logging.INFO)
bot = Bot(token=API_TOKEN)
dp = Dispatcher(bot)

# --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

def build_email(user: types.User, tg_id: str):
    if user.username:
        return f"@{user.username}"
    name = (user.first_name or "User").strip()
    return f"{name}_{tg_id}"

def build_link(uuid_str: str, label: str):
    if LINK_TEMPLATE:
        return LINK_TEMPLATE.replace("{uuid}", uuid_str).replace("{label}", label)
    return (
        f"vless://{uuid_str}@{SERVER_IP}:443"
        f"?type=tcp&encryption=none&security=reality&pbk={PBK}"
        f"&fp=chrome&sni={SNI}&sid={SID_VALUE}&spx=%2F#{label}"
    )

def default_traffic_limit_gb(device_limit: int) -> int:
    if device_limit <= 1:
        return 100
    if device_limit <= 3:
        return 200
    return 300

def ensure_traffic_defaults(rec: dict) -> dict:
    if not rec.get("traffic_limit_gb"):
        rec["traffic_limit_gb"] = default_traffic_limit_gb(int(rec.get("device_limit") or 3))
    if not rec.get("traffic_month"):
        rec["traffic_month"] = datetime.date.today().strftime("%Y-%m")
    rec["traffic_usage_bytes"] = int(rec.get("traffic_usage_bytes") or 0)
    rec["traffic_last_total"] = int(rec.get("traffic_last_total") or 0)
    rec["traffic_warn80"] = int(rec.get("traffic_warn80") or 0)
    rec["traffic_warn95"] = int(rec.get("traffic_warn95") or 0)
    return rec

def user_kb(status: str, is_admin: bool = False):
    kb = InlineKeyboardMarkup(row_width=1)
    if is_admin:
        kb.add(
            InlineKeyboardButton("🚀 Получить ключ", callback_data="get_key"),
            InlineKeyboardButton("🆘 Поддержка", callback_data="support"),
            InlineKeyboardButton("📜 Устав клуба", callback_data="club_rules"),
            InlineKeyboardButton("🛠 Админка", callback_data="admin_panel"),
        )
        return kb
    if status in ("trial", "active", "vip"):
        kb.add(InlineKeyboardButton("🚀 Получить ключ", callback_data="get_key"))
    if WEBAPP_URL:
        kb.add(InlineKeyboardButton("📱 Mini App", web_app=types.WebAppInfo(url=WEBAPP_URL)))
    kb.add(
        InlineKeyboardButton("🆘 Поддержка", callback_data="support"),
        InlineKeyboardButton("📜 Устав клуба", callback_data="club_rules"),
    )
    return kb


def quick_commands_kb():
    kb = ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row(KeyboardButton("/start"))
    return kb


def key_html(link: str) -> str:
    return f"<code>{html.escape(link, quote=False)}</code>"


async def send_key_message(chat_id: int, title: str, link: str, footer: str = ""):
    # Отправляем ключ отдельным сообщением только в <code>, чтобы в клиентах Telegram его было проще копировать.
    await bot.send_message(chat_id, title)
    await bot.send_message(chat_id, key_html(link), parse_mode="HTML")
    if footer:
        await bot.send_message(chat_id, footer)


def chunk_text(text, max_len=3500):
    if len(text) <= max_len:
        return [text]
    parts = []
    cur = ""
    for line in text.splitlines():
        if len(cur) + len(line) + 1 > max_len:
            parts.append(cur)
            cur = line
        else:
            cur = line if not cur else cur + "\n" + line
    if cur:
        parts.append(cur)
    return parts

# --- ФОНОВЫЕ ЗАДАЧИ ---

async def anti_rkn_task():
    """Имитация посещения белых сайтов для размытия трафика"""
    sites = ["https://wikipedia.org", "https://github.com", "https://google.com", "https://yahoo.com"]
    while True:
        try:
            url = random.choice(sites)
            requests.get(url, timeout=5)
            logging.info(f"Anti-RKN: Посетил {url}")
        except: pass
        await asyncio.sleep(random.randint(900, 1800)) # Раз в 15-30 минут

async def xray_health_check():
    """Проверка работы Xray и уведомление об оплате сервера"""
    while True:
        # Проверка Xray
        status = os.system(f"systemctl is-active --quiet {XRAY_SERVICE}")
        if status != 0:
            os.system(f"systemctl restart {XRAY_SERVICE}")
            await bot.send_message(ADMIN_ID, "⚠️ Ядро Xray упало, но я его успешно перезапустил!")
        
        # Уведомление об оплате сервера
        today = datetime.date.today()
        remind_from = datetime.date(2026, 3, 13)
        days_left = (SERVER_EXPIRY.date() - today).days
        db = load_db()
        meta = db.get("_meta", {})
        last_reminder = meta.get("server_reminder_date")
        if today >= remind_from and days_left >= 0:
            today_str = today.strftime("%Y-%m-%d")
            if last_reminder != today_str:
                await bot.send_message(ADMIN_ID, f"📢 Хозяин, пора оплатить сервер (Aeza)! Осталось дней: {days_left}")
                meta["server_reminder_date"] = today_str
                db["_meta"] = meta
                save_db(db)
        
        await asyncio.sleep(3600) # Раз в час

async def expiry_check_task():
    """Проверка окончания триала и отключение клиентов"""
    while True:
        db = load_db()
        changed = False
        for tg_id, info in list(db.items()):
            if tg_id == "_meta":
                continue
            expiry_str = info.get("expiry")
            status = info.get("status")
            if not expiry_str:
                continue
            try:
                expiry_date = datetime.datetime.strptime(expiry_str, "%Y-%m-%d").date()
            except Exception:
                continue
            if datetime.date.today() >= expiry_date and status != "expired":
                client_id = info.get("uuid")
                if client_id:
                    panel_update_client_enable(client_id, False)
                info["status"] = "expired"
                info["expired_at"] = datetime.date.today().strftime("%Y-%m-%d")
                db[tg_id] = info
                changed = True
                try:
                    await bot.send_message(int(tg_id), "⏳ Твой пробный период закончился. Напиши в поддержку для продления.")
                except Exception:
                    pass
        if changed:
            save_db(db)
        await asyncio.sleep(3600)

async def traffic_limit_task():
    while True:
        try:
            db = load_db()
            cookies, base_url = get_cookies()
            if not cookies:
                await asyncio.sleep(1800)
                continue
            inbounds = panel_get_inbounds(cookies, base_url)
            inbound = None
            for item in inbounds:
                if int(item.get("id", 0)) == INBOUND_ID:
                    inbound = item
                    break
            if not inbound:
                await asyncio.sleep(1800)
                continue
            settings = inbound.get("settings")
            if isinstance(settings, str):
                try:
                    settings = json.loads(settings)
                except Exception:
                    settings = {}
            clients = (settings or {}).get("clients", [])
            uuid_to_email = {c.get("id"): c.get("email") for c in clients if c.get("id")}
            stats = inbound.get("clientStats", []) or []
            total_by_email = {}
            for st in stats:
                email = st.get("email") or st.get("name")
                if not email:
                    continue
                try:
                    total = int(st.get("total") or 0)
                except Exception:
                    total = 0
                if total <= 0:
                    try:
                        total = int(st.get("up") or 0) + int(st.get("down") or 0)
                    except Exception:
                        total = 0
                total_by_email[email] = total

            current_month = datetime.date.today().strftime("%Y-%m")
            changed = False
            for uid, rec in list(db.items()):
                if uid == "_meta":
                    continue
                rec = ensure_traffic_defaults(rec)
                if rec.get("status") not in ("trial", "active", "traffic_block"):
                    db[uid] = rec
                    continue
                if rec.get("traffic_month") != current_month:
                    rec["traffic_month"] = current_month
                    rec["traffic_usage_bytes"] = 0
                    rec["traffic_last_total"] = 0
                    rec["traffic_warn80"] = 0
                    rec["traffic_warn95"] = 0
                    if rec.get("status") == "traffic_block":
                        rec["status"] = "active"
                        if rec.get("uuid"):
                            panel_update_client_enable(rec["uuid"], True)
                    changed = True
                uuid_val = rec.get("uuid")
                email = uuid_to_email.get(uuid_val)
                if not email:
                    db[uid] = rec
                    continue
                current_total = int(total_by_email.get(email, 0))
                last_total = int(rec.get("traffic_last_total") or 0)
                delta = current_total - last_total if current_total >= last_total else current_total
                rec["traffic_last_total"] = current_total
                rec["traffic_usage_bytes"] = int(rec.get("traffic_usage_bytes") or 0) + max(0, delta)

                limit_gb = int(rec.get("traffic_limit_gb") or default_traffic_limit_gb(int(rec.get("device_limit") or 3)))
                limit_bytes = limit_gb * 1024 * 1024 * 1024
                usage = int(rec.get("traffic_usage_bytes") or 0)

                if usage >= int(limit_bytes * 0.8) and int(rec.get("traffic_warn80") or 0) == 0:
                    rec["traffic_warn80"] = 1
                    try:
                        await bot.send_message(int(uid), f"📦 Ты использовал 80% лимита трафика ({limit_gb} GB/мес).")
                    except Exception:
                        pass
                if usage >= int(limit_bytes * 0.95) and int(rec.get("traffic_warn95") or 0) == 0:
                    rec["traffic_warn95"] = 1
                    try:
                        await bot.send_message(int(uid), f"⚠️ Ты использовал 95% лимита трафика ({limit_gb} GB/мес).")
                    except Exception:
                        pass
                if usage >= limit_bytes and rec.get("status") != "traffic_block":
                    rec["status"] = "traffic_block"
                    if rec.get("uuid"):
                        panel_update_client_enable(rec["uuid"], False)
                    try:
                        await bot.send_message(int(uid), "⛔ Лимит трафика на этот месяц исчерпан.")
                    except Exception:
                        pass
                    await bot.send_message(ADMIN_ID, f"⛔ Пользователь {uid} достиг лимита трафика ({limit_gb} GB).")
                db[uid] = rec
                changed = True
            if changed:
                save_db(db)
        except Exception:
            pass
        await asyncio.sleep(1800)

# --- ОБРАБОТКА КОМАНД ---

@dp.message_handler(commands=['start'])
async def cmd_start(message: types.Message):
    # Берем ID того, кто написал боту
    user_id = message.from_user.id
    db = load_db()
    args = message.get_args()
    name_now = (
        f"@{message.from_user.username}"
        if message.from_user.username
        else f"{(message.from_user.first_name or '').strip()} {(message.from_user.last_name or '').strip()}".strip() or str(user_id)
    )
    rec = db.get(str(user_id))
    if rec is not None:
        old_name = str(rec.get("name") or "").strip()
        if (not old_name) or old_name == str(user_id) or old_name.isdigit() or old_name.lower().startswith("user_"):
            rec["name"] = name_now
            db[str(user_id)] = rec
            save_db(db)
    try:
        await message.answer("Быстрые команды всегда под рукой:", reply_markup=quick_commands_kb())
    except Exception:
        pass

    welcome_text = (
        "<b>Привет! Это GhostLink 👻</b>\n\n"
        "Я выдам тебе персональный ключ для свободного интернета.\n"
        "Твой тестовый период: <b>7 дней</b>.\n\n"
        "<b>Шаг 1: Скачай приложение V2rayTun под своё устройство:</b>\n"
        f"🍏 <a href='{APP_IOS}'>iPhone</a>\n"
        f"🍎 <a href='{APP_MAC}'>Mac</a>\n"
        f"🤖 <a href='{APP_ANDROID}'>Android</a>\n"
        f"💻 <a href='{APP_WINDOWS}'>Windows</a>\n\n"
        "<b>Шаг 2: Получи ключ</b>\n"
        "Нажми кнопку <b>«🚀 Получить ключ»</b> ниже. Бот пришлет ссылку.\n\n"
        "<b>Шаг 3: Подключись</b>\n"
        "Скопируй ссылку и вставь её в приложение через кнопку <b>«+»</b> (Import from Clipboard).\n\n"
        "➕ Для нового устройства создавай отдельный ключ в Mini App: <b>Устройства → Добавить устройство</b>."
    )
    
    # ПРОВЕРКА НА АДМИНА
    if str(user_id) == str(ADMIN_ID):
        return await message.answer(
            welcome_text,
            parse_mode="HTML",
            reply_markup=user_kb("active", is_admin=True),
            disable_web_page_preview=True
        )

    # Закрытый клуб: только по инвайту
    if user_id != ADMIN_ID:
        if args:
            ref_id = None
            if args.startswith("ref_"):
                ref_id = args.split("_", 1)[1]
            elif args.startswith("ref"):
                ref_id = args[3:]
            if ref_id and ref_id.isdigit():
                # Анти-спам: админа уведомляем только при первой заявке от пользователя
                if str(user_id) not in db:
                    db[str(user_id)] = {
                        "uuid": None,
                        "expiry": None,
                        "status": "pending",
                        "ref_by": ref_id,
                        "ref_by_username": None,
                        "name": f"{message.from_user.first_name or ''} {message.from_user.last_name or ''}".strip(),
                        "requested_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    }
                    save_db(db)

                    ref_user = db.get(ref_id, {})
                    ref_name = ref_user.get("name") or f"ID {ref_id}"
                    kb_req = InlineKeyboardMarkup().add(
                        InlineKeyboardButton("✅ Одобрить", callback_data=f"approve_{user_id}"),
                        InlineKeyboardButton("❌ Отклонить", callback_data=f"deny_{user_id}")
                    )
                    await bot.send_message(
                        ADMIN_ID,
                        f"🧑‍🚀 Новый кандидат: @{message.from_user.username or 'без_username'} (ID {user_id})\n"
                        f"Пригласил: {ref_name}",
                        reply_markup=kb_req
                    )
                    return await message.answer(
                        "✅ Заявка отправлена. Ожидай одобрения Архитектора.",
                        reply_markup=user_kb("pending")
                    )

                existing = db.get(str(user_id), {})
                st = existing.get("status", "pending")
                if st == "pending":
                    return await message.answer("⏳ Заявка уже на рассмотрении.", reply_markup=user_kb("pending"))
                if st == "denied":
                    return await message.answer("🚫 Доступ отклонен.", reply_markup=user_kb("denied"))
                if st == "approved":
                    return await message.answer("✅ Вход в клуб открыт. Выбери тариф в Mini App.", reply_markup=user_kb("approved"))
                if st in ("trial", "active", "vip"):
                    return await message.answer(welcome_text, parse_mode="HTML", reply_markup=user_kb(st), disable_web_page_preview=True)
                if st in ("expired", "banned", "traffic_block"):
                    return await message.answer("⛔ Доступ сейчас неактивен. Напиши в поддержку.", reply_markup=user_kb(st))
        # если пользователь уже в базе, даем меню по статусу
        existing = db.get(str(user_id))
        if existing:
            st = existing.get("status", "pending")
            if st == "pending":
                return await message.answer("⏳ Заявка на рассмотрении.", reply_markup=user_kb("pending"))
            if st == "denied":
                return await message.answer("🚫 Доступ отклонен.", reply_markup=user_kb("denied"))
            if st == "approved":
                return await message.answer("✅ Вход в клуб открыт. Выбери тариф в Mini App.", reply_markup=user_kb("approved"))
            if st in ("trial", "active", "vip"):
                return await message.answer(welcome_text, parse_mode="HTML", reply_markup=user_kb(st), disable_web_page_preview=True)
            if st in ("expired", "banned", "traffic_block"):
                return await message.answer("⛔ Доступ сейчас неактивен. Напиши в поддержку.", reply_markup=user_kb(st))

        # без рефки и без записи
        return await message.answer(
            "🚫 Доступ закрыт. Вход только по приглашению.",
            reply_markup=user_kb("pending")
        )


@dp.callback_query_handler(lambda c: c.data == 'get_key')

async def process_get_key(callback_query: types.CallbackQuery):
    tg_id = str(callback_query.from_user.id)
    email = build_email(callback_query.from_user, tg_id)
    db = load_db()
    meta = db.get("_meta", {})
    max_users = int(meta.get("max_users", MAX_USERS_DEFAULT))
    now_ts = int(datetime.datetime.now().timestamp())

    # Закрытый клуб: доступ только при активном статусе
    if int(tg_id) != ADMIN_ID:
        u = db.get(tg_id)
        if not u or u.get("status") == "pending":
            return await bot.send_message(tg_id, "⏳ Ты в очереди. Доступ откроется после одобрения.")
        if u.get("status") == "approved":
            return await bot.send_message(tg_id, "✅ Вход в клуб открыт. Сначала активируй подписку/триал в Mini App.")
        if u.get("status") == "denied":
            return await bot.send_message(tg_id, "🚫 Доступ отклонен.")
        if u.get("status") in ("expired", "banned", "traffic_block"):
            return await bot.send_message(tg_id, "⛔ Доступ сейчас неактивен. Напиши в поддержку.")
    
    # VIP для админа
    if int(tg_id) == ADMIN_ID:
        vip_limit = db.get("_meta", {}).get("vip_limit", VIP_LIMIT_DEFAULT)
        if tg_id in db and db[tg_id].get("uuid"):
            u_id = db[tg_id]["uuid"]
            # Проверим, что VIP клиент реально есть в панели
            exists = False
            cookies, base_url = get_cookies()
            if cookies and u_id:
                inbounds = panel_get_inbounds(cookies, base_url)
                _, client = panel_find_client(inbounds, u_id)
                exists = client is not None
            if not exists:
                ok = panel_add_client(u_id, f"Admin_{tg_id}", vip_limit, tg_id)
                if not ok:
                    await bot.send_message(ADMIN_ID, "⚠️ Не удалось восстановить VIP в панели.")
                    return await bot.send_message(tg_id, "Сервис временно недоступен. Попробуй позже.")
            panel_update_client_limit(u_id, vip_limit)
            panel_update_client_enable(u_id, True)
        else:
            u_id = str(uuid.uuid4())
            ok = panel_add_client(u_id, f"Admin_{tg_id}", vip_limit, tg_id)
            if not ok:
                await bot.send_message(ADMIN_ID, "⚠️ Не удалось создать VIP в панели. Проверь доступ к панели.")
                return await bot.send_message(tg_id, "Сервис временно недоступен. Попробуй позже.")
            db[tg_id] = {"uuid": u_id, "expiry": None, "status": "vip", "traffic_limit_gb": 0}
            meta = db.get("_meta", {})
            meta["vip_limit"] = vip_limit
            db["_meta"] = meta
            save_db(db)
        link = build_link(u_id, "GhostBoss")
        await send_key_message(
            tg_id,
            f"👑 Твой VIP-ключ (лимит {vip_limit} устройств):",
            link,
            "➕ Для нового устройства: Mini App → Устройства → Добавить устройство",
        )
        return

    if tg_id in db:
        last_ts = db[tg_id].get("last_request_ts")
        if last_ts and now_ts - int(last_ts) < 30:
            return await bot.send_message(tg_id, "Подожди немного и попробуй снова.")
        if db[tg_id].get("status") == "expired":
            return await bot.send_message(tg_id, "Твой доступ истек. Напиши в поддержку для продления.")
        # Если уже есть в базе, выдаем ключ только активным
        if db[tg_id].get("status") not in ("trial", "active"):
            return await bot.send_message(tg_id, "Ключ доступен только при активном доступе.")
        u_id = db[tg_id].get('uuid')
        if not u_id:
            u_id = str(uuid.uuid4())
            ok = panel_add_client(u_id, email, 1, tg_id)
            if not ok:
                await bot.send_message(ADMIN_ID, f"⚠️ Не удалось создать клиента для {tg_id}")
                return await bot.send_message(tg_id, "Сервис временно недоступен. Попробуй позже.")
            db[tg_id]["uuid"] = u_id
        else:
            panel_update_client_limit(u_id, 1)
        # Проверим, что клиент есть в панели, иначе пересоздадим
        cookies, base_url = get_cookies()
        if cookies and u_id:
            inbounds = panel_get_inbounds(cookies, base_url)
            inbound_id, client = panel_find_client(inbounds, u_id)
            if not client:
                ok = panel_add_client(u_id, email, 1, tg_id)
                if not ok:
                    await bot.send_message(ADMIN_ID, f"⚠️ Не удалось восстановить клиента для {tg_id}")
                    return await bot.send_message(tg_id, "Сервис временно недоступен. Попробуй позже.")
        link = build_link(u_id, "GhostUser")
        db[tg_id] = ensure_traffic_defaults(db[tg_id])
        db[tg_id]["last_request_ts"] = now_ts
        save_db(db)
        await send_key_message(
            tg_id,
            "Твой ключ:",
            link,
            "➕ Для нового устройства: Mini App → Устройства → Добавить устройство",
        )
    else:
        return await bot.send_message(tg_id, "⛔ Доступ закрыт. Вход только после одобрения.")

# --- СИСТЕМА ПОДДЕРЖКИ (ТИКЕТЫ) ---

@dp.callback_query_handler(lambda c: c.data == 'support')
async def support_info(callback_query: types.CallbackQuery):
    await bot.send_message(callback_query.from_user.id, "Напиши свой вопрос следующим сообщением, и админ ответит тебе здесь!")

@dp.callback_query_handler(lambda c: c.data == 'club_rules')
async def club_rules(callback_query: types.CallbackQuery):
    rules = (
        "📝 <b>Устав GhostLink</b>\n\n"
        "1. <b>Клуб «Свои для своих»</b>\n"
        "Мы не публичный сервис. Нас всегда будет не больше 50 человек.\n\n"
        "2. <b>Уважай канал</b>\n"
        "Не используй GhostLink для тяжелых торрентов. Держим канал быстрым.\n\n"
        "3. <b>Поддержка очага</b>\n"
        "Доход идет на оплату сервера и развитие бота. Минимальный взнос — рукопожатие серверу.\n\n"
        "4. <b>Ответственность за инвайт</b>\n"
        "Приглашая друга, ты поручаешься за него. Если твой реферал нарушает правила, мы придем поговорить к тебе.\n\n"
        "5. <b>Свобода маневра</b>\n"
        "Ты сам решаешь, сколько устройств тебе нужно. Мы гибко подстроим лимит под твои задачи.\n"
    )
    await bot.send_message(callback_query.from_user.id, rules, parse_mode="HTML")

@dp.message_handler(lambda message: message.from_user.id != ADMIN_ID and not message.text.startswith('/'))
async def forward_to_admin(message: types.Message):
    kb = InlineKeyboardMarkup().add(InlineKeyboardButton("Ответить", callback_data=f"reply_{message.from_user.id}"))
    await bot.send_message(ADMIN_ID, f"📧 Сообщение от @{message.from_user.username} (ID: {message.from_user.id}):\n\n{message.text}", reply_markup=kb)
    await message.answer("Сообщение отправлено админу. Ожидай ответа.")

@dp.callback_query_handler(lambda c: c.data.startswith('reply_'))
async def prepare_reply(callback_query: types.CallbackQuery):
    user_id = callback_query.data.split('_')[1]
    admin_state["mode"] = "reply"
    admin_state["reply_to"] = int(user_id)
    await bot.send_message(ADMIN_ID, f"Введите ответ для пользователя {user_id} (или /cancel):")

# --- ЗАПУСК ---

@dp.callback_query_handler(lambda c: c.data.startswith('approve_'))
async def approve_user(callback_query: types.CallbackQuery):
    if callback_query.from_user.id != ADMIN_ID:
        return await bot.answer_callback_query(callback_query.id, "Доступ закрыт 🔒")
    user_id = callback_query.data.split('_', 1)[1]
    db = load_db()
    if user_id not in db:
        return await bot.send_message(ADMIN_ID, "Пользователь не найден.")
    db[user_id]["status"] = "approved"
    save_db(db)
    user_name = db[user_id].get("name") or user_id
    await bot.send_message(ADMIN_ID, f"✅ Добавил нового пользователя: {user_name} ({user_id})")
    await bot.send_message(
        int(user_id),
        "✅ Твоя заявка одобрена. Вход в клуб открыт. Выбери тариф/триал в Mini App.",
        reply_markup=user_kb("approved")
    )
    await bot.answer_callback_query(callback_query.id, "Одобрено")

@dp.callback_query_handler(lambda c: c.data.startswith('deny_'))
async def deny_user(callback_query: types.CallbackQuery):
    if callback_query.from_user.id != ADMIN_ID:
        return await bot.answer_callback_query(callback_query.id, "Доступ закрыт 🔒")
    user_id = callback_query.data.split('_', 1)[1]
    db = load_db()
    if user_id not in db:
        return await bot.send_message(ADMIN_ID, "Пользователь не найден.")
    db[user_id]["status"] = "denied"
    save_db(db)
    await bot.send_message(int(user_id), "🚫 Доступ отклонен.")
    await bot.answer_callback_query(callback_query.id, "Отклонено")

@dp.callback_query_handler(lambda c: c.data == 'admin_panel')
async def admin_menu(callback_query: types.CallbackQuery):
    if callback_query.from_user.id != ADMIN_ID:
        return await bot.answer_callback_query(callback_query.id, "Доступ закрыт 🔒")
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("👥 Пользователи", callback_data="admin_cat_users"),
        InlineKeyboardButton("📣 Коммуникации", callback_data="admin_cat_comm"),
        InlineKeyboardButton("🛡 Безопасность", callback_data="admin_cat_sec"),
        InlineKeyboardButton("⚙️ Система", callback_data="admin_cat_sys"),
        InlineKeyboardButton("👑 VIP", callback_data="admin_cat_vip"),
        InlineKeyboardButton("🗄 Бэкапы", callback_data="admin_cat_backup"),
    )
    await bot.send_message(ADMIN_ID, "💻 Панель управления GhostLink:", reply_markup=kb)
    await bot.answer_callback_query(callback_query.id)

def _admin_back_kb():
    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(InlineKeyboardButton("⬅️ Назад", callback_data="admin_panel"))
    return kb

@dp.callback_query_handler(lambda c: c.data == 'admin_cat_users')
async def admin_cat_users(callback_query: types.CallbackQuery):
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("📊 Статистика мест", callback_data="admin_stats"),
        InlineKeyboardButton("➕ Добавить +5 мест", callback_data="admin_add_slots"),
        InlineKeyboardButton("🎁 Выдать Trial 7 дней", callback_data="admin_trial7_user"),
        InlineKeyboardButton("📅 Продлить доступ (ID + дни)", callback_data="admin_extend_user"),
        InlineKeyboardButton("♾ Выдать без срока", callback_data="admin_unlimited_user"),
        InlineKeyboardButton("📦 Лимит трафика (ID + GB)", callback_data="admin_traffic_limit_user"),
        InlineKeyboardButton("🚫 Заблокировать юзера", callback_data="admin_ban_user"),
        InlineKeyboardButton("✅ Разблокировать юзера", callback_data="admin_unban_user"),
        InlineKeyboardButton("🗑 Удалить юзера", callback_data="admin_delete_user"),
    )
    kb.add(InlineKeyboardButton("⬅️ Назад", callback_data="admin_panel"))
    await bot.send_message(ADMIN_ID, "👥 Пользователи:", reply_markup=kb)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_cat_comm')
async def admin_cat_comm(callback_query: types.CallbackQuery):
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("📢 Сделать рассылку", callback_data="admin_broadcast"),
        InlineKeyboardButton("⬅️ Назад", callback_data="admin_panel"),
    )
    await bot.send_message(ADMIN_ID, "📣 Коммуникации:", reply_markup=kb)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_cat_sec')
async def admin_cat_sec(callback_query: types.CallbackQuery):
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("🔒 Запереть панель", callback_data="admin_panel_lock"),
        InlineKeyboardButton("🔓 Дать доступ (IP)", callback_data="admin_panel_unlock"),
        InlineKeyboardButton("📌 Текущий IP", callback_data="admin_panel_ip"),
        InlineKeyboardButton("🌐 Узнать мой IP", url="https://api.ipify.org"),
        InlineKeyboardButton("⬅️ Назад", callback_data="admin_panel"),
    )
    await bot.send_message(ADMIN_ID, "🛡 Безопасность:", reply_markup=kb)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_cat_sys')
async def admin_cat_sys(callback_query: types.CallbackQuery):
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("🔄 Перезапустить Xray", callback_data="admin_restart_xray"),
        InlineKeyboardButton("⬅️ Назад", callback_data="admin_panel"),
    )
    await bot.send_message(ADMIN_ID, "⚙️ Система:", reply_markup=kb)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_cat_vip')
async def admin_cat_vip(callback_query: types.CallbackQuery):
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("👑 VIP управление", callback_data="admin_vip_menu"),
        InlineKeyboardButton("👑 Удалить VIP", callback_data="admin_delete_vip"),
        InlineKeyboardButton("⬅️ Назад", callback_data="admin_panel"),
    )
    await bot.send_message(ADMIN_ID, "👑 VIP:", reply_markup=kb)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_cat_backup')
async def admin_cat_backup(callback_query: types.CallbackQuery):
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("📁 Выгрузить бэкап", callback_data="admin_backup"),
        InlineKeyboardButton("⬅️ Назад", callback_data="admin_panel"),
    )
    await bot.send_message(ADMIN_ID, "🗄 Бэкапы:", reply_markup=kb)
    await bot.answer_callback_query(callback_query.id)

# Обработчик кнопки Статистика
@dp.callback_query_handler(lambda c: c.data == 'admin_stats')
async def admin_stats(callback_query: types.CallbackQuery):
    await admin_do_stats(ADMIN_ID)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_add_slots')
async def admin_add_slots(callback_query: types.CallbackQuery):
    await admin_do_add_slots(ADMIN_ID)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_broadcast')
async def admin_broadcast(callback_query: types.CallbackQuery):
    admin_state["mode"] = "broadcast"
    await bot.send_message(ADMIN_ID, "Отправь текст рассылки (или /cancel):")
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_backup')
async def admin_backup(callback_query: types.CallbackQuery):
    await admin_do_backup(ADMIN_ID)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_restart_xray')
async def admin_restart_xray(callback_query: types.CallbackQuery):
    await admin_do_restart_xray(ADMIN_ID)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_panel_lock')
async def admin_panel_lock(callback_query: types.CallbackQuery):
    await admin_do_panel_lock(ADMIN_ID)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_panel_unlock')
async def admin_panel_unlock(callback_query: types.CallbackQuery):
    admin_state["mode"] = "panel_ip"
    await bot.send_message(ADMIN_ID, "Введи свой внешний IP (например 1.2.3.4):")
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_panel_ip')
async def admin_panel_ip(callback_query: types.CallbackQuery):
    await admin_do_panel_ip(ADMIN_ID)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_extend_panel')
async def admin_extend_panel(callback_query: types.CallbackQuery):
    if callback_query.from_user.id != ADMIN_ID:
        return await bot.answer_callback_query(callback_query.id, "Доступ закрыт 🔒")
    db = load_db()
    meta = db.get("_meta", {})
    ip = meta.get("panel_ip")
    if not ip:
        await bot.send_message(ADMIN_ID, "Нет активного IP. Открой доступ сначала.")
        return await bot.answer_callback_query(callback_query.id)
    ok, msg = panel_unlock(ip)
    if ok:
        if admin_state.get("panel_lock_task"):
            admin_state["panel_lock_task"].cancel()
        admin_state["panel_lock_task"] = asyncio.create_task(schedule_panel_autolock(600))
        await bot.send_message(ADMIN_ID, f"Продлил доступ на 10 минут для {ip}.")
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_ban_user')
async def admin_ban_user(callback_query: types.CallbackQuery):
    admin_state["mode"] = "ban_user"
    await bot.send_message(ADMIN_ID, "Введи Telegram ID пользователя для блокировки:")
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_trial7_user')
async def admin_trial7_user(callback_query: types.CallbackQuery):
    admin_state["mode"] = "trial7_user"
    await bot.send_message(ADMIN_ID, "Введи Telegram ID пользователя для trial 7 дней:")
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_extend_user')
async def admin_extend_user(callback_query: types.CallbackQuery):
    admin_state["mode"] = "extend_user"
    await bot.send_message(ADMIN_ID, "Введи: <ID> <дни> (пример: 123456789 30)")
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_unlimited_user')
async def admin_unlimited_user(callback_query: types.CallbackQuery):
    admin_state["mode"] = "unlimited_user"
    await bot.send_message(ADMIN_ID, "Введи Telegram ID пользователя для доступа без срока:")
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_traffic_limit_user')
async def admin_traffic_limit_user(callback_query: types.CallbackQuery):
    admin_state["mode"] = "traffic_limit_user"
    await bot.send_message(ADMIN_ID, "Введи: <ID> <GB в месяц> (пример: 123456789 200)")
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_unban_user')
async def admin_unban_user(callback_query: types.CallbackQuery):
    admin_state["mode"] = "unban_user"
    await bot.send_message(ADMIN_ID, "Введи Telegram ID пользователя для разблокировки:")
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_delete_user')
async def admin_delete_user(callback_query: types.CallbackQuery):
    admin_state["mode"] = "delete_user"
    await bot.send_message(ADMIN_ID, "Введи Telegram ID пользователя для удаления:")
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_delete_vip')
async def admin_delete_vip(callback_query: types.CallbackQuery):
    admin_state["mode"] = "delete_vip"
    await bot.send_message(ADMIN_ID, "Подтверди удаление VIP: напиши YES")
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'admin_vip_menu')
async def admin_vip_menu(callback_query: types.CallbackQuery):
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("📌 Показать VIP", callback_data="vip_show"),
        InlineKeyboardButton("➕ +1 устройство", callback_data="vip_inc"),
        InlineKeyboardButton("➖ -1 устройство", callback_data="vip_dec"),
        InlineKeyboardButton("🔁 Сменить VIP ключ", callback_data="vip_rotate")
    )
    await bot.send_message(ADMIN_ID, "👑 Управление VIP:", reply_markup=kb)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'vip_show')
async def vip_show(callback_query: types.CallbackQuery):
    await admin_do_vip_show(ADMIN_ID)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'vip_inc')
async def vip_inc(callback_query: types.CallbackQuery):
    await admin_do_vip_inc(ADMIN_ID)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'vip_dec')
async def vip_dec(callback_query: types.CallbackQuery):
    await admin_do_vip_dec(ADMIN_ID)
    await bot.answer_callback_query(callback_query.id)

@dp.callback_query_handler(lambda c: c.data == 'vip_rotate')
async def vip_rotate(callback_query: types.CallbackQuery):
    await admin_do_vip_rotate(ADMIN_ID)
    await bot.answer_callback_query(callback_query.id)

@dp.message_handler(commands=['cancel'])
async def admin_cancel(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return
    admin_state["mode"] = None
    admin_state["reply_to"] = None
    await message.answer("Операция отменена.")

@dp.message_handler(lambda message: message.from_user.id == ADMIN_ID and not message.text.startswith('/'))
async def handle_admin_text(message: types.Message):
    def _is_int(s):
        try:
            int(s)
            return True
        except Exception:
            return False

    if admin_state["mode"] in ("trial7_user", "unlimited_user"):
        user_id = message.text.strip()
        if not _is_int(user_id):
            await message.answer("Нужен числовой Telegram ID.")
            return
        db = load_db()
        if user_id not in db:
            await message.answer("Пользователь не найден в базе.")
            admin_state["mode"] = None
            return
        u = db[user_id]
        u = ensure_traffic_defaults(u)
        if admin_state["mode"] == "trial7_user":
            expiry = (datetime.date.today() + datetime.timedelta(days=7)).strftime("%Y-%m-%d")
            u["expiry"] = expiry
            u["status"] = "trial"
            u["traffic_warn80"] = 0
            u["traffic_warn95"] = 0
            u["traffic_month"] = datetime.date.today().strftime("%Y-%m")
            u["traffic_usage_bytes"] = 0
            u["traffic_last_total"] = 0
            if not u.get("uuid"):
                new_uuid = str(uuid.uuid4())
                email = f"tg_{user_id}"
                ok = panel_add_client(new_uuid, email, 1, user_id)
                if not ok:
                    await message.answer("Не удалось создать клиента в панели.")
                    admin_state["mode"] = None
                    return
                u["uuid"] = new_uuid
            else:
                panel_update_client_limit(u["uuid"], 1)
            panel_update_client_enable(u["uuid"], True)
            db[user_id] = u
            save_db(db)
            await message.answer(f"Выдан trial 7 дней пользователю {user_id}.")
            try:
                await bot.send_message(int(user_id), "🎁 Тебе выдан trial на 7 дней. Теперь кнопка «🚀 Получить ключ» активна.", reply_markup=user_kb("trial"))
            except Exception:
                pass
        else:
            u["expiry"] = None
            u["status"] = "active"
            if not u.get("uuid"):
                new_uuid = str(uuid.uuid4())
                email = f"tg_{user_id}"
                ok = panel_add_client(new_uuid, email, 1, user_id)
                if not ok:
                    await message.answer("Не удалось создать клиента в панели.")
                    admin_state["mode"] = None
                    return
                u["uuid"] = new_uuid
            else:
                panel_update_client_limit(u["uuid"], 1)
            panel_update_client_enable(u["uuid"], True)
            db[user_id] = u
            save_db(db)
            await message.answer(f"Выдан доступ без срока пользователю {user_id}.")
            try:
                await bot.send_message(int(user_id), "✅ Тебе выдан доступ без срока.", reply_markup=user_kb("active"))
            except Exception:
                pass
        admin_state["mode"] = None
        return

    if admin_state["mode"] in ("extend_user", "traffic_limit_user"):
        parts = message.text.strip().split()
        if len(parts) != 2 or not _is_int(parts[0]) or not _is_int(parts[1]):
            await message.answer("Неверный формат. Пример: 123456789 30")
            return
        user_id, val = parts[0], int(parts[1])
        db = load_db()
        if user_id not in db:
            await message.answer("Пользователь не найден в базе.")
            admin_state["mode"] = None
            return
        u = db[user_id]
        u = ensure_traffic_defaults(u)
        if admin_state["mode"] == "extend_user":
            if val < 1:
                await message.answer("Дни должны быть больше 0.")
                return
            base = datetime.date.today()
            if u.get("expiry"):
                try:
                    cur = datetime.datetime.strptime(u["expiry"], "%Y-%m-%d").date()
                    if cur > base:
                        base = cur
                except Exception:
                    pass
            u["expiry"] = (base + datetime.timedelta(days=val)).strftime("%Y-%m-%d")
            if u.get("status") in ("approved", "expired", "traffic_block", "banned"):
                u["status"] = "active"
            if u.get("uuid"):
                panel_update_client_enable(u["uuid"], True)
            db[user_id] = u
            save_db(db)
            await message.answer(f"Доступ пользователю {user_id} продлен на {val} дней до {u['expiry']}.")
        else:
            if val < 1:
                await message.answer("Лимит GB должен быть больше 0.")
                return
            u["traffic_limit_gb"] = val
            u["traffic_warn80"] = 0
            u["traffic_warn95"] = 0
            db[user_id] = u
            save_db(db)
            await message.answer(f"Лимит трафика для {user_id}: {val} GB/мес.")
        admin_state["mode"] = None
        return

    if admin_state["mode"] in ("ban_user", "unban_user", "delete_user"):
        user_id = message.text.strip()
        if not _is_int(user_id):
            await message.answer("Нужен числовой Telegram ID.")
            return
        if int(user_id) == ADMIN_ID and admin_state["mode"] in ("ban_user", "delete_user"):
            await message.answer("Админа нельзя заблокировать или удалить.")
            admin_state["mode"] = None
            return
        db = load_db()
        if user_id not in db:
            await message.answer("Пользователь не найден в базе.")
            admin_state["mode"] = None
            return
        if admin_state["mode"] == "ban_user":
            await admin_do_ban_user(ADMIN_ID, user_id)
        elif admin_state["mode"] == "unban_user":
            await admin_do_unban_user(ADMIN_ID, user_id)
        elif admin_state["mode"] == "delete_user":
            await admin_do_delete_user(ADMIN_ID, user_id)
        admin_state["mode"] = None
        return

    if admin_state["mode"] == "delete_vip":
        if message.text.strip().upper() != "YES":
            await message.answer("Отменено.")
            admin_state["mode"] = None
            return
        await admin_do_delete_vip(ADMIN_ID)
        admin_state["mode"] = None
        return

    if admin_state["mode"] == "panel_ip":
        ip = message.text.strip()
        await admin_do_panel_unlock(ADMIN_ID, ip)
        admin_state["mode"] = None
        return
    if admin_state["mode"] == "broadcast":
        db = load_db()
        sent = 0
        failed = 0
        for tg_id in list(db.keys()):
            if tg_id == "_meta":
                continue
            try:
                await bot.send_message(int(tg_id), message.text)
                sent += 1
            except BotBlocked:
                failed += 1
            except Exception:
                failed += 1
        admin_state["mode"] = None
        await message.answer(f"Рассылка завершена. Успешно: {sent}, ошибок: {failed}")
        return
    if admin_state["mode"] == "reply" and admin_state["reply_to"]:
        try:
            await bot.send_message(admin_state["reply_to"], message.text)
            await message.answer("Ответ отправлен.")
        except Exception:
            await message.answer("Не удалось отправить ответ.")
        admin_state["mode"] = None
        admin_state["reply_to"] = None
        return
    await message.answer("Нет активной операции. Используй админ-меню.")

@dp.message_handler(content_types=ContentType.WEB_APP_DATA)
async def handle_webapp_admin(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return
    try:
        payload = json.loads(message.web_app_data.data or "{}")
    except Exception:
        return
    action = payload.get("action")
    data = payload.get("payload") or {}
    if action == "admin_stats":
        await admin_do_stats(ADMIN_ID)
    elif action == "admin_add_slots":
        await admin_do_add_slots(ADMIN_ID)
    elif action == "admin_backup":
        await admin_do_backup(ADMIN_ID)
    elif action == "admin_restart_xray":
        await admin_do_restart_xray(ADMIN_ID)
    elif action == "admin_panel_lock":
        await admin_do_panel_lock(ADMIN_ID)
    elif action == "admin_panel_unlock":
        ip = str(data.get("ip", "")).strip()
        await admin_do_panel_unlock(ADMIN_ID, ip)
    elif action == "admin_panel_ip":
        await admin_do_panel_ip(ADMIN_ID)
    elif action == "admin_ban_user":
        user_id = str(data.get("user_id", "")).strip()
        if user_id:
            await admin_do_ban_user(ADMIN_ID, user_id)
    elif action == "admin_unban_user":
        user_id = str(data.get("user_id", "")).strip()
        if user_id:
            await admin_do_unban_user(ADMIN_ID, user_id)
    elif action == "admin_delete_user":
        user_id = str(data.get("user_id", "")).strip()
        if user_id:
            await admin_do_delete_user(ADMIN_ID, user_id)
    elif action == "admin_delete_vip":
        await admin_do_delete_vip(ADMIN_ID)
    elif action == "vip_show":
        await admin_do_vip_show(ADMIN_ID)
    elif action == "vip_inc":
        await admin_do_vip_inc(ADMIN_ID)
    elif action == "vip_dec":
        await admin_do_vip_dec(ADMIN_ID)
    elif action == "vip_rotate":
        await admin_do_vip_rotate(ADMIN_ID)

def get_free_mem_mb():
    try:
        with open("/proc/meminfo", "r") as f:
            lines = f.readlines()
        meminfo = {line.split(":")[0]: line.split(":")[1].strip() for line in lines if ":" in line}
        free_kb = 0
        if "MemAvailable" in meminfo:
            free_kb = int(meminfo["MemAvailable"].split()[0])
        elif "MemFree" in meminfo:
            free_kb = int(meminfo["MemFree"].split()[0])
        return free_kb // 1024
    except Exception:
        return 0

admin_state = {"mode": None, "reply_to": None, "panel_lock_task": None}

async def admin_do_stats(chat_id: int):
    db = load_db()
    total = len([k for k in db.keys() if k != "_meta"])
    meta = db.get("_meta", {})
    max_users = int(meta.get("max_users", MAX_USERS_DEFAULT))
    mem_free_mb = get_free_mem_mb()
    text = (
        f"<b>📊 Текущая загрузка:</b>\n"
        f"Занято мест: {total} / {max_users}\n"
        f"Свободно: {max_users - total}\n"
        f"Свободно ОЗУ: {mem_free_mb} MB\n\n"
        f"Сервер работает в штатном режиме ✅"
    )
    await bot.send_message(chat_id, text, parse_mode="HTML")

    onlines = panel_get_onlines()
    if onlines is None:
        await bot.send_message(chat_id, "⚠️ Не удалось получить список онлайн из панели.")
        return

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

    if not names:
        await bot.send_message(chat_id, "Онлайн: 0")
        return

    names = sorted(set(names))
    header = f"🟢 Онлайн сейчас: {len(names)}\n"
    body = "\n".join(names)
    for part in chunk_text(header + body):
        await bot.send_message(chat_id, part)

async def admin_do_add_slots(chat_id: int):
    db = load_db()
    meta = db.get("_meta", {})
    max_users = int(meta.get("max_users", MAX_USERS_DEFAULT)) + 5
    meta["max_users"] = max_users
    db["_meta"] = meta
    save_db(db)
    await bot.send_message(chat_id, f"Добавлено +5 мест. Новый лимит: {max_users}")

async def admin_do_backup(chat_id: int):
    cookies, base_url = get_cookies()
    if cookies:
        try:
            resp = requests.get(f"{base_url}panel/api/server/getDb", cookies=cookies, timeout=20)
            if resp.ok and resp.content:
                tmp_path = "/tmp/ghostlink_panel.db"
                with open(tmp_path, "wb") as f:
                    f.write(resp.content)
                await bot.send_document(chat_id, types.InputFile(tmp_path), caption="Бэкап базы панели (getDb)")
                return
        except Exception:
            pass
    if os.path.exists(DB_FILE):
        await bot.send_document(chat_id, types.InputFile(DB_FILE), caption="Бэкап локальной базы бота (SQLite)")
    else:
        await bot.send_message(chat_id, "Файл базы не найден.")

async def admin_do_restart_xray(chat_id: int):
    os.system(f"systemctl restart {XRAY_SERVICE}")
    await bot.send_message(chat_id, "♻️ Xray перезапущен.")

async def admin_do_panel_lock(chat_id: int):
    ok, msg = panel_lock()
    if ok and admin_state.get("panel_lock_task"):
        admin_state["panel_lock_task"].cancel()
        admin_state["panel_lock_task"] = None
    await bot.send_message(chat_id, f"🔒 {msg}")
    if ok:
        await bot.send_message(chat_id, "🧾 Лог: панель закрыта вручную.")

async def admin_do_panel_unlock(chat_id: int, ip: str):
    if not is_valid_ipv4(ip):
        await bot.send_message(chat_id, "Неверный IP. Пример: 1.2.3.4")
        return
    ok, msg = panel_unlock(ip)
    if ok:
        db = load_db()
        meta = db.get("_meta", {})
        meta["panel_ip"] = ip
        db["_meta"] = meta
        save_db(db)
        if admin_state.get("panel_lock_task"):
            admin_state["panel_lock_task"].cancel()
        admin_state["panel_lock_task"] = asyncio.create_task(schedule_panel_autolock(600))
        await bot.send_message(chat_id, f"🧾 Лог: доступ открыт для {ip} на 10 минут.")
    await bot.send_message(chat_id, f"🔓 {msg}")

async def admin_do_panel_ip(chat_id: int):
    db = load_db()
    meta = db.get("_meta", {})
    ip = meta.get("panel_ip")
    if ip:
        await bot.send_message(chat_id, f"Текущий разрешенный IP: {ip}")
    else:
        await bot.send_message(chat_id, "Разрешенного IP нет. Панель закрыта.")

async def admin_do_ban_user(chat_id: int, user_id: str):
    db = load_db()
    if user_id not in db:
        await bot.send_message(chat_id, "Пользователь не найден в базе.")
        return
    u = db[user_id]
    u_uuid = u.get("uuid")
    if u_uuid:
        panel_update_client_enable(u_uuid, False)
    u["status"] = "banned"
    db[user_id] = u
    save_db(db)
    await bot.send_message(chat_id, f"Пользователь {user_id} заблокирован.")

async def admin_do_unban_user(chat_id: int, user_id: str):
    db = load_db()
    if user_id not in db:
        await bot.send_message(chat_id, "Пользователь не найден в базе.")
        return
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
    await bot.send_message(chat_id, f"Пользователь {user_id} разблокирован.")

async def admin_do_delete_user(chat_id: int, user_id: str):
    db = load_db()
    if user_id not in db:
        await bot.send_message(chat_id, "Пользователь не найден в базе.")
        return
    u_uuid = db[user_id].get("uuid")
    if u_uuid:
        panel_update_client_enable(u_uuid, False)
    db.pop(user_id, None)
    save_db(db)
    await bot.send_message(chat_id, f"Пользователь {user_id} удален (доступ отключен).")

async def admin_do_delete_vip(chat_id: int):
    db = load_db()
    vip = db.get(str(ADMIN_ID), {})
    u_uuid = vip.get("uuid")
    if u_uuid:
        panel_update_client_enable(u_uuid, False)
    db.pop(str(ADMIN_ID), None)
    save_db(db)
    await bot.send_message(chat_id, "VIP удален (доступ отключен).")

async def admin_do_vip_show(chat_id: int):
    db = load_db()
    vip = db.get(str(ADMIN_ID), {})
    u_id = vip.get("uuid")
    limit = db.get("_meta", {}).get("vip_limit", VIP_LIMIT_DEFAULT)
    if not u_id:
        await bot.send_message(chat_id, "VIP ключ еще не создан. Нажми «🚀 Получить ключ».")
    else:
        link = build_link(u_id, "GhostBoss")
        await bot.send_message(chat_id, f"Текущий VIP ключ (лимит {limit}):\n\n{key_html(link)}", parse_mode="HTML")

async def admin_do_vip_inc(chat_id: int):
    db = load_db()
    meta = db.get("_meta", {})
    limit = int(meta.get("vip_limit", VIP_LIMIT_DEFAULT)) + 1
    if limit > 50:
        await bot.send_message(chat_id, "Лимит не может быть больше 50.")
        return
    u_id = db.get(str(ADMIN_ID), {}).get("uuid")
    if not u_id:
        await bot.send_message(chat_id, "VIP ключ еще не создан. Нажми «🚀 Получить ключ».")
        return
    panel_update_client_limit(u_id, limit)
    meta["vip_limit"] = limit
    db["_meta"] = meta
    save_db(db)
    await bot.send_message(chat_id, f"Лимит VIP увеличен до {limit}.")

async def admin_do_vip_dec(chat_id: int):
    db = load_db()
    meta = db.get("_meta", {})
    limit = int(meta.get("vip_limit", VIP_LIMIT_DEFAULT)) - 1
    if limit < 1:
        await bot.send_message(chat_id, "Лимит не может быть меньше 1.")
        return
    u_id = db.get(str(ADMIN_ID), {}).get("uuid")
    if not u_id:
        await bot.send_message(chat_id, "VIP ключ еще не создан. Нажми «🚀 Получить ключ».")
        return
    panel_update_client_limit(u_id, limit)
    meta["vip_limit"] = limit
    db["_meta"] = meta
    save_db(db)
    await bot.send_message(chat_id, f"Лимит VIP уменьшен до {limit}.")

async def admin_do_vip_rotate(chat_id: int):
    db = load_db()
    old_uuid = db.get(str(ADMIN_ID), {}).get("uuid")
    limit = db.get("_meta", {}).get("vip_limit", VIP_LIMIT_DEFAULT)
    if old_uuid:
        panel_update_client_enable(old_uuid, False)
    new_uuid = str(uuid.uuid4())
    panel_add_client(new_uuid, f"Admin_{ADMIN_ID}", limit, str(ADMIN_ID))
    db[str(ADMIN_ID)] = {"uuid": new_uuid, "expiry": None, "status": "vip"}
    save_db(db)
    link = build_link(new_uuid, "GhostBoss")
    await bot.send_message(chat_id, f"VIP ключ обновлен. Новый ключ:\n\n{key_html(link)}", parse_mode="HTML")

async def schedule_panel_autolock(delay_sec=600):
    try:
        # предупредим за минуту
        warn_at = max(0, delay_sec - 60)
        await asyncio.sleep(warn_at)
        db = load_db()
        meta = db.get("_meta", {})
        ip = meta.get("panel_ip")
        kb = InlineKeyboardMarkup().add(InlineKeyboardButton("🔁 Продлить на 10 минут", callback_data="admin_extend_panel"))
        await bot.send_message(ADMIN_ID, f"⏱ Панель закроется через 1 минуту. IP: {ip or '-'}", reply_markup=kb)
        await asyncio.sleep(60)
        ok, msg = panel_lock()
        if ok:
            await bot.send_message(ADMIN_ID, "⏱ Панель автоматически закрыта.")
    except asyncio.CancelledError:
        pass


async def on_startup(_):
    try:
        await bot.set_my_commands(
            [
                types.BotCommand("start", "Запустить бота"),
            ]
        )
    except Exception:
        pass


if __name__ == '__main__':
    loop = asyncio.get_event_loop()
    loop.create_task(anti_rkn_task())
    loop.create_task(xray_health_check())
    loop.create_task(expiry_check_task())
    loop.create_task(traffic_limit_task())
    executor.start_polling(dp, skip_updates=True, on_startup=on_startup)
