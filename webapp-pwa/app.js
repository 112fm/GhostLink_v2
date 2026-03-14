const screens = Array.from(document.querySelectorAll('.screen'));
const backBtn = document.getElementById('backBtn');
const helpBtn = document.getElementById('helpBtn');
const stack = ['screen-home'];
let accessClosed = false;

function showScreen(id) {
  const header = document.getElementById('appHeader');
  const locked = accessClosed && USER_ID !== ADMIN_ID;
  if (locked) id = 'screen-locked';
  screens.forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  if (backBtn) backBtn.classList.toggle('hidden', stack.length <= 1);
  if (header) header.classList.toggle('hidden', locked);
  if (helpBtn) helpBtn.classList.toggle('hidden', locked || id !== 'screen-home');
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
const PWA_LOCAL_TOKEN_KEY = 'ghost_pwa_token_local';
let PWA_TOKEN = localStorage.getItem(PWA_LOCAL_TOKEN_KEY) || '';
function getPwaToken() {
  const live = localStorage.getItem(PWA_LOCAL_TOKEN_KEY) || '';
  if (live && live !== PWA_TOKEN) PWA_TOKEN = live;
  return PWA_TOKEN || '';
}
function savePwaToken(token) {
  PWA_TOKEN = String(token || '').trim();
  if (PWA_TOKEN) localStorage.setItem(PWA_LOCAL_TOKEN_KEY, PWA_TOKEN);
}
function clearPwaToken() {
  PWA_TOKEN = '';
  localStorage.removeItem(PWA_LOCAL_TOKEN_KEY);
}
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

function detectPlatform() {
  const ua = String(navigator.userAgent || '').toLowerCase();
  if (/iphone|ipad|ipod|ios/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

function isTelegramWebView() {
  const ua = String(navigator.userAgent || '').toLowerCase();
  // telegram-web-app.js can exist in normal browser too, so rely on UA + initData
  const hasInitData = Boolean(tg && (tg.initData || '').trim());
  const hasTgUa = ua.includes('telegram');
  const hasWvUa = ua.includes('; wv') || ua.includes(' webview ');
  return hasInitData || hasTgUa || hasWvUa;
}

function normalizePwaCode(raw) {
  const ruToLat = {
    'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'К': 'K',
    'М': 'M', 'О': 'O', 'Р': 'P', 'Т': 'T', 'У': 'Y', 'Х': 'X'
  };
  return String(raw || '')
    .toUpperCase()
    .replace(/[\s\-_]/g, '')
    .replace(/[АВСЕНКМОРТУХ]/g, (ch) => ruToLat[ch] || ch);
}

function renderPreAuthGuide() {
  const guideTitle = document.getElementById('pwaGuideTitle');
  const guideText = document.getElementById('pwaGuideText');
  const guideWarn = document.getElementById('pwaGuideWarn');
  const platform = detectPlatform();
  const inTgWebView = isTelegramWebView();

  if (guideTitle) guideTitle.textContent = 'Как открыть правильно';

  let steps = '';
  if (platform === 'ios') {
    steps = '1. Открой ссылку в Safari.\n2. Нажми Поделиться -> На экран «Домой».\n3. Вернись и введи код из Telegram.';
  } else if (platform === 'android') {
    steps = '1. Открой ссылку в Chrome или другом браузере.\n2. Добавь на главный экран.\n3. Вернись и введи код из Telegram.';
  } else {
    steps = '1. Открой ссылку в обычном браузере (не встроенном окне Telegram).\n2. Введи код из Telegram.\n3. При необходимости закрепи как приложение.';
  }

  if (guideText) guideText.textContent = steps;

  if (guideWarn) {
    if (inTgWebView) {
      guideWarn.classList.remove('hidden');
      guideWarn.textContent = 'Открыто во встроенном окне Telegram. Установка тут недоступна. Открой в Safari/Chrome.';
    } else {
      guideWarn.classList.add('hidden');
      guideWarn.textContent = '';
    }
  }
}

function toggleAuthForm(show) {
  const authBox = document.getElementById('pwaAuthBox');
  const continueBtn = document.getElementById('pwaPreAuthContinue');
  if (authBox) authBox.classList.toggle('hidden', !show);
  if (continueBtn) continueBtn.classList.toggle('hidden', show);
}

function showPostAuthHint() {
  notify('Установи один раз, дальше просто открывай приложение и нажимай «Обновить» при необходимости.');
}

function showPwaLocked(text) {
  accessClosed = true;
  const title = document.getElementById('pwaLockedTitle');
  const msg = document.getElementById('pwaLockedText');
  const link = document.getElementById('pwaOpenTgLink');
  const codeErr = document.getElementById('pwaCodeError');
  if (title) title.textContent = 'Требуется авторизация';
  if (msg) msg.textContent = text || 'Доступ только по приглашению.';
  if (codeErr) codeErr.textContent = '';
  if (link) {
    link.href = buildPwaTgAuthLink();
    link.classList.remove('hidden');
  }
  renderPreAuthGuide();
  toggleAuthForm(false);
  showScreen('screen-locked');
}

async function loginByPwaCode(rawCode) {
  const code = normalizePwaCode(rawCode);
  if (!code) {
    const codeErr = document.getElementById('pwaCodeError');
    if (codeErr) codeErr.textContent = 'Введи код из Telegram.';
    return false;
  }
  try {
    const resp = await fetch(API_BASE + '/api/pwa/auth/code', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.detail || 'bad_code');
    savePwaToken(data.session_token || '');
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
    showPostAuthHint();
    return true;
  } catch (e) {
    const codeErr = document.getElementById('pwaCodeError');
    if (codeErr) codeErr.textContent = 'Код неверный или истек. Запроси новый в Telegram.';
    return false;
  }
}

let __swReg = null;
let __swReloading = false;

function showPwaUpdateBanner(registration) {
  let banner = document.getElementById('pwaUpdateBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'pwaUpdateBanner';
    banner.className = 'fixed left-4 right-4 bottom-4 z-[9999] bg-card-dark border border-primary rounded-2xl p-3 shadow-lg';
    banner.innerHTML = `
      <div class="text-white font-bold text-sm mb-1">Доступно обновление</div>
      <div class="text-muted-gray text-xs mb-2">Нажми «Обновить», чтобы применить новую версию.</div>
      <div class="flex gap-2">
        <button id="pwaUpdateNowBtn" class="ios-active bg-primary text-black font-bold px-3 py-2 rounded-xl text-sm">Обновить</button>
        <button id="pwaUpdateLaterBtn" class="ios-active border border-white/20 text-white px-3 py-2 rounded-xl text-sm">Позже</button>
      </div>
    `;
    document.body.appendChild(banner);

    const laterBtn = document.getElementById('pwaUpdateLaterBtn');
    if (laterBtn) {
      laterBtn.addEventListener('click', () => {
        banner.remove();
      });
    }
  }

  const nowBtn = document.getElementById('pwaUpdateNowBtn');
  if (nowBtn) {
    nowBtn.onclick = () => {
      if (registration && registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    };
  }
}

function setupSwUpdateFlow(registration) {
  if (!registration) return;

  const notifyIfWaiting = () => {
    if (registration.waiting) showPwaUpdateBanner(registration);
  };

  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    if (!newWorker) return;
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        notifyIfWaiting();
      }
    });
  });

  notifyIfWaiting();
}

