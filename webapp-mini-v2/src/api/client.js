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

function buildApiUrl(path) {
  const url = new URL(`${apiBase}${path}`);
  if (pwaToken && !url.searchParams.has("pwa_token")) {
    url.searchParams.set("pwa_token", pwaToken);
  }
  return url.toString();
}

function shouldSendJsonContentType(method, options = {}) {
  const verb = String(method || "GET").toUpperCase();
  if (verb === "GET" || verb === "HEAD") {
    return false;
  }
  return Boolean(options.body);
}

function buildHeaders(extraHeaders = {}, options = {}) {
  const headers = {
    Accept: "application/json",
    ...extraHeaders,
  };

  if (shouldSendJsonContentType(options.method, options)) {
    headers["Content-Type"] = "application/json";
  }

  if (telegramInitData) {
    headers["X-Telegram-InitData"] = telegramInitData;
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

  const method = String(options.method || "GET").toUpperCase();
  const credentials = pwaToken ? "include" : "omit";
  const response = await fetch(buildApiUrl(path), {
    ...options,
    method,
    cache: "no-store",
    credentials,
    headers: buildHeaders(options.headers || {}, { ...options, method }),
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

export async function establishMiniAppSession(initData) {
  const value = String(initData || "").trim();
  if (!apiBase || !value) {
    return null;
  }

  const response = await fetch(`${apiBase}/api/miniapp/session`, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
    body: new URLSearchParams({ init_data: value }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw normalizeApiError(response, data);
  }

  if (data?.session_token) {
    setPwaToken(data.session_token);
  }

  return data;
}
