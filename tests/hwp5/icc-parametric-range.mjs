import assert from 'node:assert/strict';
import {powerRangeInput,verifyRange} from './icc-power-range.mjs';
import {reference as domain} from './icc-parametric-domain.mjs';
import {reference as linearRange} from './icc-linear-range.mjs';
import {readWide} from './icc-wide-fraction-wire.mjs';
import {cmp} from './icc-power-reference.mjs';
export function referenceLinearRange(kind,raw){const active=domain(kind,raw);if(active&&cmp(active.start,[0n,1n])===0)return null;return linearRange({start:[0n,1n],end:active?active.start:[1n,1n],flags:active?1:3,a:kind>=3?raw[3]:0,b:kind===2?raw[3]:kind===4?raw[6]:0});}
export function parametricRangeEdges(call){let ranges=0,rejected=0;
 function check(kind,raw,precision=512){const input=powerRangeInput(kind,raw,precision);let active;try{active=domain(kind,raw);}catch(e){assert.throws(()=>call(207,input),new RegExp(e.message));rejected++;return;}
  const out=call(207,input);assert.equal(out.readUInt32LE(),1);assert.equal(out.length,active?312:144);
  const lower=out.subarray(4,140);
  if(active&&cmp(active.start,[0n,1n])===0)assert.deepEqual(lower,Buffer.alloc(136));
  else {const expected=referenceLinearRange(kind,raw);assert.equal(lower.readUInt32LE(),1);assert.equal(lower.readUInt32LE(4),expected.flags);const start=[readWide(lower,8),readWide(lower,40)],end=[readWide(lower,72),readWide(lower,104)];assert.ok(start[1]>0n&&end[1]>0n);assert.equal(cmp(start,expected.start),0);assert.equal(cmp(end,expected.end),0);}
  verifyRange(out.subarray(140),kind,raw);ranges++;
 }
 for(let kind=0;kind<5;kind++)for(const g of [-131072,-65536,0,65536,131072,196608])for(const a of [-131072,0,131072])for(const b of [-65536,0,65536])for(const d of [0,32768,65536,65537])for(const [c,e,f]of [[65536,0,0],[-65536,32768,65536],[0,65536,-32768]])check(kind,[g,a,b,c,d,e,f]);
 for(const precision of [128,256,512,1024])for(const raw of [[65536,0,0,65536,32768,65536,0],[65536,0,0,0,32768,65536,0],[65536,65536,0,131072,32768,0,0],[65536,65536,0,0,65536,0,0],[65536,65536,0,32768,65537,0,0],[32768,0,16384,-65536,32768,0,65536],[131072,262144,-131072,0,0,0,0]])check(4,raw,precision);
 const good=powerRangeInput(0,[65536]);for(let len=0;len<good.length;len++){assert.throws(()=>call(207,good.subarray(0,len)),/InvalidProbeInput|InvalidIcc/);rejected++;}
 for(const [b,l]of [[good,good.length-1],[Buffer.concat([good,Buffer.alloc(1)]),undefined]]){assert.throws(()=>call(207,b,l),/InvalidProbeInput|InvalidIcc|LimitExceeded/);rejected++;}
 const bad=Buffer.from(good);bad.writeUInt32BE(64);assert.throws(()=>call(207,bad),/InvalidIccComparisonPrecision/);rejected++;check(0,[65536]);return {ranges,rejected};
}
