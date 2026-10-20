/* PJlite PWA — instalação opcional, sem substituir o navegador. */
(() => {
  'use strict';
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) return;

  let deferredInstall = null;
  let banner = null;
  const dismissKey = 'pjlite-pwa-install-dismissed';

  const isDismissed = () => {
    try { return sessionStorage.getItem(dismissKey) === '1'; }
    catch { return false; }
  };
  const hide = () => {
    if (banner) banner.remove();
    banner = null;
  };
  const show = () => {
    if (banner || !deferredInstall || isDismissed() || !document.body) return;
    banner = document.createElement('aside');
    banner.id = 'pjlite-mobile-install';
    banner.setAttribute('aria-label', 'Instalação do PJlite');
    banner.style.cssText = [
      'position:fixed','right:12px','bottom:calc(12px + env(safe-area-inset-bottom, 0px))',
      'z-index:2147483000','display:flex','align-items:center','gap:10px',
      'max-width:calc(100vw - 24px)','padding:9px 10px','border-radius:14px',
      'background:#211c29','color:#fff9f1','border:1px solid #b78e80',
      'box-shadow:0 8px 24px rgba(0,0,0,.35)','font:600 13px system-ui,sans-serif'
    ].join(';');

    const icon = document.createElement('img');
    icon.src = '/pjlite-icon-192.webp';
    icon.alt = '';
    icon.width = 34;
    icon.height = 34;
    icon.style.cssText = 'width:34px;height:34px;border-radius:9px;object-fit:cover;flex-shrink:0';

    const install = document.createElement('button');
    install.type = 'button';
    install.textContent = 'Instalar PJlite';
    install.style.cssText = 'background:#f4d6b7;color:#28202a;border:0;border-radius:9px;padding:10px 12px;cursor:pointer;font:700 13px system-ui,sans-serif';

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dispensar instalação');
    dismiss.textContent = '×';
    dismiss.style.cssText = 'background:transparent;color:#f6e8e0;border:0;padding:3px 6px;font:22px system-ui,sans-serif;cursor:pointer';

    install.addEventListener('click', async () => {
      const prompt = deferredInstall;
      deferredInstall = null;
      hide();
      if (!prompt) return;
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch (error) {
        console.warn('[PJlite PWA] Instalação não iniciada:', error);
      }
    });
    dismiss.addEventListener('click', () => {
      try { sessionStorage.setItem(dismissKey, '1'); }
      catch {}
      hide();
    });
    banner.append(icon, install, dismiss);
    document.body.appendChild(banner);
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstall = event;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', show, { once: true });
    } else {
      show();
    }
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    hide();
  });
})();
