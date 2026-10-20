/* PJlite Mobile — suporte offline sem migrar ou modificar fichas salvas. */
(() => {
  'use strict';
  if (!('serviceWorker' in navigator) ||
      !(location.protocol === 'https:' || location.hostname === 'localhost')) return;

  let toast = null;
  let timer = null;
  let previouslyPrepared = false;

  function message(text, persistent = false) {
    if (!document.body) return;
    if (timer) clearTimeout(timer);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'pjlite-offline-status';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.style.cssText = [
        'position:fixed', 'bottom:calc(75px + env(safe-area-inset-bottom,0px))',
        'right:12px', 'max-width:min(330px,calc(100vw - 24px))',
        'z-index:2147482000','box-sizing:border-box', 'padding:10px 14px',
        'border:1px solid #a59c92', 'border-radius:12px',
        'box-shadow:0 6px 20px rgba(0,0,0,.25)',
        'background:#292632','color:#f9f5f1',
        'font:600 12px/1.5 system-ui,sans-serif'
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    if (!persistent) timer = setTimeout(() => {
      toast?.remove();
      toast = null;
    }, 5500);
  }

  function requestPrepared(worker) {
    return new Promise(resolve => {
      if (!worker) return resolve(false);
      const channel = new MessageChannel();
      const timeout = setTimeout(() => resolve(false), 10000);
      channel.port1.onmessage = event => {
        clearTimeout(timeout);
        channel.port1.close();
        resolve(event.data?.type === 'PJLITE_OFFLINE_STATUS' &&
                event.data.ready === true);
      };
      try {
        worker.postMessage({ type: 'PJLITE_OFFLINE_STATUS' }, [channel.port2]);
      } catch {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  function showOfflineWarning() {
    message(
      'Sem internet. O PJlite usa as fichas salvas neste aparelho; a Conta Lite exige conexão.',
      true
    );
  }

  window.addEventListener('offline', showOfflineWarning);
  window.addEventListener('online', () => {
    message('Conexão restaurada. Sincronize sua Conta Lite quando desejar.');
  });

  window.addEventListener('load', async () => {
    if (!navigator.onLine) showOfflineWarning();
    try {
      const registration = await navigator.serviceWorker.register('/pjlite-sw.js', {
        scope: '/', updateViaCache: 'none'
      });
      const ready = await navigator.serviceWorker.ready;
      const prepared = await requestPrepared(
        navigator.serviceWorker.controller || ready.active || registration.active
      );
      previouslyPrepared = prepared;
      if (navigator.onLine && prepared) {
        message('PJlite preparado para abrir sem internet. Suas fichas continuam salvas no navegador.');
      } else if (navigator.onLine) {
        message('Não foi possível concluir os arquivos offline. Abra novamente com internet.');
      }
    } catch (error) {
      console.warn('[PJlite Offline] Não foi possível preparar o aplicativo:', error);
      if (navigator.onLine) message('Não foi possível preparar o modo offline agora.');
    }
  });

  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (!navigator.onLine || previouslyPrepared) return;
    const ready = await requestPrepared(navigator.serviceWorker.controller);
    if (ready) {
      previouslyPrepared = true;
      message('PJlite pronto para abrir sem internet.');
    }
  });
})();
