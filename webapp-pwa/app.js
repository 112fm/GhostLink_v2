(function () {
  const TG_BOT = 'ghostlink112_bot';
  const params = new URLSearchParams(window.location.search);
  const ref = (params.get('ref') || '').trim();

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

  const startParam = ref ? `ref_${ref}` : '';
  const tgUrl = startParam
    ? `https://t.me/${TG_BOT}?start=${encodeURIComponent(startParam)}`
    : `https://t.me/${TG_BOT}`;

  const statusText = document.getElementById('statusText');
  if (ref) {
    statusText.textContent = 'Приглашение принято. Открой Telegram для авторизации.';
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
