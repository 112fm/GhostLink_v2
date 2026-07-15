import { createScreenRouter } from "./ui/screens.js?v=20260715-miniapp-release-25";
import { apiFetch, configureApiClient, establishMiniAppSession } from "./api/client.js?v=20260715-miniapp-release-25";
import { bootstrapAuthContext } from "./modules/auth.js?v=20260715-miniapp-release-25";
import { createInviteModule } from "./modules/invites.js?v=20260715-miniapp-release-25";
import { createPaymentsModule } from "./modules/payments.js?v=20260715-miniapp-release-25";
import { createDevicesModule } from "./modules/devices.js?v=20260715-miniapp-release-25";
import { createAdminModule } from "./modules/admin.js?v=20260715-miniapp-release-25";

const ADMIN_PREVIEW_MODE = false;
const APP_BUILD_VERSION = "2.0.0";
const VERSION_RELOAD_KEY = "ghostlink_version_soft_reload_done";
const ONBOARDING_KEY = "ghostlink_onboarding_seen_v2";
const HOME_CACHE_KEY = "ghostlink_home_snapshot_v2";

function formatSubLine(sub) {
  if (!sub || !sub.active) return "Нет подписки";
  if (!sub.expiry) return "Без срока";

  const human = sub.expiry_human || sub.expiry;
  const days = Number(sub.days_left);
  if (Number.isFinite(days)) return `${human} · ${days} дн`;

  return human;
}

function formatTariffLabel(limit) {
  const n = Math.max(1, Number(limit || 1));
  if (n <= 2) return "Solo Ghost · до 2 устройств";
  return `Flex Squad · ${n} устройств`;
}

function applySubStatus(ref, active) {
  if (!ref) return;

  if (active) {
    ref.textContent = "Подписка активна";
    ref.classList.remove("text-accent-red");
    ref.classList.remove("text-muted-gray");
    ref.classList.add("text-primary");
    return;
  }

  ref.textContent = "Подписка неактивна";
  ref.classList.remove("text-primary");
  ref.classList.remove("text-muted-gray");
  ref.classList.add("text-accent-red");
}

function applyHomeLoadError(refs, error) {
  const status = Number(error?.status || 0);

  if (refs.expiryValue) {
    refs.expiryValue.textContent = "Данные не загрузились";
  }

  if (refs.subStatus) {
    refs.subStatus.textContent =
      status === 401
        ? "Сессия не подтверждена"
        : status === 403
          ? "Доступ не подтвержден"
          : "Статус временно недоступен";
    refs.subStatus.classList.remove("text-primary");
    refs.subStatus.classList.remove("text-muted-gray");
    refs.subStatus.classList.add("text-accent-red");
  }

  if (refs.currentTariffLabel) {
    refs.currentTariffLabel.textContent =
      status === 401
        ? "Текущий тариф: открой Mini App заново"
        : "Текущий тариф: данные временно недоступны";
  }

  refs.clubBadgeLabel?.classList.add("hidden");
}

function isClubTier(tier) {
  const value = String(tier || "").toLowerCase();
  return value === "own" || value === "vip";
}

