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
let PWA_TOKEN = '';
const ADMIN_ID = 312826672;
let CURRENT_USER_ID = 0;
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

function apiFetch(path, options = {}) {
  if (!API_BASE) return Promise.reject(new Error('no_api'));
  const authHeaders = {};
  if (INIT_DATA) authHeaders['X-Telegram-InitData'] = INIT_DATA;
  if (PWA_TOKEN) authHeaders['X-PWA-Token'] = PWA_TOKEN;
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
    el.textContent = 'РџРћР”РџРРЎРљРђ РђРљРўРР’РќРђ';
    el.classList.remove('text-accent-red');
    el.classList.add('text-primary');
  } else {
    el.textContent = 'РџРћР”РџРРЎРљРђ РќР•РђРљРўРР’РќРђ';
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
  if (v === 'own') return 'СЃРІРѕР№';
  if (v === 'vip') return 'vip';
  return 'РѕР±С‹С‡РЅС‹Р№';
}

function renderTariffs() {
  const solo = tariffMap[1] || { price: 150, min_pay: 100 };
  const flexSlider = document.getElementById('flexSlider');
  const devices = Math.max(2, Math.min(5, parseInt(flexSlider.value || '2', 10)));
  const flex = tariffMap[devices] || { price: 225, min_pay: 150 };

  document.getElementById('tierBadge').textContent = formatTierLabel(currentTier);
  document.getElementById('soloPrice').textContent = `${solo.price}`;
  document.getElementById('soloMinPay').textContent = `${solo.min_pay}`;
  document.getElementById('flexPrice').textContent = `${devices} СѓСЃС‚СЂРѕР№СЃС‚РІР° вЂ” ${flex.price} в‚Ѕ`;
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
  if (!sub || !sub.active) return 'РЅРµС‚ РїРѕРґРїРёСЃРєРё';
  if (!sub.expiry) return 'Р‘РµР· СЃСЂРѕРєР°';
  const human = sub.expiry_human || sub.expiry;
  const days = Number(sub.days_left);
  if (Number.isFinite(days)) return `${human} В· ${days} РґРЅ`;
  return human;
}

