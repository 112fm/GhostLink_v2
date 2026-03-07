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
  if (!API_BASE || !INIT_DATA) return Promise.resolve(false);
  return apiFetch('/api/user')
    .then(data => {
      CURRENT_USER_ID = Number((data.user && data.user.id) || CURRENT_USER_ID || 0);
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
      if (CURRENT_USER_ID === ADMIN_ID) {
        const adminBtn = document.getElementById('homeAdminBtn');
        adminBtn.classList.remove('hidden');
      }
      accessClosed = false;
      showScreen(stack[stack.length - 1] || 'screen-home');
      setTimeout(() => setupFirstRunOnboarding('mini'), 400);
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

    row.appendChild(left);
    row.appendChild(btn);

    const keyBox = document.createElement('div');
    keyBox.className = 'flex gap-2 mt-2 w-full';

    const keyInput = document.createElement('input');
    keyInput.className = 'flex-1 rounded-xl bg-black border border-white/20 text-muted-gray text-xs px-2 py-1 truncate';
    keyInput.value = item.key || 'Ключ недоступен';
    keyInput.readOnly = true;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'ios-active bg-primary text-black font-bold px-3 py-1 rounded-xl text-xs whitespace-nowrap';
    copyBtn.textContent = 'Копировать';
    copyBtn.addEventListener('click', async () => {
      if (!item.key) return;
      try {
        await navigator.clipboard.writeText(item.key);
        notify('Ключ скопирован');
      } catch (e) { }
    });

    keyBox.appendChild(keyInput);
    keyBox.appendChild(copyBtn);

    const container = document.createElement('div');
    container.className = 'flex flex-col py-2 border-b border-white/10';
    container.appendChild(row);
    container.appendChild(keyBox);

    box.appendChild(container);
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

let paymentSettings = { phone: '+79857719139', bank: 'alfa', recipient: 'Арсений А' };

async function loadPaymentSettings() {
  try {
    paymentSettings = await apiFetch('/api/payment/settings');
  } catch (e) {
    paymentSettings = { phone: '+79857719139', bank: 'alfa', recipient: 'Арсений А' };
  }
}

async function submitTrustPayment(amount, label) {
  await loadPaymentSettings();
  const phone = String(paymentSettings.phone || '+79857719139').trim();
  const bank = String(paymentSettings.bank || 'Банк').trim();
  const recipient = String(paymentSettings.recipient || 'Получатель').trim();

  const ok = window.confirm(
    `Оплата на доверии\n\nСумма: ${amount} ₽\nБанк: ${bank}\nНомер: ${phone}\nПолучатель: ${recipient}\n\nПосле перевода нажми OK.`
  );
  if (!ok) return;

  const sender = (window.prompt('Введи плательщика в формате Имя Ф (например Иван П):') || '').trim();
  if (!/^[A-Za-zА-Яа-яЁё]{2,}\s+[A-Za-zА-Яа-яЁё]$/u.test(sender)) {
    notify('Формат: Имя Ф (например Иван П)');
    return;
  }

  await apiFetch('/api/payment/report', {
    method: 'POST',
    body: JSON.stringify({ amount, sender_name: sender, payment_label: String(label || '') }),
  });

  notify('Платеж отмечен. Доступ продлен на 7 дней, проверка идет у администратора.');
  loadUser();
}

document.getElementById('soloPay').addEventListener('click', async () => {
  try {
    const amount = Number((tariffMap[1] || {}).price || 150);
    await submitTrustPayment(amount, 'Solo');
  } catch (e) {
    notify(`Ошибка: ${e.message || 'payment_report'}`);
  }
});

document.getElementById('flexPay').addEventListener('click', async () => {
  const devices = Math.max(2, Math.min(5, parseInt(flexSlider.value || '2', 10)));
  try {
    const amount = Number((tariffMap[devices] || {}).price || 225);
    await submitTrustPayment(amount, `Flex ${devices}`);
  } catch (e) {
    notify(`Ошибка: ${e.message || 'payment_report'}`);
  }
});

if (USER_ID === ADMIN_ID) {
  const adminBtn = document.getElementById('homeAdminBtn');
  adminBtn.classList.remove('hidden');
}
document.getElementById('homeAdminBtn').addEventListener('click', () => {
  if (CURRENT_USER_ID !== ADMIN_ID) return notify('Нет доступа');
  pushScreen('screen-admin');
  loadAdminUsers();
  loadAdminStats();
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
const adminPaymentSettingsBtn = document.getElementById('adminPaymentSettings');
if (adminPaymentSettingsBtn) {
  adminPaymentSettingsBtn.addEventListener('click', async () => {
    try {
      const current = await adminFetch('/api/payment/settings');
      const phone = (window.prompt('Номер для оплаты (СБП):', String(current.phone || '')) || '').trim();
      if (!phone) return notify('Номер не задан');
      const bank = (window.prompt('Банк (например: sber / alfa / tinkoff):', String(current.bank || '')) || '').trim();
      if (!bank) return notify('Банк не задан');
      const recipient = (window.prompt('Получатель (например: Арсений А):', String(current.recipient || 'Арсений А')) || '').trim();
      if (!recipient) return notify('Получатель не задан');
      await adminFetch('/api/admin/payment/settings', {
        method: 'POST',
        body: JSON.stringify({ phone, bank, recipient })
      });
      notify('Реквизиты оплаты сохранены');
    } catch (e) {
      notify('Ошибка сохранения реквизитов: ' + (e.message || 'payment_settings'));
    }
  });
}

const adminApprovePaymentBtn = document.getElementById('adminApprovePaymentBtn');
if (adminApprovePaymentBtn) {
  adminApprovePaymentBtn.addEventListener('click', async () => {
    const userId = document.getElementById('adminUserId').value.trim();
    if (!userId) return notify('Выберите пользователя');
    if (!window.confirm('Одобрить платеж и выдать 30 дней?')) return;
    try {
      await adminFetch('/api/admin/payment/approve', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId })
      });
      notify('Платеж одобрен');
      await loadAdminUsers();
      document.getElementById('adminUserId').value = userId;
      document.getElementById('adminUserId').dispatchEvent(new Event('change'));
    } catch (e) {
      notify('Ошибка: ' + e.message);
    }
  });
}

const adminRejectPaymentBtn = document.getElementById('adminRejectPaymentBtn');
if (adminRejectPaymentBtn) {
  adminRejectPaymentBtn.addEventListener('click', async () => {
    const userId = document.getElementById('adminUserId').value.trim();
    if (!userId) return notify('Выберите пользователя');
    if (!confirmDanger('REJECT', 'Отклонить платеж и ограничить доступ?')) return;
    try {
      await adminFetch('/api/admin/payment/reject', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId })
      });
      notify('Платеж отклонен, доступ ограничен');
      await loadAdminUsers();
      document.getElementById('adminUserId').value = userId;
      document.getElementById('adminUserId').dispatchEvent(new Event('change'));
    } catch (e) {
      notify('Ошибка: ' + e.message);
    }
  });
}
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
    const ipRes = await adminFetch('/api/admin/myip');
    const ip = String((ipRes || {}).ip || '').trim();
    if (!ip) throw new Error('ip_not_detected');

    await adminFetch('/api/admin/panel/unlock', {
      method: 'POST',
      body: JSON.stringify({ ip })
    });

    const res = await adminFetch('/api/admin/proxy_auth', { method: 'POST', body: JSON.stringify({}) });
    if (res && res.ok) {
      const proxyLinkDiv = document.getElementById('adminProxyLink');
      const proxyLinkAnchor = proxyLinkDiv ? proxyLinkDiv.querySelector('a') : null;
      const panelUrl = String((res.panel_url || '').trim());
      const proxyUrl = String((res.proxy_url || '').trim());
      const href = panelUrl || proxyUrl || (API_BASE + '/panel/');
      if (proxyLinkAnchor) proxyLinkAnchor.href = href;
      if (proxyLinkDiv) proxyLinkDiv.classList.remove('hidden');
      notify('Панель открыта для твоего IP. Можешь переходить.');
    }
  } catch (e) {
    notify('Ошибка открытия панели: ' + (e.message || 'unknown'));
  }
});

