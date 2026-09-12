// Explicit read-only direct-child corpus survey. Embedded paths/payloads are not logged.
import {readFileSync,readdirSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {digest,observeHwpFile} from './hwp-corpus-evidence.mjs';
import {docOptionsEvidence} from './doc-options-evidence.mjs';
const roots=process.argv.slice(2);
if(!roots.length)roots.push('legacy/rust/crates/hwp-core/tests/fixtures');
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
const rows=[];
try{
  for(const root of roots)for(const entry of readdirSync(root,{withFileTypes:true}).filter(e=>e.isFile()&&/\.hwp$/i.test(e.name)).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
    const bytes=readFileSync(`${root}/${entry.name}`);
    rows.push({file:`${root}/${entry.name}`,sha256:digest(bytes),result:observeHwpFile(cfb,bytes,docOptionsEvidence)});
  }
  console.log(JSON.stringify({scope:'direct-child HWP-named files; DocOptions observations only',rows},null,2));
}finally{cfb.close();}