function requestSwUpdateCheck() {
  if (__swReg) __swReg.update().catch(() => { });
}

async function bootstrapPwaAuth() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (__swReloading) return;
      __swReloading = true;
      window.location.reload();
    });

    window.addEventListener('load', async () => {
      try {
        __swReg = await navigator.serviceWorker.register('./sw.js');
        setupSwUpdateFlow(__swReg);
        setInterval(requestSwUpdateCheck, 2 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') requestSwUpdateCheck();
        });
      } catch (e) { }
    });
  }

  if (INIT_DATA) return true; // Mini App Telegram
  const p = new URLSearchParams(window.location.search);
  const loginToken = (p.get('login_token') || '').trim();

  if (loginToken) {
    try {
      const resp = await fetch(API_BASE + '/api/pwa/auth', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_token: loginToken }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.detail || 'pwa_auth_failed');
      savePwaToken(data.session_token || '');
      window.history.replaceState({}, '', window.location.pathname);
      accessClosed = false;
      showPostAuthHint();
      return true;
    } catch (e) {
      showPwaLocked('Ошибка авторизации. Нажми «Войти через Telegram».');
      return false;
    }
  }

  return true;
}

function apiFetch(path, options = {}) {
  if (!API_BASE) return Promise.reject(new Error('no_api'));
  const authHeaders = {};
  const livePwaToken = getPwaToken();
  if (INIT_DATA) authHeaders['X-Telegram-InitData'] = INIT_DATA;
  if (livePwaToken) authHeaders['X-PWA-Token'] = livePwaToken;
  return fetch(API_BASE + path, {
    ...options,
    credentials: 'include',
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
let subscriptionUrl = '';
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
  if (!API_BASE) return Promise.resolve(false);
  return apiFetch('/api/user')
    .then(data => {
      CURRENT_USER_ID = Number((data.user && data.user.id) || CURRENT_USER_ID || 0);
      if (data.subscription && data.subscription.status === 'pending') {
        showScreen('screen-pending');
        return false;
      }
      if (data.subscription && data.subscription.status === 'denied') {
        showPwaLocked('Вам отказано в доступе к клубу.');
        return false;
      }

      document.getElementById('balanceValue').textContent = (data.balance || 0) + '₽';
      document.getElementById('expiryValue').textContent = formatSubLine(data.subscription);
      setSubStatus(data.subscription.active);
      document.getElementById('profileName').textContent = data.user.name || 'Пользователь';
      document.getElementById('profileId').textContent = 'ID: ' + data.user.id;
      document.getElementById('deviceLimit').textContent = data.device_limit || 3;
      document.getElementById('profileDevicesRatio').textContent = data.devices_ratio || `${data.connected || data.connected_devices || 0}/${data.device_limit || 0}`;
      currentTier = data.member_tier || currentTier;
      const dc = document.getElementById('deviceCount');
      if (dc) dc.textContent = data.connected_devices || 0;
      document.getElementById('refLink').textContent = data.referral_link || 'нет ссылки';
      document.getElementById('discountValue').textContent = data.discount_text || ((data.discount || 0) + ' ₽');
      document.getElementById('profileMonthlyPrice').textContent = `${data.monthly_min_pay || 0} ₽ (полная ${data.monthly_price || 0} ₽)`;
      supportUrl = data.support_link || 'https://t.me/ghostlink112_bot';
      appShareUrl = data.app_link || appShareUrl;
      subscriptionUrl = data.subscription_url || subscriptionUrl || '';
      const supportLink = document.getElementById('supportLink');
      supportLink.href = supportUrl;
      renderShareBlock();
      renderSubscriptionBlock();
      renderTariffs();
      IS_ADMIN = Boolean(data.user && data.user.is_admin) || String(CURRENT_USER_ID) === String(ADMIN_ID);
      if (IS_ADMIN) {
        const adminBtn = document.getElementById('homeAdminBtn');
        adminBtn.classList.remove('hidden');
      }
      accessClosed = false;
      showScreen(stack[stack.length - 1] || 'screen-home');
      return true;
    })
    .catch((err) => {
      if (err && (err.status === 401 || err.status === 403)) {
        clearPwaToken();
        accessClosed = true;
        showPwaLocked('Сессия истекла. Войди через Telegram или одноразовый код.');
      }
      return false;
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

const bindClick = (id, fn) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
};

bindClick('buyBtn', () => pushScreen('screen-tariffs'));
bindClick('homeDevicesBtn', () => { pushScreen('screen-devices'); loadDevices(); });
bindClick('homeRefBtn', () => { pushScreen('screen-ref'); loadReferrals(); });
bindClick('homeMoreBtn', () => pushScreen('screen-more'));

bindClick('moreSupportBtn', () => pushScreen('screen-support'));
bindClick('morePolicyBtn', () => pushScreen('screen-rules'));
bindClick('moreCharterBtn', () => pushScreen('screen-charter'));
const pwaReloginBtn = document.getElementById('pwaReloginBtn');
if (pwaReloginBtn) {
  pwaReloginBtn.addEventListener('click', () => {
    clearPwaToken();
    showPwaLocked('Сессия сброшена. Войди через Telegram.');
  });
}

bindClick('profilePayBtn', () => pushScreen('screen-tariffs'));
bindClick('profileRefBtn', () => { pushScreen('screen-ref'); loadReferrals(); });
bindClick('profileShareBtn', () => { pushScreen('screen-share'); renderShareBlock(); });
bindClick('profileSupportBtn', () => pushScreen('screen-support'));
bindClick('profileRulesBtn', () => pushScreen('screen-rules'));
bindClick('profileDevicesBtn', () => { pushScreen('screen-devices'); loadDevices(); });

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

function renderSubscriptionBlock() {
  const linkEl = document.getElementById('subscriptionLink');
  const copyBtn = document.getElementById('copySubscriptionBtn');
  if (linkEl) linkEl.textContent = subscriptionUrl || '—';
  if (copyBtn) copyBtn.disabled = !subscriptionUrl;
}

document.getElementById('copyAppLinkBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(appShareUrl || '');
    notify('Ссылка скопирована');
  } catch (e) {
    notify('Не удалось скопировать ссылку');
  }
});

document.getElementById('copySubscriptionBtn').addEventListener('click', async () => {
  try {
    if (!subscriptionUrl) return notify('Ссылка подписки пока недоступна');
    await navigator.clipboard.writeText(subscriptionUrl);
    notify('Ссылка подписки скопирована');
  } catch (e) {
    notify('Не удалось скопировать ссылку подписки');
  }
});

function setLegacySubscriptionVisibility(show) {
  const linkEl = document.getElementById('subscriptionLink');
  const copyBtn = document.getElementById('copySubscriptionBtn');
  const titleEl = linkEl ? linkEl.previousElementSibling : null;
  [titleEl, linkEl, copyBtn].forEach((el) => {
    if (!el) return;
    el.classList.toggle('hidden', !show);
  });
}

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
        const nameEl = document.createElement('span');
        nameEl.textContent = item.name || 'Без имени';
        const statusEl = document.createElement('span');
        statusEl.className = 'text-muted-gray';
        statusEl.textContent = status;
        row.appendChild(nameEl);
        row.appendChild(statusEl);
        box.appendChild(row);
      });
    })
    .catch(() => { });
}

