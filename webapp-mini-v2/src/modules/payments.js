import { apiFetch } from "../api/client.js?v=20260715-miniapp-release-9";

function setStatus(node, text, isError = false) {
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("text-accent-red", isError);
  node.classList.toggle("text-muted-gray", !isError);
}

function normalizeSenderName(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

function isValidSenderName(value) {
  return /^[\p{L}-]+\s[\p{L}]$/u.test(String(value || "").trim());
}

function mapApiError(error) {
  const status = Number(error?.status || 0);
  const detail = String(error?.message || error?.data?.detail || "").trim();

  if (detail === "bad_sender_format") return "Формат плательщика: Имя Ф (например: Иван П).";
  if (detail === "bad_amount") return "Некорректная сумма платежа.";
  if (detail === "already_pending") return "Заявка уже отправлена. Ожидай проверки администратора.";
  if (detail === "access_closed") return "Доступ закрыт. Напиши в поддержку.";
  if (status === 401) return "Сессия истекла. Открой mini app заново из Telegram.";
  if (status === 403) return "Нет доступа к оплате.";
  if (status === 404) return "Данные не найдены.";
  if (status === 409) return "Конфликт или операция уже выполнена.";
  if (status === 429) return "Слишком много запросов. Попробуй позже.";
  if (detail === "panel_error") return "Ошибка VPN панели. Попробуй еще раз.";
  if (detail.startsWith("panel_error:")) return detail;
  return "Ошибка сети. Попробуй еще раз.";
}

function normalizeBankName(raw) {
  const code = String(raw || "").toLowerCase().trim();
  if (code === "alfa") return "Альфа-Банк";
  if (code === "sber") return "Сбер";
  if (code === "tinkoff") return "Т-Банк";
  if (code === "vtb") return "ВТБ";
  return code || "—";
}

function isClubTier(tier) {
  const value = String(tier || "").toLowerCase();
  return value === "own" || value === "vip";
}

function normalizePeriodMonths(value) {
  const n = Number(value || 1);
  if (n === 2) return 2;
  if (n === 3) return 3;
  return 1;
}

function periodLabel(months) {
  const m = normalizePeriodMonths(months);
  if (m === 2) return "2 месяца";
  if (m === 3) return "3 месяца";
  return "1 месяц";
}

function defaultPeriodTariffMap() {
  return {
    1: {
      1: { price: 150, min_pay: 100 },
      2: { price: 150, min_pay: 100 },
      3: { price: 350, min_pay: 200 },
      4: { price: 450, min_pay: 250 },
      5: { price: 500, min_pay: 300 },
    },
    2: {
      1: { price: 290, min_pay: 180 },
      2: { price: 290, min_pay: 180 },
      3: { price: 630, min_pay: 360 },
      4: { price: 810, min_pay: 450 },
      5: { price: 900, min_pay: 540 },
    },
    3: {
      1: { price: 430, min_pay: 240 },
      2: { price: 430, min_pay: 240 },
      3: { price: 840, min_pay: 480 },
      4: { price: 1080, min_pay: 600 },
      5: { price: 1200, min_pay: 720 },
    },
  };
}

export function createPaymentsModule(options = {}) {
  const openPaymentScreen = typeof options.openPaymentScreen === "function" ? options.openPaymentScreen : () => {};

  const refs = {
    tierBadgeRow: document.getElementById("tierBadgeRow"),
    tierBadge: document.getElementById("tierBadge"),
    period1Btn: document.getElementById("period1Btn"),
    period2Btn: document.getElementById("period2Btn"),
    period3Btn: document.getElementById("period3Btn"),
    soloPrice: document.getElementById("soloPrice"),
    flexSlider: document.getElementById("flexSlider"),
    flexPrice: document.getElementById("flexPrice"),
    soloPayBtn: document.getElementById("soloPay"),
    flexPayBtn: document.getElementById("flexPay"),
    tariffStatus: document.getElementById("tariffStatus"),
    paymentPendingBox: document.getElementById("paymentPendingBox"),
    paymentFormBox: document.getElementById("paymentFormBox"),
    paymentAmountDisplay: document.getElementById("paymentAmountDisplay"),
    paymentSenderInput: document.getElementById("paymentSenderInput"),
    paymentSenderShell: document.getElementById("paymentSenderShell"),
    paymentSenderValidBadge: document.getElementById("paymentSenderValidBadge"),
    paymentBankStrict: document.getElementById("paymentBankStrict"),
    paymentBankDisplay: document.getElementById("paymentBankDisplay"),
    paymentPhoneDisplay: document.getElementById("paymentPhoneDisplay"),
    paymentRecipientDisplay: document.getElementById("paymentRecipientDisplay"),
    copyPaymentDetailsBtn: document.getElementById("copyPaymentDetailsBtn"),
    submitPaymentBtn: document.getElementById("submitPaymentBtn"),
    paymentStatusText: document.getElementById("paymentStatusText"),
  };

  if (!refs.soloPayBtn || !refs.flexPayBtn || !refs.flexSlider) {
    return {
      openTariffs: async () => {},
      openPaymentForCurrentDraft: () => {},
    };
  }

  const state = {
    loaded: false,
    loading: false,
    submitting: false,
    user: null,
    tier: "regular",
    periodMonths: 1,
    tariffMap: {
      1: { price: 150, min_pay: 100 },
      2: { price: 150, min_pay: 100 },
      3: { price: 350, min_pay: 200 },
      4: { price: 450, min_pay: 250 },
      5: { price: 500, min_pay: 300 },
    },
    periodTariffMap: defaultPeriodTariffMap(),
    paymentSettings: null,
    draft: {
      targetLimit: 2,
      periodMonths: 1,
      amount: 150,
      label: "Solo Ghost",
    },
  };

  function getDiscount() {
    return Math.max(0, Number(state?.user?.discount || 0));
  }

  function getTargetAmount(targetLimit, months = state.periodMonths) {
    const target = Math.max(1, Math.min(5, Number(targetLimit || 1)));
    const discount = getDiscount();
    const period = normalizePeriodMonths(months);
    const targetInfo = state?.periodTariffMap?.[period]?.[target] || state?.tariffMap?.[target] || {};
    const targetPrice = Number(targetInfo.price || 0);
    const targetMin = Number(targetInfo.min_pay || 0);
    const amount = targetPrice || targetMin;
    return Math.max(1, amount - discount);
  }

  function getTargetLabel(targetLimit, months = state.periodMonths) {
    const target = Math.max(1, Math.min(5, Number(targetLimit || 1)));
    const tariff = target <= 2 ? "Solo Ghost" : `Flex ${target}`;
    return `${tariff} · ${periodLabel(months)}`;
  }

  function renderTierBadge() {
    const show = isClubTier(state.tier);
    refs.tierBadgeRow?.classList.toggle("hidden", !show);
    if (show && refs.tierBadge) refs.tierBadge.textContent = "Клубный 💎";
  }

  function setPeriodButtonActive(button, active) {
    if (!button) return;
    button.classList.toggle("period-toggle-active", active);
    const isStarter = button.classList.contains("period-tier-starter");
    const isSave = button.classList.contains("period-tier-save");
    const isBest = button.classList.contains("period-tier-best");
    if (isStarter) button.classList.toggle("period-active-starter", active);
    if (isSave) button.classList.toggle("period-active-save", active);
    if (isBest) button.classList.toggle("period-active-best", active);
  }

  function renderPeriodButtons() {
    setPeriodButtonActive(refs.period1Btn, state.periodMonths === 1);
    setPeriodButtonActive(refs.period2Btn, state.periodMonths === 2);
    setPeriodButtonActive(refs.period3Btn, state.periodMonths === 3);
  }

  function renderTariffs() {
    const sliderVal = Math.max(3, Math.min(5, Number(refs.flexSlider.value || 3)));
    const soloAmount = getTargetAmount(2);
    const flexAmount = getTargetAmount(sliderVal);

    if (refs.soloPrice) refs.soloPrice.textContent = String(soloAmount);
    if (refs.flexPrice) refs.flexPrice.textContent = `${sliderVal} устройства — ${flexAmount} ₽`;

    renderTierBadge();
    renderPeriodButtons();
  }

  function renderPaymentSettings() {
    const bank = normalizeBankName(state?.paymentSettings?.bank || "");
    const phone = String(state?.paymentSettings?.phone || "—");
    const recipient = String(state?.paymentSettings?.recipient || "—");

    if (refs.paymentBankStrict) refs.paymentBankStrict.textContent = bank;
    if (refs.paymentBankDisplay) refs.paymentBankDisplay.textContent = bank;
    if (refs.paymentPhoneDisplay) refs.paymentPhoneDisplay.textContent = phone;
    if (refs.paymentRecipientDisplay) refs.paymentRecipientDisplay.textContent = recipient;
  }

  function renderPaymentDraft() {
    if (refs.paymentAmountDisplay) refs.paymentAmountDisplay.textContent = `${state.draft.amount} ₽`;
    if (refs.paymentStatusText) {
      setStatus(refs.paymentStatusText, `Тариф: ${state.draft.label}. После перевода нажми «Я перевел деньги».`);
    }
  }

  function setPendingMode(isPending) {
    refs.paymentPendingBox?.classList.toggle("hidden", !isPending);
    refs.paymentFormBox?.classList.toggle("opacity-60", Boolean(isPending));
    if (refs.submitPaymentBtn) refs.submitPaymentBtn.disabled = Boolean(isPending);
  }

  function updateSenderVisualState() {
    const value = normalizeSenderName(refs.paymentSenderInput?.value || "");
    const hasValue = value.length > 0;
    const isValid = hasValue && isValidSenderName(value);

    refs.paymentSenderShell?.classList.toggle("is-typing", hasValue);
    refs.paymentSenderShell?.classList.toggle("is-valid", isValid);
    refs.paymentSenderValidBadge?.classList.toggle("hidden", !isValid);
  }

  async function loadContext(force = false) {
    if (state.loading) return;
    if (state.loaded && !force) return;

    state.loading = true;
    setStatus(refs.tariffStatus, "Загрузка тарифов и реквизитов...");

    try {
      const [user, tariffs, paymentSettings] = await Promise.all([
        apiFetch("/api/user"),
        apiFetch("/api/tariffs"),
        apiFetch("/api/payment/settings"),
      ]);

      state.user = user || {};
      state.paymentSettings = paymentSettings || {};
      state.tier = String(tariffs?.tier || user?.member_tier || "regular");

      const prices = tariffs?.prices || {};
      const nextMap = {};
      for (let d = 1; d <= 5; d += 1) {
        const item = prices[d] || prices[String(d)];
        if (item && Number.isFinite(Number(item.price)) && Number.isFinite(Number(item.min_pay))) {
          nextMap[d] = { price: Number(item.price), min_pay: Number(item.min_pay) };
        }
      }
      if (Object.keys(nextMap).length >= 5) state.tariffMap = nextMap;

      const periodPrices = tariffs?.period_prices || {};
      const nextPeriodMap = {};
      for (const monthsRaw of [1, 2, 3]) {
        const rows = periodPrices[monthsRaw] || periodPrices[String(monthsRaw)] || {};
        const monthMap = {};
        for (let d = 1; d <= 5; d += 1) {
          const item = rows[d] || rows[String(d)];
          if (item && Number.isFinite(Number(item.price)) && Number.isFinite(Number(item.min_pay))) {
            monthMap[d] = { price: Number(item.price), min_pay: Number(item.min_pay) };
          }
        }
        if (Object.keys(monthMap).length >= 5) nextPeriodMap[monthsRaw] = monthMap;
      }
      if (Object.keys(nextPeriodMap).length >= 3) state.periodTariffMap = nextPeriodMap;

      renderTariffs();
      renderPaymentSettings();

      const pending = String(user?.subscription?.payment_status || "") === "pending_verification";
      setPendingMode(pending);
      setStatus(refs.tariffStatus, "Выбери срок и тариф, затем перейди к оплате.");
      state.loaded = true;
    } catch (error) {
      renderTariffs();
      setStatus(refs.tariffStatus, `Нет связи с API: показаны базовые цены. ${mapApiError(error)}`, true);
      if (refs.paymentStatusText) setStatus(refs.paymentStatusText, mapApiError(error), true);
    } finally {
      state.loading = false;
    }
  }

  function buildDraft(targetLimit) {
    const target = Math.max(1, Math.min(5, Number(targetLimit || 1)));
    const months = normalizePeriodMonths(state.periodMonths);

    state.draft.targetLimit = target;
    state.draft.periodMonths = months;
    state.draft.amount = getTargetAmount(target, months);
    state.draft.label = getTargetLabel(target, months);

    renderPaymentDraft();
  }

  async function openPaymentStep(targetLimit) {
    await loadContext(false);
    buildDraft(targetLimit);

    if (refs.paymentSenderInput) refs.paymentSenderInput.value = "";
    updateSenderVisualState();

    openPaymentScreen();
  }

  async function copyPaymentDetails() {
    const phone = String(state?.paymentSettings?.phone || "").trim();
    if (!phone) {
      setStatus(refs.paymentStatusText, "Реквизиты пока недоступны.", true);
      return;
    }

    try {
      await navigator.clipboard.writeText(phone);
      setStatus(refs.paymentStatusText, "Номер телефона скопирован.");
    } catch (_) {
      setStatus(refs.paymentStatusText, "Не удалось скопировать номер.", true);
    }
  }

  async function submitPayment() {
    if (state.submitting) return;

    const sender = normalizeSenderName(refs.paymentSenderInput?.value || "");
    if (!isValidSenderName(sender)) {
      setStatus(refs.paymentStatusText, "Формат плательщика: Имя Ф (например: Иван П).", true);
      updateSenderVisualState();
      return;
    }

    state.submitting = true;
    if (refs.submitPaymentBtn) {
      refs.submitPaymentBtn.disabled = true;
      refs.submitPaymentBtn.classList.add("opacity-60");
    }

    setStatus(refs.paymentStatusText, "Отправляю заявку...");

    try {
      await apiFetch("/api/payment/report", {
        method: "POST",
        body: JSON.stringify({
          amount: state.draft.amount,
          sender_name: sender,
          payment_label: state.draft.label,
          target_device_limit: state.draft.targetLimit,
          period_months: state.draft.periodMonths,
        }),
      });

      setPendingMode(true);
      setStatus(refs.paymentStatusText, "Заявка отправлена. Ожидай проверки администратора.");
    } catch (error) {
      setStatus(refs.paymentStatusText, mapApiError(error), true);
    } finally {
      state.submitting = false;
      if (refs.submitPaymentBtn) {
        refs.submitPaymentBtn.disabled = false;
        refs.submitPaymentBtn.classList.remove("opacity-60");
      }
    }
  }

  function selectPeriod(months) {
    state.periodMonths = normalizePeriodMonths(months);
    renderTariffs();
  }

  refs.period1Btn?.addEventListener("click", () => selectPeriod(1));
  refs.period2Btn?.addEventListener("click", () => selectPeriod(2));
  refs.period3Btn?.addEventListener("click", () => selectPeriod(3));
  refs.flexSlider.addEventListener("input", renderTariffs);
  refs.soloPayBtn.addEventListener("click", () => openPaymentStep(2));
  refs.flexPayBtn.addEventListener("click", () => {
    const target = Math.max(3, Math.min(5, Number(refs.flexSlider.value || 3)));
    openPaymentStep(target);
  });
  refs.copyPaymentDetailsBtn?.addEventListener("click", copyPaymentDetails);
  refs.submitPaymentBtn?.addEventListener("click", submitPayment);
  refs.paymentSenderInput?.addEventListener("input", updateSenderVisualState);

  return {
    openTariffs: async () => {
      await loadContext(false);
      renderTariffs();
    },
    openPaymentForCurrentDraft: () => {
      renderPaymentSettings();
      renderPaymentDraft();
      updateSenderVisualState();
      openPaymentScreen();
    },
  };
}
