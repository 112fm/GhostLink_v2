import { apiFetch } from "../api/client.js?v=20260717-api-base-fix-1";

const ADD_OPERATION_STORAGE_KEY = "ghostlink.device-add-operation.v1";
const ADD_OPERATION_MAX_AGE_MS = 15 * 60 * 1000;
const ADD_OPERATION_POLL_DELAY_MS = 1200;
const ADD_OPERATION_MAX_POLLS = 25;

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isRequestId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function readPendingAdd() {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(ADD_OPERATION_STORAGE_KEY) || "null");
    if (!saved || !isRequestId(saved.requestId) || !saved.payload || !Number.isFinite(saved.createdAt)) return null;
    if (Date.now() - saved.createdAt > ADD_OPERATION_MAX_AGE_MS) return null;
    return saved;
  } catch (_) {
    return null;
  }
}

function writePendingAdd(operation) {
  try {
    window.sessionStorage.setItem(ADD_OPERATION_STORAGE_KEY, JSON.stringify(operation));
  } catch (_) {
    // The request ID still protects this open Mini App when session storage is unavailable.
  }
}

function clearPendingAdd() {
  try {
    window.sessionStorage.removeItem(ADD_OPERATION_STORAGE_KEY);
  } catch (_) {
    // Ignore storage cleanup failures.
  }
}

function setStatus(node, text, isError = false) {
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("text-accent-red", isError);
  node.classList.toggle("text-muted-gray", !isError);
}

function mapApiError(error) {
  const status = Number(error?.status || 0);
  const detail = String(error?.data?.detail || error?.data?.error || error?.error_code || error?.code || error?.message || "").trim();
  const normalizedDetail = detail.toLowerCase().replace(/[\s-]+/g, "_");

  if (normalizedDetail === "device_limit_reached") return "Достигнут лимит устройств для текущего тарифа.";
  if (normalizedDetail === "bad_params" || normalizedDetail.includes("validation")) {
    return "Проверь тип и имя устройства, затем попробуй снова.";
  }
  if (normalizedDetail === "request_id_mismatch" || normalizedDetail.includes("request_id_mismatch")) {
    return "Запрос создания не прошел проверку. Закрой Mini App и открой его заново.";
  }
  if (detail === "access_closed") return "Доступ закрыт. Поддержи проект, чтобы активировать ключи.";
  if (detail === "bad_id") return "Некорректный ID устройства.";
  if (detail === "panel_error") return "Ошибка VPN панели. Попробуй еще раз.";
  if (detail.startsWith("panel_error:")) return detail;
  if (detail.startsWith("panel_add_failed:")) {
    const reason = detail.slice("panel_add_failed:".length).trim();
    if (reason.toLowerCase().includes("duplicate_email")) {
      return "Не удалось подобрать уникальное имя устройства. Измени имя и попробуй снова.";
    }
    return reason ? `Панель не добавила устройство: ${reason}` : "Панель не смогла добавить устройство. Попробуй еще раз.";
  }
  if (status === 401) return "Сессия истекла. Открой mini app заново из Telegram.";
  if (status === 403) return "Нет доступа к этому действию.";
  if (status === 400) return "Сервер отклонил создание устройства. Проверь параметры и попробуй снова.";
  if (status === 404) return "Данные устройства не найдены.";
  if (status === 429) return "Слишком много запросов. Попробуй позже.";
  return "Ошибка сети. Попробуй еще раз.";
}

function getAddPostOutcome(error) {
  const status = Number(error?.status || 0);
  const detail = String(error?.data?.detail || error?.data?.error || error?.error_code || error?.code || error?.message || "").trim();
  const phase = String(error?.phase || (status > 0 ? "response" : "request")).trim() || "request";

  if (status > 0) return { kind: "http_error", status, detail, phase };
  if (phase === "request") return { kind: "no_http_response", status: 0, detail, phase };
  return { kind: "response_unreadable", status: 0, detail, phase };
}