let issuedKeyTimer = null;
function shortPreview(value, head = 22, tail = 12) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= head + tail + 3) return text;
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

function revealIssuedKey(key, ttlSec = 180) {
  const host = document.getElementById('deviceList');
  if (!host || !host.parentElement) return;

  let box = document.getElementById('issuedKeyReveal');
  if (!box) {
    box = document.createElement('div');
    box.id = 'issuedKeyReveal';
    box.className = 'mb-3 bg-card-dark border border-primary rounded-2xl p-3';
    host.parentElement.insertBefore(box, host);
  }

  const safeKey = String(key || '').trim();
  const previewKey = shortPreview(safeKey, 24, 14);
  const safeTtl = Math.max(30, Number(ttlSec || 180));
  let left = safeTtl;

  box.innerHTML = `
    <div class="text-primary font-bold mb-2">Твой новый ключ (временно)</div>
    <div class="text-xs text-muted-gray mb-2">Сохрани ключ в V2Ray. Через время он снова скроется.</div>
    <div class="w-full truncate bg-black/40 border border-primary rounded-xl px-3 py-2 text-white text-xs" id="issuedKeyValue" title="${safeKey.replace(/"/g, '&quot;')}">${previewKey}</div>
    <div class="flex items-center gap-2 mt-2">
      <button id="issuedKeyCopyBtn" class="ios-active border border-primary text-primary font-bold px-3 py-2 rounded-xl text-sm">Скопировать</button>
      <button id="issuedKeyHideBtn" class="ios-active border border-white/20 text-white font-bold px-3 py-2 rounded-xl text-sm">Скрыть</button>
    </div>
    <div id="issuedKeyTimer" class="text-xs text-muted-gray mt-2"></div>
  `;

  const timerEl = document.getElementById('issuedKeyTimer');
  const hide = () => {
    if (issuedKeyTimer) {
      clearInterval(issuedKeyTimer);
      issuedKeyTimer = null;
    }
    if (box && box.parentElement) box.parentElement.removeChild(box);
  };

  const tick = () => {
    if (timerEl) timerEl.textContent = `Скрытие через ${left} сек`;
    left -= 1;
    if (left < 0) hide();
  };

  if (issuedKeyTimer) clearInterval(issuedKeyTimer);
  tick();
  issuedKeyTimer = setInterval(tick, 1000);

  const copyBtn = document.getElementById('issuedKeyCopyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const ok = await navigator.clipboard.writeText(safeKey).then(() => true).catch(() => false);
      notify(ok ? 'Ключ скопирован' : 'Не удалось скопировать. Выдели ключ вручную.');
    });
  }

  const hideBtn = document.getElementById('issuedKeyHideBtn');
  if (hideBtn) hideBtn.addEventListener('click', hide);
}
function renderDeviceList(items) {
  const box = document.getElementById('deviceList');
  box.innerHTML = '';
  setLegacySubscriptionVisibility(false);
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

    const rotateBtn = document.createElement('button');
    rotateBtn.className = 'ios-active border border-primary text-primary font-bold px-2 py-1 rounded-lg text-xs';
    rotateBtn.textContent = 'Обновить ключ';
    rotateBtn.addEventListener('click', async () => {
      try {
        const res = await apiFetch('/api/device/rotate', { method: 'POST', body: JSON.stringify({ uuid: item.uuid }) });
        if (res && res.key) {
          revealIssuedKey(res.key, 180);
          await navigator.clipboard.writeText(res.key).catch(() => { });
          notify('Ключ устройства обновлен');
        } else {
          notify('Ключ обновлен');
        }
        loadDevices();
      } catch (e) {
        notify('Не удалось обновить ключ устройства');
      }
    });

    const actions = document.createElement('div');
    actions.className = 'flex flex-col gap-2';
    actions.appendChild(rotateBtn);
    actions.appendChild(btn);

    row.appendChild(left);
    row.appendChild(actions);

    const keyHint = document.createElement('div');
    keyHint.className = 'text-muted-gray text-xs mt-2';
    keyHint.textContent = 'Ключ показывается временно после выдачи (вверху экрана). Для нового устройства используй "Добавить устройство".';

    const subWrap = document.createElement('div');
    subWrap.className = 'mt-2 rounded-xl border border-primary/30 p-2 bg-card-dark';
    const subUrl = item && item.uuid ? `${API_BASE}/sub/${encodeURIComponent(item.uuid)}` : '';
    const subText = document.createElement('div');
    subText.className = 'text-xs text-white/90 mb-2 truncate';
    subText.textContent = subUrl || 'Ссылка недоступна';
    if (subUrl) {
      subText.textContent = shortPreview(subUrl, 34, 12);
      subText.title = subUrl;
    }
    const subBtn = document.createElement('button');
    subBtn.className = 'ios-active border border-primary text-primary font-bold px-3 py-2 rounded-xl text-xs w-full';
    subBtn.textContent = 'Скопировать ссылку этого устройства';
    subBtn.disabled = !subUrl;
    subBtn.addEventListener('click', async () => {
      if (!subUrl) return;
      try {
        await navigator.clipboard.writeText(subUrl);
        notify('Ссылка устройства скопирована');
      } catch (e) {
        notify('Не удалось скопировать ссылку');
      }
    });
    subWrap.appendChild(subText);
    subWrap.appendChild(subBtn);

    const container = document.createElement('div');
    container.className = 'flex flex-col py-2 border-b border-white/10';
    container.appendChild(row);
    container.appendChild(keyHint);
    container.appendChild(subWrap);

    box.appendChild(container);
  });
}

