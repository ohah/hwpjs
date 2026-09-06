import assert from "node:assert/strict";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export function ellipseActual(call,b){
  assert.ok(b.length>=60);
  const attr=b.readUInt32LE(0),views=[attr&1,attr>>>1&1,attr>>>2&255,(attr&~1023)>>>0];
  const expected=Buffer.concat([b.subarray(0,60),...views.map(w),w(b.length-60),b.subarray(60)]);
  assert.deepEqual(call(60,b),expected);
  for(let n=0;n<60;n++)assert.throws(()=>call(60,b.subarray(0,n)),/UnexpectedEnd/);
  assert.deepEqual(call(60,b),expected);
  return {attributes:attr,extra:b.length-60,rejected:60};
}
export function ellipseEdges(call){
  let accepted=0,rejected=0;
  for(let at=0;at<60;at++)for(const value of [1,128,255]){
    const b=Buffer.alloc(63);b[at]=value;b.set([0,128,255],60);rejected+=ellipseActual(call,b).rejected;accepted++;
  }
  rejected+=ellipseActual(call,Buffer.alloc(60)).rejected;accepted++;
  return {accepted,rejected};
}