function parseVersionParts(input) {
  return String(input || "")
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((x) => {
      const n = Number.parseInt(x, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

function compareVersions(a, b) {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

async function checkAppVersion() {
  try {
    const version = await apiFetch("/api/app-version");
    const minVersion = String(version?.min_version || "").trim();
    const latestVersion = String(version?.latest_version || "").trim();
    const outdated = minVersion ? compareVersions(APP_BUILD_VERSION, minVersion) < 0 : false;
    return {
      ok: true,
      outdated,
      minVersion,
      latestVersion,
    };
  } catch (error) {
    return { ok: false, outdated: false, minVersion: "", latestVersion: "", error };
  }
}

function showUpdateScreen(router, versionState) {
  const msg = document.getElementById("updateMessageText");
  const btn = document.getElementById("updateReloadBtn");
  const minVersion = versionState?.minVersion ? `Минимальная версия: ${versionState.minVersion}.` : "";
  const latestVersion = versionState?.latestVersion ? ` Текущая версия: ${versionState.latestVersion}.` : "";
  if (msg) {
    msg.textContent = `Доступно обновление mini app. ${minVersion}${latestVersion} Закрой и заново открой приложение из Telegram.`;
  }
  if (btn) {
    btn.onclick = () => {
      window.location.reload();
    };
  }
  router.show("screen-update");
}

function getErrorScreenType(error) {
  if (error === "not-found") return "not-found";
  if (error?.maintenance || Number(error?.status || 0) === 503) return "maintenance";

  const status = Number(error?.status || 0);
  if (status === 0 || status >= 500) return "unavailable";
  return "";
}

function showAppError(router, error) {
  const type = getErrorScreenType(error);
  if (!type) return false;

  const content = {
    "not-found": {
      code: "404",
      title: "Страница не найдена",
      text: "Похоже, этот экран потерялся. Вернись назад и попробуй ещё раз.",
      image: "./assets/mascot/error-404-detective.png?v=20260715-miniapp-release-25",
    },
    unavailable: {
      code: "OFFLINE",
      title: "Сервис временно недоступен",
      text: "Не удалось связаться с GhostLink. Ошибка: " + (error?.message || String(error)) + ". Попробуй повторить через несколько секунд.",
      image: "./assets/mascot/error-unavailable-sleep.png?v=20260715-miniapp-release-25",
    },
    maintenance: {
      code: "MAINTENANCE",
      title: "Ведутся технические работы",
      text: "Мы уже чиним связь. Попробуй обновить Mini App немного позже.",
      image: "./assets/mascot/error-maintenance-helmet.png?v=20260715-miniapp-release-25",
    },
    forbidden: {
      code: "403",
      title: "Доступ запрещен",
      text: "У тебя нет прав для просмотра этого раздела.",
      image: "./assets/mascot/error-unavailable-sleep.png?v=20260715-miniapp-release-25",
    },
  }[type];

  const image = document.getElementById("errorStateImage");
  const code = document.getElementById("errorStateCode");
  const title = document.getElementById("errorStateTitle");
  const text = document.getElementById("errorStateText");
  if (image) {
    image.src = content.image;
    image.alt = content.title;
  }
  if (code) code.textContent = content.code;
  if (title) title.textContent = content.title;
  if (text) text.textContent = content.text;
  router.show("screen-error");
  return true;
}

function createHomeModule(auth) {
  const refs = {
    expiryValue: document.getElementById("expiryValue"),
    subStatus: document.getElementById("subStatus"),
    currentTariffLabel: document.getElementById("currentTariffLabel"),
    clubBadgeLabel: document.getElementById("clubBadgeLabel"),
    homeAdminBtn: document.getElementById("homeAdminBtn"),
  };

  function applyUserData(data) {
    if (refs.expiryValue) refs.expiryValue.textContent = formatSubLine(data?.subscription || null);
    applySubStatus(refs.subStatus, Boolean(data?.subscription?.active));

    if (refs.currentTariffLabel) {
      refs.currentTariffLabel.textContent = `Текущий тариф: ${formatTariffLabel(data?.device_limit)}`;
    }

    const showBadge = isClubTier(data?.member_tier);
    refs.clubBadgeLabel?.classList.toggle("hidden", !showBadge);
    if (refs.homeAdminBtn && (auth.isAdmin || Boolean(data?.user?.is_admin) || ADMIN_PREVIEW_MODE)) {
      refs.homeAdminBtn.classList.remove("hidden");
    }
  }

  function readSnapshot() {
    try {
      const raw = window.localStorage.getItem(HOME_CACHE_KEY);
      if (!raw) return null;
      const snapshot = JSON.parse(raw);
      return snapshot?.data && typeof snapshot.data === "object" ? snapshot : null;
    } catch (_) {
      return null;
    }
  }

  function writeSnapshot(data) {
    try {
      window.localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (_) {
      // Storage can be unavailable in restricted Telegram WebViews.
    }
  }

  async function refresh() {
    if (refs.homeAdminBtn && (auth.isAdmin || ADMIN_PREVIEW_MODE)) {
      refs.homeAdminBtn.classList.remove("hidden");
    }

    try {
      const data = await apiFetch("/api/user");
      applyUserData(data);
      writeSnapshot(data);
    } catch (error) {
      const snapshot = readSnapshot();
      if (snapshot) {
        applyUserData(snapshot.data);
        if (refs.subStatus) {
          refs.subStatus.textContent = "Нет связи · показаны последние данные";
          refs.subStatus.classList.remove("text-primary", "text-muted-gray");
          refs.subStatus.classList.add("text-accent-red");
        }
        return;
      }
      if (showAppError(router, error)) return;
      if (refs.homeAdminBtn && (auth.isAdmin || ADMIN_PREVIEW_MODE)) {
        refs.homeAdminBtn.classList.remove("hidden");
      }
      applyHomeLoadError(refs, error);
    }
  }

  return { refresh };
}

const screens = Array.from(document.querySelectorAll(".screen"));
const backBtn = document.getElementById("backBtn");
const helpBtn = document.getElementById("helpBtn");
const auth = bootstrapAuthContext();
const invites = createInviteModule();
const home = createHomeModule(auth);
const devices = createDevicesModule();
const admin = createAdminModule({
  telegramInitData: auth.initData,
  previewMode: ADMIN_PREVIEW_MODE,
});

configureApiClient({
  telegramInitData: auth.initData,
});

const router = createScreenRouter({
  screens,
  backBtn,
  helpBtn,
  homeId: "screen-home",
  fallbackId: "screen-error",
});

document.getElementById("errorRetryBtn")?.addEventListener("click", () => {
  window.location.reload();
});

const payments = createPaymentsModule({
  openPaymentScreen: () => router.push("screen-payment"),
});

if (backBtn) {
  backBtn.addEventListener("click", async () => {
    router.pop();
    const current = router.current();

    if (current === "screen-home") await home.refresh();
    if (current === "screen-tariffs") await payments.openTariffs();
    if (current === "screen-devices") await devices.open();
    if (current === "screen-admin") await admin.open();
  });
}

const homeDevicesBtn = document.getElementById("homeDevicesBtn");
if (homeDevicesBtn) {
  homeDevicesBtn.addEventListener("click", async () => {
    router.push("screen-devices");
    await devices.open();
  });
}

const homeRefBtn = document.getElementById("homeRefBtn");
if (homeRefBtn) {
  homeRefBtn.addEventListener("click", async () => {
    router.push("screen-ref");
    invites.setMode("direct");
    await invites.open();
  });
}

const homeAdminBtn = document.getElementById("homeAdminBtn");
if (homeAdminBtn) {
  if (ADMIN_PREVIEW_MODE) {
    homeAdminBtn.classList.remove("hidden");
  }
  homeAdminBtn.addEventListener("click", async () => {
    router.push("screen-admin");
    await admin.open();
  });
}

const buyBtn = document.getElementById("buyBtn");
if (buyBtn) {
  buyBtn.addEventListener("click", async () => {
    router.push("screen-tariffs");
    await payments.openTariffs();
  });
}

function createOnboarding() {
  const refs = {
    modal: document.getElementById("onboardingModal"),
    step: document.getElementById("onboardingStep"),
    title: document.getElementById("onboardingTitle"),
    text: document.getElementById("onboardingText"),
    dots: document.getElementById("onboardingDots"),
    spotlight: document.getElementById("onboardingSpotlight"),
    skipBtn: document.getElementById("onboardingSkipBtn"),
    prevBtn: document.getElementById("onboardingPrevBtn"),
    nextBtn: document.getElementById("onboardingNextBtn"),
  };

  const slides = [
    {
      title: "Главная",
      text: "Здесь ты видишь статус подписки и переходы в основные разделы: Поддержать проект, Мои ключи, Пригласить в клуб.",
      highlight: ["expiryValue", "subStatus"],
      highlightMode: "text",
    },
    {
      title: "Поддержать проект",
      text: "Выбери срок 1/2/3 месяца, затем тариф Solo или Flex и отправь подтверждение оплаты.",
      highlight: ["buyBtn"],
    },
    {
      title: "Мои ключи",
      text: "Здесь добавляются устройства, копируются ключи и выполняется обновление или сброс ключа.",
      highlight: ["homeDevicesBtn"],
    },
    {
      title: "Пригласить в клуб",
      text: "Прямой режим: ссылка сразу в бота. Мост: ссылка и QR для тех, у кого Telegram недоступен. Рефералка: отчет по приглашенным.",
      highlight: ["homeRefBtn"],
    },
    {
      title: "Готово",
      text: "Если забудешь, куда нажимать, просто открой эту подсказку кнопкой ? в правом верхнем углу.",
      highlight: ["helpBtn"],
    },
  ];

  let idx = 0;
  const highlighted = new Set();

  function clearHighlights() {
    highlighted.forEach((el) => {
      el.classList.remove("onboarding-focus");
      el.classList.remove("onboarding-text-focus");
    });
    highlighted.clear();
    refs.spotlight?.classList.add("hidden");
  }

  function applyHighlights(ids = [], mode = "frame") {
    clearHighlights();
    const elements = [];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      elements.push(el);
      if (mode === "frame") {
        el.classList.add("onboarding-focus");
        highlighted.add(el);
      } else if (mode === "text") {
        el.classList.add("onboarding-text-focus");
        highlighted.add(el);
      }
    });
    if (mode === "spotlight" && refs.spotlight && elements.length) {
      const rects = elements.map((el) => el.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left));
      const top = Math.min(...rects.map((r) => r.top));
      const right = Math.max(...rects.map((r) => r.right));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      const padX = 6;
      const padY = 4;
      refs.spotlight.style.left = `${Math.max(0, left - padX)}px`;
      refs.spotlight.style.top = `${Math.max(0, top - padY)}px`;
      refs.spotlight.style.width = `${Math.max(20, right - left + padX * 2)}px`;
      refs.spotlight.style.height = `${Math.max(20, bottom - top + padY * 2)}px`;
      refs.spotlight.classList.remove("hidden");
    }
  }

  function renderDots() {
    if (!refs.dots) return;
    refs.dots.innerHTML = "";
    slides.forEach((_, i) => {
      const dot = document.createElement("span");
      dot.className = `onboarding-dot${i === idx ? " active" : ""}`;
      refs.dots.appendChild(dot);
    });
  }

  function render() {
    const item = slides[idx] || slides[0];
    if (refs.step) refs.step.textContent = `Шаг ${idx + 1} из ${slides.length}`;
    if (refs.title) refs.title.textContent = item.title;
    if (refs.text) refs.text.textContent = item.text;
    if (refs.prevBtn) refs.prevBtn.disabled = idx === 0;
    if (refs.nextBtn) refs.nextBtn.textContent = idx >= slides.length - 1 ? "Понятно" : "Дальше";
    renderDots();
    applyHighlights(item.highlight || [], item.highlightMode || "frame");
  }

  function open() {
    idx = 0;
    render();
    refs.modal?.classList.remove("hidden");
  }

  function close(markSeen = true) {
    refs.modal?.classList.add("hidden");
    clearHighlights();
    if (markSeen) window.localStorage.setItem(ONBOARDING_KEY, "1");
  }

  refs.skipBtn?.addEventListener("click", () => close(true));
  refs.prevBtn?.addEventListener("click", () => {
    idx = Math.max(0, idx - 1);
    render();
  });
  refs.nextBtn?.addEventListener("click", () => {
    if (idx >= slides.length - 1) {
      close(true);
      return;
    }
    idx += 1;
    render();
  });
  refs.modal?.addEventListener("click", (event) => {
    if (event.target === refs.modal) close(false);
  });

  return {
    open,
    shouldAutoOpen: () => window.localStorage.getItem(ONBOARDING_KEY) !== "1",
  };
}

const onboarding = createOnboarding();
helpBtn?.addEventListener("click", () => onboarding.open());

async function bootstrap() {
  if (!auth.tg || !auth.initData) {
    const lockedReason = document.getElementById("lockedReasonText");
    if (lockedReason) {
      lockedReason.textContent = "Не удалось подтвердить сессию Telegram. Закрой и заново открой Mini App.";
    }
    router.show("screen-locked");
    return;
  }

  try {
    await establishMiniAppSession(auth.initData);
  } catch (error) {
    const lockedReason = document.getElementById("lockedReasonText");
    if (lockedReason && Number(error?.status || 0) === 401) {
      lockedReason.textContent = "Не удалось подтвердить Telegram-сессию. Закрой и заново открой Mini App.";
    } else if (lockedReason) {
      lockedReason.textContent = error?.message || "Не удалось установить сессию. Закрой и заново открой Mini App.";
    }
    router.show("screen-locked");
    return;
  }

  router.show("screen-home");
  const versionState = await checkAppVersion();
  await home.refresh();
  if (versionState.outdated) {
    const reloaded = window.sessionStorage.getItem(VERSION_RELOAD_KEY) === "1";
    if (!reloaded) {
      window.sessionStorage.setItem(VERSION_RELOAD_KEY, "1");
      window.location.reload();
      return;
    }
    showUpdateScreen(router, versionState);
    return;
  }
  window.sessionStorage.removeItem(VERSION_RELOAD_KEY);
  if (onboarding.shouldAutoOpen()) onboarding.open();
}

bootstrap();

