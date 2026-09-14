import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createCfbReader} from '../../js/cfb.mjs';
import {observeHwpEmf,summarizeEmfCorpus} from './emf-corpus-evidence.mjs';

const [cfbWasm,probeWasm,...givenRoots]=process.argv.slice(2);
if(!cfbWasm||!probeWasm) throw new Error('Usage: emf-corpus-survey <cfb.wasm> <probe.wasm> [roots...]');
const cfb=await createCfbReader(readFileSync(cfbWasm));
const module=await WebAssembly.compile(readFileSync(probeWasm)),{exports:w}=await WebAssembly.instantiate(module,{});
const inspect=bytes=>{const p=w.alloc(bytes.length);if(!p)throw Error('OutOfMemory');try{new Uint8Array(w.memory.buffer,p,bytes.length).set(bytes);if(!w.probe(337,p,bytes.length,64*1024*1024))throw Error(Buffer.from(w.memory.buffer,w.error_ptr(),w.error_len()).toString());return Buffer.from(new Uint8Array(w.memory.buffer,w.result_ptr(),w.result_len()));}finally{w.free(p,bytes.length);w.close();}};
const roots=givenRoots.length?givenRoots:['legacy/rust/crates/hwp-core/tests/fixtures','reference/rhwp/samples'],rows=[];
try {
  for(const root of roots)for(const name of readdirSync(root,{recursive:true}).filter(n=>/\.hwp$/i.test(n)).sort())
    rows.push({file:join(root,name),result:observeHwpEmf(cfb,readFileSync(join(root,name)),inspect)});
  console.log(JSON.stringify({scope:'recursive HWP corpus; DocInfo-resolved and compression-aware BinData only',summary:summarizeEmfCorpus(rows),candidates:rows.flatMap(row=>(row.result.evidence?.items??[]).map(item=>({file:row.file,...item})))},null,2));
} finally {cfb.close();}
