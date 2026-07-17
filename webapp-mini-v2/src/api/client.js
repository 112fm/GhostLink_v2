const DEFAULT_API_BASE = "https://panel.112prd.ru:2053";
const PROGRESSIVE_TIMEOUTS = [3000, 10000, 30000];
const MAX_TIMEOUT = 30000;
const DEVICE_MAX_TIMEOUT = 120000;
const WRITE_TIMEOUTS = [8000, 15000];
const DEVICE_TIMEOUTS = [8000, 15000];
const READ_RETRIES = 2;
const WRITE_RETRIES = 1;
const SESSION_RETRIES = 2;
const RETRY_DELAY_MS = 250;

let apiBase = DEFAULT_API_BASE;
let telegramInitData = "";
let pwaToken = "";

function wait(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, retries = 0, timeoutPlan = PROGRESSIVE_TIMEOUTS) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const currentTimeout = timeoutPlan[attempt] || timeoutPlan[timeoutPlan.length - 1] || MAX_TIMEOUT;
    const timeoutId = globalThis.setTimeout(() => controller.abort(), currentTimeout);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      lastError = error;
      if (attempt >= retries) throw error;
      await wait(RETRY_DELAY_MS * (attempt + 1));
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("request_failed");
}

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
  return new URL(`${apiBase}${path}`).toString();
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
  } else if (pwaToken) {
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
  err.code = data?.code || data?.error_code || "";
  err.maintenance =
    response.status === 503 ||
    data?.maintenance === true ||
    err.code === "maintenance" ||
    data?.error === "maintenance";
  return err;
}

export async function apiFetch(path, options = {}) {
  if (!apiBase) {
    throw new Error("no_api_base");
  }

  const method = String(options.method || "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD";
  const isDeviceWrite = !isRead && String(path || "").startsWith("/api/device/");
  const timeoutPlan = isDeviceWrite ? DEVICE_TIMEOUTS : (isRead ? PROGRESSIVE_TIMEOUTS : WRITE_TIMEOUTS);
  const retries = isRead ? READ_RETRIES : WRITE_RETRIES;
  
  // To avoid iOS Safari WebKit POST bug and speed up startup, we append a timestamp parameter to ALL URLs
  // to force the proxy/browser to use a fresh context occasionally.
  const urlParams = (path.indexOf("?") === -1) ? `?_t=${Date.now()}` : `&_t=${Date.now()}`;
  const finalUrl = buildApiUrl(path) + urlParams;

  const response = await fetchWithTimeout(finalUrl, {
    ...options,
    method,
    cache: "no-store",
    credentials: "include",
    headers: buildHeaders(options.headers || {}, { ...options, method }),
  }, retries, timeoutPlan);

  const timeoutPromise = wait(isDeviceWrite ? DEVICE_MAX_TIMEOUT : MAX_TIMEOUT).then(() => {
    throw new Error("Timeout while reading response body");
  });
  timeoutPromise.catch(() => {});

  const data = await Promise.race([
    response.json().catch(() => ({})),
    timeoutPromise
  ]);

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

  const response = await fetchWithTimeout(`${apiBase}/api/miniapp/session`, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
    body: new URLSearchParams({ init_data: value }),
  }, SESSION_RETRIES);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw normalizeApiError(response, data);
  }

  if (data?.session_token) {
    setPwaToken(data.session_token);
  }

  return data;
}
