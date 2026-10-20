// Teste de regressão da PWA sem rede real (Node >= 18).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const origin = 'https://pjlite.example';
const html = '<!doctype html><html><head>' +
  '<script type="module" src="/assets/index-test.js"></script>' +
  '<link rel="stylesheet" href="/assets/index-test.css">' +
  '</head><body><div id="root"></div></body></html>';
const files = new Map([
  [origin + '/', html],
  [origin + '/index.html', html],
  [origin + '/assets/index-test.js', 'console.log("offline")'],
  [origin + '/assets/index-test.css', 'body{color:black}']
]);
const staticPaths = [
  '/manifest.webmanifest', '/pjlite-install.js', '/pjlite-offline.js',
  '/pjlite-icon-192.webp', '/pjlite-icon-512.webp', '/favicon.svg', '/icons.svg',
  '/system-icons/3det.webp', '/system-icons/dnd5e.webp',
  '/system-icons/dragonbane.webp', '/system-icons/fabula.webp',
  '/system-icons/som6.webp'
];
for (const path of staticPaths) files.set(origin + path, 'fixture ' + path);
let offline = false;
const handlers = new Map();
const buckets = new Map();
const keyOf = request => new URL(typeof request === 'string' ? request : request.url, origin).href;
class BrowserRequest extends Request {
  constructor(input, options) {
    super(typeof input === 'string' ? keyOf(input) : input, options);
  }
}
const cachesMock = {
  async open(name) {
    if (!buckets.has(name)) buckets.set(name, new Map());
    const cache = buckets.get(name);
    return {
      async match(request) {
        const response = cache.get(keyOf(request));
        return response?.clone();
      },
      async put(request, response) {
        cache.set(keyOf(request), response.clone());
      }
    };
  },
  async keys() { return [...buckets.keys()]; },
  async delete(name) { return buckets.delete(name); }
};
async function networkFetch(request) {
  if (offline) throw new Error('Sem conexão');
  const url = keyOf(request);
  if (!files.has(url)) return new Response('não encontrado', { status: 404 });
  return new Response(files.get(url), { status: 200 });
}
const fakeSelf = {
  location: { origin },
  clients: { claim: async () => {} },
  skipWaiting: async () => {},
  addEventListener(name, callback) { handlers.set(name, callback); }
};
const script = await readFile(new URL('./pjlite-sw.js', import.meta.url), 'utf8');
vm.runInNewContext(script.replace('__PJLITE_RELEASE__', 'test'), {
  self: fakeSelf, caches: cachesMock, fetch: networkFetch,
  Request: BrowserRequest, Response, URL, console
}, { filename: 'pjlite-sw.js' });

async function fireWithWait(type, extras = {}) {
  let promise;
  handlers.get(type)({ ...extras, waitUntil(p) { promise = p; } });
  if (promise) await promise;
}
async function requestOffline(url, mode) {
  let responsePromise;
  const request = {
    url: keyOf(url), method: 'GET', mode, headers: new Headers()
  };
  handlers.get('fetch')({ request, respondWith(promise) { responsePromise = promise; } });
  return responsePromise ? await responsePromise : null;
}

await fireWithWait('install');
assert.equal(buckets.size, 2, 'deve criar os caches base e de recursos');
await fireWithWait('activate');
let status = null;
await fireWithWait('message', {
  data: { type: 'PJLITE_OFFLINE_STATUS' },
  ports: [{ postMessage(message) { status = message; } }]
});
assert.equal(status?.ready, true, 'somente sinalizar pronto após guardar o app');
offline = true;
assert.match(await (await requestOffline('/', 'navigate')).text(), /id="root"/,
  'app deve abrir sem conexão');
assert.match(await (await requestOffline('/assets/index-test.js', 'cors')).text(),
  /offline/, 'bundle JS deve estar no cache');
assert.match(await (await requestOffline('/assets/index-test.css', 'cors')).text(),
  /color:black/, 'CSS deve estar no cache');
assert.ok(await requestOffline('/system-icons/dragonbane.webp', 'cors'),
  'ícones dos sistemas devem estar disponíveis');

const neverCacheAccountData = await requestOffline('https://db.supabase.co/rest/v1/sheets', 'cors');
assert.equal(neverCacheAccountData, null, 'dados e APIs remotas não devem ser interceptados');
assert.equal(await requestOffline('/dispatch/', 'navigate'), null,
  'não substituir páginas ARG pelo aplicativo offline');
assert.equal(await requestOffline('/pdfs/not-downloaded.pdf', 'cors').catch(()=>null), null,
  'PDF não acessado antes permanece indisponível');
console.log('PJ Lite: teste do modo offline passou (app, JS/CSS, ícones e isolamento da nuvem).');
