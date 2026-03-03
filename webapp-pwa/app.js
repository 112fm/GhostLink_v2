const screens = Array.from(document.querySelectorAll('.screen'));
const backBtn = document.getElementById('backBtn');
const stack = ['screen-home'];
let accessClosed = false;

function showScreen(id) {
  const header = document.getElementById('appHeader');
  const locked = accessClosed && USER_ID !== ADMIN_ID;
  if (locked) id = 'screen-locked';
  screens.forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  backBtn.classList.toggle('hidden', stack.length <= 1);
  if (header) header.classList.toggle('hidden', locked);
}

function pushScreen(id) {
  if (accessClosed && USER_ID !== ADMIN_ID) return showScreen('screen-locked');
  stack.push(id);
  showScreen(id);
}

function popScreen() {
  if (stack.length > 1) stack.pop();
  showScreen(stack[stack.length - 1]);
}

if (backBtn) backBtn.addEventListener('click', popScreen);

const tg = window.Telegram ? Telegram.WebApp : null;
if (tg) tg.ready();

const API_BASE = "https://api.112prd.ru:2053";
const INIT_DATA = tg ? tg.initData : '';
let PWA_TOKEN = localStorage.getItem('ghost_pwa_token') || '';
const PWA_BOT_USERNAME = 'ghostlink112_bot';
const ADMIN_ID = 312826672;
let CURRENT_USER_ID = 0;
let IS_ADMIN = false;
function extractUserId() {
  try {
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
      return Number(tg.initDataUnsafe.user.id);
    }
    if (INIT_DATA) {
      const p = new URLSearchParams(INIT_DATA);
      const u = p.get('user');
      if (u) {
        const obj = JSON.parse(u);
        if (obj && obj.id) return Number(obj.id);
      }
    }
  } catch (e) { }
  return 0;
}
const USER_ID = extractUserId();
CURRENT_USER_ID = USER_ID;


const publicVapidKey = 'BHSwMWoCyOiW-J1gZgc3I4dCycFQDUOSX3xWLyT2C3FfiC1W2nPmuC71K5s9kx_rx_4lbK-SNyu3ABjXU_LwyII';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribePush() {
  if ('serviceWorker' in navigator && 'PushManager' in window && API_BASE) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        await apiFetch('/api/push/subscribe', {
          method: 'POST',
          body: JSON.stringify(existingSubscription)
        });
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });

      await apiFetch('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription)
      });
      console.log('Push subscribed', publicVapidKey);
    } catch (e) {
      console.log('Push subscription failed', e);
    }
  }
}

function buildPwaTgAuthLink() {
  const p = new URLSearchParams(window.location.search);
  const ref = (p.get('ref') || '').trim();
  const start = ref ? `ref_${ref}` : 'pwa';
  return `https://t.me/${PWA_BOT_USERNAME}?start=${encodeURIComponent(start)}`;
}

function showPwaLocked(text) {
  accessClosed = true;
  const title = document.getElementById('pwaLockedTitle');
  const msg = document.getElementById('pwaLockedText');
  const link = document.getElementById('pwaOpenTgLink');
  const codeErr = document.getElementById('pwaCodeError');
  if (title) title.textContent = 'Требуется авторизация';
  if (msg) msg.textContent = text || 'Открой Telegram и войди в клуб.';
  if (codeErr) codeErr.textContent = '';
  if (link) {
    link.href = buildPwaTgAuthLink();
    link.classList.remove('hidden');
  }
  showScreen('screen-locked');
}

async function loginByPwaCode(rawCode) {
  const code = String(rawCode || '').trim();
  if (!code) {
    const codeErr = document.getElementById('pwaCodeError');
    if (codeErr) codeErr.textContent = 'Введи код из Telegram.';
    return false;
  }
  try {
    const resp = await fetch(API_BASE + '/api/pwa/auth/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.token) throw new Error(data.detail || 'bad_code');
    localStorage.setItem('ghost_pwa_token', data.token);
    PWA_TOKEN = data.token;
    const codeInput = document.getElementById('pwaCodeInput');
    const codeErr = document.getElementById('pwaCodeError');
    if (codeInput) codeInput.value = '';
    if (codeErr) codeErr.textContent = '';
    accessClosed = false;
    stack.length = 0;
    stack.push('screen-home');
    showScreen('screen-home');
    loadUser();
    setTimeout(subscribePush, 2000);
    loadTariffs();
    return true;
  } catch (e) {
    const codeErr = document.getElementById('pwaCodeError');
    if (codeErr) codeErr.textContent = 'Код неверный или истек. Запроси новый в Telegram.';
    return false;
  }
}

async function bootstrapPwaAuth() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { });
    });
  }

  if (INIT_DATA) return true; // Mini App Telegram
  const p = new URLSearchParams(window.location.search);
  const loginToken = (p.get('login_token') || '').trim();

  if (loginToken) {
    try {
      const resp = await fetch(API_BASE + '/api/pwa/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_token: loginToken }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.token) throw new Error(data.detail || 'pwa_auth_failed');
      localStorage.setItem('ghost_pwa_token', data.token);
      PWA_TOKEN = data.token;
      window.history.replaceState({}, '', window.location.pathname);
      accessClosed = false;
      return true;
    } catch (e) {
      showPwaLocked('Ошибка авторизации. Нажми «Войти через Telegram».');
      return false;
    }
  }

  if (PWA_TOKEN) return true;
  showPwaLocked('Доступ только по приглашению. Войди через Telegram.');
  return false;
}

function apiFetch(path, options = {}) {
  if (!API_BASE) return Promise.reject(new Error('no_api'));
  const authHeaders = {};
  if (INIT_DATA) authHeaders['X-Telegram-InitData'] = INIT_DATA;
  if (PWA_TOKEN) authHeaders['X-PWA-Token'] = PWA_TOKEN;
  return fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options.headers || {})
    }
  }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(data.detail || 'api_error');
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  });
}