function loadDevices() {
  apiFetch('/api/device/list')
    .then((data) => {
      document.getElementById('deviceLimit').textContent = data.device_limit || 0;
      document.getElementById('deviceCount').textContent = data.connected || 0;
      document.getElementById('profileDevicesRatio').textContent = data.devices_ratio || `${data.connected || data.connected_devices || 0}/${data.device_limit || 0}`;
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
      revealIssuedKey(res.key, 180);
      const copied = await navigator.clipboard.writeText(res.key).then(() => true).catch(() => false);
      if (res.upgraded) {
        notify(copied
          ? `Лимит увеличен: ${res.upgraded.old_limit}→${res.upgraded.new_limit}. Доплата: ${res.upgraded.topup_min_pay} ₽ (полная ${res.upgraded.topup_price} ₽). Ключ показан и скопирован.`
          : `Лимит увеличен: ${res.upgraded.old_limit}→${res.upgraded.new_limit}. Доплата: ${res.upgraded.topup_min_pay} ₽ (полная ${res.upgraded.topup_price} ₽). Ключ показан, скопируй вручную.`);
      } else {
        notify(copied
          ? `Устройство добавлено (${res.devices_ratio || ''}). Ключ показан и скопирован.`
          : `Устройство добавлено (${res.devices_ratio || ''}). Ключ показан, скопируй вручную.`);
      }
    } else {
      notify('Устройство добавлено');
    }
    const nameInput = document.getElementById('deviceName');
    if (nameInput) nameInput.value = '';
    loadDevices();
  } catch (e) {
    if (e && e.message === 'device_limit_reached') notify('Достигнут лимит устройств (максимум 5).');
    else if (e && e.message === 'access_closed') notify('Доступ неактивен. Сначала активируй подписку в профиле.');
    else if (e && e.status === 401) notify('Сессия истекла. Зайди заново через Telegram.');
    else if (e && e.status === 403) notify('Операция запрещена для текущего статуса аккаунта.');
    else notify('Не удалось добавить устройство: ' + (e && e.message ? e.message : 'unknown_error'));
  }
});

document.getElementById('resetDeviceBtn').addEventListener('click', async () => {
  if (!window.confirm('Сбросить ключ пользователя? Старые подключения перестанут работать.')) return;
  try {
    const res = await apiFetch('/api/device/reset', { method: 'POST' });
    if (res.key) {
      revealIssuedKey(res.key, 180);
      const copied = await navigator.clipboard.writeText(res.key).then(() => true).catch(() => false);
      notify(copied ? 'Ключ после сброса показан и скопирован' : 'Ключ после сброса показан. Скопируй вручную.');
    } else {
      notify('Ключ сброшен');
    }
    loadDevices();
  } catch (e) {
    notify('Не удалось сбросить ключ');
  }
});

const flexSlider = document.getElementById('flexSlider');
flexSlider.addEventListener('input', () => {
  renderTariffs();
});

let paymentSettings = { phone: '+79857719139', bank: 'alfa', recipient: 'Арсений А' };
let currentPaymentLabel = '';

async function loadPaymentSettings() {
  try {
    paymentSettings = await apiFetch('/api/payment/settings');
  } catch (e) {
    paymentSettings = { phone: '+79857719139', bank: 'alfa', recipient: 'Арсений А' };
  }
}

function openPaymentScreen(amount, label) {
  currentPaymentLabel = String(label || '').trim();
  document.getElementById('paymentAmountDisplay').textContent = `${amount} ₽`;
  loadPaymentSettings().then(() => {
    document.getElementById('paymentPhoneDisplay').textContent = paymentSettings.phone || '+79857719139';
    const bankName = String(paymentSettings.bank || 'alfa').toLowerCase();
    let bankDisplay = 'Альфа-Банк';
    if (bankName.includes('sber')) bankDisplay = 'Сбербанк';
    if (bankName.includes('ozon')) bankDisplay = 'Ozon Банк';
    if (bankName.includes('tinkoff') || bankName.includes('t-bank')) bankDisplay = 'Т-Банк';
    if (bankName.includes('yandex')) bankDisplay = 'Яндекс Банк';
    document.getElementById('paymentBankDisplay').textContent = bankDisplay;
    const recipientEl = document.getElementById('paymentRecipientDisplay');
    if (recipientEl) recipientEl.textContent = paymentSettings.recipient || '—';
  });

  const pendingBox = document.getElementById('paymentPendingBox');
  const formBox = document.getElementById('paymentFormBox');
  if (pendingBox) pendingBox.classList.add('hidden');
  if (formBox) formBox.classList.remove('hidden');

  document.getElementById('paymentSenderInput').value = '';
  pushScreen('screen-payment');
}

