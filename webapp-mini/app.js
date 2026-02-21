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

      backBtn.addEventListener('click', popScreen);

      const tg = window.Telegram ? Telegram.WebApp : null;
      if (tg) tg.ready();

      const API_BASE = "https://api.112prd.ru:2053";
      const INIT_DATA = tg ? tg.initData : '';
      const ADMIN_ID = 312826672;
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
        } catch (e) {}
        return 0;
      }
      const USER_ID = extractUserId();

      function apiFetch(path, options = {}) {
        if (!API_BASE) return Promise.reject(new Error('no_api'));
        return fetch(API_BASE + path, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-InitData': INIT_DATA,
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
        if (!API_BASE || !INIT_DATA) return;
        apiFetch('/api/user')
          .then(data => {
            document.getElementById('balanceValue').textContent = (data.balance || 0) + '₽';
            document.getElementById('expiryValue').textContent = formatSubLine(data.subscription);
            setSubStatus(data.subscription.active);
            document.getElementById('profileName').textContent = data.user.name || 'Пользователь';
            document.getElementById('profileId').textContent = 'ID: ' + data.user.id;
            document.getElementById('deviceLimit').textContent = data.device_limit || 3;
            currentTier = data.member_tier || currentTier;
            const dc = document.getElementById('deviceCount');
            if (dc) dc.textContent = '—';
            document.getElementById('refLink').textContent = data.referral_link || 'нет ссылки';
            document.getElementById('discountValue').textContent = data.discount_text || ((data.discount || 0) + ' ₽');
            supportUrl = data.support_link || 'https://t.me/ghostlink112_bot';
            const supportLink = document.getElementById('supportLink');
            supportLink.href = supportUrl;
            renderTariffs();
          })
          .catch((err) => {
            if (err && (err.status === 401 || err.status === 403)) {
              accessClosed = true;
              showScreen('screen-locked');
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
      document.getElementById('profileBtn').addEventListener('click', () => pushScreen('screen-profile'));
      document.getElementById('supportBtn').addEventListener('click', () => pushScreen('screen-support'));

      document.getElementById('profilePayBtn').addEventListener('click', () => pushScreen('screen-tariffs'));
      document.getElementById('profileRefBtn').addEventListener('click', () => { pushScreen('screen-ref'); loadReferrals(); });
      document.getElementById('profileSupportBtn').addEventListener('click', () => pushScreen('screen-support'));
      document.getElementById('profileRulesBtn').addEventListener('click', () => pushScreen('screen-rules'));
      document.getElementById('profileDevicesBtn').addEventListener('click', () => { pushScreen('screen-devices'); loadDevices(); });

      document.getElementById('copyRefBtn').addEventListener('click', async () => {
        const text = document.getElementById('refLink').textContent;
        try { await navigator.clipboard.writeText(text); } catch (e) {}
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
              row.innerHTML = `<span>${item.name}</span><span class="text-muted-gray">${status}</span>`;
              box.appendChild(row);
            });
          })
          .catch(() => {});
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
          box.appendChild(row);
        });
      }

      function loadDevices() {
        apiFetch('/api/device/list')
          .then((data) => {
            document.getElementById('deviceLimit').textContent = data.device_limit || 0;
            document.getElementById('deviceCount').textContent = data.connected || 0;
            renderDeviceList(data.items || []);
          })
          .catch(() => {
            const box = document.getElementById('deviceList');
            box.textContent = 'Не удалось загрузить устройства.';
          });
      }

      document.getElementById('addDeviceBtn').addEventListener('click', async () => {
        try {
          const res = await apiFetch('/api/device/add', { method: 'POST' });
          if (res.key) {
            await navigator.clipboard.writeText(res.key).catch(() => {});
            notify('Ключ нового устройства скопирован');
          } else {
            notify('Устройство добавлено');
          }
          loadDevices();
        } catch (e) {
          if (e && e.message === 'device_limit_reached') notify('Достигнут лимит устройств');
          else notify('Не удалось добавить устройство');
        }
      });

      document.getElementById('resetDeviceBtn').addEventListener('click', () => {
        if (!confirmDanger('RESET', 'Сброс ключа устройства')) return;
        apiFetch('/api/device/reset', { method: 'POST' })
          .then((res) => {
            if (res.key) {
              navigator.clipboard.writeText(res.key).catch(() => {});
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
          loadDevices();
          loadTariffs();
        } catch (e) {
          notify(`Ошибка: ${e.message || 'subscribe'}`);
        }
      });

      if (USER_ID === ADMIN_ID) {
        const adminBtn = document.getElementById('homeAdminBtn');
        adminBtn.classList.remove('hidden');
        adminBtn.addEventListener('click', () => {
          pushScreen('screen-admin');
          loadAdminUsers();
        });
      }

      document.getElementById('adminStats').addEventListener('click', async () => {
        try {
          const data = await adminFetch('/api/admin/stats');
          notify('Статистика обновлена');
          const box = document.getElementById('adminStatsBox');
          box.textContent = `ОЗУ: ${data.free_mem_mb} MB | Онлайн: ${data.online.length} | Места: ${data.total}/${data.max_users}`;
        } catch (e) {
          notify('Ошибка');
        }
      });
      document.getElementById('adminOnline').addEventListener('click', async () => {
        try {
          const data = await adminFetch('/api/admin/stats');
          const box = document.getElementById('adminOnlineList');
          box.innerHTML = '';
          if (!data.online || data.online.length === 0) {
            box.textContent = 'Онлайн: 0';
          } else {
            data.online.forEach((name) => {
              const row = document.createElement('div');
              row.className = 'py-1 border-b border-white/10';
              row.textContent = `• ${name}`;
              box.appendChild(row);
            });
          }
          notify('Список онлайн обновлен');
        } catch (e) {
          notify('Ошибка');
        }
      });
      document.getElementById('adminRestart').addEventListener('click', async () => {
        if (!confirmDanger('RESTART', 'Перезапуск Xray')) return;
        try {
          await adminFetch('/api/admin/xray/restart', { method: 'POST' });
          notify('Xray перезапущен');
        } catch (e) {
          notify('Ошибка');
        }
      });
      document.getElementById('adminLock').addEventListener('click', async () => {
        try {
          const r = await adminFetch('/api/admin/panel/lock', { method: 'POST' });
          if (!r.ok) throw new Error(r.message || 'panel_lock_failed');
          notify(r.message || 'Панель закрыта');
        } catch (e) {
          notify(`Ошибка: ${e.message || 'panel_lock'}`);
        }
      });
      document.getElementById('adminUnlock').addEventListener('click', async () => {
        const ip = document.getElementById('adminIp').value.trim();
        if (!ip) return notify('Укажи IP');
        try {
          const r = await adminFetch('/api/admin/panel/unlock', { method: 'POST', body: JSON.stringify({ ip }) });
          if (!r.ok) throw new Error(r.message || 'panel_unlock_failed');
          notify(r.message || 'Панель открыта');
        } catch (e) {
          notify(`Ошибка: ${e.message || 'panel_unlock'}`);
        }
      });
      document.getElementById('adminIpShow').addEventListener('click', async () => {
        try {
          const r = await adminFetch('/api/admin/myip');
          notify(`Твой IP: ${r.ip || '-'}`);
          if (r.ip) document.getElementById('adminIp').value = r.ip;
        } catch (e) {
          notify('Ошибка');
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

      loadUser();
      loadTariffs();
