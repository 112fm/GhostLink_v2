import { apiFetch } from "../api/client.js?v=20260715-miniapp-release-8";

function setStatus(node, text, isError = false) {
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("text-accent-red", isError);
  node.classList.toggle("text-muted-gray", !isError);
}

function mapApiError(error) {
  const status = Number(error?.status || 0);
  const detail = String(error?.message || error?.data?.detail || "").trim();

  if (detail === "device_limit_reached") return "Достигнут лимит устройств для текущего тарифа.";
  if (detail === "access_closed") return "Доступ закрыт. Поддержи проект, чтобы активировать ключи.";
  if (detail === "bad_id") return "Некорректный ID устройства.";
  if (detail === "panel_error") return "Ошибка VPN панели. Попробуй еще раз.";
  if (detail.startsWith("panel_error:")) return detail;
  if (detail.startsWith("panel_add_failed:")) return "Панель не смогла добавить устройство. Попробуй еще раз.";
  if (status === 401) return "Сессия истекла. Открой mini app заново из Telegram.";
  if (status === 403) return "Нет доступа к этому действию.";
  if (status === 404) return "Данные устройства не найдены.";
  if (status === 429) return "Слишком много запросов. Попробуй позже.";
  return "Ошибка сети. Попробуй еще раз.";
}

