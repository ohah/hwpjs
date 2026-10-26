import {loadPrivateDemoBundle} from './demo-private-bundle.mjs';
import {digest} from './pages-demo/bundle-validation.mjs';
import {demoFixtures} from '../web/preview/fixture-catalog.mjs';
import {respondDemoFixtureCatalog} from './demo-fixture-catalog-response.mjs';
import {respondDemoFixture} from './demo-fixture-response.mjs';
import {extname, resolve} from 'node:path';
import {validateProductionBundle} from './pages-demo/bundle-production.mjs';
import {createPreviewWasmCompression} from './preview-wasm-compression.mjs';
const prefix='/hwpjs/editor/';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.ico':'image/vnd.microsoft.icon','.txt':'text/plain; charset=utf-8','.hwp':'application/octet-stream','.hwpx':'application/octet-stream','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
const redirects=new Map([['/',prefix+'demo/vanilla/'],['/index.html',prefix+'demo/vanilla/'],['/web/preview/index.html',prefix+'demo/vanilla/'],['/api',prefix+'api/'],['/api/',prefix+'api/'],['/api/index.html',prefix+'api/index.html'],...['vanilla','react','svelte','headless'].flatMap(name=>[['/demo/'+name,prefix+'demo/'+name+'/'],['/demo/'+name+'/',prefix+'demo/'+name+'/']])]);
/** Validated immutable snapshot only. Fixture/docs handlers remain owned by the server. */
export async function loadDemoServerBundle(directory,{root,privateFixtures=false}) {
 const bundle=privateFixtures?await loadPrivateDemoBundle(directory):await validateProductionBundle(directory,{root});
 if(privateFixtures){
  const policy=bundle.manifest.privateDemo;
  const publicBase=await validateProductionBundle(resolve(root,'apps/docs/docs/public/editor'),{root});
  if(!policy||digest(publicBase.manifestBytes)!==policy.publicBaseManifestSHA256||policy.catalogCount!==demoFixtures.length)throw Error('InvalidPrivateDemoPolicy');
  if(!bundle.files.get('runtime/worker.js')?.equals(publicBase.files.get('runtime/worker.js'))||!bundle.files.get('hwpjs/hwpjs.wasm')?.equals(publicBase.files.get('hwpjs/hwpjs.wasm')))throw Error('PrivateEngineDrift');
  const rows=JSON.parse(bundle.files.get('fixture-catalog.json'));
  if(!Array.isArray(rows)||rows.some(row=>!row||typeof row.available!=='boolean'||Object.keys(row).sort().join(',')!=='available,id,label,name'))throw Error('PrivateCatalogSchema');
  const project=({id,name,label})=>({id,name,label:label??name});
  if(JSON.stringify(rows.map(project))!==JSON.stringify(demoFixtures.map(project)))throw Error('PrivateCatalogMismatch');
  for(const path of ['index.html','demo/vanilla/index.html','demo/react/index.html','demo/svelte/index.html','demo/headless/index.html','api/index.html','api/main.js','api/playground.js','runtime/index.js','runtime/runtime.js','LICENSE.txt','THIRD_PARTY_NOTICES.txt'])if(!bundle.files.has(path))throw Error('IncompletePrivateBundle');
 }
 const compress=createPreviewWasmCompression();
 const primaryWasm=bundle.files.get('hwpjs/hwpjs.wasm');compress(primaryWasm,'br');compress(primaryWasm,'gzip');
 return {primaryWasm,manifest:bundle.manifest,async respond(path,method,response,acceptEncoding='') {
  const location=redirects.get(path);
  if(location){response.writeHead(302,{Location:location,'Cache-Control':'no-store'});response.end();return;}
  let key;
  if(path==='/hwpjs/hwpjs.wasm')key='hwpjs/hwpjs.wasm';
  else if(path==='/hwpjs/worker.js')key='runtime/worker.js';
  else if(path.startsWith(prefix))key=path.slice(prefix.length);
  else if(path.startsWith('/docs/editor/'))key=path.slice('/docs/editor/'.length);
  if(key?.endsWith('/'))key+='index.html';
  if(privateFixtures&&key==='fixture-catalog.json'){await respondDemoFixtureCatalog(root,'/demo-fixture-catalog.json',method,response);return;}
  if(privateFixtures&&key?.startsWith('fixtures/')&&!bundle.files.has(key)){await respondDemoFixture(root,'/demo-fixtures/'+key.slice('fixtures/'.length),method,response);return;}
  const body=key&&bundle.files.get(key);
  if(!body){response.writeHead(404,{'Cache-Control':'no-store'});response.end();return;}
  const wasm=key.endsWith('.wasm'),representation=wasm?compress(body,acceptEncoding):{bytes:body,encoding:null};
  if(representation.bytes===null){response.writeHead(406,{Vary:'Accept-Encoding','Cache-Control':'no-store'});response.end();return;}
  response.writeHead(200,{'Content-Type':mime[extname(key)]??'application/octet-stream','Content-Length':representation.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(wasm?{Vary:'Accept-Encoding'}:{}),...(representation.encoding?{'Content-Encoding':representation.encoding}:{})});
  response.end(method==='HEAD'?undefined:representation.bytes);
 }};
}
