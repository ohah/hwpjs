import assert from "node:assert/strict";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export function memoShapeActual(call,b,prefixes=true){
  assert.ok(b.length>=22);const expected=Buffer.concat([b.subarray(0,22),w(b.length-22),b.subarray(22)]);
  assert.deepEqual(call(87,b),expected);
  if(prefixes)for(let cut=0;cut<22;cut++)assert.throws(()=>call(87,b.subarray(0,cut)),/UnexpectedEnd/);
  assert.deepEqual(call(87,b),expected);
  return {width:b.readUInt32LE(),kind:b[4],lineWidth:b[5],unknown:b.readUInt32LE(18),extra:b.length-22,rejected:prefixes?22:0};
}
export function memoShapeEdges(call){
  const b=Buffer.alloc(25);b.writeUInt32LE(0xffffffff);b[4]=255;b[5]=128;
  [0x81234567,0x89abcdef,0xfedcba98,0x80000002].forEach((v,i)=>b.writeUInt32LE(v,6+i*4));b.set([9,128,255],22);
  let accepted=0,rejected=0;const check=b=>{rejected+=memoShapeActual(call,b).rejected;accepted++;};check(b);
  for(let at=0;at<b.length;at++)for(let bit=0;bit<8;bit++){const changed=Buffer.from(b);changed[at]^=1<<bit;check(changed);}
  for(let n=22;n<=25;n++)check(b.subarray(0,n));
  check(Buffer.alloc(22));return {accepted,rejected};
}
