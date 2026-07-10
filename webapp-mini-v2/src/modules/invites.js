import { apiFetch } from "../api/client.js?v=20260710-miniapp-unified-1";

const DIRECT_PLACEHOLDER = "t.me/GhostLinkBot?start=<token>";
const BRIDGE_PLACEHOLDER = "https://api.112prd.ru/s/<bridge-subscription>";
const QR_SCRIPT_SRC = "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js";
const BRIDGE_POLL_MS = 15000;
const REFERRAL_CACHE_TTL_MS = 30000;
const BRIDGE_V1_DISABLED = false;

let qrScriptPromise = null;

function setActiveTab(button, isActive) {
  button.classList.toggle("bg-primary", isActive);
  button.classList.toggle("text-black", isActive);
  button.classList.toggle("text-primary", !isActive);
}

function setMessage(node, text, isError = false) {
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("text-accent-red", isError);
  node.classList.toggle("text-muted-gray", !isError);
}

function flashCopyButton(button, ok, okText = "Скопировано ✓", failText = "Ошибка копирования") {
  if (!(button instanceof HTMLButtonElement)) return;
  const original = button.dataset.originalText || button.textContent || "";
  button.dataset.originalText = original;
  button.textContent = ok ? okText : failText;
  button.classList.add(ok ? "bg-primary" : "border-accent-red", ok ? "text-black" : "text-accent-red");
  window.setTimeout(() => {
    button.textContent = original;
    button.classList.remove("bg-primary", "text-black", "border-accent-red", "text-accent-red");
  }, 1400);
}

function mapApiError(error) {
  const status = Number(error?.status || 0);
  const detail = String(error?.message || error?.data?.detail || "").trim();

  if (status === 429 && detail === "invite_limit_reached") return "Достигнут лимит активных приглашений.";
  if (status === 401 || status === 403) return "Нет доступа. Перезапусти mini app из Telegram.";
  if (status === 429) return "Слишком много запросов. Попробуй позже.";
  if (status === 409 && detail === "invite_used") return "Этот мост уже использован.";
  if (status === 410 && detail === "invite_expired") return "Ссылка моста истекла.";
  if (status === 410 && detail === "invite_revoked") return "Мост отозван.";
  if (status === 404 && detail === "invite_not_found") return "Мост не найден.";
  if (status === 400 && detail === "bad_params") return "Некорректные параметры запроса.";
  return "Ошибка сети. Попробуй еще раз.";
}

async function copyText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    return false;
  }
}

