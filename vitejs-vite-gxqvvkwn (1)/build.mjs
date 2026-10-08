import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Snapshot oficial gerado pelo pipeline da base modular.
// O parâmetro de versão evita que a Vercel reutilize um snapshot HTTP em cache
// quando o branch production-dist recebe uma correção mantendo o mesmo nome.
const RELEASE_BUILD='1b9fee9eaabc82f75102f542475c3e7bcb28ee1f';
const SNAPSHOT=`https://codeload.github.com/queijoba/litetester1/tar.gz/refs/heads/production-dist?release=${RELEASE_BUILD}`;
const archive=join(tmpdir(),'pjlite-production-dist.tar.gz');
const out='dist';

console.log(`PJ Lite: baixando snapshot oficial 0.9.5v Alpha (${RELEASE_BUILD.slice(0,8)})...`);
const response=await fetch(SNAPSHOT,{redirect:'follow',cache:'no-store'});
if(!response.ok) throw new Error(`Falha ao baixar snapshot (${response.status}).`);
await writeFile(archive,Buffer.from(await response.arrayBuffer()));
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
execFileSync('tar',['-xzf',archive,'-C',out,'--strip-components=1'],{stdio:'inherit'});
const marker=await readFile(join(out,'.pjlite-release'),'utf8').catch(()=> '');
if(!marker.includes('PJ Lite 0.9.5v Alpha')) throw new Error('Snapshot de produção não corresponde à 0.9.5v Alpha.');
console.log(marker.trim());
console.log('PJ Lite: snapshot de produção pronto em dist/.');
