export const ADMIN_ID = 312826672;

export function getTelegramWebApp() {
  if (typeof window === "undefined") {
    return null;
  }
  if (!window.Telegram || !window.Telegram.WebApp) {
    return null;
  }
  return window.Telegram.WebApp;
}

export function extractUserId(initData = "", initDataUnsafe = null) {
  try {
    const directId = initDataUnsafe?.user?.id;
    if (directId) {
      return Number(directId);
    }

    if (initData) {
      const params = new URLSearchParams(initData);
      const rawUser = params.get("user");
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed?.id) {
          return Number(parsed.id);
        }
      }
    }
  } catch (_) {
    return 0;
  }
  return 0;
}

export function bootstrapAuthContext() {
  const tg = getTelegramWebApp();
  if (tg && typeof tg.ready === "function") {
    tg.ready();
  }

  const initData = tg?.initData || "";
  const userId = extractUserId(initData, tg?.initDataUnsafe || null);

  return {
    tg,
    initData,
    userId,
    isAdmin: userId === ADMIN_ID,
  };
}
