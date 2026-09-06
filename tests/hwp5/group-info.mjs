import assert from "node:assert/strict";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const run=(call,b,mode)=>call(84,Buffer.concat([Buffer.from([mode]),b]));
export function groupInfoActual(call,b,mode=0,prefixes=true){
  const count=b.readUInt16LE(),idsEnd=2+count*4,end=idsEnd+mode*4;assert.ok(end<=b.length);
  const want=Buffer.concat([w(count),b.subarray(2,idsEnd),w(mode),w(mode?b.readUInt32LE(idsEnd):0),w(b.length-end),b.subarray(end)]);
  assert.deepEqual(run(call,b,mode),want);
  if(prefixes)for(let cut=0;cut<end;cut++)assert.throws(()=>run(call,b.subarray(0,cut),mode),/UnexpectedEnd/);
  assert.deepEqual(run(call,b,mode),want);
  return {count,rejected:prefixes?end:0,extra:b.length-end};
}
export function groupInfoEdges(call){
  const b=Buffer.alloc(22);b.writeUInt16LE(3);[0x24726563,0xffffffff,0x24726563,0x80000001,0xff800009].forEach((n,i)=>b.writeUInt32LE(n,2+i*4));
  let accepted=0,rejected=0;
  const check=(b,mode,prefixes=true)=>{rejected+=groupInfoActual(call,b,mode,prefixes).rejected;accepted++;};
  for(const mode of [0,1]){
    check(b,mode);
    for(let at=2;at<b.length;at++)for(let bit=0;bit<8;bit++){const changed=Buffer.from(b);changed[at]^=1<<bit;check(changed,mode);}
    for(const count of [0,1,65535]){const large=Buffer.alloc(2+count*4+mode*4);large.writeUInt16LE(count);check(large,mode,count<2);}
    for(const count of [6,32768,65535]){const changed=Buffer.from(b);changed.writeUInt16LE(count);assert.throws(()=>run(call,changed,mode),/UnexpectedEnd/);rejected++;check(b,mode,false);}
  }
  for(const mode of [2,255]){assert.throws(()=>run(call,b,mode),/InvalidMode/);rejected++;}
  assert.throws(()=>call(84,Buffer.alloc(0)),/UnexpectedEnd/);rejected++;
  return {accepted,rejected};
}
