import { apiFetch, getApiBase } from "../api/client.js";

function setStatus(node, text, isError = false) {
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("text-accent-red", isError);
  node.classList.toggle("text-muted-gray", !isError);
}

function mapApiError(error) {
  const status = Number(error?.status || 0);
  const detail = String(error?.message || error?.data?.detail || "").trim();

  if (status === 401) return "Сессия истекла. Открой mini app заново из Telegram.";
  if (status === 403) return "Нет доступа к админке.";
  if (status === 404) return "Данные не найдены.";
  if (status === 409) return "Действие уже выполнено или конфликт состояния.";
  if (status === 429) return "Слишком много запросов. Попробуй позже.";
  if (detail) return `Ошибка: ${detail}`;
  return "Ошибка сети. Попробуй еще раз.";
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  if (value >= gb) return `${(value / gb).toFixed(2)} GB`;
  if (value >= mb) return `${(value / mb).toFixed(1)} MB`;
  if (value >= kb) return `${(value / kb).toFixed(1)} KB`;
  return `${Math.floor(value)} B`;
}

function openExternalLink(url) {
  const tg = window.Telegram?.WebApp;
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function createAdminModule(options = {}) {
  const tgInitData = String(options.telegramInitData || "");
  const previewMode = Boolean(options.previewMode);

  const refs = {
    root: document.getElementById("screen-admin"),
    status: document.getElementById("adminStatusText"),
    tabButtons: Array.from(document.querySelectorAll("[data-admin-tab]")),
    tabPanes: Array.from(document.querySelectorAll("[data-admin-pane]")),

    dashOnline: document.getElementById("adminDashOnline"),
    dashOffline: document.getElementById("adminDashOffline"),
    dashActivePct: document.getElementById("adminDashActivePct"),
    dashTraffic: document.getElementById("adminDashTraffic"),
    dashRam: document.getElementById("adminDashRam"),
    dashRamGauge: document.getElementById("adminDashRamGauge"),
    dashBotStarts: document.getElementById("adminDashBotStarts"),
    dashProfilesCreated: document.getElementById("adminDashProfilesCreated"),
    dashFirstPaid: document.getElementById("adminDashFirstPaid"),
    dashExpiringSoon: document.getElementById("adminDashExpiringSoon"),
    dashBlacklisted: document.getElementById("adminDashBlacklisted"),
    dashDevicesTotal: document.getElementById("adminDashDevicesTotal"),
    dashExpiringCard: document.getElementById("adminDashExpiringCard"),
    growthFilterButtons: Array.from(document.querySelectorAll("[data-growth-period]")),
    dashRefreshBtn: document.getElementById("adminDashRefreshBtn"),

    usersRefreshBtn: document.getElementById("adminUsersRefreshBtn"),
    usersSelect: document.getElementById("adminUsersSelect"),
    userTierBadge: document.getElementById("adminUserTierBadge"),
    userName: document.getElementById("adminUserName"),
    userIdLine: document.getElementById("adminUserIdLine"),
    userDaysLeft: document.getElementById("adminUserDaysLeft"),
    userInviter: document.getElementById("adminUserInviter"),
    userTraffic: document.getElementById("adminUserTraffic"),
    userDevicesRatio: document.getElementById("adminUserDevicesRatio"),
    userStatusLine: document.getElementById("adminUserStatusLine"),
    userLimitBadge: document.getElementById("adminUserLimitBadge"),
    userKeysList: document.getElementById("adminUserKeysList"),
    userTierRegularBtn: document.getElementById("adminUserTierRegularBtn"),
    userTierOwnBtn: document.getElementById("adminUserTierOwnBtn"),
    userTierVipBtn: document.getElementById("adminUserTierVipBtn"),
    userExtendBtn: document.getElementById("adminUserExtendBtn"),
    userUnlimitedBtn: document.getElementById("adminUserUnlimitedBtn"),
    userResetSubBtn: document.getElementById("adminUserResetSubBtn"),
    userBanBtn: document.getElementById("adminUserBanBtn"),
    userUnbanBtn: document.getElementById("adminUserUnbanBtn"),
    userDeleteBtn: document.getElementById("adminUserDeleteBtn"),
    userMessageInput: document.getElementById("adminUserMessageInput"),
    userMessageBtn: document.getElementById("adminUserMessageBtn"),

    clientsRefreshBtn: document.getElementById("adminClientsRefreshBtn"),
    clientsSearchInput: document.getElementById("adminClientsSearchInput"),
    clientsOnlineCount: document.getElementById("adminClientsOnlineCount"),
    clientsOfflineCount: document.getElementById("adminClientsOfflineCount"),
    clientsDisabledCount: document.getElementById("adminClientsDisabledCount"),
    clientsList: document.getElementById("adminClientsList"),

    payPhoneInput: document.getElementById("adminPayPhone"),
    payBankInput: document.getElementById("adminPayBank"),
    payRecipientInput: document.getElementById("adminPayRecipient"),
    payPreviewPhone: document.getElementById("adminPayPreviewPhone"),
    payPreviewBank: document.getElementById("adminPayPreviewBank"),
    payPreviewRecipient: document.getElementById("adminPayPreviewRecipient"),
    payLoadBtn: document.getElementById("adminPayLoadBtn"),
    paySaveBtn: document.getElementById("adminPaySaveBtn"),
    payHistoryRefreshBtn: document.getElementById("adminPayHistoryRefreshBtn"),
    payHistoryList: document.getElementById("adminPayHistoryList"),
    partnerTgIdInput: document.getElementById("adminPartnerTgId"),
    partnerCodeInput: document.getElementById("adminPartnerCode"),
    partnerCreateBtn: document.getElementById("adminPartnerCreateBtn"),
    partnerRotateBtn: document.getElementById("adminPartnerRotateBtn"),
    partnerRefreshBtn: document.getElementById("adminPartnerRefreshBtn"),
    partnerLink: document.getElementById("adminPartnerLink"),
    partnerCopyBtn: document.getElementById("adminPartnerCopyBtn"),
    partnerTotal: document.getElementById("adminPartnerTotal"),
    partnerPaid: document.getElementById("adminPartnerPaid"),
    partnerAuto: document.getElementById("adminPartnerAuto"),
    partnerManual: document.getElementById("adminPartnerManual"),
    partnerUsersList: document.getElementById("adminPartnerUsersList"),

    panelStatus: document.getElementById("adminPanelStatus"),
    panelOpenBtn: document.getElementById("adminPanelOpenBtn"),
    panelCloseBtn: document.getElementById("adminPanelCloseBtn"),
    panelRefreshBtn: document.getElementById("adminPanelRefreshBtn"),

    roleTgIdInput: document.getElementById("adminRoleTgIdInput"),
    roleSelect: document.getElementById("adminRoleSelect"),
    roleSetBtn: document.getElementById("adminRoleSetBtn"),
    roleRefreshBtn: document.getElementById("adminRoleRefreshBtn"),
    rolesList: document.getElementById("adminRolesList"),

    sysRestartBtn: document.getElementById("adminSystemRestartBtn"),
    sysBackupBtn: document.getElementById("adminSystemBackupBtn"),
  };

  if (!refs.root) {
    return { open: async () => {} };
  }

  const state = {
    tab: "dashboard",
    growthPeriod: "1m",
    users: [],
    usersById: {},
    selectedUserId: "",
    clients: [],
    clientsQuery: "",
    userSlots: [],
    panelOpenPreview: false,
    paymentPreview: {
      phone: "+7 (900) 000-00-00",
      bank: "Т-Банк",
      recipient: "Иван И.",
    },
    roles: [],
    paymentHistory: [],
    partnerInvite: null,
    partnerAnalytics: { items: [], total: 0, paid: 0, auto_accepted: 0, manual_moderation: 0 },
    loadedTabs: {},
  };
  let dashboardAutoTimer = null;

  const previewGrowthByPeriod = {
    "1m": { botStarts: 124, profilesCreated: 71, payments: 64 },
    "3m": { botStarts: 338, profilesCreated: 194, payments: 178 },
    all: { botStarts: 1160, profilesCreated: 702, payments: 812 },
  };

  const previewUsers = [
    {
      id: "1001",
      name: "Артем",
      tg_username: "artem_test",
      ref_by: "—",
      member_tier: "regular",
      status: "active",
      days_left: 24,
      connected_devices: 2,
      device_limit: 2,
      devices_ratio: "2/2",
      up: 325000000,
      down: 1240000000,
    },
    {
      id: "1002",
      name: "Никита",
      tg_username: "nik_own",
      ref_by: "1001",
      member_tier: "own",
      status: "active",
      days_left: 67,
      connected_devices: 3,
      device_limit: 5,
      devices_ratio: "3/5",
      up: 1250000000,
      down: 3860000000,
    },
  ];

  const previewClients = [
    { uuid: "cl-1001-1", email: "1001_iphone", online: true, enable: true, tg_id: "1001" },
    { uuid: "cl-1001-2", email: "1001_mac", online: false, enable: true, tg_id: "1001" },
    { uuid: "cl-1002-1", email: "1002_android", online: true, enable: true, tg_id: "1002" },
    { uuid: "cl-1002-2", email: "1002_tv", online: false, enable: false, tg_id: "1002" },
  ];

  const previewSlotsByUser = {
    "1001": [
      {
        slot: 1,
        status: "active",
        online: true,
        enabled: true,
        email: "1001_iphone",
        uuid: "cl-1001-1",
        up: 145000000,
        down: 560000000,
        subscription_url: "https://demo.ghostlink.tech/sub/1001/key1",
        vless_key: "vless://demo-key-user1001-1",
      },
      {
        slot: 2,
        status: "active",
        online: false,
        enabled: true,
        email: "1001_mac",
        uuid: "cl-1001-2",
        up: 180000000,
        down: 680000000,
        subscription_url: "https://demo.ghostlink.tech/sub/1001/key2",
        vless_key: "vless://demo-key-user1001-2",
      },
    ],
    "1002": [
      {
        slot: 1,
        status: "active",
        online: true,
        enabled: true,
        email: "1002_android",
        uuid: "cl-1002-1",
        up: 640000000,
        down: 1410000000,
        subscription_url: "https://demo.ghostlink.tech/sub/1002/key1",
        vless_key: "vless://demo-key-user1002-1",
      },
      {
        slot: 2,
        status: "active",
        online: false,
        enabled: true,
        email: "1002_tv",
        uuid: "cl-1002-2",
        up: 190000000,
        down: 920000000,
        subscription_url: "https://demo.ghostlink.tech/sub/1002/key2",
        vless_key: "vless://demo-key-user1002-2",
      },
      { slot: 3, status: "empty" },
      { slot: 4, status: "empty" },
      { slot: 5, status: "empty" },
    ],
  };

  const previewRoles = [
    { tg_id: "123456789", role: "owner", source: "env" },
    { tg_id: "1001", role: "admin", source: "meta" },
    { tg_id: "1002", role: "moderator", source: "meta" },
  ];

  const previewPaymentHistory = [
    {
      id: 1,
      ts: "2026-04-29T12:00:00Z",
      actor_tg_id: "123456789",
      role: "owner",
      old: { phone: "+7 (999) 111-22-33", bank: "Т-Банк", recipient: "Иван И." },
      new: { phone: "+7 (999) 111-22-33", bank: "Сбер", recipient: "Иван И." },
    },
    {
      id: 2,
      ts: "2026-04-28T19:40:00Z",
      actor_tg_id: "1001",
      role: "admin",
      old: { phone: "+7 (999) 111-22-33", bank: "Т-Банк", recipient: "Иван И." },
      new: { phone: "+7 (900) 333-44-55", bank: "Т-Банк", recipient: "Иван И." },
    },
  ];

  const previewPartnerInvite = {
    invite: {
      partner_tg_id: "747212726",
      partner_code: "kkkk8kkkkk",
      telegram_start_link: "https://t.me/GhostLinkBot?start=PreviewPartnerToken1",
      auto_accept_limit: 20,
      trial_days: 10,
    },
    analytics: {
      total: 7,
      paid: 3,
      auto_accepted: 7,
      manual_moderation: 0,
      items: [
        { tg_id: "9001", telegram_id: "9001", username: "@neo", name: "Neo", status: "active", is_paid: true, auto_accepted: true },
        { tg_id: "9002", telegram_id: "9002", username: "@trinity", name: "Trinity", status: "trial", is_paid: false, auto_accepted: true },
        { tg_id: "9003", telegram_id: "9003", username: "", name: "ID 9003", status: "pending", is_paid: false, auto_accepted: true },
      ],
    },
  };

  function asNum(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function pickNum(source, keys, fallback = 0) {
    for (const key of keys) {
      const value = asNum(source?.[key], NaN);
      if (Number.isFinite(value)) return value;
    }
    return fallback;
  }

  function setRamGauge(usedGb, totalGb) {
    if (!refs.dashRam || !refs.dashRamGauge) return;
    const safeTotal = Math.max(0.001, asNum(totalGb, 0.001));
    const safeUsed = Math.max(0, asNum(usedGb, 0));
    const pct = Math.max(0, Math.min(100, Math.round((safeUsed / safeTotal) * 100)));
    refs.dashRam.textContent = `${safeUsed.toFixed(1)} / ${safeTotal.toFixed(1)} GB`;
    refs.dashRamGauge.style.setProperty("--p", String(pct));
  }

  function setGrowthFilterActive(period) {
    refs.growthFilterButtons.forEach((btn) => {
      const active = String(btn.dataset.growthPeriod || "") === period;
      btn.classList.toggle("admin-growth-filter-btn-active", active);
    });
  }

  function formatPhoneRu(input) {
    const digits = String(input || "").replace(/\D/g, "");
    let core = digits;
    if (core.startsWith("8")) core = `7${core.slice(1)}`;
    if (!core.startsWith("7")) core = `7${core}`;
    core = core.slice(0, 11);
    const parts = core.slice(1);
    const p1 = parts.slice(0, 3);
    const p2 = parts.slice(3, 6);
    const p3 = parts.slice(6, 8);
    const p4 = parts.slice(8, 10);
    let out = "+7";
    if (p1) out += ` (${p1}`;
    if (p1.length === 3) out += ")";
    if (p2) out += ` ${p2}`;
    if (p3) out += `-${p3}`;
    if (p4) out += `-${p4}`;
    return out;
  }

  function updatePayPreview() {
    const phone = String(refs.payPhoneInput?.value || "").trim();
    const bank = String(refs.payBankInput?.value || "").trim();
    const recipient = String(refs.payRecipientInput?.value || "").trim();
    if (refs.payPreviewPhone) refs.payPreviewPhone.textContent = phone || "—";
    if (refs.payPreviewBank) refs.payPreviewBank.textContent = bank || "—";
    if (refs.payPreviewRecipient) refs.payPreviewRecipient.textContent = recipient || "—";
  }

  function fmtDateTime(iso) {
    const ts = String(iso || "").trim();
    if (!ts) return "—";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  }

  function partnerIdentity() {
    const tgId = String(refs.partnerTgIdInput?.value || "").replace(/\D/g, "").trim();
    const rawCode = String(refs.partnerCodeInput?.value || "").trim();
    const partnerCode = rawCode || tgId;
    return { tgId, partnerCode };
  }

  function renderPartnerUsers() {
    if (!refs.partnerUsersList) return;
    refs.partnerUsersList.innerHTML = "";
    const items = Array.isArray(state.partnerAnalytics?.items) ? state.partnerAnalytics.items : [];
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "rounded-xl border border-white/10 bg-black/30 px-3 py-2";
      empty.textContent = "Пока никого нет.";
      refs.partnerUsersList.appendChild(empty);
      return;
    }

    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "admin-partner-user-item";

      const head = document.createElement("div");
      head.className = "admin-partner-user-head";

      const left = document.createElement("div");
      const name = document.createElement("div");
      name.className = "admin-partner-user-name";
      name.textContent = String(item?.name || item?.username || `ID ${String(item?.tg_id || item?.telegram_id || "—")}`);

      const meta = document.createElement("div");
      meta.className = "admin-partner-user-meta";
      const tgId = String(item?.tg_id || item?.telegram_id || "—").trim();
      const username = String(item?.username || "—").trim() || "—";
      const status = String(item?.status || "—").trim() || "—";
      meta.textContent = `TG ID: ${tgId} · username: ${username} · статус: ${status}`;

      left.appendChild(name);
      left.appendChild(meta);

      const badge = document.createElement("span");
      const paid = Boolean(item?.is_paid);
      badge.className = `admin-partner-user-badge ${paid ? "paid" : "pending"}`;
      badge.textContent = paid ? "Оплатил" : "Без оплаты";

      head.appendChild(left);
      head.appendChild(badge);
      row.appendChild(head);
      refs.partnerUsersList.appendChild(row);
    });
  }

  function renderPartnerState() {
    const invite = state.partnerInvite || {};
    const analytics = state.partnerAnalytics || {};
    if (refs.partnerLink) {
      refs.partnerLink.textContent = String(invite?.telegram_start_link || "").trim() || "Ссылка еще не создана.";
    }
    if (refs.partnerTotal) refs.partnerTotal.textContent = String(Number(analytics?.total || 0));
    if (refs.partnerPaid) refs.partnerPaid.textContent = String(Number(analytics?.paid || 0));
    if (refs.partnerAuto) refs.partnerAuto.textContent = String(Number(analytics?.auto_accepted || 0));
    if (refs.partnerManual) refs.partnerManual.textContent = String(Number(analytics?.manual_moderation || 0));
    renderPartnerUsers();
  }

  function renderRoles() {
    if (!refs.rolesList) return;
    refs.rolesList.innerHTML = "";
    const items = Array.isArray(state.roles) ? state.roles : [];
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "rounded-xl border border-white/10 bg-card-dark px-3 py-2 text-muted-gray";
      empty.textContent = "Ролей пока нет.";
      refs.rolesList.appendChild(empty);
      return;
    }

    items.forEach((item) => {
      const tgId = String(item?.tg_id || "").trim() || "—";
      const role = String(item?.role || "admin").trim().toLowerCase();
      const source = String(item?.source || "").trim();

      const row = document.createElement("div");
      row.className = "admin-role-item";

      const meta = document.createElement("div");
      meta.className = "admin-role-meta";
      const id = document.createElement("div");
      id.className = "admin-role-id";
      id.textContent = tgId;
      const src = document.createElement("div");
      src.className = "text-xs text-muted-gray";
      src.textContent = source ? `Источник: ${source}` : "";
      meta.appendChild(id);
      meta.appendChild(src);

      const controls = document.createElement("div");
      controls.className = "flex items-center gap-2";
      const badge = document.createElement("span");
      badge.className = `admin-role-badge ${role}`;
      badge.textContent = role;
      controls.appendChild(badge);

      if (role !== "owner") {
        const removeBtn = document.createElement("button");
        removeBtn.className = "ios-active admin-role-remove-btn";
        removeBtn.textContent = "Снять";
        removeBtn.addEventListener("click", async () => {
          const yes = window.confirm(`Снять роль у ${tgId}?`);
          if (!yes) return;
          setStatus(refs.status, "Снимаю роль...");
          try {
            await apiFetch("/api/admin/access/roles/remove", {
              method: "POST",
              body: JSON.stringify({ tg_id: tgId }),
            });
            setStatus(refs.status, "Роль снята.");
            await loadRoles();
          } catch (error) {
            setStatus(refs.status, mapApiError(error), true);
          }
        });
        controls.appendChild(removeBtn);
      }

      row.appendChild(meta);
      row.appendChild(controls);
      refs.rolesList.appendChild(row);
    });
  }

  function renderPaymentHistory() {
    if (!refs.payHistoryList) return;
    refs.payHistoryList.innerHTML = "";
    const items = Array.isArray(state.paymentHistory) ? state.paymentHistory : [];
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "rounded-xl border border-white/10 bg-black/30 px-3 py-2";
      empty.textContent = "История пуста.";
      refs.payHistoryList.appendChild(empty);
      return;
    }

    items.forEach((item) => {
      const oldV = item?.old || {};
      const newV = item?.new || {};
      const row = document.createElement("div");
      row.className = "admin-pay-history-item";
      row.innerHTML = `
        <div class="admin-pay-history-meta">
          <span>${fmtDateTime(item?.ts)}</span>
          <span>${String(item?.role || "admin")} · ${String(item?.actor_tg_id || "—")}</span>
        </div>
        <div class="admin-pay-history-values">
          <div>Телефон: <span class="text-white">${String(oldV?.phone || "—")}</span> → <span class="text-white">${String(newV?.phone || "—")}</span></div>
          <div>Банк: <span class="text-white">${String(oldV?.bank || "—")}</span> → <span class="text-white">${String(newV?.bank || "—")}</span></div>
          <div>Получатель: <span class="text-white">${String(oldV?.recipient || "—")}</span> → <span class="text-white">${String(newV?.recipient || "—")}</span></div>
        </div>
      `;
      refs.payHistoryList.appendChild(row);
    });
  }

  async function loadPartnerAnalytics() {
    const { tgId, partnerCode } = partnerIdentity();
    if (!tgId) {
      state.partnerInvite = null;
      state.partnerAnalytics = { items: [], total: 0, paid: 0, auto_accepted: 0, manual_moderation: 0 };
      renderPartnerState();
      setStatus(refs.status, "Укажи TG ID партнера, чтобы загрузить статистику.");
      return;
    }

    if (previewMode) {
      if (refs.partnerTgIdInput && !refs.partnerTgIdInput.value) refs.partnerTgIdInput.value = previewPartnerInvite.invite.partner_tg_id;
      if (refs.partnerCodeInput && !refs.partnerCodeInput.value) refs.partnerCodeInput.value = previewPartnerInvite.invite.partner_code;
      state.partnerInvite = { ...previewPartnerInvite.invite };
      state.partnerAnalytics = {
        ...previewPartnerInvite.analytics,
        items: previewPartnerInvite.analytics.items.map((item) => ({ ...item })),
      };
      renderPartnerState();
      setStatus(refs.status, "Локальный превью-режим: партнерская статистика загружена.");
      return;
    }

    setStatus(refs.status, "Загружаю партнерскую статистику...");
    try {
      const data = await apiFetch(
        `/api/admin/partner-invite/analytics?partner_tg_id=${encodeURIComponent(tgId)}&partner_code=${encodeURIComponent(partnerCode)}`,
      );
      state.partnerAnalytics = data || { items: [], total: 0, paid: 0, auto_accepted: 0, manual_moderation: 0 };
      renderPartnerState();
      setStatus(refs.status, "Партнерская статистика обновлена.");
    } catch (error) {
      state.partnerAnalytics = { items: [], total: 0, paid: 0, auto_accepted: 0, manual_moderation: 0 };
      renderPartnerState();
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function createOrRotatePartnerInvite(forceNew = false) {
    const { tgId, partnerCode } = partnerIdentity();
    if (!tgId) {
      setStatus(refs.status, "Укажи TG ID партнера.", true);
      return;
    }

    if (previewMode) {
      state.partnerInvite = {
        ...previewPartnerInvite.invite,
        partner_tg_id: tgId,
        partner_code: partnerCode,
      };
      state.partnerAnalytics = {
        ...previewPartnerInvite.analytics,
        items: previewPartnerInvite.analytics.items.map((item) => ({ ...item })),
      };
      renderPartnerState();
      setStatus(refs.status, forceNew ? "PREVIEW: партнерская ссылка перевыпущена." : "PREVIEW: партнерская ссылка загружена.");
      return;
    }

    setStatus(refs.status, forceNew ? "Перевыпускаю партнерскую ссылку..." : "Получаю партнерскую ссылку...");
    try {
      const data = await apiFetch("/api/admin/partner-invite/create", {
        method: "POST",
        body: JSON.stringify({
          partner_tg_id: tgId,
          partner_code: partnerCode,
          force_new: forceNew,
        }),
      });
      state.partnerInvite = data?.invite || null;
      state.partnerAnalytics = data?.analytics || { items: [], total: 0, paid: 0, auto_accepted: 0, manual_moderation: 0 };
      renderPartnerState();

      if (data?.initial_reward?.applied) {
        setStatus(refs.status, "Партнерская ссылка готова. Стартовый бонус партнеру применен.");
      } else {
        setStatus(refs.status, forceNew ? "Партнерская ссылка перевыпущена." : "Партнерская ссылка готова.");
      }
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function copyPartnerLink() {
    const value = String(state.partnerInvite?.telegram_start_link || "").trim();
    if (!value) {
      setStatus(refs.status, "Ссылка еще не создана.", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setStatus(refs.status, "Партнерская ссылка скопирована.");
    } catch (_) {
      setStatus(refs.status, "Не удалось скопировать ссылку.", true);
    }
  }

  function selectedUser() {
    const id = String(state.selectedUserId || "").trim();
    return state.usersById[id] || null;
  }

  function normalizeSlotsToLimit(rawSlots, limit) {
    const maxSlots = Math.max(0, Number(limit || 0));
    const slots = Array.isArray(rawSlots) ? rawSlots.map((it) => ({ ...it })) : [];
    if (maxSlots <= 0) return slots;

    const bySlot = new Map();
    slots.forEach((item, idx) => {
      const n = Number(item?.slot);
      const slot = Number.isFinite(n) && n > 0 ? Math.floor(n) : idx + 1;
      bySlot.set(slot, { ...item, slot });
    });

    for (let i = 1; i <= maxSlots; i += 1) {
      if (!bySlot.has(i)) {
        bySlot.set(i, { slot: i, status: "empty" });
      }
    }

    return Array.from(bySlot.values())
      .filter((it) => Number(it?.slot) > 0)
      .sort((a, b) => Number(a.slot) - Number(b.slot))
      .slice(0, maxSlots);
  }

  function setTab(tab) {
    state.tab = tab;
    refs.tabButtons.forEach((btn) => {
      const active = String(btn.dataset.adminTab || "") === tab;
      btn.classList.toggle("bg-primary", active);
      btn.classList.toggle("text-black", active);
      btn.classList.toggle("text-primary", !active);
    });
    refs.tabPanes.forEach((pane) => {
      const active = String(pane.dataset.adminPane || "") === tab;
      pane.classList.toggle("hidden", !active);
    });
  }

  async function loadDashboard(options = {}) {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setStatus(refs.status, "Обновляю дашборд...");
    }
    try {
      const stats = await apiFetch(`/api/admin/stats?period=${encodeURIComponent(state.growthPeriod)}`);
      const growthSource = stats && typeof stats === "object" ? stats : {};
      const online = Array.isArray(stats?.online) ? stats.online.length : pickNum(stats, ["online_count"], 0);
      const totalClients = pickNum(stats, ["total_clients", "clients_total", "devices_total"], online);
      const offline = Math.max(0, totalClients - online);
      const activePct = totalClients > 0 ? Math.round((online / totalClients) * 100) : 0;
      const traffic = Number(stats?.traffic_up || 0) + Number(stats?.traffic_down || 0);
      const totalMemMb = pickNum(stats, ["total_mem_mb", "mem_total_mb"], 0);
      const freeMemMb = pickNum(stats, ["free_mem_mb", "mem_free_mb"], 0);
      const usedMemMb = Math.max(0, totalMemMb - freeMemMb);
      const expiringSoon = pickNum(stats, ["expiring_soon", "expiring_soon_count"], 0);
      const blacklisted = pickNum(stats, ["blacklisted", "blacklisted_count", "banned_count"], 0);
      const usersTotal = pickNum(stats, ["total", "users_total"], 0);
      const botStarts = pickNum(growthSource, ["bot_starts", "starts", "users_started", "started_bot"], usersTotal);
      const profilesCreated = pickNum(growthSource, ["profiles_created", "users_created", "profiles", "users_total"], usersTotal);
      const payments = pickNum(
        growthSource,
        ["payment_count", "paid_count", "payments", "first_paid", "paid_first", "first_payments"],
        0,
      );

      if (refs.dashOnline) refs.dashOnline.textContent = String(online);
      if (refs.dashOffline) refs.dashOffline.textContent = String(offline);
      if (refs.dashActivePct) refs.dashActivePct.textContent = `${activePct}%`;
      if (refs.dashTraffic) refs.dashTraffic.textContent = formatBytes(traffic);
      setRamGauge(usedMemMb / 1024, Math.max(totalMemMb / 1024, 0.1));
      if (refs.dashDevicesTotal) refs.dashDevicesTotal.textContent = String(totalClients);
      if (refs.dashExpiringSoon) refs.dashExpiringSoon.textContent = String(expiringSoon);
      if (refs.dashBlacklisted) refs.dashBlacklisted.textContent = String(blacklisted);
      if (refs.dashBotStarts) refs.dashBotStarts.textContent = String(botStarts);
      if (refs.dashProfilesCreated) refs.dashProfilesCreated.textContent = String(profilesCreated);
      if (refs.dashFirstPaid) refs.dashFirstPaid.textContent = String(payments);
      setGrowthFilterActive(state.growthPeriod);

      if (!silent) {
        setStatus(refs.status, "Дашборд обновлен.");
      }
    } catch (error) {
      if (previewMode) {
        const users = previewUsers;
        const clients = previewClients;
        const online = clients.filter((it) => Boolean(it.online)).length;
        const totalClients = clients.length;
        const offline = Math.max(0, totalClients - online);
        const activePct = totalClients > 0 ? Math.round((online / totalClients) * 100) : 0;
        const growth = previewGrowthByPeriod[state.growthPeriod] || previewGrowthByPeriod["1m"];
        const expiringSoon = users.filter((u) => asNum(u?.days_left, 99999) > 0 && asNum(u?.days_left, 99999) <= 3).length;
        const blacklisted = users.filter((u) => String(u?.status || "").toLowerCase().includes("ban")).length;

        if (refs.dashOnline) refs.dashOnline.textContent = String(online);
        if (refs.dashOffline) refs.dashOffline.textContent = String(offline);
        if (refs.dashActivePct) refs.dashActivePct.textContent = `${activePct}%`;
        if (refs.dashTraffic) refs.dashTraffic.textContent = "7.4 GB";
        setRamGauge(1.4, 4);
        if (refs.dashDevicesTotal) refs.dashDevicesTotal.textContent = String(totalClients);
        if (refs.dashExpiringSoon) refs.dashExpiringSoon.textContent = String(expiringSoon);
        if (refs.dashBlacklisted) refs.dashBlacklisted.textContent = String(blacklisted);
        if (refs.dashBotStarts) refs.dashBotStarts.textContent = String(growth.botStarts);
        if (refs.dashProfilesCreated) refs.dashProfilesCreated.textContent = String(growth.profilesCreated);
        if (refs.dashFirstPaid) refs.dashFirstPaid.textContent = String(growth.payments);
        setGrowthFilterActive(state.growthPeriod);
        if (!silent) {
          setStatus(refs.status, "Локальный превью-режим админки: показаны демо-данные.");
        }
        return;
      }
      if (!silent) {
        setStatus(refs.status, mapApiError(error), true);
      }
    }
  }

  function startDashboardAutoRefresh() {
    if (dashboardAutoTimer) return;
    dashboardAutoTimer = window.setInterval(async () => {
      const adminScreenActive = refs.root?.classList.contains("active");
      if (!adminScreenActive) return;
      if (state.tab !== "dashboard") return;
      await loadDashboard({ silent: true });
    }, 15000);
  }

  function renderUsersSelect() {
    if (!refs.usersSelect) return;

    refs.usersSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Выбери пользователя";
    refs.usersSelect.appendChild(placeholder);

    state.users.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = String(u?.id || "");
      const name = String(u?.name || `ID ${u?.id || ""}`);
      const username = String(u?.tg_username || "").trim();
      const tierValue = String(u?.member_tier || "regular").toLowerCase();
      const tierTag = tierValue === "vip" ? "V" : tierValue === "own" ? "O" : "R";
      opt.textContent = username ? `[${tierTag}] ${name} (${username})` : `[${tierTag}] ${name}`;
      refs.usersSelect.appendChild(opt);
    });

    refs.usersSelect.value = state.selectedUserId || "";
  }

  function renderSelectedUserMeta() {
    const u = selectedUser();
    if (!u) {
      if (refs.userTierBadge) {
        refs.userTierBadge.textContent = "R";
        refs.userTierBadge.className = "admin-user-tier-badge admin-user-tier-regular";
      }
      if (refs.userName) refs.userName.textContent = "Выбери пользователя";
      if (refs.userIdLine) refs.userIdLine.textContent = "ID: —";
      if (refs.userDaysLeft) refs.userDaysLeft.textContent = "—";
      if (refs.userInviter) refs.userInviter.textContent = "—";
      if (refs.userTraffic) refs.userTraffic.textContent = "—";
      if (refs.userDevicesRatio) refs.userDevicesRatio.textContent = "—";
      if (refs.userStatusLine) refs.userStatusLine.textContent = "—";
      if (refs.userLimitBadge) {
        refs.userLimitBadge.textContent = "—";
        refs.userLimitBadge.classList.remove("is-full");
      }
      return;
    }
    const name = String(u?.name || `ID ${u?.id || ""}`);
    const username = String(u?.tg_username || "").trim() || "—";
    const inviter = String(u?.ref_by || "—");
    const tier = String(u?.member_tier || "regular");
    const sub = String(u?.status || "—");
    const days = Number(u?.days_left);
    const daysText = Number.isFinite(days) ? `${days} дн` : "—";
    const devices = String(u?.devices_ratio || `${u?.connected_devices || 0}/${u?.device_limit || 0}`);
    const traffic = `${formatBytes(Number(u?.up || 0) + Number(u?.down || 0))}`;
    const tierValue = tier.toLowerCase();
    const tierTag = tierValue === "vip" ? "V" : tierValue === "own" ? "O" : "R";
    const tierClass = tierValue === "vip"
      ? "admin-user-tier-vip"
      : tierValue === "own"
        ? "admin-user-tier-own"
        : "admin-user-tier-regular";
    if (refs.userTierBadge) {
      refs.userTierBadge.textContent = tierTag;
      refs.userTierBadge.className = `admin-user-tier-badge ${tierClass}`;
    }
    if (refs.userName) refs.userName.textContent = `@${username}`;
    if (refs.userIdLine) refs.userIdLine.textContent = `ID: ${u.id} · ${name}`;
    if (refs.userDaysLeft) refs.userDaysLeft.textContent = daysText;
    if (refs.userInviter) refs.userInviter.textContent = inviter;
    if (refs.userTraffic) refs.userTraffic.textContent = traffic;
    if (refs.userDevicesRatio) {
      refs.userDevicesRatio.textContent = devices;
      const [usedRaw, limitRaw] = devices.split("/");
      const used = Number(usedRaw);
      const limit = Number(limitRaw);
      const full = Number.isFinite(used) && Number.isFinite(limit) && limit > 0 && used >= limit;
      refs.userDevicesRatio.classList.toggle("text-accent-red", full);
      refs.userDevicesRatio.classList.toggle("text-white", !full);
    }
    if (refs.userStatusLine) refs.userStatusLine.textContent = `${tier} · ${sub}`;
    if (refs.userLimitBadge) {
      refs.userLimitBadge.textContent = devices;
      const [usedRaw, limitRaw] = devices.split("/");
      const used = Number(usedRaw);
      const limit = Number(limitRaw);
      const full = Number.isFinite(used) && Number.isFinite(limit) && limit > 0 && used >= limit;
      refs.userLimitBadge.classList.toggle("is-full", full);
    }
  }

  async function loadUsers(keepSelected = true) {
    setStatus(refs.status, "Загружаю пользователей...");
    try {
      const data = await apiFetch("/api/admin/users");
      const items = Array.isArray(data?.items) ? data.items : [];
      state.users = items;
      state.usersById = {};
      items.forEach((u) => {
        state.usersById[String(u?.id || "")] = u;
      });

      if (!keepSelected || !state.usersById[state.selectedUserId]) {
        state.selectedUserId = "";
      }

      renderUsersSelect();
      renderSelectedUserMeta();
      await loadUserSlots();
      setStatus(refs.status, "Список пользователей обновлен.");
    } catch (error) {
      if (previewMode) {
        state.users = previewUsers.map((u) => ({ ...u }));
        state.usersById = {};
        state.users.forEach((u) => {
          state.usersById[String(u?.id || "")] = u;
        });
        if (!keepSelected || !state.usersById[state.selectedUserId]) {
          state.selectedUserId = String(state.users[0]?.id || "");
        }
        renderUsersSelect();
        renderSelectedUserMeta();
        await loadUserSlots();
        setStatus(refs.status, "Локальный превью-режим: пользователи загружены.");
        return;
      }
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function copyAnyKey(slot) {
    const vless = String(slot?.vless_key || "").trim();
    const sub = String(slot?.subscription_url || "").trim();
    const value = sub || vless;
    if (!value) {
      setStatus(refs.status, "У этого слота нет ключа для копирования.", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      const copiedType = sub ? "Подписка" : "Ключ";
      setStatus(refs.status, `${copiedType} Key ${slot?.slot || "?"} скопирован${sub ? "а" : ""}.`);
    } catch (_) {
      setStatus(refs.status, "Не удалось скопировать ссылку.", true);
    }
  }

  async function deleteUserSlotKey(slot) {
    const u = selectedUser();
    if (!u) {
      setStatus(refs.status, "Сначала выбери пользователя.", true);
      return;
    }
    const keyNo = Number(slot?.slot || 0);
    const uuid = String(slot?.uuid || "").trim();
    if (!uuid) {
      setStatus(refs.status, "У этого слота нет UUID для удаления.", true);
      return;
    }
    const yes = window.confirm(`Удалить только Key ${keyNo} у пользователя ID ${u.id}?`);
    if (!yes) return;

    if (previewMode) {
      const idx = state.userSlots.findIndex((it) => String(it?.uuid || "") === uuid);
      if (idx >= 0) {
        state.userSlots[idx] = { slot: keyNo, status: "empty" };
        renderUserSlots();
      }
      setStatus(refs.status, `PREVIEW: Key ${keyNo} удален.`);
      return;
    }

    setStatus(refs.status, `Удаляю Key ${keyNo}...`);
    try {
      await apiFetch("/api/admin/client/delete", {
        method: "POST",
        body: JSON.stringify({ uuid }),
      });
      setStatus(refs.status, `Key ${keyNo} удален.`);
      await loadUsers(true);
      await loadUserSlots();
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function createKeyForUserSlot(slotNo) {
    const u = selectedUser();
    if (!u) {
      setStatus(refs.status, "Сначала выбери пользователя.", true);
      return;
    }
    const slot = Math.max(1, Number(slotNo || 0));
    if (!Number.isFinite(slot) || slot <= 0) {
      setStatus(refs.status, "Некорректный слот.", true);
      return;
    }
    const uname = String(u?.tg_username || "").trim();
    const who = uname ? `@${uname.replace(/^@+/, "")}` : `ID ${u.id}`;
    const yes = window.confirm(`Создать Key ${slot} для ${who}?`);
    if (!yes) return;

    if (previewMode) {
      const key = `vless://demo-key-user${u.id}-${slot}`;
      const email = `${u.id}_key${slot}`;
      const idx = state.userSlots.findIndex((it) => Number(it?.slot) === slot);
      const item = {
        slot,
        status: "active",
        online: false,
        enabled: true,
        email,
        uuid: `demo-${u.id}-${slot}-${Date.now()}`,
        up: 0,
        down: 0,
        subscription_url: `https://demo.ghostlink.tech/sub/${u.id}/key${slot}`,
        vless_key: key,
      };
      if (idx >= 0) state.userSlots[idx] = item;
      else state.userSlots.push(item);
      state.userSlots.sort((a, b) => Number(a.slot) - Number(b.slot));
      renderUserSlots();
      setStatus(refs.status, `PREVIEW: Key ${slot} создан.`);
      return;
    }

    setStatus(refs.status, `Создаю Key ${slot}...`);
    try {
      await apiFetch("/api/admin/user/devices/create", {
        method: "POST",
        body: JSON.stringify({
          user_id: String(u.id),
          slot,
        }),
      });
      setStatus(refs.status, `Key ${slot} создан.`);
      await loadUsers(true);
      await loadUserSlots();
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  function renderUserSlots() {
    if (!refs.userKeysList) return;
    refs.userKeysList.innerHTML = "";

    if (!state.selectedUserId) {
      const row = document.createElement("div");
      row.className = "rounded-xl border border-white/10 bg-black/30 px-3 py-2";
      row.textContent = "Выбери пользователя, чтобы загрузить ключи.";
      refs.userKeysList.appendChild(row);
      return;
    }

    if (!state.userSlots.length) {
      const row = document.createElement("div");
      row.className = "rounded-xl border border-white/10 bg-black/30 px-3 py-2";
      row.textContent = "Ключи не найдены.";
      refs.userKeysList.appendChild(row);
      return;
    }

    state.userSlots.forEach((slot) => {
      const row = document.createElement("div");
      row.className = "rounded-xl border border-primary/30 bg-black/30 px-3 py-2";

      const head = document.createElement("div");
      head.className = "flex items-center justify-between gap-2";

      const left = document.createElement("div");
      left.className = "flex items-center gap-2 min-w-0";

      const dot = document.createElement("span");
      dot.className = "admin-key-dot";
      if (slot.status !== "active") {
        dot.classList.add("admin-key-dot-offline");
      } else if (!slot.enabled) {
        dot.classList.add("admin-key-dot-disabled");
      } else if (slot.online) {
        dot.classList.add("admin-key-dot-online");
      } else {
        dot.classList.add("admin-key-dot-offline");
      }

      const label = document.createElement("div");
      label.className = "text-white text-sm font-semibold";
      label.textContent = `Key ${slot.slot}`;

      left.appendChild(dot);
      left.appendChild(label);

      const status = document.createElement("div");
      status.className = "text-xs text-muted-gray";
      status.textContent = slot.status === "active"
        ? `${slot.online ? "online" : "offline"} · ${slot.enabled ? "enabled" : "disabled"}`
        : "empty";
      head.appendChild(left);
      head.appendChild(status);

      const meta = document.createElement("div");
      meta.className = "text-xs text-muted-gray mt-1 break-all admin-key-meta";
      meta.textContent = slot.status === "active"
        ? `${String(slot.email || slot.uuid || "—")} · ${formatBytes(Number(slot.up || 0) + Number(slot.down || 0))}`
        : "Слот пуст";

      row.appendChild(head);
      row.appendChild(meta);

      if (slot.status === "active") {
        const actions = document.createElement("div");
        actions.className = "flex gap-2 mt-2";
        const copyBtn = document.createElement("button");
        copyBtn.className = "ios-active border border-primary text-primary rounded-lg px-2 py-1 text-xs font-semibold";
        copyBtn.textContent = "Скопировать подписку";
        copyBtn.addEventListener("click", () => copyAnyKey(slot));
        const delBtn = document.createElement("button");
        delBtn.className = "ios-active border border-accent-red text-accent-red rounded-lg px-2 py-1 text-xs font-semibold";
        delBtn.textContent = "Удалить ключ";
        delBtn.addEventListener("click", () => deleteUserSlotKey(slot));
        actions.appendChild(copyBtn);
        actions.appendChild(delBtn);
        row.appendChild(actions);
      } else {
        const actions = document.createElement("div");
        actions.className = "flex gap-2 mt-2";
        const createBtn = document.createElement("button");
        createBtn.className = "ios-active border border-primary text-primary rounded-lg px-2 py-1 text-xs font-semibold";
        createBtn.textContent = "Создать ключ";
        createBtn.addEventListener("click", () => createKeyForUserSlot(slot.slot));
        actions.appendChild(createBtn);
        row.appendChild(actions);
      }

      refs.userKeysList.appendChild(row);
    });
  }

  async function loadUserSlots() {
    renderUserSlots();
    if (!state.selectedUserId) return;
    const user = selectedUser();
    const userLimit = Math.max(0, Number(user?.device_limit || 0));
    try {
      const data = await apiFetch(`/api/admin/user/devices?user_id=${encodeURIComponent(state.selectedUserId)}`);
      const raw = Array.isArray(data?.slots) ? data.slots : [];
      state.userSlots = normalizeSlotsToLimit(raw, userLimit);
    } catch (error) {
      if (previewMode) {
        const raw = (previewSlotsByUser[state.selectedUserId] || []).map((it) => ({ ...it }));
        state.userSlots = normalizeSlotsToLimit(raw, userLimit);
      } else {
        state.userSlots = [];
        setStatus(refs.status, mapApiError(error), true);
      }
    } finally {
      renderUserSlots();
    }
  }

  async function callUserAction(path, body, okText, confirmText = "") {
    const u = selectedUser();
    if (!u) {
      setStatus(refs.status, "Сначала выбери пользователя.", true);
      return;
    }
    if (confirmText) {
      const yes = window.confirm(confirmText);
      if (!yes) return;
    }
    if (previewMode) {
      const id = String(u.id);
      if (path.includes("/tier")) {
        state.usersById[id].member_tier = String(body?.tier || state.usersById[id].member_tier);
      } else if (path.includes("/extend")) {
        const addDays = Math.max(0, Number(body?.days || 0));
        state.usersById[id].days_left = Number(state.usersById[id].days_left || 0) + addDays;
      } else if (path.includes("/unlimited")) {
        state.usersById[id].status = "unlimited";
      } else if (path.includes("/reset_subscription")) {
        state.usersById[id].status = "inactive";
        state.usersById[id].days_left = 0;
      } else if (path.includes("/ban")) {
        state.usersById[id].status = "banned";
      } else if (path.includes("/unban")) {
        state.usersById[id].status = "active";
      } else if (path.includes("/delete")) {
        state.users = state.users.filter((it) => String(it.id) !== id);
        delete state.usersById[id];
        state.selectedUserId = String(state.users[0]?.id || "");
      }
      renderUsersSelect();
      renderSelectedUserMeta();
      await loadUserSlots();
      setStatus(refs.status, `PREVIEW: ${okText}`);
      return;
    }

    setStatus(refs.status, "Выполняю действие...");
    try {
      await apiFetch(path, {
        method: "POST",
        body: JSON.stringify({ user_id: String(u.id), ...(body || {}) }),
      });
      setStatus(refs.status, okText);
      await loadUsers(true);
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function setTier(tier) {
    await callUserAction("/api/admin/user/tier", { tier }, `Tier обновлен: ${tier}.`);
  }

  async function extendUser() {
    const value = window.prompt("На сколько дней продлить?", "30");
    const days = Number(value || 0);
    if (!Number.isFinite(days) || days <= 0) {
      setStatus(refs.status, "Некорректное число дней.", true);
      return;
    }
    await callUserAction("/api/admin/user/extend", { days: Math.floor(days) }, `Продлено на ${Math.floor(days)} дн.`);
  }

  async function sendBotMessageToUser() {
    const u = selectedUser();
    if (!u) {
      setStatus(refs.status, "Сначала выбери пользователя.", true);
      return;
    }
    const text = String(refs.userMessageInput?.value || "").trim();
    if (!text) {
      setStatus(refs.status, "Введи текст сообщения.", true);
      return;
    }

    if (previewMode) {
      if (refs.userMessageInput) refs.userMessageInput.value = "";
      setStatus(refs.status, "PREVIEW: сообщение отправлено через бота.");
      return;
    }

    setStatus(refs.status, "Отправляю сообщение через бота...");
    try {
      await apiFetch("/api/admin/support_reply", {
        method: "POST",
        body: JSON.stringify({ user_id: String(u.id), text }),
      });
      if (refs.userMessageInput) refs.userMessageInput.value = "";
      setStatus(refs.status, "Сообщение отправлено через бота.");
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  function renderClients() {
    if (!refs.clientsList) return;
    refs.clientsList.innerHTML = "";
    const query = String(state.clientsQuery || "").trim().toLowerCase();
    const visible = !query
      ? state.clients
      : state.clients.filter((item) => {
          const tg = String(item?.tg_id || "").toLowerCase();
          const email = String(item?.email || "").toLowerCase();
          const uuid = String(item?.uuid || "").toLowerCase();
          return tg.includes(query) || email.includes(query) || uuid.includes(query);
        });

    const onlineCount = visible.filter((it) => Boolean(it?.online)).length;
    const disabledCount = visible.filter((it) => it?.enable === false).length;
    const offlineCount = Math.max(0, visible.length - onlineCount);
    if (refs.clientsOnlineCount) refs.clientsOnlineCount.textContent = String(onlineCount);
    if (refs.clientsOfflineCount) refs.clientsOfflineCount.textContent = String(offlineCount);
    if (refs.clientsDisabledCount) refs.clientsDisabledCount.textContent = String(disabledCount);

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "rounded-xl border border-white/10 bg-card-dark px-3 py-2 text-muted-gray";
      empty.textContent = query ? "Ничего не найдено по фильтру." : "Нет устройств в панели.";
      refs.clientsList.appendChild(empty);
      return;
    }

    visible.forEach((item) => {
      const uuid = String(item?.uuid || "").trim();
      const email = String(item?.email || uuid).trim();
      const online = Boolean(item?.online);
      const enabled = item?.enable !== false;
      const tgId = String(item?.tg_id || "").trim() || "—";
      const shortUuid = uuid ? uuid.slice(0, 12) : "—";

      const row = document.createElement("div");
      row.className = "admin-device-card";

      const top = document.createElement("div");
      top.className = "flex items-start justify-between gap-2";

      const left = document.createElement("div");
      left.className = "min-w-0 flex-1";
      const titleLine = document.createElement("div");
      titleLine.className = "flex items-center gap-2";
      const dot = document.createElement("span");
      dot.className = "admin-device-dot";
      if (!enabled) dot.classList.add("admin-device-dot-disabled");
      else if (online) dot.classList.add("admin-device-dot-online");
      else dot.classList.add("admin-device-dot-offline");
      const title = document.createElement("div");
      title.className = "text-white text-sm font-semibold truncate";
      title.textContent = email;
      titleLine.appendChild(dot);
      titleLine.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "text-xs text-muted-gray/70 mt-1";
      meta.innerHTML = `🔑 <span class="admin-key-meta">${shortUuid}</span>`;

      const owner = document.createElement("button");
      owner.className = "ios-active text-xs text-white/65 underline-offset-2 hover:underline mt-1";
      owner.textContent = `🆔 ${tgId}`;
      owner.addEventListener("click", async () => {
        setTab("users");
        await loadUsers(true);
        const wanted = String(tgId).trim();
        if (wanted && refs.usersSelect) {
          const found = state.users.find((u) => String(u?.id || "").trim() === wanted || String(u?.tg_id || "").trim() === wanted);
          if (found) {
            state.selectedUserId = String(found.id);
            refs.usersSelect.value = state.selectedUserId;
            renderSelectedUserMeta();
            await loadUserSlots();
            setStatus(refs.status, "Открыл пользователя по TG ID.");
          } else {
            setStatus(refs.status, "Пользователь по TG ID не найден в текущем списке.", true);
          }
        }
      });

      left.appendChild(titleLine);
      left.appendChild(meta);
      left.appendChild(owner);

      const statusWrap = document.createElement("div");
      statusWrap.className = "flex flex-col items-end gap-1";
      const badge = document.createElement("span");
      badge.className = enabled ? "admin-device-badge admin-device-badge-active" : "admin-device-badge admin-device-badge-disabled";
      badge.textContent = enabled ? "ACTIVE" : "DISABLED";

      const toggle = document.createElement("button");
      toggle.className = `ios-active admin-toggle ${enabled ? "is-on" : ""}`;
      toggle.setAttribute("aria-label", enabled ? "Выключить устройство" : "Включить устройство");
      toggle.innerHTML = `<span class="admin-toggle-knob"></span>`;
      toggle.addEventListener("click", async () => {
        setStatus(refs.status, "Обновляю устройство...");
        try {
          await apiFetch("/api/admin/client/enable", {
            method: "POST",
            body: JSON.stringify({ uuid, enable: !enabled }),
          });
          setStatus(refs.status, "Статус устройства обновлен.");
          await loadClients();
        } catch (error) {
          setStatus(refs.status, mapApiError(error), true);
        }
      });
      statusWrap.appendChild(badge);
      statusWrap.appendChild(toggle);

      top.appendChild(left);
      top.appendChild(statusWrap);

      const actions = document.createElement("div");
      actions.className = "flex justify-end mt-2";
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "ios-active admin-device-delete";
      deleteBtn.innerHTML = `<span class="material-symbols-outlined text-base">delete</span>`;
      deleteBtn.addEventListener("click", async () => {
        const yes = window.confirm("Удалить это устройство из панели?");
        if (!yes) return;
        setStatus(refs.status, "Удаляю устройство...");
        try {
          await apiFetch("/api/admin/client/delete", {
            method: "POST",
            body: JSON.stringify({ uuid }),
          });
          setStatus(refs.status, "Устройство удалено.");
          await loadClients();
        } catch (error) {
          setStatus(refs.status, mapApiError(error), true);
        }
      });

      actions.appendChild(deleteBtn);
      row.appendChild(top);
      row.appendChild(actions);
      refs.clientsList.appendChild(row);
    });
  }

  async function loadClients() {
    setStatus(refs.status, "Загружаю устройства панели...");
    try {
      const data = await apiFetch("/api/admin/clients");
      state.clients = Array.isArray(data?.items) ? data.items : [];
      renderClients();
      setStatus(refs.status, "Список устройств обновлен.");
    } catch (error) {
      if (previewMode) {
        state.clients = previewClients.map((it) => ({ ...it }));
        renderClients();
        setStatus(refs.status, "Локальный превью-режим: устройства загружены.");
        return;
      }
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function loadPaymentSettings() {
    setStatus(refs.status, "Загружаю реквизиты...");
    try {
      const data = await apiFetch("/api/payment/settings");
      if (refs.payPhoneInput) refs.payPhoneInput.value = String(data?.phone || "");
      if (refs.payBankInput) refs.payBankInput.value = String(data?.bank || "");
      if (refs.payRecipientInput) refs.payRecipientInput.value = String(data?.recipient || "");
      updatePayPreview();
      setStatus(refs.status, "Реквизиты загружены.");
    } catch (error) {
      if (previewMode) {
        if (refs.payPhoneInput) refs.payPhoneInput.value = state.paymentPreview.phone;
        if (refs.payBankInput) refs.payBankInput.value = state.paymentPreview.bank;
        if (refs.payRecipientInput) refs.payRecipientInput.value = state.paymentPreview.recipient;
        updatePayPreview();
        setStatus(refs.status, "Локальный превью-режим: реквизиты загружены.");
        return;
      }
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function savePaymentSettings() {
    const phone = String(refs.payPhoneInput?.value || "").trim();
    const bank = String(refs.payBankInput?.value || "").trim();
    const recipient = String(refs.payRecipientInput?.value || "").trim();
    if (!phone || !bank || !recipient) {
      setStatus(refs.status, "Заполни phone/bank/recipient.", true);
      return;
    }
    if (previewMode) {
      state.paymentPreview = { phone, bank, recipient };
      updatePayPreview();
      setStatus(refs.status, "PREVIEW: реквизиты сохранены локально.");
      if (refs.paySaveBtn) {
        const prev = refs.paySaveBtn.textContent;
        refs.paySaveBtn.textContent = "✅ Сохранено";
        refs.paySaveBtn.classList.add("is-saved");
        window.setTimeout(() => {
          refs.paySaveBtn.textContent = prev || "Сохранить реквизиты";
          refs.paySaveBtn.classList.remove("is-saved");
        }, 2000);
      }
      return;
    }

    setStatus(refs.status, "Сохраняю реквизиты...");
    try {
      await apiFetch("/api/admin/payment/settings", {
        method: "POST",
        body: JSON.stringify({ phone, bank, recipient }),
      });
      updatePayPreview();
      setStatus(refs.status, "Реквизиты сохранены.");
      if (refs.paySaveBtn) {
        const prev = refs.paySaveBtn.textContent;
        refs.paySaveBtn.textContent = "✅ Сохранено";
        refs.paySaveBtn.classList.add("is-saved");
        window.setTimeout(() => {
          refs.paySaveBtn.textContent = prev || "Сохранить реквизиты";
          refs.paySaveBtn.classList.remove("is-saved");
        }, 2000);
      }
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function loadPaymentHistory() {
    setStatus(refs.status, "Загружаю историю реквизитов...");
    try {
      const data = await apiFetch("/api/admin/payment/settings/history");
      state.paymentHistory = Array.isArray(data?.items) ? data.items : [];
      renderPaymentHistory();
      setStatus(refs.status, "История реквизитов обновлена.");
    } catch (error) {
      if (previewMode) {
        state.paymentHistory = previewPaymentHistory.map((it) => ({ ...it }));
        renderPaymentHistory();
        setStatus(refs.status, "Локальный превью-режим: история реквизитов загружена.");
        return;
      }
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function loadRoles() {
    setStatus(refs.status, "Загружаю роли...");
    try {
      const data = await apiFetch("/api/admin/access/roles");
      state.roles = Array.isArray(data?.items) ? data.items : [];
      renderRoles();
      setStatus(refs.status, "Роли обновлены.");
    } catch (error) {
      if (previewMode) {
        state.roles = previewRoles.map((it) => ({ ...it }));
        renderRoles();
        setStatus(refs.status, "Локальный превью-режим: роли загружены.");
        return;
      }
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function setRole() {
    const tgId = String(refs.roleTgIdInput?.value || "").replace(/\D/g, "").trim();
    const role = String(refs.roleSelect?.value || "admin").trim().toLowerCase();
    if (!tgId) {
      setStatus(refs.status, "Укажи TG ID.", true);
      return;
    }
    if (!["admin", "moderator"].includes(role)) {
      setStatus(refs.status, "Роль должна быть admin или moderator.", true);
      return;
    }
    if (previewMode) {
      const exists = state.roles.find((it) => String(it?.tg_id || "") === tgId);
      if (exists) {
        exists.role = role;
      } else {
        state.roles.push({ tg_id: tgId, role, source: "meta" });
      }
      renderRoles();
      setStatus(refs.status, `PREVIEW: роль ${role} выдана.`);
      return;
    }
    setStatus(refs.status, "Сохраняю роль...");
    try {
      await apiFetch("/api/admin/access/roles/set", {
        method: "POST",
        body: JSON.stringify({ tg_id: tgId, role }),
      });
      setStatus(refs.status, `Роль ${role} сохранена.`);
      if (refs.roleTgIdInput) refs.roleTgIdInput.value = "";
      await loadRoles();
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function refreshPanelStatus() {
    setStatus(refs.status, "Проверяю доступ к панели...");
    if (previewMode) {
      if (refs.panelStatus) {
        refs.panelStatus.textContent = state.panelOpenPreview
          ? "Панель открыта (PREVIEW)"
          : "Панель закрыта (PREVIEW)";
      }
      setStatus(refs.status, "Локальный превью-режим: статус панели обновлен.");
      return;
    }

    try {
      const data = await apiFetch("/api/admin/proxy_status");
      const open = Boolean(data?.open);
      const sec = Number(data?.seconds_left || 0);
      if (refs.panelStatus) {
        refs.panelStatus.textContent = open
          ? `Панель открыта (${sec} сек осталось)`
          : "Панель закрыта";
      }
      setStatus(refs.status, "Статус панели обновлен.");
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function openPanel() {
    if (previewMode) {
      state.panelOpenPreview = true;
      await refreshPanelStatus();
      setStatus(refs.status, "PREVIEW: панель открыта.");
      return;
    }

    setStatus(refs.status, "Открываю панель...");
    try {
      const data = await apiFetch("/api/admin/proxy_auth", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const url = String(data?.proxy_url || "").trim();
      if (url) openExternalLink(url);
      await refreshPanelStatus();
      setStatus(refs.status, "Панель открыта.");
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function closePanel() {
    if (previewMode) {
      state.panelOpenPreview = false;
      await refreshPanelStatus();
      setStatus(refs.status, "PREVIEW: панель закрыта.");
      return;
    }

    setStatus(refs.status, "Закрываю панель...");
    try {
      await apiFetch("/api/admin/proxy_close", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refreshPanelStatus();
      setStatus(refs.status, "Панель закрыта.");
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function restartSystem() {
    const yes = window.confirm("Перезапустить Xray?");
    if (!yes) return;
    if (previewMode) {
      setStatus(refs.status, "PREVIEW: Xray перезапущен (эмуляция).");
      return;
    }

    setStatus(refs.status, "Перезапускаю Xray...");
    try {
      await apiFetch("/api/admin/xray/restart", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setStatus(refs.status, "Xray перезапущен.");
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
    }
  }

  async function downloadBackup() {
    if (previewMode) {
      setStatus(refs.status, "PREVIEW: backup-скачивание эмулировано.");
      return;
    }

    setStatus(refs.status, "Готовлю backup...");
    try {
      if (!tgInitData) {
        setStatus(refs.status, "Нет Telegram initData. Открой внутри Telegram.", true);
        return;
      }
      const apiBase = String(getApiBase() || "").replace(/\/+$/, "");
      const response = await fetch(`${apiBase}/api/admin/backup`, {
        method: "GET",
        credentials: "include",
        headers: {
          "X-Telegram-InitData": tgInitData,
        },
      });
      if (!response.ok) {
        throw new Error(`backup_${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ghostlink-backup.db";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus(refs.status, "Backup скачан.");
    } catch (error) {
      setStatus(refs.status, "Не удалось скачать backup (в Telegram WebView это может блокироваться).", true);
    }
  }

  refs.tabButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tab = String(btn.dataset.adminTab || "dashboard");
      setTab(tab);
      await loadTabData(tab);
    });
  });

  refs.dashRefreshBtn?.addEventListener("click", loadDashboard);
  refs.growthFilterButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.growthPeriod = String(btn.dataset.growthPeriod || "1m");
      setGrowthFilterActive(state.growthPeriod);
      await loadDashboard();
    });
  });
  refs.dashExpiringCard?.addEventListener("click", async () => {
    setTab("users");
    await loadUsers(true);
    state.loadedTabs.users = true;
    setStatus(refs.status, "Открыл вкладку пользователей. Проверь тех, у кого осталось 3 дня и меньше.");
  });

  refs.usersRefreshBtn?.addEventListener("click", async () => {
    const icon = refs.usersRefreshBtn.querySelector(".material-symbols-outlined");
    icon?.classList.add("is-spinning");
    try {
      await loadUsers(false);
    } finally {
      icon?.classList.remove("is-spinning");
    }
  });
  refs.usersSelect?.addEventListener("change", () => {
    state.selectedUserId = String(refs.usersSelect?.value || "").trim();
    renderSelectedUserMeta();
    loadUserSlots();
  });
  refs.userTierRegularBtn?.addEventListener("click", () => setTier("regular"));
  refs.userTierOwnBtn?.addEventListener("click", () => setTier("own"));
  refs.userTierVipBtn?.addEventListener("click", () => setTier("vip"));
  refs.userExtendBtn?.addEventListener("click", extendUser);
  refs.userUnlimitedBtn?.addEventListener("click", () => callUserAction("/api/admin/user/unlimited", {}, "Выдан доступ без срока."));
  refs.userResetSubBtn?.addEventListener("click", () => callUserAction(
    "/api/admin/user/reset_subscription",
    {},
    "Подписка сброшена.",
    "Сбросить подписку пользователя?",
  ));
  refs.userBanBtn?.addEventListener("click", () => callUserAction(
    "/api/admin/user/ban",
    {},
    "Пользователь заблокирован.",
    "Заблокировать пользователя?",
  ));
  refs.userUnbanBtn?.addEventListener("click", () => callUserAction("/api/admin/user/unban", {}, "Пользователь разблокирован."));
  refs.userDeleteBtn?.addEventListener("click", () => callUserAction(
    "/api/admin/user/delete",
    {},
    "Пользователь удален.",
    "Удалить пользователя из системы?",
  ));
  refs.userMessageBtn?.addEventListener("click", sendBotMessageToUser);

  refs.clientsRefreshBtn?.addEventListener("click", async () => {
    const icon = refs.clientsRefreshBtn.querySelector(".material-symbols-outlined");
    icon?.classList.add("is-spinning");
    try {
      await loadClients();
    } finally {
      icon?.classList.remove("is-spinning");
    }
  });
  refs.clientsSearchInput?.addEventListener("input", () => {
    state.clientsQuery = String(refs.clientsSearchInput?.value || "");
    renderClients();
  });

  refs.payLoadBtn?.addEventListener("click", async () => {
    const icon = refs.payLoadBtn.querySelector(".material-symbols-outlined");
    icon?.classList.add("is-spinning");
    try {
      await loadPaymentSettings();
    } finally {
      icon?.classList.remove("is-spinning");
    }
  });
  refs.paySaveBtn?.addEventListener("click", savePaymentSettings);
  refs.payHistoryRefreshBtn?.addEventListener("click", async () => {
    const icon = refs.payHistoryRefreshBtn.querySelector(".material-symbols-outlined");
    icon?.classList.add("is-spinning");
    try {
      await loadPaymentHistory();
    } finally {
      icon?.classList.remove("is-spinning");
    }
  });
  refs.payPhoneInput?.addEventListener("input", () => {
    const formatted = formatPhoneRu(refs.payPhoneInput.value);
    refs.payPhoneInput.value = formatted;
    updatePayPreview();
  });
  refs.payPhoneInput?.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text") || "";
    const formatted = formatPhoneRu(text);
    if (formatted) {
      event.preventDefault();
      refs.payPhoneInput.value = formatted;
      updatePayPreview();
    }
  });
  refs.payBankInput?.addEventListener("input", updatePayPreview);
  refs.payRecipientInput?.addEventListener("input", updatePayPreview);
  refs.partnerCreateBtn?.addEventListener("click", async () => createOrRotatePartnerInvite(false));
  refs.partnerRotateBtn?.addEventListener("click", async () => createOrRotatePartnerInvite(true));
  refs.partnerCopyBtn?.addEventListener("click", copyPartnerLink);
  refs.partnerRefreshBtn?.addEventListener("click", async () => {
    const icon = refs.partnerRefreshBtn.querySelector(".material-symbols-outlined");
    icon?.classList.add("is-spinning");
    try {
      await loadPartnerAnalytics();
    } finally {
      icon?.classList.remove("is-spinning");
    }
  });
  refs.partnerTgIdInput?.addEventListener("input", () => {
    const digits = String(refs.partnerTgIdInput.value || "").replace(/\D/g, "");
    refs.partnerTgIdInput.value = digits;
    if (!String(refs.partnerCodeInput?.value || "").trim() && digits && refs.partnerCodeInput) {
      refs.partnerCodeInput.value = digits;
    }
  });

  refs.panelRefreshBtn?.addEventListener("click", async () => {
    const icon = refs.panelRefreshBtn.querySelector(".material-symbols-outlined");
    icon?.classList.add("is-spinning");
    try {
      await refreshPanelStatus();
    } finally {
      icon?.classList.remove("is-spinning");
    }
  });
  refs.panelOpenBtn?.addEventListener("click", openPanel);
  refs.panelCloseBtn?.addEventListener("click", closePanel);

  refs.roleSetBtn?.addEventListener("click", setRole);
  refs.roleRefreshBtn?.addEventListener("click", async () => {
    const icon = refs.roleRefreshBtn.querySelector(".material-symbols-outlined");
    icon?.classList.add("is-spinning");
    try {
      await loadRoles();
    } finally {
      icon?.classList.remove("is-spinning");
    }
  });

  refs.sysRestartBtn?.addEventListener("click", restartSystem);
  refs.sysBackupBtn?.addEventListener("click", downloadBackup);

  async function loadTabData(tab) {
    const name = String(tab || "dashboard");
    if (name === "dashboard") {
      if (!state.loadedTabs.dashboard) {
        await loadDashboard();
        state.loadedTabs.dashboard = true;
      }
      return;
    }
    if (state.loadedTabs[name]) return;
    if (name === "users") {
      await loadUsers(false);
    } else if (name === "devices") {
      await loadClients();
    } else if (name === "payment") {
      await Promise.all([loadPaymentSettings(), loadPaymentHistory()]);
    } else if (name === "partner") {
      await loadPartnerAnalytics();
    } else if (name === "panel") {
      await refreshPanelStatus();
    } else if (name === "system") {
      await loadRoles();
    }
    state.loadedTabs[name] = true;
  }

  return {
    open: async () => {
      setTab("dashboard");
      startDashboardAutoRefresh();
      state.loadedTabs = {};
      await loadDashboard();
      state.loadedTabs.dashboard = true;
    },
  };
}