const adminPanelLockBtn = document.getElementById('adminPanelLockBtn');
if (adminPanelLockBtn) {
  adminPanelLockBtn.addEventListener('click', async () => {
    try {
      const r = await adminFetch('/api/admin/panel/lock', { method: 'POST' });
      const proxyLinkDiv = document.getElementById('adminProxyLink');
      if (proxyLinkDiv) proxyLinkDiv.classList.add('hidden');
      notify((r && r.message) ? r.message : 'Панель закрыта');
    } catch (e) {
      notify('Ошибка закрытия панели: ' + (e.message || 'unknown'));
    }
  });
}
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
  const actionsBox = document.getElementById('adminUserActions');
  const approveBtn = document.getElementById('adminApprovePaymentBtn');
  const rejectBtn = document.getElementById('adminRejectPaymentBtn');

  if (!userId || !adminUsersById[userId]) {
    meta.textContent = 'Выбери пользователя, чтобы увидеть детали подписки.';
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
    }
  } catch (e) {
    notify(`Ошибка: ${e.message || 'set_regular'}`);
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

function setupFirstRunOnboarding(appLabel, forceShow = false) {
  const overlay = document.getElementById('onboardingOverlay');
  const title = document.getElementById('onboardingTitle');
  const text = document.getElementById('onboardingText');
  const nextBtn = document.getElementById('onboardingNext');
  const skipBtn = document.getElementById('onboardingSkip');
  if (!overlay || !title || !text || !nextBtn || !skipBtn) return;

  const key = `ghost_onboarding_done_${appLabel}`;
  if (!forceShow && localStorage.getItem(key) === '1') return;

  const steps = [
    {
      title: 'Добро пожаловать в GhostLink',
      text: 'Это личный кабинет в Telegram для управления доступом и ключами.'
    },
    {
      title: 'Где взять ключ',
      text: 'Открой "Мои ключи" -> "Добавить устройство". Ключ скопируется автоматически.'
    },
    {
      title: 'Что делать дальше',
      text: 'Вставь ключ в V2RayTun. Для оплаты используй "Поддержать проект", для вопросов — "Поддержка".'
    }
  ];

  let idx = 0;
  const render = () => {
    title.textContent = steps[idx].title;
    text.textContent = steps[idx].text;
    nextBtn.textContent = idx === steps.length - 1 ? 'Готово' : 'Далее';
  };

  const finish = () => {
    localStorage.setItem(key, '1');
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
  render();
}

loadUser();
loadTariffs();

const helpBtn = document.getElementById('helpBtn');
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