function formatExpiry(expiresInSec) {
  const sec = Math.max(0, Number(expiresInSec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

function renderTrackingList(listNode, items) {
  if (!listNode) return;

  if (!Array.isArray(items) || items.length === 0) {
    listNode.innerHTML = '<div class="rounded-xl border border-white/10 bg-card-dark px-3 py-2">Пока нет приглашенных пользователей</div>';
    return;
  }

  const rows = items.map((item) => {
    const rawName = String(item?.name || "").trim();
    const name = rawName || `ID ${String(item?.id || "").trim() || "—"}`;
    const paid = String(item?.status || "").toLowerCase() === "paid";
    const status = paid ? "Оплатил" : "Ожидает оплату";
    return (
      '<div class="rounded-xl border border-white/10 bg-card-dark px-3 py-2 flex items-center justify-between gap-3">' +
      `<span class="text-white break-all">${name}</span>` +
      `<span class="${paid ? "text-primary" : "text-muted-gray"} text-xs whitespace-nowrap">${status}</span>` +
      "</div>"
    );
  });

  listNode.innerHTML = rows.join("");
}

function getBridgeStage(invite, hasPaidBonus = false) {
  if (!invite) return 0;
  const status = String(invite?.status || "");
  const sessionStatus = String(invite?.bridge_session?.status || "");
  if (hasPaidBonus) return 5;
  if (sessionStatus === "claimed") return 4;
  if (sessionStatus === "pending_claim") return 2;
  if (sessionStatus === "pending_cleanup") return 3;
  if (sessionStatus === "cleaned" || sessionStatus === "expired") return 4;
  if (sessionStatus === "issued") return 2;
  if (status === "used") return 2;
  if (status === "active") return 1;
  return 0;
}

function paintBridgeTimeline(container, stage) {
  if (!container) return;
  const steps = Array.from(container.querySelectorAll(":scope > div"));
  steps.forEach((node, idx) => {
    const active = idx < stage;
    node.classList.toggle("text-primary", active);
    node.classList.toggle("text-muted-gray", !active);
    node.classList.toggle("border-primary/50", active);
    node.classList.toggle("border-white/10", !active);
  });
}

function ensureQrScript() {
  if (window.QRCode && typeof window.QRCode.toCanvas === "function") {
    return Promise.resolve(true);
  }
  if (qrScriptPromise) return qrScriptPromise;

  qrScriptPromise = new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${QR_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(!!window.QRCode), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = QR_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(!!window.QRCode);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return qrScriptPromise;
}

async function renderBridgeQr(stubNode, link) {
  if (!stubNode) return;
  const value = String(link || "").trim();
  if (!value) {
    stubNode.classList.add("px-3");
    stubNode.innerHTML = "QR появится после создания";
    return;
  }
  stubNode.classList.remove("px-3");

  const hasQr = await ensureQrScript();
  if (!hasQr || !window.QRCode || typeof window.QRCode.toCanvas !== "function") {
    const img = document.createElement("img");
    img.alt = "Bridge QR";
    img.width = 176;
    img.height = 176;
    img.style.width = "176px";
    img.style.height = "176px";
    img.style.display = "block";
    img.style.margin = "0 auto";
    img.style.borderRadius = "10px";
    img.style.objectFit = "contain";
    img.src = `https://quickchart.io/qr?size=220&dark=111111&light=FFFFFF&text=${encodeURIComponent(value)}`;
    img.onerror = () => {
      stubNode.innerHTML = "QR недоступен. Используй короткую ссылку.";
    };
    stubNode.innerHTML = "";
    stubNode.appendChild(img);
    return;
  }

  stubNode.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.style.width = "176px";
  canvas.style.height = "176px";
  canvas.style.display = "block";
  canvas.style.margin = "0 auto";
  canvas.style.borderRadius = "10px";
  window.QRCode.toCanvas(
    canvas,
    value,
    {
      width: 176,
      margin: 1,
      color: {
        dark: "#111111",
        light: "#FFFFFF",
      },
    },
    (err) => {
      if (err) {
        stubNode.innerHTML = "Не удалось построить QR.";
        return;
      }
      stubNode.appendChild(canvas);
    },
  );
}

export function createInviteModule() {
  const refs = {
    directBtn: document.getElementById("inviteModeDirectBtn"),
    bridgeBtn: document.getElementById("inviteModeBridgeBtn"),
    trackBtn: document.getElementById("inviteModeTrackBtn"),
    directPane: document.getElementById("inviteDirectPane"),
    bridgePane: document.getElementById("inviteBridgePane"),
    trackPane: document.getElementById("inviteTrackingPane"),

    directLink: document.getElementById("directInviteLink"),
    directCopyBtn: document.getElementById("directCopyBtn"),
    directShareBtn: document.getElementById("directShareBtn"),
    directStatus: document.getElementById("directStatusText"),

    bridgeLink: document.getElementById("bridgeInviteLink"),
    bridgeCreateBtn: document.getElementById("bridgeCreateBtn"),
    bridgeCopyBtn: document.getElementById("bridgeCopyBtn"),
    bridgeRefreshQrBtn: document.getElementById("bridgeRefreshQrBtn"),
    bridgeRevokeBtn: document.getElementById("bridgeRevokeBtn"),
    bridgeStatus: document.getElementById("bridgeStatusText"),
    bridgeQrStub: document.getElementById("bridgeQrStub"),
    bridgeBotQrStub: document.getElementById("bridgeBotQrStub"),
    bridgeTimeline: document.getElementById("inviteTimeline"),
    bridgeAppChoiceBtns: document.getElementById("bridgeAppChoiceBtns"),
    bridgeAppsIosBtn: document.getElementById("bridgeAppsIosBtn"),
    bridgeAppsAndroidBtn: document.getElementById("bridgeAppsAndroidBtn"),
    bridgeIosApps: document.getElementById("bridgeIosApps"),
    bridgeAndroidApps: document.getElementById("bridgeAndroidApps"),
    bridgeAppsBackIosBtn: document.getElementById("bridgeAppsBackIosBtn"),
    bridgeAppsBackAndroidBtn: document.getElementById("bridgeAppsBackAndroidBtn"),

    trackingRefreshBtn: document.getElementById("trackingRefreshBtn"),
    trackingTotal: document.getElementById("trackingTotalCount"),
    trackingPaid: document.getElementById("trackingPaidCount"),
    trackingInfo: document.getElementById("trackingInfoText"),
    trackingList: document.getElementById("inviteTrackingList"),
  };

  if (
    !refs.directBtn || !refs.bridgeBtn || !refs.trackBtn ||
    !refs.directPane || !refs.bridgePane || !refs.trackPane
  ) {
    return { open: () => {}, setMode: () => {} };
  }

  const state = {
    mode: "direct",
    directLink: "",
    bridgeInvite: null,
    bridgeTempKey: "",
    bridgeTempToken: "",
    bridgeTempKeyExpiresInSec: 0,
    bridgeLoaded: false,
    bridgeLoading: false,
    bridgePollTimer: null,
    referralsCache: null,
    referralsCacheTs: 0,
    trackLoaded: false,
    trackLoading: false,
  };

  function resetReferralCache() {
    state.referralsCache = null;
    state.referralsCacheTs = 0;
  }

  function stopBridgePolling() {
    if (!state.bridgePollTimer) return;
    clearInterval(state.bridgePollTimer);
    state.bridgePollTimer = null;
  }

  function startBridgePolling() {
    if (state.bridgePollTimer) return;
    state.bridgePollTimer = setInterval(() => {
      if (state.mode !== "bridge") return;
      loadBridgeInvite(true);
    }, BRIDGE_POLL_MS);
  }

  function showBridgeApps(target) {
    const value = String(target || "").toLowerCase();
    const showIos = value === "ios";
    const showAndroid = value === "android";
    refs.bridgeAppChoiceBtns?.classList.toggle("hidden", showIos || showAndroid);
    refs.bridgeIosApps?.classList.toggle("hidden", !showIos);
    refs.bridgeAndroidApps?.classList.toggle("hidden", !showAndroid);
  }

  async function fetchReferralsCached(force = false) {
    const now = Date.now();
    if (!force && state.referralsCache && (now - state.referralsCacheTs) < REFERRAL_CACHE_TTL_MS) {
      return state.referralsCache;
    }
    try {
      const data = await apiFetch("/api/referrals");
      state.referralsCache = data || { items: [] };
      state.referralsCacheTs = now;
      return state.referralsCache;
    } catch (_) {
      return state.referralsCache;
    }
  }

  function bridgeInviteHasPaidBonus(invite, referrals) {
    const invitedId = String(
      invite?.invited_tg_id ||
      invite?.bridge_session?.invited_tg_id ||
      "",
    ).trim();
    if (!invitedId || !Array.isArray(referrals?.items)) return false;
    return referrals.items.some((item) => {
      const itemId = String(item?.id || "").trim();
      const paid = String(item?.status || "").toLowerCase() === "paid";
      return paid && itemId === invitedId;
    });
  }

  async function loadDirectLink() {
    setMessage(refs.directStatus, "Загрузка ссылки...");
    try {
      const data = await apiFetch("/api/user");
      const link = String(data?.referral_link || "").trim();
      state.directLink = link;

      if (!link) {
        refs.directLink.textContent = DIRECT_PLACEHOLDER;
        refs.directLink.classList.remove("text-white");
        refs.directLink.classList.add("text-muted-gray");
        setMessage(refs.directStatus, "Ссылка пока не выдана.", true);
        return;
      }

      refs.directLink.textContent = link;
      refs.directLink.classList.remove("text-muted-gray");
      refs.directLink.classList.add("text-white");
      setMessage(refs.directStatus, "Ссылка готова.");
    } catch (error) {
      refs.directLink.textContent = DIRECT_PLACEHOLDER;
      refs.directLink.classList.remove("text-white");
      refs.directLink.classList.add("text-muted-gray");
      setMessage(refs.directStatus, mapApiError(error), true);
    }
  }

  function clearBridgeInvite() {
    state.bridgeInvite = null;
    state.bridgeTempKey = "";
    state.bridgeTempToken = "";
    state.bridgeTempKeyExpiresInSec = 0;
    if (refs.bridgeLink) {
      refs.bridgeLink.textContent = BRIDGE_PLACEHOLDER;
      refs.bridgeLink.classList.remove("text-white");
      refs.bridgeLink.classList.add("text-muted-gray");
    }
    paintBridgeTimeline(refs.bridgeTimeline, 0);
    renderBridgeQr(refs.bridgeQrStub, "");
    renderBridgeQr(refs.bridgeBotQrStub, "");
  }

  async function issueBridgeTempKey(inviteToken) {
    const token = String(inviteToken || "").trim();
    if (!token) return null;
    const data = await apiFetch(`/bridge/i/${encodeURIComponent(token)}/temp-key`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const key = String(data?.subscription_url || data?.bridge_subscription_url || data?.vless || data?.temp_key_vless || "").trim();
    state.bridgeTempKey = key;
    state.bridgeTempToken = token;
    state.bridgeTempKeyExpiresInSec = Number(data?.expires_in_sec || 0);
    return {
      ...data,
      vless: key,
    };
  }

  async function paintBridgeInvite(invite) {
    state.bridgeInvite = invite || null;
    const value = String(state.bridgeTempKey || "").trim();
    if (refs.bridgeLink) {
      refs.bridgeLink.textContent = value || BRIDGE_PLACEHOLDER;
      refs.bridgeLink.classList.toggle("text-white", !!value);
      refs.bridgeLink.classList.toggle("text-muted-gray", !value);
    }

    const referrals = await fetchReferralsCached(false);
    const hasPaidBonus = bridgeInviteHasPaidBonus(invite, referrals);
    paintBridgeTimeline(refs.bridgeTimeline, getBridgeStage(invite, hasPaidBonus));
    await renderBridgeQr(refs.bridgeQrStub, value);
    const tgLink = String(invite?.telegram_start_link || invite?.direct_link || "").trim();
    await renderBridgeQr(refs.bridgeBotQrStub, tgLink);
    return { hasPaidBonus };
  }

  async function loadBridgeInvite(force = false) {
    if (state.bridgeLoading) return;
    if (!force && state.bridgeLoaded) return;

    state.bridgeLoading = true;
    setMessage(refs.bridgeStatus, "Загрузка моста...");
    try {
      const data = await apiFetch("/api/invite/list?mode=bridge");
      const items = Array.isArray(data?.items) ? data.items : [];
      const active = items.find((item) => String(item?.status || "") === "active");
      const used = items.find((item) => String(item?.status || "") === "used");
      const current = active || used || null;

      if (!current) {
        clearBridgeInvite();
        setMessage(refs.bridgeStatus, "У тебя пока нет активного моста. Нажми «Создать мост 2.0».");
      } else {
        const token = String(current?.token || "").trim();
        if (token && token !== state.bridgeTempToken) {
          state.bridgeTempKey = "";
          state.bridgeTempKeyExpiresInSec = 0;
        }
        if (token && !state.bridgeTempKey) {
          try {
            await issueBridgeTempKey(token);
          } catch (_) {
            state.bridgeTempKey = "";
            state.bridgeTempToken = "";
            state.bridgeTempKeyExpiresInSec = 0;
          }
        }
        const extra = await paintBridgeInvite(current);
        const expiresIn = Number(state.bridgeTempKeyExpiresInSec || current?.expires_in_sec || 0);
        const sessionStatus = String(current?.bridge_session?.status || "");
        if (extra?.hasPaidBonus) {
          setMessage(refs.bridgeStatus, "Мост завершен. Приглашенный оплатил подписку, бонус зачислен.");
        } else if (sessionStatus === "claimed") {
          setMessage(refs.bridgeStatus, "Гость вошел в Telegram. Подписка моста закреплена за его аккаунтом и ждет решения администратора.");
        } else if (sessionStatus === "pending_claim") {
          setMessage(refs.bridgeStatus, `Подписка моста работает еще ${formatExpiry(expiresIn)} без Telegram. После включения VPN гость сканирует QR Telegram-бота.`);
        } else if (sessionStatus === "pending_cleanup") {
          const cleanupAfterTs = Number(current?.bridge_session?.cleanup_after_ts || 0);
          const nowTs = Math.floor(Date.now() / 1000);
          const cleanupIn = cleanupAfterTs > nowTs ? cleanupAfterTs - nowTs : 0;
          setMessage(refs.bridgeStatus, `Старый мост: гость вошел в Telegram, временный ключ отключится через ${formatExpiry(cleanupIn)}.`);
        } else if (sessionStatus === "cleaned" || sessionStatus === "expired") {
          setMessage(refs.bridgeStatus, "Мост завершен или срок ожидания истек. Создай новый мост при необходимости.");
        } else if (!state.bridgeTempKey) {
          setMessage(refs.bridgeStatus, "Мост найден, но подписка еще не выдана. Нажми «Обновить подписку».");
        } else {
          setMessage(refs.bridgeStatus, `Подписка моста активна еще ${formatExpiry(expiresIn)} без Telegram. После включения VPN открой Telegram-бота.`);
        }
      }
      state.bridgeLoaded = true;
    } catch (error) {
      clearBridgeInvite();
      setMessage(refs.bridgeStatus, mapApiError(error), true);
    } finally {
      state.bridgeLoading = false;
    }
  }

  async function createBridgeInvite(forceNew = false) {
    if (BRIDGE_V1_DISABLED) {
      setMessage(refs.bridgeStatus, "МОСТ 2.0 в подготовке. Временная выдача ключей скоро вернется.", true);
      return;
    }
    setMessage(refs.bridgeStatus, forceNew ? "Обновляю мост и подписку..." : "Создаю мост 2.0...");
    try {
      const data = await apiFetch("/api/invite/create", {
        method: "POST",
        body: JSON.stringify({ type: "bridge", force_new: forceNew }),
      });
      const invite = data?.invite || null;
      if (!invite) throw new Error("invite_not_created");
      const token = String(invite?.token || "").trim();
      if (!token) throw new Error("invite_not_created");
      await issueBridgeTempKey(token);
      resetReferralCache();
      await paintBridgeInvite(invite);
      const expiresIn = Number(state.bridgeTempKeyExpiresInSec || 0);
      const reused = !!data?.reused;
      setMessage(
        refs.bridgeStatus,
        reused
          ? `Мост 2.0 уже активен. Подписка обновлена, срок ожидания: ${formatExpiry(expiresIn)}.`
          : `Мост 2.0 создан. Подписка выдана, срок ожидания входа в бота: ${formatExpiry(expiresIn)}.`,
      );
      state.bridgeLoaded = true;
    } catch (error) {
      setMessage(refs.bridgeStatus, mapApiError(error), true);
    }
  }

  async function revokeBridgeInvite() {
    if (BRIDGE_V1_DISABLED) {
      setMessage(refs.bridgeStatus, "МОСТ 2.0 в подготовке. Отзыв временно недоступен.", true);
      return;
    }
    const token = String(state.bridgeInvite?.token || "").trim();
    if (!token) {
      setMessage(refs.bridgeStatus, "Нет активного моста для отзыва.", true);
      return;
    }
    setMessage(refs.bridgeStatus, "Отзываю мост...");
    try {
      await apiFetch("/api/invite/revoke", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      clearBridgeInvite();
      setMessage(refs.bridgeStatus, "Мост отозван.");
      state.bridgeLoaded = false;
      resetReferralCache();
    } catch (error) {
      setMessage(refs.bridgeStatus, mapApiError(error), true);
    }
  }

  async function loadTrackingReport(force = false) {
    if (state.trackLoading) return;
    if (!force && state.trackLoaded) return;

    state.trackLoading = true;
    setMessage(refs.trackingInfo, "Загрузка отчета...");
    renderTrackingList(refs.trackingList, []);

    try {
      const data = await apiFetch("/api/referrals");
      state.referralsCache = data || { items: [] };
      state.referralsCacheTs = Date.now();

      const total = Number(data?.total || 0);
      const paid = Number(data?.paid || 0);
      if (refs.trackingTotal) refs.trackingTotal.textContent = String(total);
      if (refs.trackingPaid) refs.trackingPaid.textContent = String(paid);
      renderTrackingList(refs.trackingList, Array.isArray(data?.items) ? data.items : []);
      setMessage(refs.trackingInfo, `Отчет обновлен в ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}.`);
      state.trackLoaded = true;
    } catch (error) {
      if (refs.trackingTotal) refs.trackingTotal.textContent = "0";
      if (refs.trackingPaid) refs.trackingPaid.textContent = "0";
      renderTrackingList(refs.trackingList, []);
      setMessage(refs.trackingInfo, mapApiError(error), true);
    } finally {
      state.trackLoading = false;
    }
  }

  function setMode(mode) {
    const isDirect = mode === "direct";
    const isBridge = mode === "bridge";
    const isTrack = mode === "track";

    state.mode = mode;
    refs.directPane.classList.toggle("hidden", !isDirect);
    refs.bridgePane.classList.toggle("hidden", !isBridge);
    refs.trackPane.classList.toggle("hidden", !isTrack);

    setActiveTab(refs.directBtn, isDirect);
    setActiveTab(refs.bridgeBtn, isBridge);
    setActiveTab(refs.trackBtn, isTrack);

    if (isTrack) loadTrackingReport(false);
    if (isBridge) {
      refs.bridgeCreateBtn?.setAttribute("disabled", "disabled");
      refs.bridgeRefreshQrBtn?.setAttribute("disabled", "disabled");
      refs.bridgeRevokeBtn?.setAttribute("disabled", "disabled");
      refs.bridgeCopyBtn?.setAttribute("disabled", "disabled");
      if (BRIDGE_V1_DISABLED) {
        stopBridgePolling();
        clearBridgeInvite();
        setMessage(refs.bridgeStatus, "МОСТ 2.0 в подготовке. Используй прямое приглашение.", true);
      } else {
        refs.bridgeCreateBtn?.removeAttribute("disabled");
        refs.bridgeRefreshQrBtn?.removeAttribute("disabled");
        refs.bridgeRevokeBtn?.removeAttribute("disabled");
        refs.bridgeCopyBtn?.removeAttribute("disabled");
        startBridgePolling();
        loadBridgeInvite(false);
      }
    } else {
      refs.bridgeCreateBtn?.removeAttribute("disabled");
      refs.bridgeRefreshQrBtn?.removeAttribute("disabled");
      refs.bridgeRevokeBtn?.removeAttribute("disabled");
      refs.bridgeCopyBtn?.removeAttribute("disabled");
      stopBridgePolling();
    }
  }

  refs.directBtn.addEventListener("click", () => setMode("direct"));
  refs.bridgeBtn.addEventListener("click", () => setMode("bridge"));
  refs.trackBtn.addEventListener("click", () => setMode("track"));

  refs.directCopyBtn?.addEventListener("click", async () => {
    if (!state.directLink) await loadDirectLink();
    const ok = await copyText(state.directLink);
    flashCopyButton(refs.directCopyBtn, ok);
    setMessage(refs.directStatus, ok ? "Ссылка скопирована." : "Не удалось скопировать ссылку.", !ok);
  });

  refs.directShareBtn?.addEventListener("click", async () => {
    if (!state.directLink) await loadDirectLink();
    const link = String(state.directLink || "").trim();
    if (!link) {
      setMessage(refs.directStatus, "Ссылка пока недоступна.", true);
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({
          title: "GhostLink",
          text: "Приглашение в клуб GhostLink",
          url: link,
        });
        setMessage(refs.directStatus, "Ссылка отправлена.");
      } else {
        const ok = await copyText(link);
        flashCopyButton(refs.directCopyBtn, ok);
        setMessage(refs.directStatus, ok ? "Ссылка скопирована." : "Не удалось скопировать ссылку.", !ok);
      }
    } catch (_) {
      // User canceled share dialog.
    }
  });

  refs.bridgeCreateBtn?.addEventListener("click", () => createBridgeInvite(false));
  refs.bridgeRefreshQrBtn?.addEventListener("click", () => createBridgeInvite(true));
  refs.bridgeRevokeBtn?.addEventListener("click", revokeBridgeInvite);
  refs.bridgeAppsIosBtn?.addEventListener("click", () => showBridgeApps("ios"));
  refs.bridgeAppsAndroidBtn?.addEventListener("click", () => showBridgeApps("android"));
  refs.bridgeAppsBackIosBtn?.addEventListener("click", () => showBridgeApps(""));
  refs.bridgeAppsBackAndroidBtn?.addEventListener("click", () => showBridgeApps(""));
  refs.bridgeCopyBtn?.addEventListener("click", async () => {
    if (BRIDGE_V1_DISABLED) {
      setMessage(refs.bridgeStatus, "МОСТ 2.0 в подготовке. Временная ссылка недоступна.", true);
      return;
    }
    const key = String(state.bridgeTempKey || refs.bridgeLink?.textContent || "").trim();
    const ok = await copyText(key === BRIDGE_PLACEHOLDER ? "" : key);
    flashCopyButton(refs.bridgeCopyBtn, ok);
    setMessage(refs.bridgeStatus, ok ? "Подписка моста скопирована." : "Подписка моста пока недоступна.", !ok);
  });

  refs.trackingRefreshBtn?.addEventListener("click", () => loadTrackingReport(true));

  async function open() {
    if (!state.directLink) await loadDirectLink();
    if (state.mode === "bridge") {
      startBridgePolling();
      await loadBridgeInvite(false);
    }
  }

  clearBridgeInvite();
  setMode("direct");

  return {
    open,
    setMode,
  };
}