function setSubStatus(active) {
  const el = document.getElementById('subStatus');
  if (active) {
    el.textContent = 'ПОДПИСКА АКТИВНА';
    el.classList.remove('text-accent-red');
    el.classList.add('text-primary');
  } else {
    el.textContent = 'ПОДПИСКА НЕАКТИВНА';
    el.classList.remove('text-primary');
    el.classList.add('text-accent-red');
  }
}

let supportUrl = '';
let appShareUrl = `${window.location.origin}${window.location.pathname}`;
let adminUsersById = {};
let tariffMap = { 1: { price: 150, min_pay: 100 }, 2: { price: 225, min_pay: 150 }, 3: { price: 300, min_pay: 200 }, 4: { price: 375, min_pay: 250 }, 5: { price: 450, min_pay: 300 } };
let currentTier = 'regular';

function formatTierLabel(tier) {
  const v = String(tier || '').toLowerCase();
  if (v === 'own') return 'свой';
  if (v === 'vip') return 'vip';
  return 'обычный';
}

function renderTariffs() {
  const solo = tariffMap[1] || { price: 150, min_pay: 100 };
  const flexSlider = document.getElementById('flexSlider');
  const devices = Math.max(2, Math.min(5, parseInt(flexSlider.value || '2', 10)));
  const flex = tariffMap[devices] || { price: 225, min_pay: 150 };

  document.getElementById('tierBadge').textContent = formatTierLabel(currentTier);
  document.getElementById('soloPrice').textContent = `${solo.price}`;
  document.getElementById('soloMinPay').textContent = `${solo.min_pay}`;
  document.getElementById('flexPrice').textContent = `${devices} устройства — ${flex.price} ₽`;
  document.getElementById('flexMinPay').textContent = `${flex.min_pay}`;
}

async function loadTariffs() {
  try {
    const data = await apiFetch('/api/tariffs');
    const prices = data && data.prices ? data.prices : {};
    const next = {};
    for (let d = 1; d <= 5; d += 1) {
      const item = prices[d] || prices[String(d)];
      if (item && Number.isFinite(Number(item.price)) && Number.isFinite(Number(item.min_pay))) {
        next[d] = { price: Number(item.price), min_pay: Number(item.min_pay) };
      }
    }
    if (Object.keys(next).length >= 5) tariffMap = next;
    currentTier = String(data && data.tier ? data.tier : currentTier);
    renderTariffs();
  } catch (e) {
    renderTariffs();
  }
}

function formatSubLine(sub) {
  if (!sub || !sub.active) return 'нет подписки';
  if (!sub.expiry) return 'Без срока';
  const human = sub.expiry_human || sub.expiry;
  const days = Number(sub.days_left);
  if (Number.isFinite(days)) return `${human} · ${days} дн`;
  return human;
}

function loadUser() {
  if (!API_BASE || (!INIT_DATA && !PWA_TOKEN)) return;
  apiFetch('/api/user')
    .then(data => {
      CURRENT_USER_ID = Number((data.user && data.user.id) || CURRENT_USER_ID || 0);
      if (data.subscription && data.subscription.status === 'pending') {
        showScreen('screen-pending');
        return;
      }
      if (data.subscription && data.subscription.status === 'denied') {
        showPwaLocked('Вам отказано в доступе к клубу.');
        return;
      }

      document.getElementById('balanceValue').textContent = (data.balance || 0) + '₽';
      document.getElementById('expiryValue').textContent = formatSubLine(data.subscription);
      setSubStatus(data.subscription.active);
      document.getElementById('profileName').textContent = data.user.name || 'Пользователь';
      document.getElementById('profileId').textContent = 'ID: ' + data.user.id;
      document.getElementById('deviceLimit').textContent = data.device_limit || 3;
      document.getElementById('profileDevicesRatio').textContent = data.devices_ratio || `${data.connected_devices || 0}/${data.device_limit || 0}`;
      currentTier = data.member_tier || currentTier;
      const dc = document.getElementById('deviceCount');
      if (dc) dc.textContent = data.connected_devices || 0;
      document.getElementById('refLink').textContent = data.referral_link || 'нет ссылки';
      document.getElementById('discountValue').textContent = data.discount_text || ((data.discount || 0) + ' ₽');
      document.getElementById('profileMonthlyPrice').textContent = `${data.monthly_min_pay || 0} ₽ (полная ${data.monthly_price || 0} ₽)`;
      supportUrl = data.support_link || 'https://t.me/ghostlink112_bot';
      appShareUrl = data.app_link || appShareUrl;
      const supportLink = document.getElementById('supportLink');
      supportLink.href = supportUrl;
      renderShareBlock();
      renderTariffs();
      IS_ADMIN = Boolean(data.user && data.user.is_admin) || String(CURRENT_USER_ID) === String(ADMIN_ID);
      if (IS_ADMIN) {
        const adminBtn = document.getElementById('homeAdminBtn');
        adminBtn.classList.remove('hidden');
      }
    })
    .catch((err) => {
      if (err && (err.status === 401 || err.status === 403)) {
        localStorage.removeItem('ghost_pwa_token');
        PWA_TOKEN = '';
        accessClosed = true;
        showPwaLocked('Сессия истекла. Войди через Telegram или одноразовый код.');
      }
    });
}

function notify(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 180);
  }, 1800);
}

function confirmDanger(code, title) {
  const ok1 = window.confirm(`Опасное действие: ${title}.\nПродолжить?`);
  if (!ok1) return false;
  const typed = window.prompt(`Введи ${code} для подтверждения:`) || '';
  return typed.trim().toUpperCase() === code;
}

