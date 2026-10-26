import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {checkJavaScriptModule} from './pages-demo/javascript-syntax.mjs';
import {assertBundlePath,digest,rejectSymlinkAncestors} from './pages-demo/bundle-validation.mjs';
/** Private fixture labels may include repository-relative provenance, never absolute paths/URLs. */
export async function loadPrivateDemoBundle(directory){
 await rejectSymlinkAncestors(resolve(directory,'manifest.json'));
 const manifestBytes=await readFile(resolve(directory,'manifest.json')),manifest=JSON.parse(manifestBytes);
 if(manifest.mode!=='frozen-dist-closure'||manifest.base!=='relative'||!manifest.privateDemo||!Array.isArray(manifest.files))throw Error('InvalidPrivateManifest');
 const expected=new Set(['manifest.json']);
 for(const row of manifest.files){assertBundlePath(row.path);if(expected.has(row.path)||!Number.isSafeInteger(row.bytes)||row.bytes<0||!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('InvalidPrivateManifest');expected.add(row.path);}
 async function walk(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){const path=prefix+entry.name;if(entry.isSymbolicLink())throw Error('SymlinkBundleEntry');if(entry.isDirectory())await walk(resolve(dir,entry.name),path+'/');else if(!entry.isFile()||!expected.has(path))throw Error('UnexpectedStaticFile');}}
 await walk(directory);const files=new Map([['manifest.json',manifestBytes]]);
 for(const row of manifest.files){const bytes=await readFile(resolve(directory,row.path));if(bytes.length!==row.bytes||digest(bytes)!==row.sha256)throw Error('ChecksumMismatch:'+row.path);if(/\.(js|css|html|json|txt)$/.test(row.path)&&/(?:\.ts\.net|tailscale|\/Users\/|sourceMappingURL)/i.test(bytes.toString()))throw Error('PrivateBundleAbsolutePathOrURL');if(row.path.endsWith('.js'))checkJavaScriptModule(bytes.toString());files.set(row.path,bytes);}
 const wasm=manifest.files.filter(row=>row.path.endsWith('.wasm'));if(wasm.length!==1||wasm[0].path!=='hwpjs/hwpjs.wasm'||wasm[0].sha256!==manifest.wasmSha256)throw Error('NonCanonicalWasm');
 return {manifest,manifestBytes,files};
}
