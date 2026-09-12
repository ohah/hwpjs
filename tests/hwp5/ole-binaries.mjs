import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync,deflateRawSync} from 'node:zlib';
import {createCfbReader} from '../../js/cfb.mjs';
import {documentRecords} from './documents.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
const word=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const words=values=>Buffer.concat(values.map(word));
const defaults=[100000,67108864,268435456,1000000,67108864];
const input=(file,selection=2,caps=defaults,decoded=67108864)=>Buffer.concat([Buffer.of(selection),words([...caps,decoded]),Buffer.from(file)]);

export async function oleBinaries(call,cfb){
 const inner=await createCfbReader(readFileSync(new URL('../../zig-out/bin/hwpjs.wasm',import.meta.url)));
 const results=[];
 try{
 for(const name of ['chart/분산형/곡선이있는분산형.hwp','한셀OLE.hwp','task1725/text_footnote_tail_overpagination.hwp']){
  const file=readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url));
  cfb.parse(file,{strict:true});
  const nodes=cfb.document().nodes,h=Buffer.from(cfb.findExact('/FileHeader').content),flags=h.readUInt32LE(36);
  assert.equal(flags&(2|4|16|256|1024),0);
  const decode=b=>flags&1?inflateRawSync(b):Buffer.from(b);
  const info=decode(cfb.findExact('/DocInfo').content),candidates=[];
  let binaries=0,unhandled=0,envelopeBytes=0,streams=0,streamBytesTotal=0,entries=0,pathBytes=0;
  for(const rec of documentRecords(info).filter(r=>r.tag===18)){
   const p=info.subarray(rec.start,rec.end),attrs=p.readUInt16LE(),type=attrs&15;
   if(type!==1&&type!==2)continue;
   binaries++;
   let extension='';
   if(type===1||p.length>4){const units=p.readUInt16LE(4);assert.ok(p.length>=6+units*2);extension=p.subarray(6,6+units*2).toString('utf16le');}
   if(type!==2&&extension.toLowerCase()!=='ole'){unhandled++;continue;}
   const path='/BinData/BIN'+p.readUInt16LE(2).toString(16).toUpperCase().padStart(4,'0')+(extension?'.'+extension:'');
   const compression=(attrs>>4)&3;assert.notEqual(compression,3);
   const stored=Buffer.from(streamBytes(cfb.findExact(path)));
   const bytes=compression===1||(compression===0&&(flags&1))?inflateRawSync(stored):stored;
   assert.equal(bytes.readUInt32LE(),bytes.length-4);
   const parsed=inner.parse(bytes.subarray(4),{strict:true});
   envelopeBytes+=bytes.length;entries+=parsed.FileIndex.length;
   pathBytes+=parsed.FullPaths.reduce((n,p)=>n+Buffer.byteLength(p),0);
   for(const entry of parsed.FileIndex)if(entry.type===2){streams++;streamBytesTotal+=entry.size;}
   candidates.push({rec,attrs,bytes,path});
  }
  const stats=[binaries,unhandled,candidates.length,envelopeBytes,streams,streamBytesTotal,entries,pathBytes];
  const base=call(307,input(file,0));assert.equal(base.length,44);assert.deepEqual(base.subarray(0,36),Buffer.alloc(36));
  const expected=Buffer.concat([words([1,...stats]),base.subarray(36)]);
  let accepted=0,rejected=0;
  const accept=(bytes,wanted)=>{assert.deepEqual(call(307,bytes),wanted);accepted++;};
  const reject=(bytes,error)=>{assert.throws(()=>call(307,bytes),e=>e.constructor===Error&&e.message===error);rejected++;assert.deepEqual(call(307,input(file)),expected);};
  accept(input(file),expected);
  const exact=[candidates.length,envelopeBytes,streamBytesTotal,entries,pathBytes];
  accept(input(file,2,exact,base.readUInt32LE(36)),expected);
  for(let i=0;i<5;i++)if(exact[i]){const caps=[...exact];caps[i]--;reject(input(file,2,caps),'LimitExceeded');}
  reject(input(file,3),'InvalidMode');
  for(let cut=0;cut<25;cut++)reject(input(file).subarray(0,cut),'UnexpectedEnd');
  for(const candidate of candidates){
   const binParent=nodes.findIndex(n=>n.parent===0&&n.name==='BinData');
   const target=nodes.find(n=>n.parent===binParent&&n.name.toLowerCase()===candidate.path.split('/').at(-1).toLowerCase());assert.ok(target);
   const rewrite=(payload,compression)=>{
    const changed=Buffer.from(info);changed.writeUInt16LE((candidate.attrs&~0x30)|(compression<<4),candidate.rec.start);
    const encode=b=>flags&1?deflateRawSync(b):b;
    return cfb.write({nodes:nodes.map(n=>n===target?{...n,content:compression===1?deflateRawSync(payload):payload}:n.parent===0&&n.name==='DocInfo'?{...n,content:encode(changed)}:n)});
   };
   for(const compression of [1,2]){
    accept(input(rewrite(candidate.bytes,compression)),expected);
    const broken=Buffer.from(candidate.bytes);broken[0]^=1;
    const encoded=rewrite(broken,compression);
    accept(input(encoded,0),base);
    reject(input(encoded),'InvalidOleEnvelopeSize');
   }
   assert.equal(candidates.length,1); // These paired fixtures each select one BinData item.
   reject(input(file,1),'InvalidSignature');
   const rawExpected=Buffer.from(expected);
   for(const offset of [16,36,40])rawExpected.writeUInt32LE(rawExpected.readUInt32LE(offset)-4,offset);
   accept(input(rewrite(candidate.bytes.subarray(4),2),1),rawExpected);
  }
  results.push({name,stats,accepted,rejected});
 }
 }finally{inner.close();}
 return results;
}
