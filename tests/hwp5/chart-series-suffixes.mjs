import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createCfbReader} from '../../js/cfb.mjs';import {oleContainerSurvey} from './ole-container-survey.mjs';import {streamBytes} from './hwp-corpus-evidence.mjs';import {seriesSuffixOracle} from './chart-series-suffix-oracle.mjs';
const extent=b=>{b.writeUInt32LE(b.length-36,32);return b;};
export async function chartSeriesSuffixes(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,formats=0,nullCodes=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  const e=seriesSuffixOracle(b);roots++;formats+=2;nullCodes+=e.r.formats.filter(f=>f.format.code===null).length;
  const accept=bytes=>{const x=seriesSuffixOracle(bytes);assert.deepEqual(call(329,x.input(),bytes.length),x.wire);accepted++;};
  const reject=(bytes,error,maxObjects=e.r.objects.size,limit=bytes.length)=>{assert.throws(()=>call(329,e.input(bytes,maxObjects),limit),err=>err.constructor===Error&&err.message===error);rejected++;assert.deepEqual(call(329,e.input(),b.length),e.wire);};
  accept(b);accept(extent(Buffer.from(b.subarray(0,e.end))));const after=Buffer.from(b);after.fill(255,e.end);accept(after);
  for(let cut=e.start;cut<e.end;cut++)reject(extent(Buffer.from(b.subarray(0,cut))),'UnexpectedEnd');
  reject(b,'LimitExceeded',e.r.objects.size-1);reject(b,'LimitExceeded',e.r.objects.size,b.length-1);
  for(const at of [e.start,e.r.body.text.fontOffset,...e.r.formats.map(f=>f.format.start)])for(const [id,error] of [[0xffffffff,'UnsupportedChartObjectReference'],[e.prior.tail.label.id,'DuplicateChartObjectId']]){const bad=Buffer.from(b);bad.writeUInt32LE(id,at);reject(bad,error);}
  for(const d of [...e.r.body.text.declarations,...e.r.formats.flatMap(f=>f.declarations)])for(const [at,error] of [[d.nameOffset,'UnsupportedChartClass'],[d.versionOffset,'UnsupportedChartTypeVersion']]){const bad=Buffer.from(b);bad[at]^=1;reject(bad,error);}
  const raw=Buffer.from(b);raw.writeUInt16LE(65535,e.r.wordOffset);for(const {format:f} of e.r.formats)raw.writeUInt16LE(0xaa55,(f.code?.start??f.end-4)-2);for(const f of e.r.body.text.rawFields)raw.fill(255,f.start,f.start+f.n);accept(raw);
  for(const {format:f} of e.r.formats){const at=f.code?.start??f.end-4,own=Buffer.from(b);own.writeUInt32LE(f.headerWord,at);reject(own,'UnsupportedChartObjectReference');
   const alias=Buffer.alloc(4);alias.writeUInt32LE(e.r.body.text.fontName.id);accept(extent(Buffer.concat([b.subarray(0,at),alias,b.subarray(f.code?.end??f.end)])));
   if(f.code){accept(extent(Buffer.concat([b.subarray(0,at),Buffer.from([255,255,255,255]),b.subarray(f.code.end)])));
    const empty=Buffer.from(b);empty.writeUInt16LE(0,f.code.lengthOffset);accept(extent(Buffer.concat([empty.subarray(0,f.code.payloadOffset),empty.subarray(f.code.trailerOffset)])));
   }
  }
 });}finally{cfb.close();}
 assert.equal(roots,43);assert.equal(formats,86);assert.equal(nullCodes,2);return {roots,formats,nullCodes,accepted,rejected};
}
