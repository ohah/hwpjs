import assert from 'node:assert/strict';
const decoder=new TextDecoder('utf-16be',{fatal:true,ignoreBOM:true});
export function unicodeInput(payload,maxBytes=67108864,maxRecords=100000){const b=Buffer.alloc(8+payload.length);b.writeUInt32BE(maxBytes);b.writeUInt32BE(maxRecords,4);payload.copy(b,8);return b;}
export function unicodeFixture(units,copies=1){const start=16+12*copies,b=Buffer.alloc(start+units.length*2);b.write('mluc');b.writeUInt32BE(copies,8);b.writeUInt32BE(12,12);for(let i=0;i<copies;i++){const o=16+12*i;b.write('enUS',o);b.writeUInt32BE(units.length*2,o+4);b.writeUInt32BE(start,o+8);}units.forEach((v,i)=>b.writeUInt16BE(v,start+2*i));return b;}
export function unicodeReference(payload){const count=payload.readUInt32BE(8),stride=payload.readUInt32BE(12),seen=new Set();let bytes=0,scalars=0n,nuls=0n,boms=0n,terminated=0;
  for(let i=0;i<count;i++){const o=16+i*stride,n=payload.readUInt32BE(o+4),start=payload.readUInt32BE(o+8),key=`${start}:${n}`;if(!seen.has(key)){seen.add(key);bytes+=n;}const s=decoder.decode(payload.subarray(start,start+n));for(const c of s){scalars++;if(c==='\0')nuls++;if(c==='\ufeff')boms++;}if(s.endsWith('\0'))terminated++;}
  const out=Buffer.alloc(48);out.writeUInt32LE(count);out.writeUInt32LE(seen.size,4);out.writeUInt32LE(bytes,8);out.writeUInt32LE(terminated,12);out.writeBigUInt64LE(scalars,16);out.writeBigUInt64LE(nuls,24);out.writeBigUInt64LE(boms,32);out.writeUInt32LE(1,40);return out;
}
export function iccUnicodeEdges(call){let comparisons=0,rejected=0;
  function reject(b,p,limit=b.length){assert.throws(()=>call(166,b,limit),p);rejected++;}
  function check(payload){let expected;try{expected=unicodeReference(payload);}catch(e){assert.ok(e instanceof TypeError);reject(unicodeInput(payload),/InvalidUnicodeEncoding|UnexpectedEnd/);return;}assert.deepEqual(call(166,unicodeInput(payload)),expected);comparisons++;}
  for(let unit=0;unit<65536;unit++)check(unicodeFixture([unit]));
  for(let i=0;i<1024;i++)for(const pair of [[0xd800+i,0xdc00],[0xd800+i,0xdfff],[0xd800,0xdc00+i],[0xdbff,0xdc00+i]])check(unicodeFixture(pair));
  for(const units of [[],[0,0xfeff,0xffff,0xfdd0],[0xd800,0xdc00,0],[0xdbff,0xdfff],[0xd800,65],[0xdc00,0xd800]])for(const copies of [0,1,2,17])check(unicodeFixture(units,copies));
  const shared=unicodeFixture([0xfeff,0,0xd800,0xdc00,0],17);assert.deepEqual(call(166,unicodeInput(shared,10)),unicodeReference(shared));comparisons++;
  reject(unicodeInput(shared,9),/LimitExceeded/);reject(unicodeInput(shared,10,16),/LimitExceeded/);
  const overlap=unicodeFixture([0xd800,0xdc00],2);overlap.writeUInt32BE(2,32);overlap.writeUInt32BE(42,36);check(overlap);
  const good=unicodeInput(unicodeFixture([65]));for(let n=0;n<good.length;n++)reject(good.subarray(0,n),/InvalidProbeInput|InvalidIcc/);reject(good,/LimitExceeded/,good.length-1);
  check(unicodeFixture([65,0]));return {comparisons,rejected};
}
