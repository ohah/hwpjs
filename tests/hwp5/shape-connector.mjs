import assert from "node:assert/strict";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export function connectorActual(call,b,prefixes=true){
  const count=b.readUInt32LE(36),end=40+count*10;assert.ok(end<=b.length);
  const result=call(83,b);
  assert.deepEqual(result,Buffer.concat([b.subarray(0,end),w(b.length-end),b.subarray(end)]));
  if(prefixes)for(let cut=0;cut<end;cut++)assert.throws(()=>call(83,b.subarray(0,cut)),/UnexpectedEnd/);
  assert.deepEqual(call(83,b),result);
  return {count,kind:b.readUInt32LE(16),extra:b.length-end,rejected:prefixes?end:0};
}
export function connectorEdges(call){
  let accepted=0,rejected=0;
  const check=(b,prefixes=true)=>{rejected+=connectorActual(call,b,prefixes).rejected;accepted++;};
  const good=Buffer.alloc(64);good.writeUInt32LE(2,36);
  for(let i=0;i<9;i++)good.writeUInt32LE((0x80000000+i*7919)>>>0,i*4);
  good.fill(255,40,60);good.set([9,0,128,255],60);check(good);
  for(let at=0;at<good.length;at++)if(at<36||at>=40)for(let bit=0;bit<8;bit++){
    const b=Buffer.from(good);b[at]^=1<<bit;check(b);
  }
  for(const count of [0,1,2,65537]){
    const b=Buffer.alloc(40+count*10);b.writeUInt32LE(count,36);check(b,count<3);
  }
  for(const count of [3,65535,0x80000000,0xffffffff]){
    const b=Buffer.from(good);b.writeUInt32LE(count,36);
    assert.throws(()=>call(83,b),/UnexpectedEnd/);rejected++;check(good,false);
  }
  // A normal line is not enough bytes for the explicitly selected connector parser.
  assert.throws(()=>call(83,Buffer.alloc(18)),/UnexpectedEnd/);rejected++;
  return {accepted,rejected};
}