function adminFetch(path, options = {}) {
  return apiFetch(path, options);
}

document.getElementById('buyBtn').addEventListener('click', () => pushScreen('screen-tariffs'));
document.getElementById('homeDevicesBtn').addEventListener('click', () => { pushScreen('screen-devices'); loadDevices(); });
document.getElementById('homeRefBtn').addEventListener('click', () => { pushScreen('screen-ref'); loadReferrals(); });
document.getElementById('supportBtn').addEventListener('click', () => pushScreen('screen-support'));
document.getElementById('homeMoreBtn').addEventListener('click', () => pushScreen('screen-more'));

document.getElementById('moreProfileBtn').addEventListener('click', () => pushScreen('screen-profile'));
document.getElementById('moreShareBtn').addEventListener('click', () => { pushScreen('screen-share'); renderShareBlock(); });
document.getElementById('moreRulesBtn').addEventListener('click', () => pushScreen('screen-rules'));
const pwaReloginBtn = document.getElementById('pwaReloginBtn');
if (pwaReloginBtn) {
  pwaReloginBtn.addEventListener('click', () => {
    localStorage.removeItem('ghost_pwa_token');
    PWA_TOKEN = '';
    showPwaLocked('Сессия сброшена. Войди через Telegram.');
  });
}
document.getElementById('moreGetKeyBtn').addEventListener('click', async () => {
  try {
    const res = await apiFetch('/api/key', { method: 'POST' });
    const key = (res && res.key) ? String(res.key) : '';
    if (!key) return notify('Ключ не получен');
    await navigator.clipboard.writeText(key).catch(() => { });
    notify('Ключ скопирован');
  } catch (e) {
    notify('Не удалось получить ключ');
  }
});

document.getElementById('profilePayBtn').addEventListener('click', () => pushScreen('screen-tariffs'));
document.getElementById('profileRefBtn').addEventListener('click', () => { pushScreen('screen-ref'); loadReferrals(); });
document.getElementById('profileShareBtn').addEventListener('click', () => { pushScreen('screen-share'); renderShareBlock(); });
document.getElementById('profileSupportBtn').addEventListener('click', () => pushScreen('screen-support'));
document.getElementById('profileRulesBtn').addEventListener('click', () => pushScreen('screen-rules'));
document.getElementById('profileDevicesBtn').addEventListener('click', () => { pushScreen('screen-devices'); loadDevices(); });

document.getElementById('copyRefBtn').addEventListener('click', async () => {
  const text = document.getElementById('refLink').textContent;
  try { await navigator.clipboard.writeText(text); } catch (e) { }
});