document.getElementById('soloPay').addEventListener('click', () => {
  const price = tariffMap[1] ? tariffMap[1].price : 150;
  openPaymentScreen(price, 'Solo');
});

document.getElementById('flexPay').addEventListener('click', () => {
  const devices = Math.max(3, Math.min(5, parseInt(flexSlider.value || '3', 10)));
  const price = tariffMap[devices] ? tariffMap[devices].price : 225;
  openPaymentScreen(price, `Flex ${devices}`);
});

const profilePayBtn = document.getElementById('profilePayBtn');
if (profilePayBtn) {
  profilePayBtn.addEventListener('click', () => {
    const limit = CURRENT_USER_DATA ? (CURRENT_USER_DATA.device_limit || 1) : 1;
    let price = tariffMap[limit] ? tariffMap[limit].price : 150;
    openPaymentScreen(price, `Текущий тариф ${limit}`);
  });
}

document.getElementById('copyPhoneBtn').addEventListener('click', async () => {
  try {
    const phone = document.getElementById('paymentPhoneDisplay').textContent;
    await navigator.clipboard.writeText(phone);
    notify('Номер телефона скопирован!');
  } catch (e) { }
});

document.getElementById('submitPaymentBtn').addEventListener('click', async () => {
  const senderVal = document.getElementById('paymentSenderInput').value.trim();
  if (!/^[A-Za-zА-Яа-яЁё]{2,}\s+[A-Za-zА-Яа-яЁё]$/u.test(senderVal)) return notify('Формат: Имя Ф (например Иван П)');

  const amountText = document.getElementById('paymentAmountDisplay').textContent;
  const amount = parseInt(amountText.replace(/\D/g, ''), 10) || 150;

  try {
    await apiFetch('/api/payment/report', {
      method: 'POST',
      body: JSON.stringify({ amount: amount, sender_name: senderVal, payment_label: currentPaymentLabel })
    });
    notify('Платеж отмечен. Доступ продлен на 7 дней, проверка идет у администратора.');
    loadUser();
    pushScreen('screen-home');
  } catch (e) {
    notify('Ошибка отправки: ' + e.message);
  }
});

if (String(USER_ID) === String(ADMIN_ID)) {
  const adminBtn = document.getElementById('homeAdminBtn');
  adminBtn.classList.remove('hidden');
}

async function loadAdminSbpSettings() {
  try {
    const res = await apiFetch('/api/payment/settings');
    document.getElementById('adminSbpPhone').value = res.phone || '';
    document.getElementById('adminSbpBank').value = res.bank || 'sber';
    const recipientInput = document.getElementById('adminSbpRecipient');
    if (recipientInput) recipientInput.value = res.recipient || 'Арсений А';
  } catch (e) { }
}

const adminSbpSaveBtn = document.getElementById('adminSbpSaveBtn');
if (adminSbpSaveBtn) {
  adminSbpSaveBtn.addEventListener('click', async () => {
    const phone = document.getElementById('adminSbpPhone').value.trim();
    const bank = document.getElementById('adminSbpBank').value.trim();
    const recipient = ((document.getElementById('adminSbpRecipient') || {}).value || '').trim();
    try {
      await adminFetch('/api/admin/payment/settings', {
        method: 'POST',
        body: JSON.stringify({ phone, bank, recipient })
      });
      notify('Реквизиты сохранены');
    } catch (e) { notify('Ошибка сохранения: ' + e.message); }
  });
}

const adminApprovePaymentBtn = document.getElementById('adminApprovePaymentBtn');
if (adminApprovePaymentBtn) {
  adminApprovePaymentBtn.addEventListener('click', async () => {
    const userId = document.getElementById('adminUserId').value.trim();
    if (!userId) return notify('Выберите пользователя');
    if (!confirm('Одобрить платеж и выдать 30 дней?')) return;
    try {
      await adminFetch('/api/admin/payment/approve', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId })
      });
      notify('Платеж одобрен!');
      await loadAdminUsers();
      document.getElementById('adminUserId').value = userId;
      document.getElementById('adminUserId').dispatchEvent(new Event('change'));
    } catch (e) { notify('Ошибка: ' + e.message); }
  });
}

const adminRejectPaymentBtn = document.getElementById('adminRejectPaymentBtn');
if (adminRejectPaymentBtn) {
  adminRejectPaymentBtn.addEventListener('click', async () => {
    const userId = document.getElementById('adminUserId').value.trim();
    if (!userId) return notify('Выберите пользователя');
    if (!confirmDanger('REJECT', 'Отклонить платеж (пользователь лишится аванса и получит бан)')) return;
    try {
      await adminFetch('/api/admin/payment/reject', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId })
      });
      notify('Платеж отклонен. Доступ закрыт.');
      await loadAdminUsers();
      document.getElementById('adminUserId').value = userId;
      document.getElementById('adminUserId').dispatchEvent(new Event('change'));
    } catch (e) { notify('Ошибка: ' + e.message); }
  });
}

document.getElementById('homeAdminBtn').addEventListener('click', () => {
  if (!IS_ADMIN && String(CURRENT_USER_ID) !== String(ADMIN_ID)) return notify('Нет доступа');
  pushScreen('screen-admin');
  loadAdminUsers();
  loadAdminSbpSettings();
  loadAdminStats();
  refreshPanelProxyState();
});