function loadUser() {
  if (!API_BASE || !INIT_DATA) return Promise.resolve(false);
  return apiFetch('/api/user')
    .then(data => {
      CURRENT_USER_ID = Number((data.user && data.user.id) || CURRENT_USER_ID || 0);
      document.getElementById('balanceValue').textContent = (data.balance || 0) + 'в‚Ѕ';
      document.getElementById('expiryValue').textContent = formatSubLine(data.subscription);
      setSubStatus(data.subscription.active);
      document.getElementById('profileName').textContent = data.user.name || 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ';
      document.getElementById('profileId').textContent = 'ID: ' + data.user.id;
      document.getElementById('deviceLimit').textContent = data.device_limit || 3;
      document.getElementById('profileDevicesRatio').textContent = data.devices_ratio || `${data.connected_devices || 0}/${data.device_limit || 0}`;
      currentTier = data.member_tier || currentTier;
      const dc = document.getElementById('deviceCount');
      if (dc) dc.textContent = data.connected_devices || 0;
      document.getElementById('refLink').textContent = data.referral_link || 'РЅРµС‚ СЃСЃС‹Р»РєРё';
      document.getElementById('discountValue').textContent = data.discount_text || ((data.discount || 0) + ' в‚Ѕ');
      document.getElementById('profileMonthlyPrice').textContent = `${data.monthly_min_pay || 0} в‚Ѕ (РїРѕР»РЅР°СЏ ${data.monthly_price || 0} в‚Ѕ)`;
      supportUrl = data.support_link || 'https://t.me/ghostlink112_bot';
      appShareUrl = data.app_link || appShareUrl;
      subscriptionUrl = data.subscription_url || subscriptionUrl || '';
      const supportLink = document.getElementById('supportLink');
      supportLink.href = supportUrl;
      renderShareBlock();
      renderSubscriptionBlock();
      renderTariffs();
      if (CURRENT_USER_ID === ADMIN_ID) {
        const adminBtn = document.getElementById('homeAdminBtn');
        adminBtn.classList.remove('hidden');
      }
      accessClosed = false;
      showScreen(stack[stack.length - 1] || 'screen-home');
      return true;
    })
    .catch((err) => {
      if (err && (err.status === 401 || err.status === 403)) {
        accessClosed = true;
        showScreen('screen-locked');
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
  const ok1 = window.confirm(`РћРїР°СЃРЅРѕРµ РґРµР№СЃС‚РІРёРµ: ${title}.\nРџСЂРѕРґРѕР»Р¶РёС‚СЊ?`);
  if (!ok1) return false;
  const typed = window.prompt(`Р’РІРµРґРё ${code} РґР»СЏ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ:`) || '';
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
  if (linkEl) linkEl.textContent = appShareUrl || 'вЂ”';
  if (qrEl && appShareUrl) {
    qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(appShareUrl)}`;
  }
}

function renderSubscriptionBlock() {
  const linkEl = document.getElementById('subscriptionLink');
  const copyBtn = document.getElementById('copySubscriptionBtn');
  if (linkEl) linkEl.textContent = subscriptionUrl || 'вЂ”';
  if (copyBtn) copyBtn.disabled = !subscriptionUrl;
}

document.getElementById('copyAppLinkBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(appShareUrl || '');
    notify('РЎСЃС‹Р»РєР° СЃРєРѕРїРёСЂРѕРІР°РЅР°');
  } catch (e) {
    notify('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ СЃСЃС‹Р»РєСѓ');
  }
});

document.getElementById('copySubscriptionBtn').addEventListener('click', async () => {
  try {
    if (!subscriptionUrl) return notify('РЎСЃС‹Р»РєР° РїРѕРґРїРёСЃРєРё РїРѕРєР° РЅРµРґРѕСЃС‚СѓРїРЅР°');
    await navigator.clipboard.writeText(subscriptionUrl);
    notify('РЎСЃС‹Р»РєР° РїРѕРґРїРёСЃРєРё СЃРєРѕРїРёСЂРѕРІР°РЅР°');
  } catch (e) {
    notify('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ СЃСЃС‹Р»РєСѓ РїРѕРґРїРёСЃРєРё');
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
      await navigator.share({ title: 'GhostLink', text: 'Р›РёС‡РЅС‹Р№ РєР°Р±РёРЅРµС‚ GhostLink', url: appShareUrl });
    } else {
      await navigator.clipboard.writeText(appShareUrl || '');
      notify('РЎСЃС‹Р»РєР° СЃРєРѕРїРёСЂРѕРІР°РЅР°');
    }
  } catch (e) { }
});

document.getElementById('supportLink').addEventListener('click', (e) => {
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

function loadReferrals() {
  apiFetch('/api/referrals')
    .then(data => {
      const box = document.getElementById('refList');
      const total = Number(data.total || 0);
      const paid = Number(data.paid || 0);
      const pending = Number(data.pending || 0);
      const summary = document.createElement('div');
      summary.className = 'text-sm text-muted-gray mb-3';
      summary.textContent = `РџСЂРёРіР»Р°С€РµРЅРѕ: ${total} В· РћРїР»Р°С‚РёР»Рё: ${paid} В· РћР¶РёРґР°СЋС‚: ${pending}`;
      if (!data.items || data.items.length === 0) {
        box.innerHTML = '';
        box.appendChild(summary);
        const empty = document.createElement('div');
        empty.className = 'text-muted-gray text-sm';
        empty.textContent = 'РџРѕРєР° РЅРёРєРѕРіРѕ РЅРµС‚.';
        box.appendChild(empty);
        return;
      }
      box.innerHTML = '';
      box.appendChild(summary);
      data.items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between py-2 border-b border-white/10 text-sm';
        const status = item.status === 'paid' ? 'РћРїР»Р°С‡РµРЅРѕ' : 'РћР¶РёРґР°РµС‚ РѕРїР»Р°С‚С‹';
        const nameEl = document.createElement('span');
        nameEl.textContent = item.name || 'Р‘РµР· РёРјРµРЅРё';
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

async function isSubscriptionUrlReady(url) {
  const subUrl = String(url || '').trim();
  if (!subUrl) return false;
  try {
    const resp = await fetch(subUrl, { method: 'GET', cache: 'no-store', credentials: 'omit' });
    if (!resp.ok) return false;
    const text = (await resp.text()).trim();
    return text.startsWith('vless://');
  } catch (e) {
    return false;
  }
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
    <div class="text-primary font-bold mb-2">РўРІРѕР№ РЅРѕРІС‹Р№ РєР»СЋС‡ (РІСЂРµРјРµРЅРЅРѕ)</div>
    <div class="text-xs text-muted-gray mb-2">РЎРѕС…СЂР°РЅРё РєР»СЋС‡ РІ V2Ray. Р§РµСЂРµР· РІСЂРµРјСЏ РѕРЅ СЃРЅРѕРІР° СЃРєСЂРѕРµС‚СЃСЏ.</div>
    <div class="w-full truncate bg-black/40 border border-primary rounded-xl px-3 py-2 text-white text-xs" id="issuedKeyValue" title="${safeKey.replace(/"/g, '&quot;')}">${previewKey}</div>
    <div class="flex items-center gap-2 mt-2">
      <button id="issuedKeyCopyBtn" class="ios-active border border-primary text-primary font-bold px-3 py-2 rounded-xl text-sm">РЎРєРѕРїРёСЂРѕРІР°С‚СЊ</button>
      <button id="issuedKeyHideBtn" class="ios-active border border-white/20 text-white font-bold px-3 py-2 rounded-xl text-sm">РЎРєСЂС‹С‚СЊ</button>
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
    if (timerEl) timerEl.textContent = `РЎРєСЂС‹С‚РёРµ С‡РµСЂРµР· ${left} СЃРµРє`;
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
      notify(ok ? 'РљР»СЋС‡ СЃРєРѕРїРёСЂРѕРІР°РЅ' : 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ. Р’С‹РґРµР»Рё РєР»СЋС‡ РІСЂСѓС‡РЅСѓСЋ.');
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
    box.textContent = 'пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ.';
    return;
  }

  items.forEach((item) => {
    const subUrl = (item && item.subscription_url) ? String(item.subscription_url) : (item && item.uuid ? `${API_BASE}/sub/${encodeURIComponent(item.uuid)}` : '');

    const container = document.createElement('div');
    container.className = 'mb-3 rounded-2xl border border-primary/30 bg-black/20 p-3';

    const headerRow = document.createElement('div');
    headerRow.className = 'flex items-start justify-between gap-3';

    const info = document.createElement('div');
    info.className = 'min-w-0 flex-1';

    const title = document.createElement('div');
    title.className = 'text-white text-sm font-semibold truncate';
    title.textContent = item.email || item.uuid;

    const meta = document.createElement('div');
    meta.className = 'text-muted-gray text-xs mt-1';
    meta.textContent = `${item.online ? 'пїЅпїЅпїЅпїЅпїЅпїЅ' : 'пїЅпїЅпїЅпїЅпїЅпїЅ'} пїЅ ${formatBytes(item.total || 0)}`;

    info.appendChild(title);
    info.appendChild(meta);
    headerRow.appendChild(info);
    container.appendChild(headerRow);

    const bodyRow = document.createElement('div');
    bodyRow.className = 'mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px] gap-2 items-stretch';

    const subWrap = document.createElement('div');
    subWrap.className = 'rounded-xl border border-primary/30 p-2 bg-card-dark min-w-0 flex flex-col';

    const subText = document.createElement('div');
    subText.className = 'text-xs text-white/90 truncate';
    subText.textContent = subUrl ? shortPreview(subUrl, 28, 12) : 'пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ';
    if (subUrl) subText.title = subUrl;

    const subBtn = document.createElement('button');
    subBtn.className = 'ios-active border border-primary text-primary font-bold px-3 h-[42px] rounded-xl text-xs mt-2 w-full';
    subBtn.textContent = 'пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ';
    subBtn.disabled = !subUrl;
    subBtn.addEventListener('click', async () => {
      if (!subUrl) return;
      try {
        await navigator.clipboard.writeText(subUrl);
        notify('пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ');
      } catch (e) {
        notify('пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ');
      }
    });

    subWrap.appendChild(subText);
    subWrap.appendChild(subBtn);

    const actions = document.createElement('div');
    actions.className = 'flex flex-col gap-2';

    const rotateBtn = document.createElement('button');
    rotateBtn.className = 'ios-active border border-primary text-primary font-bold px-2 h-[42px] rounded-xl text-xs';
    rotateBtn.textContent = 'пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅ';
    rotateBtn.addEventListener('click', async () => {
      try {
        const res = await apiFetch('/api/device/rotate', { method: 'POST', body: JSON.stringify({ uuid: item.uuid }) });
        const ready = await isSubscriptionUrlReady((res && res.subscription_url) || subUrl);
        notify(ready ? 'пїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ, пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ' : 'пїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ, пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅ пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ');
        loadDevices();
      } catch (e) {
        notify('пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ');
      }
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'ios-active border border-primary text-primary font-bold px-2 h-[42px] rounded-xl text-xs';
    delBtn.textContent = 'пїЅпїЅпїЅпїЅпїЅпїЅпїЅ';
    delBtn.addEventListener('click', async () => {
      try {
        await apiFetch('/api/device/remove', { method: 'POST', body: JSON.stringify({ uuid: item.uuid }) });
        notify('пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ');
        loadDevices();
      } catch (e) {
        notify('пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ');
      }
    });

    actions.appendChild(rotateBtn);
    actions.appendChild(delBtn);

    bodyRow.appendChild(subWrap);
    bodyRow.appendChild(actions);
    container.appendChild(bodyRow);

    box.appendChild(container);
  });
}

function loadDevices() {
  apiFetch('/api/device/list')
    .then((data) => {
      const limit = Number(data.device_limit || 0);
      const connected = Number(data.connected || 0);
      document.getElementById('deviceLimit').textContent = `${connected}/${limit}`;
      document.getElementById('deviceCount').textContent = connected;
      document.getElementById('profileDevicesRatio').textContent = data.devices_ratio || `${connected}/${limit}`;

      const addBtn = document.getElementById('addDeviceBtn');
      if (addBtn) {
        addBtn.textContent = `пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ (${connected}/${limit})`;
        addBtn.disabled = !!limit && connected >= limit;
      }

      renderDeviceList(data.items || []);
    })
    .catch(() => {
      const box = document.getElementById('deviceList');
      box.textContent = 'пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ.';
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
    const ready = await isSubscriptionUrlReady(res && res.subscription_url);

    if (res && res.upgraded) {
      notify(`пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ: ${res.upgraded.old_limit}>${res.upgraded.new_limit}. пїЅпїЅпїЅпїЅпїЅпїЅпїЅ: ${res.upgraded.topup_min_pay} ?.`);
    } else {
      notify(ready ? `пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ (${res.devices_ratio || ''}). пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ.` : `пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ (${res.devices_ratio || ''}). пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅ пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ.`);
    }

    const nameInput = document.getElementById('deviceName');
    if (nameInput) nameInput.value = '';
    loadDevices();
  } catch (e) {
    if (e && e.message === 'device_limit_reached') notify('пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ (пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ 5).');
    else if (e && e.message === 'access_closed') notify('пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ. пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ.');
    else if (e && e.status === 401) notify('пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ. пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ Telegram.');
    else if (e && e.status === 403) notify('пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ.');
    else notify('пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ: ' + (e && e.message ? e.message : 'unknown_error'));
  }
});

document.getElementById('resetDeviceBtn').addEventListener('click', async () => {
  if (!window.confirm('пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ? пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ.')) return;
  try {
    await apiFetch('/api/device/reset', { method: 'POST' });
    notify('пїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ. пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅ.');
    loadDevices();
  } catch (e) {
    notify('пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅ');
  }
});

const flexSlider = document.getElementById('flexSlider');
flexSlider.addEventListener('input', () => {
  renderTariffs();
});

let paymentSettings = { phone: '+79857719139', bank: 'alfa', recipient: 'РђСЂСЃРµРЅРёР№ Рђ' };
let currentPaymentLabel = '';

async function loadPaymentSettings() {
  try {
    paymentSettings = await apiFetch('/api/payment/settings');
  } catch (e) {
    paymentSettings = { phone: '+79857719139', bank: 'alfa', recipient: 'РђСЂСЃРµРЅРёР№ Рђ' };
  }
}

function openPaymentScreen(amount, label) {
  currentPaymentLabel = String(label || '').trim();
  document.getElementById('paymentAmountDisplay').textContent = `${amount} в‚Ѕ`;
  loadPaymentSettings().then(() => {
    document.getElementById('paymentPhoneDisplay').textContent = paymentSettings.phone || '+79857719139';
    const bankName = String(paymentSettings.bank || 'alfa').toLowerCase();
    let bankDisplay = 'РђР»СЊС„Р°-Р‘Р°РЅРє';
    if (bankName.includes('sber')) bankDisplay = 'РЎР±РµСЂР±Р°РЅРє';
    if (bankName.includes('ozon')) bankDisplay = 'Ozon Р‘Р°РЅРє';
    if (bankName.includes('tinkoff') || bankName.includes('t-bank')) bankDisplay = 'Рў-Р‘Р°РЅРє';
    if (bankName.includes('yandex')) bankDisplay = 'РЇРЅРґРµРєСЃ Р‘Р°РЅРє';
    document.getElementById('paymentBankDisplay').textContent = bankDisplay;
    const recipientEl = document.getElementById('paymentRecipientDisplay');
    if (recipientEl) recipientEl.textContent = paymentSettings.recipient || 'вЂ”';
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
    openPaymentScreen(price, `РўРµРєСѓС‰РёР№ С‚Р°СЂРёС„ ${limit}`);
  });
}

document.getElementById('copyPhoneBtn').addEventListener('click', async () => {
  try {
    const phone = document.getElementById('paymentPhoneDisplay').textContent;
    await navigator.clipboard.writeText(phone);
    notify('РќРѕРјРµСЂ С‚РµР»РµС„РѕРЅР° СЃРєРѕРїРёСЂРѕРІР°РЅ!');
  } catch (e) { }
});

document.getElementById('submitPaymentBtn').addEventListener('click', async () => {
  const senderVal = document.getElementById('paymentSenderInput').value.trim();
  if (!/^[\\p{L}]{2,}\\s+[\\p{L}]$/u.test(senderVal)) return notify('Р¤РѕСЂРјР°С‚: РРјСЏ Р¤ (РЅР°РїСЂРёРјРµСЂ РРІР°РЅ Рџ)');

  const amountText = document.getElementById('paymentAmountDisplay').textContent;
  const amount = parseInt(amountText.replace(/\D/g, ''), 10) || 150;

  try {
    await apiFetch('/api/payment/report', {
      method: 'POST',
      body: JSON.stringify({ amount: amount, sender_name: senderVal, payment_label: currentPaymentLabel })
    });
    notify('РџР»Р°С‚РµР¶ РѕС‚РјРµС‡РµРЅ. Р”РѕСЃС‚СѓРї РїСЂРѕРґР»РµРЅ РЅР° 7 РґРЅРµР№, РїСЂРѕРІРµСЂРєР° РёРґРµС‚ Сѓ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°.');
    loadUser();
    pushScreen('screen-home');
  } catch (e) {
    notify('РћС€РёР±РєР° РѕС‚РїСЂР°РІРєРё: ' + e.message);
  }
});

if (USER_ID === ADMIN_ID) {
  const adminBtn = document.getElementById('homeAdminBtn');
  adminBtn.classList.remove('hidden');
}
document.getElementById('homeAdminBtn').addEventListener('click', () => {
  if (CURRENT_USER_ID !== ADMIN_ID) return notify('РќРµС‚ РґРѕСЃС‚СѓРїР°');
  pushScreen('screen-admin');
  loadAdminUsers();
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
      box.textContent = 'РќРёРєРѕРіРѕ РЅРµС‚ РѕРЅР»Р°Р№РЅ';
    } else {
      data.online.forEach((name) => {
        const row = document.createElement('div');
        row.className = 'py-1 border-b border-white/10';
        row.textContent = `вЂў ${name}`;
        box.appendChild(row);
      });
    }
  } catch (e) {
    const box = document.getElementById('adminOnlineList');
    if (box) box.textContent = 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё СЃС‚Р°С‚РёСЃС‚РёРєРё';
    notify('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃС‚Р°С‚РёСЃС‚РёРєСѓ: ' + (e.message || 'stats'));
  }
}
document.getElementById('adminStats').addEventListener('click', () => { loadAdminStats(); notify('Р”Р°РЅРЅС‹Рµ СЃРµСЂРІРµСЂР° РѕР±РЅРѕРІР»РµРЅС‹'); });
const adminPaymentSettingsBtn = document.getElementById('adminPaymentSettings');
if (adminPaymentSettingsBtn) {
  adminPaymentSettingsBtn.addEventListener('click', async () => {
    try {
      const current = await adminFetch('/api/payment/settings');
      const phone = (window.prompt('РќРѕРјРµСЂ РґР»СЏ РѕРїР»Р°С‚С‹ (РЎР‘Рџ):', String(current.phone || '')) || '').trim();
      if (!phone) return notify('РќРѕРјРµСЂ РЅРµ Р·Р°РґР°РЅ');
      const bank = (window.prompt('Р‘Р°РЅРє (РЅР°РїСЂРёРјРµСЂ: sber / alfa / tinkoff):', String(current.bank || '')) || '').trim();
      if (!bank) return notify('Р‘Р°РЅРє РЅРµ Р·Р°РґР°РЅ');
      const recipient = (window.prompt('РџРѕР»СѓС‡Р°С‚РµР»СЊ (РЅР°РїСЂРёРјРµСЂ: РђСЂСЃРµРЅРёР№ Рђ):', String(current.recipient || 'РђСЂСЃРµРЅРёР№ Рђ')) || '').trim();
      if (!recipient) return notify('РџРѕР»СѓС‡Р°С‚РµР»СЊ РЅРµ Р·Р°РґР°РЅ');
      await adminFetch('/api/admin/payment/settings', {
        method: 'POST',
        body: JSON.stringify({ phone, bank, recipient })
      });
      notify('Р РµРєРІРёР·РёС‚С‹ РѕРїР»Р°С‚С‹ СЃРѕС…СЂР°РЅРµРЅС‹');
    } catch (e) {
      notify('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ СЂРµРєРІРёР·РёС‚РѕРІ: ' + (e.message || 'payment_settings'));
    }
  });
}

const adminApprovePaymentBtn = document.getElementById('adminApprovePaymentBtn');
if (adminApprovePaymentBtn) {
  adminApprovePaymentBtn.addEventListener('click', async () => {
    const userId = document.getElementById('adminUserId').value.trim();
    if (!userId) return notify('Р’С‹Р±РµСЂРёС‚Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ');
    if (!window.confirm('РћРґРѕР±СЂРёС‚СЊ РїР»Р°С‚РµР¶ Рё РІС‹РґР°С‚СЊ 30 РґРЅРµР№?')) return;
    try {
      await adminFetch('/api/admin/payment/approve', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId })
      });
      notify('РџР»Р°С‚РµР¶ РѕРґРѕР±СЂРµРЅ');
      await loadAdminUsers();
      document.getElementById('adminUserId').value = userId;
      document.getElementById('adminUserId').dispatchEvent(new Event('change'));
    } catch (e) {
      notify('РћС€РёР±РєР°: ' + e.message);
    }
  });
}

const adminRejectPaymentBtn = document.getElementById('adminRejectPaymentBtn');
if (adminRejectPaymentBtn) {
  adminRejectPaymentBtn.addEventListener('click', async () => {
    const userId = document.getElementById('adminUserId').value.trim();
    if (!userId) return notify('Р’С‹Р±РµСЂРёС‚Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ');
    if (!confirmDanger('REJECT', 'РћС‚РєР»РѕРЅРёС‚СЊ РїР»Р°С‚РµР¶ Рё РѕРіСЂР°РЅРёС‡РёС‚СЊ РґРѕСЃС‚СѓРї?')) return;
    try {
      await adminFetch('/api/admin/payment/reject', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId })
      });
      notify('РџР»Р°С‚РµР¶ РѕС‚РєР»РѕРЅРµРЅ, РґРѕСЃС‚СѓРї РѕРіСЂР°РЅРёС‡РµРЅ');
      await loadAdminUsers();
      document.getElementById('adminUserId').value = userId;
      document.getElementById('adminUserId').dispatchEvent(new Event('change'));
    } catch (e) {
      notify('РћС€РёР±РєР°: ' + e.message);
    }
  });
}
document.getElementById('adminRestart').addEventListener('click', async () => {
  if (!confirmDanger('RESTART', 'РџРµСЂРµР·Р°РїСѓСЃРє Xray')) return;
  try {
    await adminFetch('/api/admin/xray/restart', { method: 'POST' });
    notify('Xray РїРµСЂРµР·Р°РїСѓС‰РµРЅ');
  } catch (e) {
    notify('РћС€РёР±РєР°');
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
  if (statusEl) statusEl.textContent = isOpen ? 'РѕС‚РєСЂС‹С‚Р°' : 'Р·Р°РєСЂС‹С‚Р°';
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
      if (!silent) notify('РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РїР°РЅРµР»Рё');
      return false;
    }

    if (!panelStatusSyncLostNotified && !silent) {
      notify('РЎРІСЏР·СЊ СЃ API РЅРµСЃС‚Р°Р±РёР»СЊРЅР°. РџРѕРІС‚РѕСЂРё С‡РµСЂРµР· РїР°СЂСѓ СЃРµРєСѓРЅРґ.');
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
      if (!silent) notify('РџР°РЅРµР»СЊ РѕС‚РєСЂС‹С‚Р° РЅР° 15 РјРёРЅСѓС‚');
      return true;
    }

    if (!silent) notify('РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ РїР°РЅРµР»СЊ. РџРѕРІС‚РѕСЂРё С‡РµСЂРµР· РїР°СЂСѓ СЃРµРєСѓРЅРґ.');
    await refreshPanelProxyState(true);
    return false;
  } catch (e) {
    if (e && (e.status === 401 || e.status === 403)) notify('РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РїР°РЅРµР»Рё');
    else notify('РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ РїР°РЅРµР»СЊ. РџСЂРѕРІРµСЂСЊ СЃРµС‚СЊ Рё РїРѕРІС‚РѕСЂРё.');
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
      notify('РЎРЅР°С‡Р°Р»Р° РѕС‚РєСЂРѕР№ РїР°РЅРµР»СЊ, Р·Р°С‚РµРј РїРµСЂРµС…РѕРґРё РїРѕ СЃСЃС‹Р»РєРµ.');
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
      notify('РџР°РЅРµР»СЊ Р·Р°РєСЂС‹С‚Р°');
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) notify('РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РїР°РЅРµР»Рё');
      else notify('РћС€РёР±РєР° Р·Р°РєСЂС‹С‚РёСЏ РїР°РЅРµР»Рё. РџРѕРІС‚РѕСЂРё РµС‰Рµ СЂР°Р·.');
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
    notify(`РќРѕРІС‹Р№ Р»РёРјРёС‚: ${r.max_users}`);
  } catch (e) {
    notify('РћС€РёР±РєР°');
  }
});
function adminErr(e, fallback = 'РћС€РёР±РєР°') {
  const msg = (e && e.message) ? e.message : fallback;
  notify(`${fallback}: ${msg}`);
}

document.getElementById('adminBan').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('РЈРєР°Р¶Рё Telegram ID');
  try {
    await adminFetch('/api/admin/user/ban', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ Р·Р°Р±Р°РЅРµРЅ');
    await loadAdminUsers(userId, true);
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
  } catch (e) {
    adminErr(e, 'РћС€РёР±РєР° Р±Р°РЅР°');
  }
});
document.getElementById('adminUnban').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('РЈРєР°Р¶Рё Telegram ID');
  try {
    await adminFetch('/api/admin/user/unban', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЂР°Р·Р±Р»РѕРєРёСЂРѕРІР°РЅ');
    await loadAdminUsers(userId, true);
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
  } catch (e) {
    adminErr(e, 'РћС€РёР±РєР° СЂР°Р·Р±Р°РЅР°');
  }
});
document.getElementById('adminDelete').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('РЈРєР°Р¶Рё Telegram ID');
  if (!confirmDanger('DELETE', `РЈРґР°Р»РµРЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ ${userId}`)) return;
  try {
    await adminFetch('/api/admin/user/delete', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СѓРґР°Р»РµРЅ');
    await loadAdminUsers('', true);
  } catch (e) {
    adminErr(e, 'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ');
  }
});

document.getElementById('adminTrial7').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Р’С‹Р±РµСЂРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ');
  try {
    await adminFetch('/api/admin/user/trial7', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Р’С‹РґР°РЅ trial 7 РґРЅРµР№');
    await loadAdminUsers(userId, true);
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
  } catch (e) {
    adminErr(e, 'РћС€РёР±РєР° trial');
  }
});
document.getElementById('adminExtend').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  const days = parseInt(document.getElementById('adminDays').value || '0', 10);
  if (!userId) return notify('Р’С‹Р±РµСЂРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ');
  if (!days || days < 1) return notify('РЈРєР°Р¶Рё РґРЅРё');
  try {
    await adminFetch('/api/admin/user/extend', { method: 'POST', body: JSON.stringify({ user_id: userId, days }) });
    notify(`РџСЂРѕРґР»РµРЅРѕ РЅР° ${days} РґРЅ.`);
    await loadAdminUsers(userId, true);
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
  } catch (e) {
    adminErr(e, 'РћС€РёР±РєР° РїСЂРѕРґР»РµРЅРёСЏ');
  }
});
document.getElementById('adminUnlimited').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Р’С‹Р±РµСЂРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ');
  try {
    await adminFetch('/api/admin/user/unlimited', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('Р’С‹РґР°РЅ РґРѕСЃС‚СѓРї Р±РµР· СЃСЂРѕРєР°');
    await loadAdminUsers(userId, true);
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
  } catch (e) {
    adminErr(e, 'РћС€РёР±РєР° РІС‹РґР°С‡Рё Р±РµР· СЃСЂРѕРєР°');
  }
});
document.getElementById('adminResetSub').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Р’С‹Р±РµСЂРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ');
  if (!confirmDanger('RESET', `РЎР±СЂРѕСЃ РїРѕРґРїРёСЃРєРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ ${userId}`)) return;
  try {
    await adminFetch('/api/admin/user/reset_subscription', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    notify('РџРѕРґРїРёСЃРєР° СЃР±СЂРѕС€РµРЅР°');
    await loadAdminUsers(userId, true);
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
  } catch (e) {
    adminErr(e, 'РћС€РёР±РєР° СЃР±СЂРѕСЃР° РїРѕРґРїРёСЃРєРё');
  }
});
document.getElementById('adminUsersRefresh').addEventListener('click', loadAdminUsers);
document.getElementById('adminUserId').addEventListener('change', () => {
  const userId = document.getElementById('adminUserId').value.trim();
  const meta = document.getElementById('adminUserMeta');
  const openBtn = document.getElementById('adminOpenTg');
  const actionsBox = document.getElementById('adminUserActions');
  const approveBtn = document.getElementById('adminApprovePaymentBtn');
  const rejectBtn = document.getElementById('adminRejectPaymentBtn');

  if (!userId || !adminUsersById[userId]) {
    meta.textContent = 'Р’С‹Р±РµСЂРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ, С‡С‚РѕР±С‹ СѓРІРёРґРµС‚СЊ РґРµС‚Р°Р»Рё РїРѕРґРїРёСЃРєРё.';
    openBtn.disabled = true;
    if (actionsBox) actionsBox.classList.add('hidden');
    return;
  }

  if (actionsBox) actionsBox.classList.remove('hidden');
  const u = adminUsersById[userId];

  if (approveBtn) {
    if (u.payment_status === 'pending_verification') approveBtn.classList.remove('hidden');
    else approveBtn.classList.add('hidden');
  }
  if (rejectBtn) {
    if (u.payment_status === 'pending_verification') rejectBtn.classList.remove('hidden');
    else rejectBtn.classList.add('hidden');
  }

  const expiry = u.expiry_human || (u.expiry ? u.expiry : 'Р‘РµР· СЃСЂРѕРєР°/РЅРµС‚');
  const days = Number(u.days_left);
  const daysText = Number.isFinite(days) ? `${days} РґРЅ` : 'вЂ”';
  const connected = Number(u.connected_devices || 0);
  const limit = Number(u.device_limit || 0);
  const ratio = `${connected}/${limit}`;
  const tierText = formatTierLabel(u.member_tier || 'regular');

  meta.classList.add('whitespace-pre-line');
  meta.textContent = [
    `РЎС‚Р°С‚СѓСЃ: ${u.status || 'none'}`,
    `РџРѕРґРїРёСЃРєР° РґРѕ: ${expiry}`,
    `РћСЃС‚Р°Р»РѕСЃСЊ: ${daysText}`,
    `РўР°СЂРёС„: ${u.tariff_name || 'вЂ”'} В· РЈСЃС‚СЂРѕР№СЃС‚РІР°: ${ratio}`,
    `РљР°С‚РµРіРѕСЂРёСЏ: ${tierText}`,
    `РўСЂР°С„РёРє: ${u.traffic_limit_gb || 0} GB/РјРµСЃ`
  ].join('\n');

  if (u.payment_status === 'pending_verification') {
    const paymentNotice = document.createElement('div');
    paymentNotice.className = 'mt-3 p-2 bg-yellow-900/30 border border-yellow-500 text-yellow-200 rounded-lg text-xs leading-5 whitespace-pre-line';
    paymentNotice.textContent = [
      'РЎР‘Рџ РџР›РђРўР•Р– РћР–РР”РђР•Рў РџР РћР’Р•Р РљР',
      `Р—Р°СЏРІР»РµРЅРЅР°СЏ СЃСѓРјРјР°: ${u.payment_amount || 0} в‚Ѕ`,
      `РџР»Р°С‚РµР»СЊС‰РёРє: ${u.payment_sender || 'вЂ”'}`,
      `РўР°СЂРёС„: ${u.payment_label || 'вЂ”'}`,
      `РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ (РњРЎРљ): ${u.payment_time_msk || 'вЂ”'}`,
      `Р РµРєРІРёР·РёС‚С‹: ${u.payment_bank || 'вЂ”'} В· ${u.payment_phone || 'вЂ”'} В· ${u.payment_recipient || 'вЂ”'}`
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
  if (!u) return notify('Р’С‹Р±РµСЂРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ');
  const link = u.tg_link || '';
  if (!link) return notify('РЈ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅРµС‚ username РІ Telegram');
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
  if (!email) return notify('РЈРєР°Р¶Рё РЅР°Р·РІР°РЅРёРµ/email РєР»РёРµРЅС‚Р°');
  try {
    await adminFetch('/api/admin/client/create', {
      method: 'POST',
      body: JSON.stringify({ email: email, tg_id: tgId || 'manual', limit: limit })
    });
    notify('РљР»РёРµРЅС‚ РґРѕР±Р°РІР»РµРЅ');
    document.getElementById('adminClientEmail').value = '';
    loadAdminClients();
  } catch (e) {
    notify('РћС€РёР±РєР°');
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
    notify('Р‘СЌРєР°Рї СЃРєР°С‡Р°РЅ');
  } catch (e) {
    notify('РћС€РёР±РєР°');
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
  box.textContent = 'Р—Р°РіСЂСѓР·РєР°...';
  try {
    const data = await adminFetch('/api/admin/clients');
    if (!data.items || data.items.length === 0) {
      box.textContent = 'РЎРїРёСЃРѕРє РїСѓСЃС‚';
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
      meta.textContent = `${item.online ? 'РћРЅР»Р°Р№РЅ' : 'РћС„Р»Р°Р№РЅ'} В· ${formatBytes(item.total || 0)}`;
      left.appendChild(name);
      left.appendChild(meta);

      const right = document.createElement('div');
      right.className = 'flex gap-2';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'border border-accent-red text-accent-red font-bold px-2 py-1 rounded-lg text-xs hover:bg-accent-red/10';
      deleteBtn.textContent = 'РЈРґР°Р»РёС‚СЊ';
      deleteBtn.addEventListener('click', async () => {
        if (!confirmDanger('DELETE', 'РЈРґР°Р»РµРЅРёРµ СѓСЃС‚СЂРѕР№СЃС‚РІР°: ' + (item.display_name || item.uuid))) return;
        try {
          await adminFetch('/api/admin/client/delete', {
            method: 'POST',
            body: JSON.stringify({ uuid: item.uuid })
          });
          notify('РЈСЃС‚СЂРѕР№СЃС‚РІРѕ СѓРґР°Р»РµРЅРѕ');
          loadAdminClients();
        } catch (e) {
          notify('РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ');
        }
      });
      right.appendChild(deleteBtn);

      const toggle = document.createElement('button');
      toggle.className = 'ios-active border border-primary text-primary font-bold px-2 py-1 rounded-lg text-xs';
      toggle.textContent = item.enable ? 'РћС‚РєР»' : 'Р’РєР»';
      toggle.addEventListener('click', async () => {
        try {
          await adminFetch('/api/admin/client/enable', {
            method: 'POST',
            body: JSON.stringify({ uuid: item.uuid, enable: !item.enable })
          });
          notify('РЎРѕС…СЂР°РЅРµРЅРѕ');
          loadAdminClients();
        } catch (e) {
          notify('РћС€РёР±РєР°');
        }
      });
      right.appendChild(toggle);

      row.appendChild(left);
      row.appendChild(right);
      box.appendChild(row);
    });
  } catch (e) {
    box.textContent = 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё';
  }
}

document.getElementById('adminClientsRefresh').addEventListener('click', loadAdminClients);
document.getElementById('adminSetOwn').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Р’С‹Р±РµСЂРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ');
  try {
    await adminFetch('/api/admin/user/tier', { method: 'POST', body: JSON.stringify({ user_id: userId, tier: 'own' }) });
    notify('РљР°С‚РµРіРѕСЂРёСЏ: РЎР’РћР™');
    await loadAdminUsers();
    document.getElementById('adminUserId').value = userId;
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
    if (String(userId) === String(USER_ID)) {
      loadTariffs();
      loadUser();
    }
  } catch (e) {
    notify(`РћС€РёР±РєР°: ${e.message || 'set_own'}`);
  }
});
document.getElementById('adminSetRegular').addEventListener('click', async () => {
  const userId = document.getElementById('adminUserId').value.trim();
  if (!userId) return notify('Р’С‹Р±РµСЂРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ');
  try {
    await adminFetch('/api/admin/user/tier', { method: 'POST', body: JSON.stringify({ user_id: userId, tier: 'regular' }) });
    notify('РљР°С‚РµРіРѕСЂРёСЏ: РћР±С‹С‡РЅС‹Р№');
    await loadAdminUsers();
    document.getElementById('adminUserId').value = userId;
    document.getElementById('adminUserId').dispatchEvent(new Event('change'));
    if (String(userId) === String(USER_ID)) {
      loadTariffs();
      loadUser();
    }
  } catch (e) {
    notify(`РћС€РёР±РєР°: ${e.message || 'set_regular'}`);
  }
});

async function loadAdminUsers(selectedId = '', silent = false) {
  const sel = document.getElementById('adminUserId');
  if (!sel) return;
  try {
    const data = await adminFetch('/api/admin/users');
    adminUsersById = {};
    const keepId = String(selectedId || sel.value || '').trim();
    sel.innerHTML = '<option value="">Р’С‹Р±РµСЂРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</option>';
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
      const subText = u.expiry_human ? ` РґРѕ ${u.expiry_human}` : '';
      const leftText = Number.isFinite(d) ? ` В· ${d}Рґ` : '';
      const ratioText = ` В· ${u.connected_devices || 0}/${u.device_limit || 0}`;
      let tierTag = '[РћР‘Р«Р§РќР«Р™]';
      const tier = String(u.member_tier || 'regular').toLowerCase();
      if (tier === 'own') tierTag = '[РЎР’РћР™]';
      if (tier === 'vip') tierTag = '[VIP]';
      opt.textContent = `${withId} ${tierTag} [${u.status}]${subText}${leftText}${ratioText}`;
      sel.appendChild(opt);
    });
    if (keepId && adminUsersById[keepId]) sel.value = keepId;
    document.getElementById('adminUserMeta').textContent = 'Р’С‹Р±РµСЂРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ, С‡С‚РѕР±С‹ СѓРІРёРґРµС‚СЊ РґРµС‚Р°Р»Рё РїРѕРґРїРёСЃРєРё.';
    document.getElementById('adminOpenTg').disabled = true;
    if (!silent) notify('РЎРїРёСЃРѕРє РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РѕР±РЅРѕРІР»РµРЅ');
  } catch (e) {
    adminErr(e, 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№');
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
      title: 'РњРѕРё РєР»СЋС‡Рё',
      text: 'Р—РґРµСЃСЊ С‚С‹ РїРѕР»СѓС‡Р°РµС€СЊ РґРѕСЃС‚СѓРї. РќР°Р¶РјРё В«РњРѕРё РєР»СЋС‡РёВ» -> В«Р”РѕР±Р°РІРёС‚СЊ СѓСЃС‚СЂРѕР№СЃС‚РІРѕВ» Рё Р·Р°Р±РµСЂРё СЃРІРѕР№ РєР»СЋС‡.'
    },
    {
      selector: '#buyBtn',
      title: 'РџРѕРґРґРµСЂР¶Р°С‚СЊ РїСЂРѕРµРєС‚',
      text: 'Р—РґРµСЃСЊ РІС‹Р±РёСЂР°РµС‚СЃСЏ С‚Р°СЂРёС„ Рё РїРѕРґС‚РІРµСЂР¶РґР°РµС‚СЃСЏ РїРµСЂРµРІРѕРґ. РџРѕСЃР»Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Р°РґРјРёРЅРѕРј РґРѕСЃС‚СѓРї РїСЂРѕРґР»РµРІР°РµС‚СЃСЏ.'
    },
    {
      selector: '#homeRefBtn',
      title: 'РџСЂРёРіР»Р°СЃРёС‚СЊ РІ РєР»СѓР±',
      text: 'РўСѓС‚ С‚РІРѕСЏ РёРЅРІР°Р№С‚-СЃСЃС‹Р»РєР°. РџСЂРёРіР»Р°С€Р°Р№ Р»СЋРґРµР№ Рё РїРѕР»СѓС‡Р°Р№ СЃРєРёРґРєСѓ РїРѕСЃР»Рµ РёС… РїРµСЂРІРѕР№ РѕРїР»Р°С‚С‹.'
    },
    {
      selector: '#homeDevicesBtn',
      title: 'РљР°Рє РїРѕРґРєР»СЋС‡РёС‚СЊ СЃРµСЂРІРёСЃ',
      text: '1) РЎРєР°С‡Р°Р№ РїСЂРёР»РѕР¶РµРЅРёРµ V2Ray-РєР»РёРµРЅС‚. 2) Р’ В«РњРѕРё РєР»СЋС‡РёВ» СЃРѕР·РґР°Р№ СѓСЃС‚СЂРѕР№СЃС‚РІРѕ. 3) РЎРєРѕРїРёСЂСѓР№ РєР»СЋС‡ Рё РІСЃС‚Р°РІСЊ РµРіРѕ РІ V2Ray.'
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
    nextBtn.textContent = idx === steps.length - 1 ? 'Р“РѕС‚РѕРІРѕ' : 'Р”Р°Р»РµРµ';

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

loadUser().then((loaded) => {
  if (loaded) setupFirstRunOnboarding('mini');
});
loadTariffs();

if (helpBtn) {
  helpBtn.addEventListener('click', () => setupFirstRunOnboarding('mini', true));
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
    sel.innerHTML = '<option value="">Р’С‹Р±РµСЂРёС‚Рµ РґРёР°Р»РѕРі</option>';
    adminSupportTickets.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.user_id;
      const unread = t.needs_reply ? ' [РќРћР’РћР•]' : '';
      opt.textContent = `${t.name}${unread}`;
      sel.appendChild(opt);
    });
    document.getElementById('adminSupportMessages').innerHTML = '<div class="text-center text-muted-gray text-xs mt-auto py-4">Р’С‹Р±РµСЂРёС‚Рµ РґРёР°Р»РѕРі РёР· СЃРїРёСЃРєР° РІС‹С€Рµ</div>';
    document.getElementById('adminSupportInput').disabled = true;
    document.getElementById('adminSupportSendBtn').disabled = true;
  } catch (e) {
    notify('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё С‚РёРєРµС‚РѕРІ');
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
    list.innerHTML = '<div class="text-center text-muted-gray text-xs mt-auto py-4">Р’С‹Р±РµСЂРёС‚Рµ РґРёР°Р»РѕРі РёР· СЃРїРёСЃРєР° РІС‹С€Рµ</div>';
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
    notify('РћС€РёР±РєР° РѕС‚РїСЂР°РІРєРё: ' + e.message);
  } finally {
    inp.disabled = false;
    adminSupBtn.disabled = false;
  }
});

document.querySelectorAll('.admin-tab-btn[data-tab="admin-tab-support"]').forEach(b => {
  b.addEventListener('click', loadAdminSupportTickets);
});






