let deferredPrompt = null;
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

function showInstallHelp(message) {
  const helpText = document.getElementById('install-help');
  if (!helpText) return;
  helpText.textContent = message;
  helpText.hidden = false;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      if (!isLocalHost && !window.isSecureContext) {
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
    installBtn.textContent = 'Install App';
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
  if (!target || target.id !== 'install-app-btn') {
    return;
  }

  if (isIos && !isStandalone) {
    showInstallHelp('On iPhone: open this page in Safari, tap Share, then tap "Add to Home Screen".');
    return;
  }

  if (!deferredPrompt) {
    showInstallHelp('Install is available in supported browsers. On iPhone, use Safari > Share > Add to Home Screen.');
    return;
  }

  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  target.hidden = true;
});

window.addEventListener('load', () => {
  const installBtn = document.getElementById('install-app-btn');
  if (!installBtn || isStandalone) return;

  if (isIos) {
    installBtn.textContent = 'Install on iPhone';
    installBtn.hidden = false;
    showInstallHelp('For iPhone install, use Safari and tap Share > Add to Home Screen.');
  }
});