async function loadAdminStats() {
  try {
    const data = await adminFetch('/api/admin/stats');
    document.getElementById('dashMem').textContent = data.free_mem_mb + ' MB';
    document.getElementById('dashOnline').textContent = String(data.online ? data.online.length : 0);
    const totalGB = (((data.traffic_up || 0) + (data.traffic_down || 0)) / (1024 ** 3)).toFixed(2);
    const dashTotal = document.getElementById('dashTotal');
    if (dashTotal) dashTotal.textContent = totalGB + ' GB';

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
    const box = document.getElementById('adminOnlineList');
    if (box) box.textContent = 'Ошибка загрузки статистики';
    notify('Не удалось загрузить статистику: ' + (e.message || 'stats'));
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

const adminPanelOpenBtn = document.getElementById('adminOtpLogin');
const adminPanelCloseBtn = document.getElementById('adminPanelLockBtn');
let panelStatePollHandle = null;
let panelActionInFlight = false;
let panelLastKnownOpen = false;
let panelStatusSyncLostNotified = false;

function formatPanelLeft(seconds) {
  const sec = Math.max(0, Number(seconds) || 0);
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

function setPanelButtonsState(isOpen) {
  panelLastKnownOpen = !!isOpen;
  if (adminPanelOpenBtn) {
    adminPanelOpenBtn.classList.toggle('hidden', !!isOpen);
    adminPanelOpenBtn.disabled = panelActionInFlight || !!isOpen;
  }
  if (adminPanelCloseBtn) {
    adminPanelCloseBtn.classList.toggle('hidden', !isOpen);
    adminPanelCloseBtn.disabled = panelActionInFlight || !isOpen;
  }
}

function setPanelActionBusy(busy) {
  panelActionInFlight = !!busy;
  setPanelButtonsState(panelLastKnownOpen);
}

function setPanelUiState(isOpen, secondsLeft = 0) {
  setPanelButtonsState(!!isOpen);
  const statusEl = document.getElementById('adminPanelStatusText');
  const timerEl = document.getElementById('adminPanelTimer');
  if (statusEl) statusEl.textContent = isOpen ? 'открыта' : 'закрыта';
  if (timerEl) timerEl.textContent = isOpen ? formatPanelLeft(secondsLeft) : '--:--';
}

function setPanelLinkHref(href) {
  const proxyLinkDiv = document.getElementById('adminProxyLink');
  const proxyLinkAnchor = proxyLinkDiv ? proxyLinkDiv.querySelector('a') : null;
  if (proxyLinkAnchor && href) proxyLinkAnchor.href = href;
  if (proxyLinkDiv) proxyLinkDiv.classList.remove('hidden');
}

function hidePanelLink() {
  const proxyLinkDiv = document.getElementById('adminProxyLink');
  if (proxyLinkDiv) proxyLinkDiv.classList.add('hidden');
}

function openPanelExternal(href) {
  const url = String(href || '').trim();
  if (!url) return;
  try {
    if (tg && typeof tg.openLink === 'function') tg.openLink(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch (e) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

async function refreshPanelProxyState(silent = true) {
  try {
    const r = await adminFetch('/api/admin/proxy_status');
    const isOpen = !!(r && r.open);
    const secondsLeft = Number((r && r.seconds_left) || 0);
    panelStatusSyncLostNotified = false;
    setPanelUiState(isOpen, secondsLeft);
    if (!isOpen) hidePanelLink();
    return true;
  } catch (e) {
    if (e && (e.status === 401 || e.status === 403)) {
      setPanelUiState(false, 0);
      hidePanelLink();
      if (!silent) notify('Нет доступа к панели');
      return false;
    }

    if (!panelStatusSyncLostNotified && !silent) {
      notify('Связь с API нестабильна. Повтори через пару секунд.');
      panelStatusSyncLostNotified = true;
    }
    return false;
  }
}

async function openPanelWithFreshSession(silent = false) {
  if (panelActionInFlight) return false;
  setPanelActionBusy(true);
  try {
    const res = await adminFetch('/api/admin/proxy_auth', { method: 'POST', body: JSON.stringify({}) });
    if (res && res.ok) {
      const proxyUrl = String((res.proxy_url || '').trim());
      const token = String((res.proxy_token || '').trim());
      const hrefBase = proxyUrl || (API_BASE + '/panel/');
      const href = token ? (hrefBase + (hrefBase.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token)) : hrefBase;
      panelStatusSyncLostNotified = false;
      setPanelLinkHref(href);
      setPanelUiState(true, Number((res && res.ttl_sec) || 900));
      openPanelExternal(href);
      if (!silent) notify('Панель открыта на 15 минут');
      return true;
    }

    if (!silent) notify('Не удалось открыть панель. Повтори через пару секунд.');
    await refreshPanelProxyState(true);
    return false;
  } catch (e) {
    if (e && (e.status === 401 || e.status === 403)) notify('Нет доступа к панели');
    else notify('Не удалось открыть панель. Проверь сеть и повтори.');
    await refreshPanelProxyState(true);
    return false;
  } finally {
    setPanelActionBusy(false);
  }
}

if (adminPanelOpenBtn) {
  adminPanelOpenBtn.addEventListener('click', async () => {
    await openPanelWithFreshSession(false);
  });
}

const panelLinkWrap = document.getElementById('adminProxyLink');
const panelLinkAnchor = panelLinkWrap ? panelLinkWrap.querySelector('a') : null;
if (panelLinkAnchor) {
  panelLinkAnchor.addEventListener('click', (e) => {
    e.preventDefault();
    const href = String(panelLinkAnchor.getAttribute('href') || '').trim();
    if (!href) {
      notify('Сначала открой панель, затем переходи по ссылке.');
      return;
    }
    openPanelExternal(href);
  });
}

if (adminPanelCloseBtn) {
  adminPanelCloseBtn.addEventListener('click', async () => {
    if (panelActionInFlight) return;
    setPanelActionBusy(true);
    try {
      await adminFetch('/api/admin/proxy_close', { method: 'POST' });
      hidePanelLink();
      setPanelUiState(false, 0);
      notify('Панель закрыта');
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) notify('Нет доступа к панели');
      else notify('Ошибка закрытия панели. Повтори еще раз.');
      await refreshPanelProxyState(true);
    } finally {
      setPanelActionBusy(false);
    }
  });
}

refreshPanelProxyState(true);
if (!panelStatePollHandle) {
  panelStatePollHandle = setInterval(() => {
    refreshPanelProxyState(true);
  }, 10000);
}
document.getElementById('adminAddSlots').addEventListener('click', async () => {
  try {
    const r = await adminFetch('/api/admin/add_slots', { method: 'POST' });
    notify(`Новый лимит: ${r.max_users}`);
  } catch (e) {
    notify('Ошибка');
  }
});
function adminErr(e, fallback = 'Ошибка') {
  const msg = (e && e.message) ? e.message : fallback;
  notify(`${fallback}: ${msg}`);
}

document.getElementById('adminBan').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Укажи Telegram ID');
  try {
    await adminFetch('/api/admin/user/ban', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Пользователь забанен');
    await loadAdminUsers(userId, true);
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
  } catch (e) {
    adminErr(e, 'Ошибка бана');
  }
});
document.getElementById('adminUnban').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Укажи Telegram ID');
  try {
    await adminFetch('/api/admin/user/unban', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Пользователь разблокирован');
    await loadAdminUsers(userId, true);
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
  } catch (e) {
    adminErr(e, 'Ошибка разбана');
  }
});
document.getElementById('adminDelete').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Укажи Telegram ID');
  if (!confirmDanger('DELETE', `Удаление пользователя ${userId}`)) return;
  try {
    await adminFetch('/api/admin/user/delete', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Пользователь удален');
    await loadAdminUsers('', true);
  } catch (e) {
    adminErr(e, 'Ошибка удаления');
  }
});

document.getElementById('adminTrial7').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Выбери пользователя');
  try {
    await adminFetch('/api/admin/user/trial7', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Выдан trial 7 дней');
    await loadAdminUsers(userId, true);
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
  } catch (e) {
    adminErr(e, 'Ошибка trial');
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
    await loadAdminUsers(userId, true);
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
  } catch (e) {
    adminErr(e, 'Ошибка продления');
  }
});
document.getElementById('adminUnlimited').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Выбери пользователя');
  try {
    await adminFetch('/api/admin/user/unlimited', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Выдан доступ без срока');
    await loadAdminUsers(userId, true);
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
  } catch (e) {
    adminErr(e, 'Ошибка выдачи без срока');
  }
});
document.getElementById('adminResetSub').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Выбери пользователя');
  if (!confirmDanger('RESET', `Сброс подписки пользователя ${userId}`)) return;
  try {
    await adminFetch('/api/admin/user/reset_subscription', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Подписка сброшена');
    await loadAdminUsers(userId, true);
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
  } catch (e) {
    adminErr(e, 'Ошибка сброса подписки');
  }
});
document.getElementById('adminUsersRefresh').addEventListener('click', loadAdminUsers);
document.getElementById('adminUserId').addEventListener('change', () => {
  const userId = document.getElementById('adminUserId').value.trim();
  const meta = document.getElementById('adminUserMeta');
  const openBtn = document.getElementById('adminOpenTg');
  const actionsBox = document.getElementById('adminUserActions');

  if (!userId || !adminUsersById[userId]) {
    meta.textContent = 'Выбери пользователя, чтобы увидеть детали подписки.';
    openBtn.disabled = true;
    if (actionsBox) actionsBox.classList.add('hidden');
    return;
  }

  if (actionsBox) actionsBox.classList.remove('hidden');
  const u = adminUsersById[userId];

  const pActions = document.getElementById('adminPaymentActions');
  if (pActions) {
    if (u.payment_status === 'pending_verification') {
      pActions.classList.remove('hidden');
    } else {
      pActions.classList.add('hidden');
    }
  }

  const expiry = u.expiry_human || (u.expiry ? u.expiry : 'Без срока/нет');
  const days = Number(u.days_left);
  const daysText = Number.isFinite(days) ? `${days} дн` : '—';
  const connected = Number(u.connected_devices || 0);
  const limit = Number(u.device_limit || 0);
  const ratio = `${connected}/${limit}`;
  const tierText = formatTierLabel(u.member_tier || 'regular');

  meta.classList.add('whitespace-pre-line');
  meta.textContent = [
    `Статус: ${u.status || 'none'}`,
    `Подписка до: ${expiry}`,
    `Осталось: ${daysText}`,
    `Тариф: ${u.tariff_name || '—'} · Устройства: ${ratio}`,
    `Категория: ${tierText}`,
    `Трафик: ${u.traffic_limit_gb || 0} GB/мес`
  ].join('\n');

  if (u.payment_status === 'pending_verification') {
    const paymentNotice = document.createElement('div');
    paymentNotice.className = 'mt-3 p-2 bg-yellow-900/30 border border-yellow-500 text-yellow-200 rounded-lg text-xs leading-5 whitespace-pre-line';
    paymentNotice.textContent = [
      'СБП ПЛАТЕЖ ОЖИДАЕТ ПРОВЕРКИ',
      `Заявленная сумма: ${u.payment_amount || 0} ₽`,
      `Плательщик: ${u.payment_sender || '—'}`,
      `Тариф: ${u.payment_label || '—'}`,
      `Подтверждение (МСК): ${u.payment_time_msk || '—'}`,
      `Реквизиты: ${u.payment_bank || '—'} · ${u.payment_phone || '—'} · ${u.payment_recipient || '—'}`
    ].join('\n');
    meta.appendChild(paymentNotice);
  }

  openBtn.disabled = !(u.tg_link || u.tg_username);
});

