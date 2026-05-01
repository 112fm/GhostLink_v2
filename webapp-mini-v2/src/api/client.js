const DEFAULT_API_BASE = "https://api.112prd.ru:2053";

let apiBase = DEFAULT_API_BASE;
let telegramInitData = "";
let pwaToken = "";

export function configureApiClient(options = {}) {
  if (options.apiBase) {
    apiBase = String(options.apiBase).replace(/\/+$/, "");
  }
  if (typeof options.telegramInitData === "string") {
    telegramInitData = options.telegramInitData;
  }
  if (typeof options.pwaToken === "string") {
    pwaToken = options.pwaToken;
  }
}

export function setPwaToken(token) {
  pwaToken = typeof token === "string" ? token : "";
}

function buildHeaders(extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  if (telegramInitData) {
    headers["X-Telegram-InitData"] = telegramInitData;
  }
  if (pwaToken) {
    headers["X-PWA-Token"] = pwaToken;
  }
  return headers;
}

function normalizeApiError(response, data) {
  const message =
    data?.detail ||
    data?.error ||
    `api_error_${response.status}`;
  const err = new Error(message);
  err.status = response.status;
  err.data = data || {};
  return err;
}

export async function apiFetch(path, options = {}) {
  if (!apiBase) {
    throw new Error("no_api_base");
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    credentials: "include",
    headers: buildHeaders(options.headers || {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw normalizeApiError(response, data);
  }

  return data;
}

export function getApiBase() {
  return apiBase;
}
