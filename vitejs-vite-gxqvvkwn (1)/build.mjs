import { HE_ICON_ASSETS } from './pwa/he-icons.mjs';
import { mkdir, rm, writeFile, readFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Snapshot oficial gerado pelo pipeline da base modular.
// O parâmetro de versão evita que a Vercel reutilize um snapshot HTTP em cache
// quando o branch production-dist recebe uma correção mantendo o mesmo nome.
// Testa o cache offline em uma simulação de queda de rede antes do deploy.
execFileSync(process.execPath, ['pwa/test-offline.mjs'], {stdio: 'inherit'});
const RELEASE_BUILD='fddde443ea6f322170d182cdcb3d1e1c9aaf3478';
const SNAPSHOT=`https://codeload.github.com/queijoba/litetester1/tar.gz/${RELEASE_BUILD}`;
const archive=join(tmpdir(),'pjlite-production-dist.tar.gz');
const out='dist';

console.log(`PJ Lite: baixando snapshot oficial 1.1.0v Alpha (${RELEASE_BUILD.slice(0,8)})...`);
const response=await fetch(SNAPSHOT,{redirect:'follow',cache:'no-store'});
if(!response.ok) throw new Error(`Falha ao baixar snapshot (${response.status}).`);
await writeFile(archive,Buffer.from(await response.arrayBuffer()));
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
execFileSync('tar',['-xzf',archive,'-C',out,'--strip-components=1'],{stdio:'inherit'});
const marker=await readFile(join(out,'.pjlite-release'),'utf8').catch(()=> '');
if(!marker.includes('PJ Lite 1.1.0v Alpha')) throw new Error('Snapshot de produção não corresponde à 1.1.0v Alpha.');
console.log(marker.trim());
// O snapshot de produção é baixado acima. A camada PWA é mantida aqui
// para não depender de alterações manuais na branch production-dist.
const pwaHead = [
  '    <link rel="manifest" href="/manifest.webmanifest">',
  '    <meta name="mobile-web-app-capable" content="yes">',
  '    <meta name="apple-mobile-web-app-capable" content="yes">',
  '    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '    <link rel="apple-touch-icon" href="/pjlite-icon-192.webp">',
  '    <script defer src="/pjlite-install.js"></script>',
  '    <script defer src="/pjlite-offline.js"></script>'
].join('\n');

const htmlPath = join(out, 'index.html');
const html = await readFile(htmlPath, 'utf8');
if (!/<\/head>/i.test(html)) {
  throw new Error('Snapshot PJlite sem fechamento de <head>, PWA não injetada.');
}
if (/rel=["']manifest["']/i.test(html)) {
  throw new Error('Snapshot PJlite já tem manifesto; revise para evitar conflito.');
}
await writeFile(htmlPath, html.replace(/<\/head>/i, pwaHead + '\n</head>'), 'utf8');

for (const filename of ['manifest.webmanifest', 'pjlite-install.js', 'pjlite-offline.js']) {
  await copyFile(new URL('./pwa/' + filename, import.meta.url), join(out, filename));
}
const serviceWorkerSource = await readFile(new URL('./pwa/pjlite-sw.js', import.meta.url), 'utf8');
await writeFile(join(out, 'pjlite-sw.js'), serviceWorkerSource.replace('__PJLITE_RELEASE__', RELEASE_BUILD.slice(0, 12)), 'utf8');
execFileSync(process.execPath, ['--check', join(out, 'pjlite-sw.js')], {stdio:'inherit'});
execFileSync(process.execPath, ['--check', join(out, 'pjlite-offline.js')], {stdio:'inherit'});

for (const {filename, base64} of HE_ICON_ASSETS) {
  await writeFile(join(out, filename), Buffer.from(base64, 'base64'));
}
console.log('PJ Lite: PWA e modo offline básico instalados no dist (arquivos, cache e ícones He).');

console.log('PJ Lite: snapshot de produção pronto em dist/.');