function renderShareBlock() {
  const linkEl = document.getElementById('appShareLink');
  const qrEl = document.getElementById('appQrImg');
  if (linkEl) linkEl.textContent = appShareUrl || '—';
  if (qrEl && appShareUrl) {
    qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(appShareUrl)}`;
  }
}

document.getElementById('copyAppLinkBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(appShareUrl || '');
    notify('Ссылка скопирована');
  } catch (e) {
    notify('Не удалось скопировать ссылку');
  }
});

document.getElementById('shareAppBtn').addEventListener('click', async () => {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'GhostLink', text: 'Личный кабинет GhostLink', url: appShareUrl });
    } else {
      await navigator.clipboard.writeText(appShareUrl || '');
      notify('Ссылка скопирована');
    }
  } catch (e) { }
});

const supportLinkEl = document.getElementById('supportLink');
if (supportLinkEl) {
  supportLinkEl.addEventListener('click', (e) => {
    if (!supportUrl) return;
    if (tg && tg.openTelegramLink) {
      e.preventDefault();
      try {
        tg.openTelegramLink(supportUrl);
      } catch (err) {
        window.location.href = supportUrl;
      }
    } else {
      e.preventDefault();
      window.open(supportUrl, '_blank');
    }
  });
}

function loadReferrals() {
  apiFetch('/api/referrals')
    .then(data => {
      const box = document.getElementById('refList');
      const total = Number(data.total || 0);
      const paid = Number(data.paid || 0);
      const pending = Number(data.pending || 0);
      const summary = document.createElement('div');
      summary.className = 'text-sm text-muted-gray mb-3';
      summary.textContent = `Приглашено: ${total} · Оплатили: ${paid} · Ожидают: ${pending}`;
      if (!data.items || data.items.length === 0) {
        box.innerHTML = '';
        box.appendChild(summary);
        const empty = document.createElement('div');
        empty.className = 'text-muted-gray text-sm';
        empty.textContent = 'Пока никого нет.';
        box.appendChild(empty);
        return;
      }
      box.innerHTML = '';
      box.appendChild(summary);
      data.items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between py-2 border-b border-white/10 text-sm';
        const status = item.status === 'paid' ? 'Оплачено' : 'Ожидает оплаты';
        row.innerHTML = `<span>${item.name}</span><span class="text-muted-gray">${status}</span>`;
        box.appendChild(row);
      });
    })
    .catch(() => { });
}

function renderDeviceList(items) {
  const box = document.getElementById('deviceList');
  box.innerHTML = '';
  if (!items || items.length === 0) {
    box.textContent = 'Устройства не найдены.';
    return;
  }
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-2 py-2 border-b border-white/10';
    const left = document.createElement('div');
    left.className = 'flex flex-col min-w-0';
    const title = document.createElement('div');
    title.className = 'text-white truncate';
    title.textContent = item.email || item.uuid;
    const meta = document.createElement('div');
    meta.className = 'text-muted-gray text-xs';
    meta.textContent = `${item.online ? 'Онлайн' : 'Офлайн'} · ${formatBytes(item.total || 0)}`;
    left.appendChild(title);
    left.appendChild(meta);

    const btn = document.createElement('button');
    btn.className = 'ios-active border border-primary text-primary font-bold px-2 py-1 rounded-lg text-xs';
    btn.textContent = 'Удалить';
    btn.addEventListener('click', async () => {
      try {
        await apiFetch('/api/device/remove', { method: 'POST', body: JSON.stringify({ uuid: item.uuid }) });
        notify('Устройство удалено');
        loadDevices();
      } catch (e) {
        notify('Не удалось удалить устройство');
      }
    });

    const btns = document.createElement('div');
    btns.className = 'flex gap-2';
    if (item.key) {
      const keyBtn = document.createElement('button');
      keyBtn.className = 'ios-active border border-primary text-primary font-bold px-2 py-1 rounded-lg text-xs';
      keyBtn.textContent = 'Ключ';
      keyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(item.key);
          notify('Ключ скопирован');
        } catch (e) { }
      });
      btns.appendChild(keyBtn);
    }
    btn.className = 'ios-active border border-accent-red text-accent-red font-bold px-2 py-1 rounded-lg text-xs';
    btns.appendChild(btn);
    row.appendChild(left);
    row.appendChild(btns);
    box.appendChild(row);
  });
}

function loadDevices() {
  apiFetch('/api/device/list')
    .then((data) => {
      document.getElementById('deviceLimit').textContent = data.device_limit || 0;
      document.getElementById('deviceCount').textContent = data.connected || 0;
      document.getElementById('profileDevicesRatio').textContent = `${data.connected || 0}/${data.device_limit || 0}`;
      renderDeviceList(data.items || []);
    })
    .catch(() => {
      const box = document.getElementById('deviceList');
      box.textContent = 'Не удалось загрузить устройства.';
    });
}

document.getElementById('addDeviceBtn').addEventListener('click', async () => {
  try {
    const deviceType = (document.getElementById('deviceType') || {}).value || 'other';
    const deviceName = ((document.getElementById('deviceName') || {}).value || '').trim();
    const res = await apiFetch('/api/device/add', {
      method: 'POST',
      body: JSON.stringify({ device_type: deviceType, device_name: deviceName })
    });
    if (res.key) {
      await navigator.clipboard.writeText(res.key).catch(() => { });
      if (res.upgraded) {
        notify(`Лимит увеличен: ${res.upgraded.old_limit}→${res.upgraded.new_limit}. Доплата: ${res.upgraded.topup_min_pay} ₽ (полная ${res.upgraded.topup_price} ₽). Ключ скопирован.`);
      } else {
        notify(`Устройство добавлено (${res.devices_ratio || ''}). Ключ скопирован.`);
      }
    } else {
      notify('Устройство добавлено');
    }
    const nameInput = document.getElementById('deviceName');
    if (nameInput) nameInput.value = '';
    loadDevices();
  } catch (e) {
    if (e && e.message === 'device_limit_reached') notify('Достигнут лимит устройств (максимум 5).');
    else notify('Не удалось добавить устройство');
  }
});

document.getElementById('resetDeviceBtn').addEventListener('click', () => {
  if (!confirmDanger('RESET', 'Сброс ключа устройства')) return;
  apiFetch('/api/device/reset', { method: 'POST' })
    .then((res) => {
      if (res.key) {
        navigator.clipboard.writeText(res.key).catch(() => { });
        notify('Ключ после сброса скопирован');
      } else {
        notify('Ключ сброшен');
      }
      loadDevices();
    })
    .catch(() => notify('Не удалось сбросить ключ'));
});

const flexSlider = document.getElementById('flexSlider');
flexSlider.addEventListener('input', () => {
  renderTariffs();
});

document.getElementById('soloPay').addEventListener('click', async () => {
  try {
    const res = await apiFetch('/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({ tariff_id: 'solo', devices: 1 })
    });
    notify(`Solo активирован до ${res.expiry || 'даты в профиле'}`);
    loadUser();
    setTimeout(subscribePush, 2000);
    loadDevices();
    loadTariffs();
  } catch (e) {
    notify(`Ошибка: ${e.message || 'subscribe'}`);
  }
});

document.getElementById('flexPay').addEventListener('click', async () => {
  const devices = Math.max(2, Math.min(5, parseInt(flexSlider.value || '2', 10)));
  try {
    const res = await apiFetch('/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({ tariff_id: 'flex', devices })
    });
    notify(`Flex (${devices}) активирован до ${res.expiry || 'даты в профиле'}`);
    loadUser();
    setTimeout(subscribePush, 2000);
    loadDevices();
    loadTariffs();
  } catch (e) {
    notify(`Ошибка: ${e.message || 'subscribe'}`);
  }
});

if (String(USER_ID) === String(ADMIN_ID)) {
  const adminBtn = document.getElementById('homeAdminBtn');
  adminBtn.classList.remove('hidden');
}
document.getElementById('homeAdminBtn').addEventListener('click', () => {
  if (!IS_ADMIN && String(CURRENT_USER_ID) !== String(ADMIN_ID)) return notify('Нет доступа');
  pushScreen('screen-admin');
  loadAdminUsers();
});

async function loadAdminStats() {
  try {
    const data = await adminFetch('/api/admin/stats');
    document.getElementById('dashMem').textContent = data.free_mem_mb + ' MB';
    document.getElementById('dashOnline').textContent = String(data.online ? data.online.length : 0);
    const upGB = ((data.traffic_up || 0) / (1024 ** 3)).toFixed(2);
    const downGB = ((data.traffic_down || 0) / (1024 ** 3)).toFixed(2);
    document.getElementById('dashUp').textContent = upGB + ' GB';
    document.getElementById('dashDown').textContent = downGB + ' GB';

    const box = document.getElementById('adminOnlineList');
    box.innerHTML = '';
    if (!data.online || data.online.length === 0) {
      box.textContent = 'Никого нет онлайн';
    } else {
      data.online.forEach((name) => {
        const row = document.createElement('div');
        row.className = 'py-1 border-b border-white/10';
        row.textContent = `• ${name}`;
        box.appendChild(row);
      });
    }
  } catch (e) {
    // silently fail
  }
}
document.getElementById('adminStats').addEventListener('click', () => { loadAdminStats(); notify('Данные сервера обновлены'); });

document.getElementById('adminRestart').addEventListener('click', async () => {
  if (!confirmDanger('RESTART', 'Перезапуск Xray')) return;
  try {
    await adminFetch('/api/admin/xray/restart', { method: 'POST' });
    notify('Xray перезапущен');
  } catch (e) {
    notify('Ошибка');
  }
});
document.getElementById('adminOtpLogin').addEventListener('click', async () => {
  try {
    const res = await adminFetch('/api/admin/proxy_auth', { method: 'POST', body: JSON.stringify({}) });
    if (res && res.ok) {
      notify('Доступ разрешен на 1 час');
      document.getElementById('adminProxyLink').classList.remove('hidden');
      document.getElementById('adminOtpLogin').classList.add('hidden');
    }
  } catch (e) {
    notify('Ошибка: ' + (e.message || 'неверная сессия'));
  }
});
document.getElementById('adminAddSlots').addEventListener('click', async () => {
  try {
    const r = await adminFetch('/api/admin/add_slots', { method: 'POST' });
    notify(`Новый лимит: ${r.max_users}`);
  } catch (e) {
    notify('Ошибка');
  }
});
document.getElementById('adminBan').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Укажи Telegram ID');
  try {
    await adminFetch('/api/admin/user/ban', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Пользователь забанен');
    loadAdminUsers();
  } catch (e) {
    notify('Ошибка');
  }
});
document.getElementById('adminUnban').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Укажи Telegram ID');
  try {
    await adminFetch('/api/admin/user/unban', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Пользователь разблокирован');
    loadAdminUsers();
  } catch (e) {
    notify('Ошибка');
  }
});
document.getElementById('adminDelete').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Укажи Telegram ID');
  if (!confirmDanger('DELETE', `Удаление пользователя ${userId}`)) return;
  try {
    await adminFetch('/api/admin/user/delete', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Пользователь удален');
    loadAdminUsers();
  } catch (e) {
    notify('Ошибка');
  }
});

document.getElementById('adminTrial7').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Выбери пользователя');
  try {
    await adminFetch('/api/admin/user/trial7', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Выдан trial 7 дней');
    loadAdminUsers();
  } catch (e) {
    notify('Ошибка');
  }
});
document.getElementById('adminExtend').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  const days = parseInt(document.getElementById('adminDays').value || '0', 10);
  if (!userId) return notify('Выбери пользователя');
  if (!days || days < 1) return notify('Укажи дни');
  try {
    await adminFetch('/api/admin/user/extend', { method: 'POST', body: JSON.stringify({ user_id: userId, days }) });
    notify(`Продлено на ${days} дн.`);
    loadAdminUsers();
  } catch (e) {
    notify('Ошибка');
  }
});
document.getElementById('adminUnlimited').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Выбери пользователя');
  try {
    await adminFetch('/api/admin/user/unlimited', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Выдан доступ без срока');
    loadAdminUsers();
  } catch (e) {
    notify('Ошибка');
  }
});
document.getElementById('adminResetSub').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Выбери пользователя');
  if (!confirmDanger('RESET', `Сброс подписки пользователя ${userId}`)) return;
  try {
    await adminFetch('/api/admin/user/reset_subscription', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Подписка сброшена');
    loadAdminUsers();
  } catch (e) {
    notify('Ошибка');
  }
});
document.getElementById('adminUsersRefresh').addEventListener('click', loadAdminUsers);
document.getElementById('adminUserId').addEventListener('change', () => {
  const userId = document.getElementById('adminUserId').value.trim();
  const meta = document.getElementById('adminUserMeta');
  const openBtn = document.getElementById('adminOpenTg');
  if (!userId || !adminUsersById[userId]) {
    meta.textContent = 'Выбери пользователя, чтобы увидеть детали подписки.';
    openBtn.disabled = true;
    return;
  }
  const u = adminUsersById[userId];
  const expiry = u.expiry_human || (u.expiry ? u.expiry : 'Без срока/нет');
  const days = Number(u.days_left);
  const daysText = Number.isFinite(days) ? `${days} дн` : '—';
  const connected = Number(u.connected_devices || 0);
  const limit = Number(u.device_limit || 0);
  const ratio = `${connected}/${limit}`;
  const tierText = formatTierLabel(u.member_tier || 'regular');
  meta.innerHTML =
    `Статус: ${u.status || 'none'}<br>` +
    `Подписка до: ${expiry}<br>` +
    `Осталось: ${daysText}<br>` +
    `Тариф: ${u.tariff_name || '—'} · Устройства: ${ratio}<br>` +
    `Категория: ${tierText}<br>` +
    `Трафик: ${u.traffic_limit_gb || 0} GB/мес`;
  openBtn.disabled = !(u.tg_link || u.tg_username);
});

document.getElementById('adminOpenTg').addEventListener('click', () => {
  const userId = document.getElementById('adminUserId').value.trim();
  const u = adminUsersById[userId];
  if (!u) return notify('Выбери пользователя');
  const link = u.tg_link || '';
  if (!link) return notify('У пользователя нет username в Telegram');
  if (tg && tg.openTelegramLink) {
    try { tg.openTelegramLink(link); } catch (e) { window.open(link, '_blank'); }
  } else {
    window.open(link, '_blank');
  }
});

document.getElementById('adminClientCreate').addEventListener('click', async () => {
  const email = document.getElementById('adminClientEmail').value.trim();
  const tgId = document.getElementById('adminClientTgId').value.trim();
  const limit = parseInt(document.getElementById('adminClientLimit').value || '3', 10);
  if (!email) return notify('Укажи название/email клиента');
  try {
    await adminFetch('/api/admin/client/create', {
      method: 'POST',
      body: JSON.stringify({ email: email, tg_id: tgId || 'manual', limit: limit })
    });
    notify('Клиент добавлен');
    document.getElementById('adminClientEmail').value = '';
    loadAdminClients();
  } catch (e) {
    notify('Ошибка');
  }
});
document.getElementById('adminBackup').addEventListener('click', async () => {
  try {
    const resp = await fetch(API_BASE + '/api/admin/backup', {
      headers: { 'X-Telegram-InitData': INIT_DATA }
    });
    if (!resp.ok) throw new Error('backup_error');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ghostlink-backup.db';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notify('Бэкап скачан');
  } catch (e) {
    notify('Ошибка');
  }
});

function formatBytes(val) {
  const v = Number(val || 0);
  if (v < 1024) return v + ' B';
  const kb = v / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  const mb = kb / 1024;
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  const gb = mb / 1024;
  return gb.toFixed(2) + ' GB';
}

async function loadAdminClients() {
  const box = document.getElementById('adminClients');
  box.textContent = 'Загрузка...';
  try {
    const data = await adminFetch('/api/admin/clients');
    if (!data.items || data.items.length === 0) {
      box.textContent = 'Список пуст';
      return;
    }
    box.innerHTML = '';
    data.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-2 py-2 border-b border-white/10';
      const left = document.createElement('div');
      left.className = 'flex flex-col';
      const name = document.createElement('div');
      name.className = 'text-white';
      name.textContent = item.display_name || item.email || item.uuid;
      const meta = document.createElement('div');
      meta.className = 'text-muted-gray text-xs';
      meta.textContent = `${item.online ? 'Онлайн' : 'Офлайн'} · ${formatBytes(item.total || 0)}`;
      left.appendChild(name);
      left.appendChild(meta);

      const right = document.createElement('div');
      right.className = 'flex gap-2';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'border border-accent-red text-accent-red font-bold px-2 py-1 rounded-lg text-xs hover:bg-accent-red/10';
      deleteBtn.textContent = 'Удалить';
      deleteBtn.addEventListener('click', async () => {
        if (!confirmDanger('DELETE', 'Удаление устройства: ' + (item.display_name || item.uuid))) return;
        try {
          await adminFetch('/api/admin/client/delete', {
            method: 'POST',
            body: JSON.stringify({ uuid: item.uuid })
          });
          notify('Устройство удалено');
          loadAdminClients();
        } catch (e) {
          notify('Ошибка удаления');
        }
      });
      right.appendChild(deleteBtn);

      const toggle = document.createElement('button');
      toggle.className = 'ios-active border border-primary text-primary font-bold px-2 py-1 rounded-lg text-xs';
      toggle.textContent = item.enable ? 'Откл' : 'Вкл';
      toggle.addEventListener('click', async () => {
        try {
          await adminFetch('/api/admin/client/enable', {
            method: 'POST',
            body: JSON.stringify({ uuid: item.uuid, enable: !item.enable })
          });
          notify('Сохранено');
          loadAdminClients();
        } catch (e) {
          notify('Ошибка');
        }
      });
      right.appendChild(toggle);

      row.appendChild(left);
      row.appendChild(right);
      box.appendChild(row);
    });
  } catch (e) {
    box.textContent = 'Ошибка загрузки';
  }
}

document.getElementById('adminClientsRefresh').addEventListener('click', loadAdminClients);
document.getElementById('adminSetOwn').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Выбери пользователя');
  try {
    await adminFetch('/api/admin/user/tier', { method: 'POST', body: JSON.stringify({ user_id: userId, tier: 'own' }) });
    notify('Категория: СВОЙ');
    await loadAdminUsers();
    document.getElementById('adminUserId').value = userId;
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
    if (String(userId) === String(USER_ID)) {
      loadTariffs();
      loadUser();
      setTimeout(subscribePush, 2000);
    }
  } catch (e) {
    notify(`Ошибка: ${e.message || 'set_own'}`);
  }
});
document.getElementById('adminSetRegular').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Выбери пользователя');
  try {
    await adminFetch('/api/admin/user/tier', { method: 'POST', body: JSON.stringify({ user_id: userId, tier: 'regular' }) });
    notify('Категория: Обычный');
    await loadAdminUsers();
    document.getElementById('adminUserId').value = userId;
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
    if (String(userId) === String(USER_ID)) {
      loadTariffs();
      loadUser();
      setTimeout(subscribePush, 2000);
    }
  } catch (e) {
    notify(`Ошибка: ${e.message || 'set_regular'}`);
  }
});


async function loadAdminPending() {
  const box = document.getElementById('adminPendingList');
  if (!box) return;
  box.textContent = 'Загрузка...';
  try {
    const data = await adminFetch('/api/admin/pending');
    if (!data.items || data.items.length === 0) {
      box.textContent = 'Нет заявок';
      return;
    }
    box.innerHTML = '';
    data.items.forEach(u => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-2 py-2 border-b border-white/10';
      const nameDiv = document.createElement('div');
      nameDiv.className = 'text-white flex flex-col';
      const strong = document.createElement('strong');
      strong.textContent = u.name;
      const sub = document.createElement('span');
      sub.className = 'text-muted-gray text-xs';
      sub.textContent = 'ID: ' + u.id;
      nameDiv.appendChild(strong);
      nameDiv.appendChild(sub);

      const btnGroup = document.createElement('div');
      btnGroup.className = 'flex gap-2';

      const btnOk = document.createElement('button');
      btnOk.className = 'ios-active border border-primary text-primary font-bold px-2 py-1 rounded-lg text-xs';
      btnOk.textContent = 'Одобрить';
      btnOk.onclick = async () => {
        try {
          await adminFetch('/api/admin/approve', {
            method: 'POST',
            body: JSON.stringify({ user_id: u.id, action: 'approve' })
          });
          notify('Заявка одобрена');
          loadAdminPending();
        } catch (e) { notify('Ошибка: ' + e.message); }
      };

      const btnNo = document.createElement('button');
      btnNo.className = 'ios-active border border-accent-red text-accent-red font-bold px-2 py-1 rounded-lg text-xs';
      btnNo.textContent = 'Отклонить';
      btnNo.onclick = async () => {
        if (!confirm('Отклонить заявку?')) return;
        try {
          await adminFetch('/api/admin/approve', {
            method: 'POST',
            body: JSON.stringify({ user_id: u.id, action: 'deny' })
          });
          notify('Заявка отклонена');
          loadAdminPending();
        } catch (e) { notify('Ошибка: ' + e.message); }
      };

      btnGroup.appendChild(btnOk);
      btnGroup.appendChild(btnNo);
      row.appendChild(nameDiv);
      row.appendChild(btnGroup);
      box.appendChild(row);
    });
  } catch (e) {
    box.textContent = 'Ошибка загрузки заявок';
  }
}

const pb = document.getElementById('adminPendingRefresh');
if (pb) pb.addEventListener('click', loadAdminPending);


async function loadInbox() {
  const list = document.getElementById('inboxList');
  if (!list) return;
  try {
    const res = await apiFetch('/api/user/inbox');
    if (!res.items || res.items.length === 0) {
      list.innerHTML = '<div class="text-center text-muted-gray mt-4">Нет новостей</div>';
      return;
    }
    list.innerHTML = '';
    [...res.items].reverse().forEach(msg => {
      const div = document.createElement('div');
      div.className = 'bg-card-dark p-3 rounded-xl shadow border border-white/5';
      div.innerHTML = '<div class="text-xs text-primary mb-1">' + msg.ts + '</div><div class="text-sm whitespace-pre-wrap">' + msg.text + '</div>';
      list.appendChild(div);
    });
  } catch (e) { }
}

async function loadSupport() {
  const list = document.getElementById('supportMessages');
  if (!list) return;
  try {
    const res = await apiFetch('/api/user/support');
    if (!res.items || res.items.length === 0) {
      list.innerHTML = '<div class="text-center text-muted-gray text-xs w-full py-4">Нет сообщений</div>';
      return;
    }
    list.innerHTML = '';
    // reverse for bottom-up flex
    [...res.items].forEach(msg => {
      const wrap = document.createElement('div');
      wrap.className = 'flex flex-col w-full ' + (msg.is_admin ? 'items-start' : 'items-end');
      const bubble = document.createElement('div');
      bubble.className = 'px-3 py-2 rounded-xl max-w-[85%] whitespace-pre-wrap ' + (msg.is_admin ? 'bg-white/10 text-white rounded-tl-sm' : 'bg-primary text-black rounded-tr-sm');
      bubble.textContent = msg.text;
      const ts = document.createElement('div');
      ts.className = 'text-[10px] text-white/40 mt-1 px-1';
      ts.textContent = msg.ts;
      wrap.appendChild(bubble);
      wrap.appendChild(ts);
      // insert at top because flex-col-reverse
      list.prepend(wrap);
    });
  } catch (e) { }
}

const supBtn = document.getElementById('supportSendBtn');
if (supBtn) supBtn.addEventListener('click', async () => {
  const inp = document.getElementById('supportInput');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  try {
    await apiFetch('/api/user/support', { method: 'POST', body: JSON.stringify({ text }) });
    loadSupport();
  } catch (e) {
    notify('Ошибка отправки: ' + e.message);
  }
});

const broadcastBtn = document.getElementById('adminBroadcastBtn');
if (broadcastBtn) broadcastBtn.addEventListener('click', async () => {
  const inp = document.getElementById('adminBroadcastText');
  const text = inp.value.trim();
  if (!text) return;
  if (!confirm('Отправить Push-уведомление всем?')) return;
  try {
    const r = await adminFetch('/api/admin/broadcast', { method: 'POST', body: JSON.stringify({ message: text }) });
    inp.value = '';
    notify('Отправлено. Доставлено пушей: ' + r.sent_pushes);
  } catch (e) {
    notify('Ошибка: ' + e.message);
  }
});

async function loadAdminUsers() {
  const sel = document.getElementById('adminUserId');
  if (!sel) return;
  try {
    const data = await adminFetch('/api/admin/users');
    adminUsersById = {};
    sel.innerHTML = '<option value="">Выбери пользователя</option>';
    (data.items || []).forEach(u => {
      adminUsersById[u.id] = u;
      const opt = document.createElement('option');
      opt.value = u.id;
      const label = (u.display_name || u.name || u.id).trim();
      const withId = label === u.id || label === `ID ${u.id}` ? label : `${label} (${u.id})`;
      const d = Number(u.days_left);
      const subText = u.expiry_human ? ` до ${u.expiry_human}` : '';
      const leftText = Number.isFinite(d) ? ` · ${d}д` : '';
      const ratioText = ` · ${u.connected_devices || 0}/${u.device_limit || 0}`;
      let tierTag = '[ОБЫЧНЫЙ]';
      const tier = String(u.member_tier || 'regular').toLowerCase();
      if (tier === 'own') tierTag = '[СВОЙ]';
      if (tier === 'vip') tierTag = '[VIP]';
      opt.textContent = `${withId} ${tierTag} [${u.status}]${subText}${leftText}${ratioText}`;
      sel.appendChild(opt);
    });
    document.getElementById('adminUserMeta').textContent = 'Выбери пользователя, чтобы увидеть детали подписки.';
    document.getElementById('adminOpenTg').disabled = true;
    notify('Список пользователей обновлен');
  } catch (e) {
    notify('Ошибка загрузки пользователей');
  }
}

bootstrapPwaAuth().then((ok) => {
  if (!ok) return;
  loadUser();
  setTimeout(subscribePush, 2000);
  loadTariffs();
});

const pwaCodeBtn = document.getElementById('pwaCodeBtn');
const pwaCodeInput = document.getElementById('pwaCodeInput');
if (pwaCodeBtn) {
  pwaCodeBtn.addEventListener('click', () => loginByPwaCode(pwaCodeInput ? pwaCodeInput.value : ''));
}
if (pwaCodeInput) {
  pwaCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loginByPwaCode(pwaCodeInput.value);
    }
  });
}

// Admin Tabs Logic
document.querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.admin-tab-btn').forEach(b => {
      b.className = 'admin-tab-btn ios-active bg-card-dark text-white border border-primary/50 font-bold px-4 py-2 rounded-xl text-sm whitespace-nowrap';
    });

    const me = e.currentTarget;
    me.className = 'admin-tab-btn ios-active bg-primary text-black font-bold px-4 py-2 rounded-xl text-sm whitespace-nowrap';
    const targetId = me.getAttribute('data-tab');

    document.querySelectorAll('.admin-tab-content').forEach(c => {
      c.classList.add('hidden');
      c.classList.remove('block');
    });

    const t = document.getElementById(targetId);
    if (t) {
      t.classList.remove('hidden');
      t.classList.add('block');
      if (targetId === 'admin-tab-system' && typeof loadAdminStats === 'function') loadAdminStats();
      if (targetId === 'admin-tab-support' && typeof loadAdminSupportTickets === 'function') loadAdminSupportTickets();
    }
  });
});

// Admin Support Chat Logic
let adminSupportTickets = [];

async function loadAdminSupportTickets() {
  const sel = document.getElementById('adminSupportUserId');
  if (!sel) return;
  try {
    const res = await adminFetch('/api/admin/support_tickets');
    adminSupportTickets = res.items || [];
    sel.innerHTML = '<option value="">Выберите диалог</option>';
    adminSupportTickets.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.user_id;
      const unread = t.needs_reply ? ' [НОВОЕ]' : '';
      opt.textContent = `${t.name}${unread}`;
      sel.appendChild(opt);
    });
    document.getElementById('adminSupportMessages').innerHTML = '<div class="text-center text-muted-gray text-xs mt-auto py-4">Выберите диалог из списка выше</div>';
    document.getElementById('adminSupportInput').disabled = true;
    document.getElementById('adminSupportSendBtn').disabled = true;
  } catch (e) {
    notify('Ошибка загрузки тикетов');
  }
}

const adminSupRef = document.getElementById('adminSupportRefresh');
if (adminSupRef) adminSupRef.addEventListener('click', loadAdminSupportTickets);

const adminSupSel = document.getElementById('adminSupportUserId');
if (adminSupSel) adminSupSel.addEventListener('change', (e) => {
  const uid = e.target.value;
  const list = document.getElementById('adminSupportMessages');
  const inp = document.getElementById('adminSupportInput');
  const btn = document.getElementById('adminSupportSendBtn');

  if (!uid) {
    list.innerHTML = '<div class="text-center text-muted-gray text-xs mt-auto py-4">Выберите диалог из списка выше</div>';
    inp.disabled = true;
    btn.disabled = true;
    return;
  }

  const ticket = adminSupportTickets.find(t => t.user_id === uid);
  if (!ticket || !ticket.messages) return;

  inp.disabled = false;
  btn.disabled = false;
  list.innerHTML = '';

  [...ticket.messages].forEach(msg => {
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col w-full ' + (msg.is_admin ? 'items-end' : 'items-start');
    const bubble = document.createElement('div');
    bubble.className = 'px-3 py-2 rounded-xl max-w-[85%] whitespace-pre-wrap ' + (msg.is_admin ? 'bg-primary text-black rounded-tr-sm' : 'bg-white/10 text-white rounded-tl-sm');
    bubble.textContent = msg.text;
    const ts = document.createElement('div');
    ts.className = 'text-[10px] text-white/40 mt-1 px-1';
    ts.textContent = msg.ts;
    wrap.appendChild(bubble);
    wrap.appendChild(ts);
    list.prepend(wrap);
  });
});

const adminSupBtn = document.getElementById('adminSupportSendBtn');
if (adminSupBtn) adminSupBtn.addEventListener('click', async () => {
  const sel = document.getElementById('adminSupportUserId');
  const inp = document.getElementById('adminSupportInput');
  const uid = sel.value;
  const text = inp.value.trim();
  if (!uid || !text) return;

  inp.disabled = true;
  adminSupBtn.disabled = true;

  try {
    await adminFetch('/api/admin/support_reply', {
      method: 'POST',
      body: JSON.stringify({ user_id: uid, text })
    });
    inp.value = '';
    await loadAdminSupportTickets();
    sel.value = uid;
    sel.dispatchEvent(new Event('change'));
  } catch (e) {
    notify('Ошибка отправки: ' + e.message);
  } finally {
    inp.disabled = false;
    adminSupBtn.disabled = false;
  }
});

document.querySelectorAll('.admin-tab-btn[data-tab="admin-tab-support"]').forEach(b => {
  b.addEventListener('click', loadAdminSupportTickets);
});
