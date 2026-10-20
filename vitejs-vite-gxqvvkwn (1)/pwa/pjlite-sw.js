/* PJlite — PWA offline básica.
 * O Cache Storage contém APENAS recursos estáticos. As fichas permanecem no
 * armazenamento local atual do PJlite. Nada de dados da Conta Lite é enviado
 * ou enfileirado para sincronização automaticamente.
 */
const VERSION = '__PJLITE_RELEASE__-offline-v1';
const CORE_CACHE = 'pjlite-pwa-core-' + VERSION;
const RUNTIME_CACHE = 'pjlite-pwa-runtime-' + VERSION;
const OWN_PREFIX = 'pjlite-pwa-';
const STATIC_FILES = [
  '/manifest.webmanifest',
  '/pjlite-install.js',
  '/pjlite-offline.js',
  '/pjlite-icon-192.webp',
  '/pjlite-icon-512.webp',
  '/favicon.svg',
  '/icons.svg',
  '/system-icons/3det.webp',
  '/system-icons/dnd5e.webp',
  '/system-icons/dragonbane.webp',
  '/system-icons/fabula.webp',
  '/system-icons/som6.webp'
];
const SAFE_CROSS_ORIGINS = new Set([
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
]);

function isAppNavigation(url) {
  // Não entregar a interface de fichas para links de ARG, autenticação, APIs etc.
  return url.pathname === '/' || url.pathname === '/index.html';
}
function isPublicStatic(url) {
  return url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/system-icons/') ||
    STATIC_FILES.includes(url.pathname);
}
function isPdfTemplate(url) {
  return /^\/pdfs\/[^/]+\.pdf$/i.test(url.pathname);
}
function findAppAssets(html) {
  // O snapshot Vite contém JS/CSS com hash no index.html.
  const found = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"'?#]+)(?:[?#][^"']*)?["']/g)]
    .map(match => match[1]);
  if (!found.some(path => path.endsWith('.js')) ||
      !found.some(path => path.endsWith('.css'))) {
    throw new Error('[PJlite Offline] Recursos principais do aplicativo não encontrados.');
  }
  return [...new Set(found)];
}
function externalToPrefetch(html) {
  const urls = [];
  if (html.includes('https://cdn.tailwindcss.com')) {
    urls.push('https://cdn.tailwindcss.com');
  }
  const fontLink = html.match(/href=["'](https:\/\/fonts\.googleapis\.com\/[^"']+)["']/);
  if (fontLink) urls.push(fontLink[1].replaceAll('&amp;', '&'));
  return urls;
}
async function cacheRequired(cache, path) {
  const request = new Request(path, { credentials: 'same-origin', cache: 'reload' });
  const response = await fetch(request);
  if (!response.ok || response.type === 'opaque') {
    throw new Error('[PJlite Offline] Falha ao preparar ' + path);
  }
  await cache.put(path, response);
}
async function prefetchOptionalExternal(cache, url) {
  try {
    const request = new Request(url, { mode: 'no-cors', cache: 'reload' });
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      await cache.put(request, response);
    }
  } catch (error) {
    // Rede/recurso externo indisponível não pode bloquear a instalação base.
    console.info('[PJlite Offline] Recurso externo não armazenado:', url, error);
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    const response = await fetch(new Request('/', {
      credentials: 'same-origin', cache: 'reload'
    }));
    if (!response.ok) throw new Error('[PJlite Offline] Página inicial indisponível');
    const html = await response.clone().text();
    const assets = findAppAssets(html);

    // Instalação só é concluída depois que o HTML, JS e CSS funcionais
    // estiverem presentes no cache. Se falhar, a versão antiga permanece ativa.
    await Promise.all(
      [...new Set([...STATIC_FILES, ...assets])].map(path => cacheRequired(cache, path))
    );
    await cache.put('/', response);
    const runtime = await caches.open(RUNTIME_CACHE);
    await Promise.all(externalToPrefetch(html).map(url => prefetchOptionalExternal(runtime, url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(OWN_PREFIX) &&
        name !== CORE_CACHE && name !== RUNTIME_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CORE_CACHE);
      // Somente a raiz: a resposta pode mudar entre versões.
      await cache.put('/', response.clone());
    }
    return response;
  } catch (error) {
    const cache = await caches.open(CORE_CACHE);
    const fallback = await cache.match('/');
    if (fallback) return fallback;
    throw error;
  }
}
async function cacheFirstStatic(request) {
  const cache = await caches.open(CORE_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}
async function offlinePdfTemplate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}
async function safeExternalResource(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    await cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    // Nunca armazenar chamadas de autenticação, bancos de dados ou APIs remotas.
    if (SAFE_CROSS_ORIGINS.has(url.origin)) {
      event.respondWith(safeExternalResource(request));
    }
    return;
  }

  if (request.mode === 'navigate') {
    if (isAppNavigation(url)) event.respondWith(networkFirstPage(request));
    return;
  }
  if (isPublicStatic(url)) {
    event.respondWith(cacheFirstStatic(request));
  } else if (isPdfTemplate(url)) {
    // Modelos PDF são armazenados após o primeiro download, sem baixar todos.
    event.respondWith(offlinePdfTemplate(request));
  }
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'PJLITE_OFFLINE_STATUS' || !event.ports?.[0]) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    const home = await cache.match('/');
    let ready = false;
    if (home) {
      const html = await home.clone().text();
      const files = [...STATIC_FILES, ...findAppAssets(html)];
      ready = (await Promise.all(files.map(path => cache.match(path))))
        .every(Boolean);
    }
    event.ports[0].postMessage({ type: 'PJLITE_OFFLINE_STATUS', ready });
  })().catch(() => event.ports[0].postMessage({
    type: 'PJLITE_OFFLINE_STATUS', ready: false
  })));
});
