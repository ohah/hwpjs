/** Build only the public umbrella; never writes internal package metadata/dist. */
import assert from 'node:assert/strict';
import {isProductionSource} from '../packages/hwpjs/build/source-policy.mjs';
import {readFile,writeFile,mkdir,readdir,copyFile,mkdtemp,rename,unlink} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
assert(globalThis.Bun,'BuildRequiresBun');
const root=fileURLToPath(new URL('../',import.meta.url)),pkg=resolve(root,'packages/hwpjs');
const options={};for(const arg of process.argv.slice(2)){const m=/^--(wasm|out)=(.+)$/.exec(arg);assert(m&&!Object.hasOwn(options,m[1]),'InvalidBuildArgument');options[m[1]]=m[2];}
assert(options.wasm,'ExplicitWasmRequired');const destination=resolve(root,options.out??'packages/hwpjs/dist');
assert(destination===join(pkg,'dist')||destination.startsWith(resolve(root,'zig-out/verification')+'/'),'UnownedOutput');
const sha=b=>createHash('sha256').update(b).digest('hex');
const wasm=await readFile(resolve(root,options.wasm));assert(wasm.subarray(0,8).equals(Buffer.from([0,97,115,109,1,0,0,0])),'InvalidWasm');
const workspace=resolve(root,'zig-out/verification/public-package-build');await mkdir(workspace,{recursive:true});
const staging=await mkdtemp(join(workspace,'build-')),dist=join(staging,'dist');await mkdir(dist);
const alias={'@hwpjs/core':'@ohah/hwpjs','@hwpjs/vanilla':'@ohah/hwpjs/vanilla','@hwpjs/react':'@ohah/hwpjs/react','@hwpjs/svelte':'@ohah/hwpjs/svelte','@hwpjs/react-native':'@ohah/hwpjs/react-native'};
const remap=s=>s.replace(/@hwpjs\/(react-native|vanilla|react|svelte|core)(?=[/\s'";]|$)/g,x=>alias[x]);
const namespace={name:'umbrella-self-references',setup(b){b.onResolve({filter:/^@hwpjs\//},({path})=>{const key=Object.keys(alias).find(k=>path===k||path.startsWith(k+'/'));assert(key,'UnknownInternalNamespace:'+path);return{path:alias[key]+path.slice(key.length),external:true};});}};
const observed=new Map();
async function observe(path,category){
 assert(path.startsWith(root)&&isProductionSource(path),'NonProductionBuildInput:'+path);
 const bytes=await readFile(path),hash=sha(bytes),key=relative(root,path),previous=observed.get(key);
 assert(!previous||previous.sha256===hash,'SourceChangedDuringBuild:'+key);
 if(previous)previous.categories.add(category);else observed.set(key,{sha256:hash,categories:new Set([category])});return bytes;
}
const runtimeInputs={name:'observed-runtime-inputs',setup(b){b.onLoad({filter:/\.(?:[cm]?js|tsx?|json|css)$/},async({path})=>{await observe(path,'runtime-module');return undefined;});}};
const {compile}=await import('svelte/compiler');
const svelte=generate=>({name:'svelte-'+generate,setup(b){b.onLoad({filter:/\.svelte$/},async({path})=>({contents:compile((await observe(path,'runtime-module')).toString(),{filename:path,generate,dev:false}).js.code,loader:'js'}));}});
async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else if(e.isFile())out.push(p);else throw Error('UnexpectedInput:'+p);}return out.sort();}
const packages=['core','vanilla','react','svelte','react-native'];
const metadata=[join(pkg,'package.json'),join(pkg,'README.md'),join(root,'tools/build-public-package.mjs'),join(pkg,'build/source-policy.mjs'),join(root,'package.json'),join(root,'bun.lock'),join(root,'LICENSE'),join(root,'docs/third-party-notices.md')];
for(const path of metadata)await observe(path,'build-metadata-license');
const entrypoints=['index','runtime','vanilla','react','svelte','react-native'].map(n=>join(pkg,'src',n+'.ts'));
// Worker is emitted separately below so bundlers may safely copy its URL as a single asset.
const settings={outdir:dist,target:'browser',format:'esm',splitting:true,sourcemap:'none',naming:{entry:'[name].js',chunk:'chunk-[hash].js'},external:['@ohah/hwpjs','@ohah/hwpjs/*','react','react/*','react-dom','react-dom/*','svelte','svelte/*','react-native','react-native/*','@shopify/react-native-skia']};
const built=await Bun.build({...settings,entrypoints,plugins:[namespace,runtimeInputs,svelte('client')]});assert(built.success,built.logs.map(String).join('\n'));
// Use the actual source rather than an import-only wrapper (sideEffects can drop the wrapper).
const worker=await Bun.build({...settings,entrypoints:[join(root,'packages/core/src/worker.ts')],splitting:false,naming:'worker.js',plugins:[namespace,runtimeInputs]});assert(worker.success,worker.logs.map(String).join('\n'));
const ssr=await Bun.build({...settings,entrypoints:[join(pkg,'src/svelte.ts')],target:'node',splitting:false,naming:'svelte.server.js',plugins:[namespace,runtimeInputs,svelte('server')]});assert(ssr.success,ssr.logs.map(String).join('\n'));
const config=join(staging,'types.json');
const declarationSources=[join(root,'packages/core/src/index.ts'),join(root,'packages/core/src/runtime.ts'),...packages.filter(n=>n!=='core').map(n=>join(root,'packages',n,'src/index.ts')),join(root,'packages/core/src/runtime/legacy-reader-runtime.d.ts')];
await writeFile(config,JSON.stringify({compilerOptions:{target:'ES2023',module:'ESNext',moduleResolution:'Bundler',strict:true,skipLibCheck:false,jsx:'react-jsx',lib:['ES2023','DOM','DOM.Iterable'],declaration:true,emitDeclarationOnly:true,noEmitOnError:true,allowImportingTsExtensions:true,rewriteRelativeImportExtensions:true,rootDir:join(root,'packages'),outDir:join(dist,'types'),paths:Object.fromEntries(packages.map(n=>['@hwpjs/'+n,[join(root,'packages',n,'src/index.ts')]])),types:['react'],typeRoots:[join(root,'node_modules/@types')]},files:declarationSources},null,2));
const graph=spawnSync(join(root,'node_modules/.bin/tsc'),['-p',config,'--listFilesOnly'],{cwd:root,encoding:'utf8'});assert(graph.status===0,'TypeDependencyGraphFailed:'+graph.stdout+graph.stderr);
const typeInputs=graph.stdout.split(/\r?\n/).filter(p=>p.startsWith(join(root,'packages')+'/')&&/\.(?:ts|tsx)$/.test(p));
for(const path of typeInputs)await observe(path,'public-types-source');
const declaration=spawnSync(join(root,'node_modules/.bin/tsc'),['-p',config],{cwd:root,encoding:'utf8'});await writeFile(join(staging,'declaration.log'),declaration.stdout+declaration.stderr);assert(declaration.status===0,'DeclarationBuildFailed:'+declaration.stdout+declaration.stderr);
for(const p of typeInputs)if(p.endsWith('.d.ts')&&isProductionSource(p)){const dest=join(dist,'types',relative(join(root,'packages'),p));await mkdir(dirname(dest),{recursive:true});await copyFile(p,dest);}
for(const p of await files(join(dist,'types')))if(p.endsWith('.d.ts'))await writeFile(p,remap(await readFile(p,'utf8')).replace(/(["'][^"']+)\.ts(["'])/g,'$1.js$2'));
// Keep the declaration graph rooted in public exports, not every implementation declaration.
const publicManifest=JSON.parse(await readFile(join(pkg,'package.json'),'utf8'));
const declarationRoots=Object.values(publicManifest.exports).filter(e=>typeof e==='object'&&e.types).map(e=>resolve(staging,e.types)),keptTypes=new Set(),typeEdges=[];
const queue=[...declarationRoots];
while(queue.length){const path=queue.shift();assert(path.startsWith(join(dist,'types')+'/'),'TypePathEscape');if(keptTypes.has(path))continue;keptTypes.add(path);const text=await readFile(path,'utf8');
 for(const match of text.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g)){
  const spec=match[1];let target;
  if(spec.startsWith('.')){const raw=resolve(dirname(path),spec);target=/\.js$/.test(raw)?raw.replace(/\.js$/,'.d.ts'):raw.endsWith('.d.ts')?raw:raw+'.d.ts';}
  else if(spec==='@ohah/hwpjs'||spec.startsWith('@ohah/hwpjs/')){const key=spec==='@ohah/hwpjs'?'.':'./'+spec.slice('@ohah/hwpjs/'.length),entry=publicManifest.exports[key];assert(entry&&entry.types,'UnexportedPublicTypeDependency:'+spec);target=resolve(staging,entry.types);}
  if(target){typeEdges.push({from:relative(dist,path),specifier:spec,to:relative(dist,target)});queue.push(target);}
 }
}
const prunedTypes=[];for(const path of await files(join(dist,'types')))if(path.endsWith('.d.ts')&&!keptTypes.has(path)){prunedTypes.push(relative(dist,path));await unlink(path);}
await writeFile(join(staging,'declaration-closure.json'),JSON.stringify({roots:declarationRoots.map(p=>relative(dist,p)),files:[...keptTypes].map(p=>relative(dist,p)).sort(),edges:typeEdges,prunedTypes},null,2));
await writeFile(join(dist,'hwpjs.wasm'),wasm);assert((await readFile(join(dist,'worker.js'))).length>500,'EmptyWorkerEntrypoint');
const before=Object.fromEntries([...observed].sort(([a],[b])=>a.localeCompare(b)).map(([path,info])=>[path,info.sha256]));
for(const [path,hash]of Object.entries(before))assert.equal(sha(await readFile(join(root,path))),hash,'SourceChangedDuringBuild:'+path);
await writeFile(join(staging,'source-inputs.json'),JSON.stringify([...observed].sort(([a],[b])=>a.localeCompare(b)).map(([path,info])=>({path,sha256:info.sha256,categories:[...info.categories].sort()})),null,2));
const outputs=Object.fromEntries(await Promise.all((await files(dist)).map(async p=>[relative(dist,p),sha(await readFile(p))])));
await writeFile(join(dist,'build-manifest.json'),JSON.stringify({schemaVersion:1,namespace:'@ohah/hwpjs',buildVersions:{bun:Bun.version,typescript:JSON.parse(await readFile(join(root,'node_modules/typescript/package.json'),'utf8')).version,svelte:JSON.parse(await readFile(join(root,'node_modules/svelte/package.json'),'utf8')).version},sourceFingerprint:sha(JSON.stringify(before)),wasm:{sha256:sha(wasm),bytes:wasm.length,unchanged:true},declarations:'fresh-source-emit',files:outputs},null,2));
await writeFile(join(staging,'source-fingerprints.json'),JSON.stringify(before,null,2));
await mkdir(dirname(destination),{recursive:true});try{await rename(destination,join(staging,'previous-dist'));}catch(e){if(e.code!=='ENOENT')throw e;}await rename(dist,destination);
await copyFile(join(root,'LICENSE'),join(pkg,'LICENSE'));await copyFile(join(root,'docs/third-party-notices.md'),join(pkg,'THIRD_PARTY_NOTICES.md'));
console.log(JSON.stringify({destination,files:Object.keys(outputs).length,wasmSha256:sha(wasm),staging}));
