const DEFAULT_API_BASE = "https://panel.112prd.ru:2053";
const PROGRESSIVE_TIMEOUTS = [5000, 10000, 20000];
const WRITE_TIMEOUTS = [20000];
const DEVICE_TIMEOUTS = [30000];
const SESSION_TIMEOUTS = [4000];
const READ_RETRIES = 2;
const WRITE_RETRIES = 0;
const SESSION_RETRIES = 0;
const RETRY_DELAY_MS = 250;

let apiBase = DEFAULT_API_BASE;
let telegramInitData = "";
let pwaToken = "";

function wait(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function createTransportError(error, phase, timedOut = false) {
  if (timedOut) {
    const timeoutError = new Error(phase === "body" ? "response_body_timeout" : "request_timeout");
    timeoutError.name = "AbortError";
    timeoutError.phase = phase;
    timeoutError.timedOut = true;
    return timeoutError;
  }

  const transportError = new Error(
    error && typeof error === "object" ? String(error.message || "request_failed") : String(error || "request_failed"),
  );
  if (error && typeof error === "object" && error.name) {
    transportError.name = error.name;
    transportError.cause = error;
  }
  transportError.phase = phase;
  return transportError;
}

function parseJsonBody(response, rawBody) {
  if (response.status === 204) return {};

  const body = String(rawBody || "").trim();
  if (!body) {
    if (!response.ok) return {};
    const error = new Error("empty_response_body");
    error.phase = "body";
    throw error;
  }

  try {
    return JSON.parse(body);
  } catch (_) {
    if (!response.ok) return {};
    const error = new Error("invalid_json_response");
    error.phase = "json";
    throw error;
  }
}

async function requestJsonAttempt(url, options = {}, timeoutMs = PROGRESSIVE_TIMEOUTS[0]) {
  const controller = new AbortController();
  let phase = "request";
  let timedOut = false;
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    phase = "body";
    const rawBody = await response.text();
    return { response, data: parseJsonBody(response, rawBody) };
  } catch (error) {
    throw createTransportError(error, phase, timedOut);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function requestJsonWithRetry(url, options = {}, retries = 0, timeoutPlan = PROGRESSIVE_TIMEOUTS) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const currentTimeout = timeoutPlan[attempt] || timeoutPlan[timeoutPlan.length - 1] || PROGRESSIVE_TIMEOUTS[0];
      return await requestJsonAttempt(url, options, currentTimeout);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) throw error;
      await wait(RETRY_DELAY_MS * (attempt + 1));
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

  const { response, data } = await requestJsonWithRetry(finalUrl, {
    ...options,
    method,
    cache: "no-store",
    credentials: "include",
    headers: buildHeaders(options.headers || {}, { ...options, method }),
  }, retries, timeoutPlan);

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

  const { response, data } = await requestJsonWithRetry(`${apiBase}/api/miniapp/session`, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
    body: new URLSearchParams({ init_data: value }),
  }, SESSION_RETRIES, SESSION_TIMEOUTS);

  if (!response.ok) {
    throw normalizeApiError(response, data);
  }

  if (data?.session_token) {
    setPwaToken(data.session_token);
  }

  return data;
}