function shortUuid(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 8)}...${raw.slice(-4)}`;
}

function deviceTitle(item, index) {
  const email = String(item?.email || "").trim();
  if (email) return email;
  return `Устройство ${index + 1}`;
}

async function copyText(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    await navigator.clipboard.writeText(raw);
    return true;
  } catch (_) {
    return false;
  }
}

export function createDevicesModule() {
  const refs = {
    limit: document.getElementById("deviceLimit"),
    count: document.getElementById("deviceCount"),
    link: document.getElementById("subscriptionLink"),
    copyBtn: document.getElementById("copySubscriptionBtn"),
    list: document.getElementById("deviceList"),
    addForm: document.getElementById("deviceAddForm"),
    type: document.getElementById("deviceType"),
    name: document.getElementById("deviceName"),
    addBtn: document.getElementById("addDeviceBtn"),
    updateBtn: document.getElementById("updateDeviceBtn"),
    resetBtn: document.getElementById("resetDeviceBtn"),
    status: document.getElementById("deviceStatusText"),
  };

  if (!refs.list || !refs.addBtn || !refs.resetBtn) {
    return { open: async () => {} };
  }

  const state = {
    loading: false,
    busy: false,
    items: [],
    deviceLimit: 0,
    connected: 0,
    mainUuid: "",
    subscriptionUrl: "",
  };

  function setBusy(flag) {
    state.busy = Boolean(flag);
    refs.addBtn.disabled = state.busy;
    refs.resetBtn.disabled = state.busy;
    if (refs.updateBtn) refs.updateBtn.disabled = state.busy;
    if (refs.copyBtn) refs.copyBtn.disabled = state.busy;
  }

  function getMainItem() {
    return state.items.find((x) => String(x?.uuid || "") === state.mainUuid) || state.items[0] || null;
  }

  function resolveSubscriptionUrl() {
    const main = getMainItem();
    const fromItem = String(main?.subscription_url || "").trim();
    if (fromItem) return fromItem;
    return String(state.subscriptionUrl || "").trim();
  }

  function renderTop() {
    if (refs.limit) refs.limit.textContent = String(state.deviceLimit || 0);
    if (refs.count) refs.count.textContent = String(state.connected || 0);
    if (refs.link) refs.link.classList.add("hidden");
    if (refs.copyBtn) refs.copyBtn.classList.add("hidden");
  }

  function createActionButton(text, action, uuid, danger = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.action = action;
    btn.dataset.uuid = String(uuid || "");
    btn.textContent = text;
    btn.className = danger
      ? "ios-active border border-accent-red text-accent-red rounded-lg px-2 py-1 text-xs font-semibold"
      : "ios-active border border-primary text-primary rounded-lg px-2 py-1 text-xs font-semibold";
    return btn;
  }

  function renderList() {
    refs.list.innerHTML = "";

    if (!state.items.length) {
      const empty = document.createElement("div");
      empty.className = "rounded-xl border border-white/10 bg-card-dark px-3 py-2 text-muted-gray";
      empty.textContent = "Пока нет устройств. Нажми «Добавить устройство».";
      refs.list.appendChild(empty);
      return;
    }

    state.items.forEach((item, index) => {
      const uuid = String(item?.uuid || "").trim();
      const isMain = uuid && uuid === state.mainUuid;

      const card = document.createElement("div");
      card.className = "rounded-xl border border-primary/40 bg-card-dark px-3 py-3 mb-2";

      const top = document.createElement("div");
      top.className = "flex items-center justify-between gap-2";

      const title = document.createElement("div");
      title.className = "text-white text-sm font-semibold";
      title.textContent = deviceTitle(item, index);

      const tag = document.createElement("span");
      tag.className = isMain
        ? "text-[10px] text-black bg-primary rounded px-2 py-0.5"
        : "text-[10px] text-muted-gray border border-white/10 rounded px-2 py-0.5";
      tag.textContent = isMain ? "Основной" : "Устройство";

      top.appendChild(title);
      top.appendChild(tag);

      const meta = document.createElement("div");
      meta.className = "text-xs text-muted-gray mt-1";
      meta.textContent = `UUID: ${shortUuid(uuid)}`;

      const actions = document.createElement("div");
      actions.className = "flex gap-2 mt-3";
      actions.appendChild(createActionButton("Скопировать подписку", "copy", uuid));
      actions.appendChild(createActionButton("Обновить ключ", "rotate", uuid));
      actions.appendChild(createActionButton("Удалить", "remove", uuid, true));

      card.appendChild(top);
      card.appendChild(meta);
      card.appendChild(actions);

      refs.list.appendChild(card);
    });
  }

  function showAddForm(show) {
    refs.addForm?.classList.toggle("hidden", !show);
    if (show) {
      refs.addBtn.textContent = "Создать устройство";
      refs.name?.focus();
    } else {
      refs.addBtn.textContent = "Добавить устройство";
      if (refs.name) refs.name.value = "";
    }
  }

  async function loadList(force = false) {
    if (state.loading && !force) return;
    state.loading = true;
    setBusy(true);
    setStatus(refs.status, "Загружаю устройства...");

    try {
      const data = await apiFetch("/api/device/list");
      state.items = Array.isArray(data?.items) ? data.items : [];
      state.deviceLimit = Number(data?.device_limit || 0);
      state.connected = Number(data?.connected || state.items.length || 0);
      state.mainUuid = String(state.items[0]?.uuid || "").trim();

      renderTop();
      renderList();
      setStatus(refs.status, `Устройств подключено: ${state.connected}/${state.deviceLimit || 0}.`);
    } catch (error) {
      state.items = [];
      state.deviceLimit = 0;
      state.connected = 0;
      state.mainUuid = "";
      renderTop();
      renderList();
      setStatus(refs.status, mapApiError(error), true);
    } finally {
      state.loading = false;
      setBusy(false);
    }
  }

  async function addDevice() {
    if (state.busy) return;

    const isFormHidden = refs.addForm?.classList.contains("hidden");
    if (isFormHidden) {
      showAddForm(true);
      setStatus(refs.status, "Выбери тип и задай имя (необязательно), затем нажми «Создать устройство». ");
      return;
    }

    const payload = {
      device_type: String(refs.type?.value || "other"),
      device_name: String(refs.name?.value || "").trim(),
    };

    setBusy(true);
    setStatus(refs.status, "Добавляю устройство...");

    try {
      const data = await apiFetch("/api/device/add", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const nextLink = String(data?.subscription_url || "").trim();
      if (nextLink) state.subscriptionUrl = nextLink;

      showAddForm(false);
      await loadList(true);
      setStatus(refs.status, "Устройство добавлено.");
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
      setBusy(false);
    }
  }

  async function resetKey() {
    if (state.busy) return;
    const yes = window.confirm("Сбросить ключ? Старые ссылки перестанут работать.");
    if (!yes) return;

    setBusy(true);
    setStatus(refs.status, "Сбрасываю ключ...");

    try {
      const data = await apiFetch("/api/device/reset", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const nextLink = String(data?.subscription_url || "").trim();
      if (nextLink) state.subscriptionUrl = nextLink;

      await loadList(true);
      setStatus(refs.status, "Ключ сброшен.");
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
      setBusy(false);
    }
  }

  async function rotateKey(uuid) {
    if (state.busy) return;
    const target = String(uuid || state.mainUuid || state.items[0]?.uuid || "").trim();
    if (!target) {
      setStatus(refs.status, "Нет устройства для обновления ключа.", true);
      return;
    }

    setBusy(true);
    setStatus(refs.status, "Обновляю ключ устройства...");

    try {
      const data = await apiFetch("/api/device/rotate", {
        method: "POST",
        body: JSON.stringify({ uuid: target }),
      });

      const nextLink = String(data?.subscription_url || "").trim();
      if (nextLink) state.subscriptionUrl = nextLink;

      await loadList(true);
      setStatus(refs.status, "Ключ устройства обновлен.");
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
      setBusy(false);
    }
  }

  async function removeDevice(uuid) {
    if (state.busy) return;
    const target = String(uuid || "").trim();
    if (!target) return;

    const yes = window.confirm("Удалить это устройство? Доступ для него будет отключен.");
    if (!yes) return;

    setBusy(true);
    setStatus(refs.status, "Удаляю устройство...");

    try {
      await apiFetch("/api/device/remove", {
        method: "POST",
        body: JSON.stringify({ uuid: target }),
      });

      await loadList(true);
      setStatus(refs.status, "Устройство удалено.");
    } catch (error) {
      setStatus(refs.status, mapApiError(error), true);
      setBusy(false);
    }
  }

  async function copySubscription(uuid = "") {
    const target = String(uuid || "").trim();
    const item = state.items.find((x) => String(x?.uuid || "").trim() === target) || null;
    const value = String(item?.subscription_url || "").trim();
    const ok = await copyText(value);
    if (ok) {
      setStatus(refs.status, "Подписка устройства скопирована.");
    } else {
      setStatus(refs.status, "Подписка этого устройства пока недоступна.", true);
    }
  }

  refs.addBtn.addEventListener("click", addDevice);
  refs.resetBtn.addEventListener("click", resetKey);
  refs.updateBtn?.addEventListener("click", () => rotateKey(""));
  refs.copyBtn?.addEventListener("click", () => copySubscription(""));

  refs.name?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!refs.addForm?.classList.contains("hidden")) addDevice();
  });

  refs.list.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
    if (!target) return;

    const action = String(target.getAttribute("data-action") || "");
    const uuid = String(target.getAttribute("data-uuid") || "");

    if (action === "rotate") {
      rotateKey(uuid);
      return;
    }
    if (action === "copy") {
      copySubscription(uuid);
      return;
    }
    if (action === "remove") {
      removeDevice(uuid);
    }
  });

  return {
    open: async () => {
      showAddForm(false);
      await loadList(true);
    },
  };
}