function shortUuid(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 8)}...${raw.slice(-4)}`;
}

function isIndeterminateTransportError(error) {
  if (Number(error?.status || 0) > 0) return false;
  if (error?.phase === "body" || error?.phase === "json") return true;
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return name === "aborterror" || name === "typeerror" || message.includes("failed to fetch") || message.includes("timeout");
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
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(raw);
      return true;
    }
  } catch (_) {
    // Telegram WebView may expose clipboard only partially; use the legacy path below.
  }

  const textarea = document.createElement("textarea");
  textarea.value = raw;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = Boolean(document.execCommand?.("copy"));
  } catch (_) {
    copied = false;
  }
  textarea.remove();
  return copied;
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
    refreshBtn: document.getElementById("refreshDevicesBtn"),
    status: document.getElementById("deviceStatusText"),
  };

  if (!refs.list || !refs.addBtn || !refs.refreshBtn) {
    return { open: async () => {} };
  }

  const state = {
    loading: false,
    busy: false,
    listState: "idle",
    listRequestSeq: 0,
    listProgressTimer: null,
    hasLoadedList: false,
    addOutcomeUnknown: false,
    pendingAdd: readPendingAdd(),
    items: [],
    deviceLimit: 0,
    connected: 0,
    mainUuid: "",
    subscriptionUrl: "",
  };

  function setBusy(flag) {
    state.busy = Boolean(flag);
    refs.addBtn.disabled = state.busy || state.addOutcomeUnknown || Boolean(state.pendingAdd);
    refs.refreshBtn.disabled = state.busy;
    if (refs.copyBtn) refs.copyBtn.disabled = state.busy;
  }

  function clearListProgressTimer() {
    if (state.listProgressTimer) {
      window.clearTimeout(state.listProgressTimer);
      state.listProgressTimer = null;
    }
  }

  function isTemporaryListError(error) {
    const status = Number(error?.status || 0);
    return isIndeterminateTransportError(error) || status >= 500;
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
    if (refs.limit) refs.limit.textContent = state.hasLoadedList ? String(state.deviceLimit || 0) : "—";
    if (refs.count) refs.count.textContent = state.hasLoadedList ? String(state.connected || 0) : "—";
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

    if (!state.hasLoadedList) {
      const loading = document.createElement("div");
      loading.className = "rounded-xl border border-white/10 bg-card-dark px-3 py-3 text-muted-gray";
      loading.textContent = "Получаем список устройств...";
      refs.list.appendChild(loading);
      return;
    }

    if (!state.items.length) {
      const empty = document.createElement("div");
      empty.className = "rounded-xl border border-white/10 bg-card-dark px-3 py-2 text-muted-gray";
      empty.textContent = "Пока нет устройств. Нажми «Добавить устройство».";
      refs.list.appendChild(empty);
      return;
    }

    state.items.forEach((item, index) => {
      const uuid = String(item?.uuid || "").trim();
      const card = document.createElement("div");
      card.className = "rounded-xl border border-primary/40 bg-card-dark px-3 py-3 mb-2";

      const top = document.createElement("div");
      top.className = "flex items-center justify-between gap-2";

      const title = document.createElement("div");
      title.className = "text-white text-sm font-semibold";
      title.textContent = deviceTitle(item, index);

      const tag = document.createElement("span");
      tag.className = "text-[10px] text-muted-gray border border-white/10 rounded px-2 py-0.5";
      tag.textContent = "Устройство";

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

  function setListLoadingState(seq, loadingText, preserveActionStatus) {
    state.listState = "loading";
    if (!state.hasLoadedList) {
      renderTop();
      renderList();
    }
    if (!preserveActionStatus) setStatus(refs.status, loadingText);

    clearListProgressTimer();
    state.listProgressTimer = window.setTimeout(() => {
      if (seq !== state.listRequestSeq || !state.loading) return;
      state.listState = "retrying";
      if (!preserveActionStatus) {
        setStatus(refs.status, "Список загружается дольше обычного. Проверяем соединение...");
      }
    }, 5000);
  }

  async function loadList(force = false, options = {}) {
    const { loadingText = "Получаем список устройств...", preserveActionStatus = false } = options;
    if (state.loading && !force) return { ok: false, stale: true };
    const seq = state.listRequestSeq + 1;
    state.listRequestSeq = seq;
    state.loading = true;
    setBusy(true);
    setListLoadingState(seq, loadingText, preserveActionStatus);

    try {
      const data = await apiFetch("/api/device/list");
      if (seq !== state.listRequestSeq) return { ok: false, stale: true };
      state.items = Array.isArray(data?.items) ? data.items : [];
      state.deviceLimit = Number(data?.device_limit || 0);
      state.connected = Number(data?.connected || state.items.length || 0);
      state.mainUuid = String(state.items[0]?.uuid || "").trim();
      state.hasLoadedList = true;
      state.listState = "loaded";

      renderTop();
      renderList();
      if (!preserveActionStatus) {
        setStatus(refs.status, `Устройств подключено: ${state.connected}/${state.deviceLimit || 0}.`);
      }
    } catch (error) {
      if (seq !== state.listRequestSeq) return { ok: false, stale: true };
      state.listState = state.hasLoadedList ? "stale" : "unavailable";
      if (state.hasLoadedList) {
        // Preserve the last confirmed cards during temporary refresh failures.
        renderTop();
        renderList();
      } else {
        renderTop();
        renderList();
      }
      if (!preserveActionStatus) {
        const temporary = isTemporaryListError(error);
        const text = state.hasLoadedList
          ? "Список временно не обновился. Нажми «Обновить список»."
          : "Не удалось получить список устройств. Нажми «Обновить список».";
        setStatus(refs.status, temporary ? text : mapApiError(error), !temporary);
      }
      return { ok: false, error };
    } finally {
      if (seq === state.listRequestSeq) {
        clearListProgressTimer();
        state.loading = false;
        setBusy(false);
      }
    }

    return { ok: true };
  }

  function rememberPendingAdd(payload, knownUuids) {
    state.pendingAdd = {
      requestId: newRequestId(),
      payload,
      knownUuids: Array.from(knownUuids),
      createdAt: Date.now(),
      postOutcome: { kind: "pending", status: 0, detail: "", phase: "request" },
    };
    writePendingAdd(state.pendingAdd);
    return state.pendingAdd;
  }

  function rememberAddPostOutcome(pending, outcome) {
    if (!pending || state.pendingAdd !== pending) return;
    pending.postOutcome = outcome;
    writePendingAdd(pending);
  }

  function forgetPendingAdd() {
    state.pendingAdd = null;
    state.addOutcomeUnknown = false;
    clearPendingAdd();
  }

  async function getAddOperation(requestId) {
    for (let attempt = 0; attempt < ADD_OPERATION_MAX_POLLS; attempt += 1) {
      try {
        const operation = await apiFetch(`/api/device/operations/${encodeURIComponent(requestId)}`);
        const status = String(operation?.status || "").toLowerCase();
        if (status === "succeeded" || status === "failed") return { kind: status, operation };
      } catch (error) {
        if (Number(error?.status || 0) === 404) return { kind: "not_found" };
        if (!isIndeterminateTransportError(error)) return { kind: "error", error };
      }
      await sleep(ADD_OPERATION_POLL_DELAY_MS);
    }
    return { kind: "processing" };
  }

  async function finishCreated(operation) {
    const nextLink = String(operation?.subscription_url || "").trim();
    if (nextLink) state.subscriptionUrl = nextLink;

    forgetPendingAdd();
    showAddForm(false);
    setStatus(refs.status, "Устройство создано. Обновляю список...");
    const refreshed = await loadList(true, { preserveActionStatus: true });
    if (refreshed.stale) return;
    if (refreshed.ok) {
      setStatus(refs.status, "Устройство добавлено.");
    } else {
      setStatus(refs.status, "Устройство создано. Список временно не обновился.");
    }
  }

  async function resumePendingAdd({ retryMissing = false } = {}) {
    const pending = state.pendingAdd;
    if (!pending) return false;

    let postOutcome = pending.postOutcome || { kind: "unknown", status: 0, detail: "", phase: "" };
    if (postOutcome.kind === "http_error") {
      forgetPendingAdd();
      setBusy(false);
      setStatus(refs.status, mapApiError({ ...postOutcome, data: { detail: postOutcome.detail } }), true);
      return false;
    }

    setBusy(true);
    setStatus(refs.status, "Проверяю создание устройства...");
    let outcome = await getAddOperation(pending.requestId);

    // Retry only after a user-triggered action and only when the initial POST
    // had no HTTP response at all. A confirmed HTTP error must stay final.
    if (outcome.kind === "not_found" && retryMissing && postOutcome.kind === "no_http_response") {
      try {
        const data = await apiFetch("/api/device/add", {
          method: "POST",
          headers: { "X-Request-ID": pending.requestId },
          body: JSON.stringify({ ...pending.payload, request_id: pending.requestId }),
        });
        if (String(data?.status || "").toLowerCase() === "succeeded" || data?.subscription_url) {
          await finishCreated(data);
          return true;
        }
        rememberAddPostOutcome(pending, { kind: "accepted", status: 0, detail: String(data?.status || ""), phase: "response" });
        postOutcome = pending.postOutcome;
        outcome = await getAddOperation(pending.requestId);
      } catch (error) {
        const retryOutcome = getAddPostOutcome(error);
        rememberAddPostOutcome(pending, retryOutcome);
        if (retryOutcome.kind === "http_error") outcome = { kind: "error", error };
      }
    }

    if (outcome.kind === "succeeded") {
      await finishCreated(outcome.operation);
      return true;
    }
    if (outcome.kind === "failed" || outcome.kind === "error") {
      forgetPendingAdd();
      setBusy(false);
      setStatus(refs.status, mapApiError(outcome.error || outcome.operation), true);
      return false;
    }
    if (outcome.kind === "not_found") {
      if (postOutcome.kind !== "no_http_response") {
        state.addOutcomeUnknown = true;
        setBusy(false);
        setStatus(refs.status, "Сервер не подтвердил операцию. Не создавай второе устройство: обнови список позже.", true);
        return false;
      }
      forgetPendingAdd();
      setBusy(false);
      setStatus(refs.status, "Сервер не получил запрос. Можно создать устройство заново.", true);
      return false;
    }

    state.addOutcomeUnknown = true;
    setBusy(false);
    setStatus(refs.status, "Создание еще выполняется. Нажми «Обновить список», не создавая второе устройство.", true);
    return false;
  }

  async function addDevice() {
    if (state.busy || state.addOutcomeUnknown) return;
    if (state.pendingAdd) {
      await resumePendingAdd({ retryMissing: true });
      return;
    }

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
    const knownUuids = new Set(state.items.map((item) => String(item?.uuid || "").trim()).filter(Boolean));
    const pending = rememberPendingAdd(payload, knownUuids);

    setBusy(true);
    setStatus(refs.status, "Создаю устройство. Не закрывай Mini App...");

    try {
      const data = await apiFetch("/api/device/add", {
        method: "POST",
        headers: { "X-Request-ID": pending.requestId },
        body: JSON.stringify({ ...payload, request_id: pending.requestId }),
      });

      if (String(data?.status || "").toLowerCase() === "processing") {
        rememberAddPostOutcome(pending, { kind: "accepted", status: 0, detail: "processing", phase: "response" });
        await resumePendingAdd();
        return;
      }
      rememberAddPostOutcome(pending, { kind: "accepted", status: 0, detail: "succeeded", phase: "response" });
      await finishCreated(data);
    } catch (error) {
      const postOutcome = getAddPostOutcome(error);
      rememberAddPostOutcome(pending, postOutcome);
      if (postOutcome.kind === "no_http_response" || postOutcome.kind === "response_unreadable") {
        await resumePendingAdd();
        return;
      }
      forgetPendingAdd();
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
    const previousEmail = String(state.items.find((item) => String(item?.uuid || "").trim() === target)?.email || "").trim();

    setBusy(true);
    setStatus(refs.status, "Обновляю ключ устройства...");

    try {
      const data = await apiFetch("/api/device/rotate", {
        method: "POST",
        body: JSON.stringify({ uuid: target }),
      });

      const nextLink = String(data?.subscription_url || "").trim();
      if (nextLink) state.subscriptionUrl = nextLink;

      setStatus(refs.status, "Ключ обновлен. Обновляю список...");
      const refreshed = await loadList(true, { preserveActionStatus: true });
      if (refreshed.stale) return;
      setStatus(refs.status, refreshed.ok ? "Ключ устройства обновлен." : "Ключ обновлен. Список временно не обновился.");
    } catch (error) {
      if (isIndeterminateTransportError(error)) {
        setStatus(refs.status, "Ответ не получен. Проверяю, обновился ли ключ...");
        const refreshed = await loadList(true, { preserveActionStatus: true });
        if (refreshed.stale) return;
        const rotated = refreshed.ok && state.items.some((item) => {
          const itemUuid = String(item?.uuid || "").trim();
          return itemUuid && itemUuid !== target && String(item?.email || "").trim() === previousEmail;
        });
        if (rotated) {
          setStatus(refs.status, "Ключ устройства обновлен.");
          return;
        }
        setStatus(refs.status, "Не удалось подтвердить обновление ключа. Не нажимай повторно: подожди и обнови список.");
        return;
      }
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

      state.items = state.items.filter((item) => String(item?.uuid || "").trim() !== target);
      state.connected = state.items.length;
      state.mainUuid = String(state.items[0]?.uuid || "").trim();
      state.hasLoadedList = true;
      renderTop();
      renderList();

      setStatus(refs.status, "Устройство удалено. Обновляю список...");
      const refreshed = await loadList(true, { preserveActionStatus: true });
      if (refreshed.stale) return;
      setStatus(refs.status, refreshed.ok ? "Устройство удалено." : "Устройство удалено. Список временно не обновился.");
    } catch (error) {
      if (isIndeterminateTransportError(error)) {
        setStatus(refs.status, "Ответ не получен. Проверяю, удалилось ли устройство...");
        const refreshed = await loadList(true, { preserveActionStatus: true });
        if (refreshed.stale) return;
        const removed = refreshed.ok && !state.items.some((item) => String(item?.uuid || "").trim() === target);
        if (removed) {
          setStatus(refs.status, "Устройство удалено.");
          return;
        }
        setStatus(refs.status, "Не удалось подтвердить удаление. Не нажимай повторно: подожди и обнови список.");
        return;
      }
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
  refs.refreshBtn.addEventListener("click", async () => {
    const refreshed = await loadList(true);
    if (refreshed.ok && state.pendingAdd) {
      await resumePendingAdd({ retryMissing: true });
      return;
    }
    if (refreshed.ok && state.addOutcomeUnknown) {
      state.addOutcomeUnknown = false;
      setBusy(false);
    }
  });
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
      const refreshed = await loadList(true);
      if (refreshed.ok && state.pendingAdd) {
        await resumePendingAdd({ retryMissing: true });
        return;
      }
      if (refreshed.ok && state.addOutcomeUnknown) {
        state.addOutcomeUnknown = false;
        setBusy(false);
      }
    },
  };
}