const adminManageSubToggle = document.getElementById('adminManageSubToggle');
if (adminManageSubToggle) {
  adminManageSubToggle.addEventListener('click', () => {
    const menu = document.getElementById('adminSubMenu');
    if (menu) {
      menu.classList.toggle('hidden');
      menu.style.display = menu.classList.contains('hidden') ? 'none' : 'flex';
    }
  });
}

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
      const ts = document.createElement('div');
      ts.className = 'text-xs text-primary mb-1';
      ts.textContent = msg.ts || '';
      const body = document.createElement('div');
      body.className = 'text-sm whitespace-pre-wrap';
      body.textContent = msg.text || '';
      div.appendChild(ts);
      div.appendChild(body);
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

async function loadAdminUsers(selectedId = '', silent = false) {
  const sel = document.getElementById('adminUserId');
  if (!sel) return;
  try {
    const data = await adminFetch('/api/admin/users');
    adminUsersById = {};
    const keepId = String(selectedId || sel.value || '').trim();
    sel.innerHTML = '<option value="">Выбери пользователя</option>';
    (data.items || []).forEach(u => {
      adminUsersById[u.id] = u;
      const opt = document.createElement('option');
      opt.value = u.id;
      const tgUser = (u.tg_username || '').trim();
      const tgFullName = (u.tg_full_name || '').trim();
      const baseLabel = (u.display_name || u.name || '').trim();
      let label = '';
      if (tgUser && tgFullName) label = `${tgUser} (${tgFullName})`;
      else if (tgUser && baseLabel && baseLabel !== tgUser) label = `${tgUser} (${baseLabel})`;
      else label = tgUser || baseLabel || `ID ${u.id}`;
      const withId = label.includes(`(${u.id})`) || label === `ID ${u.id}` ? label : `${label} (${u.id})`;
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
    if (keepId && adminUsersById[keepId]) sel.value = keepId;
    document.getElementById('adminUserMeta').textContent = 'Выбери пользователя, чтобы увидеть детали подписки.';
    document.getElementById('adminOpenTg').disabled = true;
    if (!silent) notify('Список пользователей обновлен');
  } catch (e) {
    adminErr(e, 'Ошибка загрузки пользователей');
  }
}

function setupFirstRunOnboarding(appLabel, forceShow = false) {
  const overlay = document.getElementById('onboardingOverlay');
  const card = overlay ? overlay.querySelector('div') : null;
  const title = document.getElementById('onboardingTitle');
  const text = document.getElementById('onboardingText');
  const nextBtn = document.getElementById('onboardingNext');
  const skipBtn = document.getElementById('onboardingSkip');
  if (!overlay || !card || !title || !text || !nextBtn || !skipBtn) return;

  const styleId = 'ghostOnboardingStyles';
  if (!document.getElementById(styleId)) {
    const st = document.createElement('style');
    st.id = styleId;
    st.textContent = `
      .ghost-onboarding-target {
        position: relative !important;
        z-index: 72 !important;
        box-shadow: 0 0 0 2px #b8ff00, 0 0 0 8px rgba(184, 255, 0, 0.22);
        border-radius: 16px;
      }
      #onboardingOverlay { z-index: 70; }
      #onboardingOverlay .onboarding-card {
        position: fixed;
        z-index: 80;
        width: min(420px, calc(100vw - 24px));
      }
    `;
    document.head.appendChild(st);
  }

  card.classList.add('onboarding-card');

  const key = `ghost_onboarding_done_${appLabel}`;
  if (!forceShow && localStorage.getItem(key) === '1') return;

  const steps = [
    {
      selector: '#homeDevicesBtn',
      title: 'Мои ключи',
      text: 'Здесь ты получаешь доступ. Нажми «Мои ключи» -> «Добавить устройство» и забери свой ключ.'
    },
    {
      selector: '#buyBtn',
      title: 'Поддержать проект',
      text: 'Здесь выбирается тариф и подтверждается перевод. После подтверждения админом доступ продлевается.'
    },
    {
      selector: '#homeRefBtn',
      title: 'Пригласить в клуб',
      text: 'Тут твоя инвайт-ссылка. Приглашай людей и получай скидку после их первой оплаты.'
    },
    {
      selector: '#homeDevicesBtn',
      title: 'Как подключить сервис',
      text: '1) Скачай приложение V2Ray-клиент. 2) В «Мои ключи» создай устройство. 3) Скопируй ключ и вставь его в V2Ray.'
    }
  ];

  let idx = 0;
  let currentTarget = null;

  const clearTarget = () => {
    if (currentTarget) {
      currentTarget.classList.remove('ghost-onboarding-target');
      currentTarget = null;
    }
  };

  const placeCard = (targetEl) => {
    const margin = 12;
    card.style.left = `${margin}px`;
    card.style.top = `${margin}px`;

    const cardRect = card.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!targetEl) {
      const left = Math.max(margin, Math.min((vw - cardRect.width) / 2, vw - cardRect.width - margin));
      const top = Math.max(margin, vh - cardRect.height - margin);
      card.style.left = `${Math.round(left)}px`;
      card.style.top = `${Math.round(top)}px`;
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    const left = Math.max(margin, Math.min(rect.left, vw - cardRect.width - margin));
    const spaceBelow = vh - rect.bottom - margin;
    const spaceAbove = rect.top - margin;

    let top;
    if (spaceBelow >= cardRect.height + 8 || spaceBelow >= spaceAbove) {
      top = Math.min(vh - cardRect.height - margin, rect.bottom + 10);
    } else {
      top = Math.max(margin, rect.top - cardRect.height - 10);
    }

    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  };

  const onViewportChange = () => {
    placeCard(currentTarget);
  };

  const render = () => {
    const step = steps[idx];
    title.textContent = step.title;
    text.textContent = step.text;
    nextBtn.textContent = idx === steps.length - 1 ? 'Готово' : 'Далее';

    clearTarget();
    currentTarget = step.selector ? document.querySelector(step.selector) : null;
    if (currentTarget) currentTarget.classList.add('ghost-onboarding-target');

    requestAnimationFrame(() => placeCard(currentTarget));
  };

  const finish = () => {
    localStorage.setItem(key, '1');
    clearTarget();
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('orientationchange', onViewportChange);
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
  };

  nextBtn.onclick = () => {
    if (idx >= steps.length - 1) {
      finish();
      return;
    }
    idx += 1;
    render();
  };

  skipBtn.onclick = finish;

  overlay.classList.remove('hidden');
  overlay.classList.add('flex');

  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);

  render();
}

bootstrapPwaAuth().then((ok) => {
  if (!ok) return;
  loadUser().then((loaded) => {
    if (loaded) setupFirstRunOnboarding('pwa');
  });
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

const pwaPreAuthContinue = document.getElementById('pwaPreAuthContinue');
if (pwaPreAuthContinue) {
  pwaPreAuthContinue.addEventListener('click', () => {
    toggleAuthForm(true);
    if (pwaCodeInput) pwaCodeInput.focus();
  });
}

if (helpBtn) {
  helpBtn.addEventListener('click', () => setupFirstRunOnboarding('pwa', true));
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


