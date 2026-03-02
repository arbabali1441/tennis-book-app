let deferredPrompt = null;
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      if (!isLocalHost) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        return;
      }

      await navigator.serviceWorker.register('/sw.js');
    } catch (err) {
      console.error('Service worker registration failed:', err);
    }
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  const installBtn = document.getElementById('install-app-btn');
  if (installBtn) {
    installBtn.hidden = false;
  }
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  const installBtn = document.getElementById('install-app-btn');
  if (installBtn) {
    installBtn.hidden = true;
  }
});

document.addEventListener('click', async (event) => {
  const target = event.target;
  if (!target || target.id !== 'install-app-btn' || !deferredPrompt) {
    return;
  }

  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  target.hidden = true;
});
