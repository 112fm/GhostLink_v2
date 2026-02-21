(function () {
  const TG_BOT = 'ghostlink112_bot';
  const API_BASE = 'https://api.112prd.ru:2053';
  const params = new URLSearchParams(window.location.search);
  const ref = (params.get('ref') || '').trim();
  const loginToken = (params.get('login_token') || '').trim();
  const existingToken = localStorage.getItem('ghost_pwa_token') || '';
  const miniBase = `${window.location.origin}${window.location.pathname}`.replace('webapp-pwa', 'webapp-mini');
  const statusText = document.getElementById('statusText');

  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  const inviteUrl = ref
    ? `${window.location.origin}${window.location.pathname}?ref=${encodeURIComponent(ref)}`
    : `${window.location.origin}${window.location.pathname}`;

  const startParam = ref ? `ref_${ref}` : 'pwa';
  const tgUrl = startParam
    ? `https://t.me/${TG_BOT}?start=${encodeURIComponent(startParam)}`
    : `https://t.me/${TG_BOT}`;
  
  if (ref) {
    statusText.textContent = 'Приглашение принято. Открой Telegram для авторизации.';
  }

  async function exchangeLoginToken(token) {
    const resp = await fetch(`${API_BASE}/api/pwa/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login_token: token }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.token) {
      throw new Error(data.detail || 'pwa_auth_failed');
    }
    localStorage.setItem('ghost_pwa_token', data.token);
    return data.token;
  }

  async function openCabinetByToken(token) {
    localStorage.setItem('ghost_pwa_token', token);
    statusText.textContent = 'Авторизация успешна. Открываю кабинет...';
    const next = `${miniBase}?pwa=1&v=2`;
    window.location.href = next;
  }

  if (existingToken && !loginToken) {
    openCabinetByToken(existingToken);
    return;
  }

  if (loginToken) {
    exchangeLoginToken(loginToken)
      .then((token) => openCabinetByToken(token))
      .catch(() => {
        statusText.textContent = 'Ошибка авторизации. Нажми «Войти через Telegram».';
      });
    return;
  }

  document.getElementById('openTgBtn').addEventListener('click', () => {
    window.location.href = tgUrl;
  });

  document.getElementById('shareInviteBtn').addEventListener('click', async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'GhostLink Club',
          text: 'Приглашение в закрытый клуб',
          url: inviteUrl,
        });
      } else {
        await navigator.clipboard.writeText(inviteUrl);
      }
      statusText.textContent = 'Ссылка отправлена.';
    } catch (e) {
      statusText.textContent = 'Не удалось поделиться ссылкой.';
    }
  });

  document.getElementById('copyInviteBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      statusText.textContent = 'Ссылка скопирована.';
    } catch (e) {
      statusText.textContent = 'Не удалось скопировать ссылку.';
    }
  });

  document.getElementById('installBtn').addEventListener('click', async () => {
    try {
      if (!installPrompt) {
        statusText.textContent = 'На iPhone: Safari -> Поделиться -> На экран Домой.';
        return;
      }
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
    } catch (e) {
      statusText.textContent = 'Установка недоступна на этом устройстве.';
    }
  });
})();
