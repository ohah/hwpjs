import assert from "node:assert/strict";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export const colorRun=(call,b)=>call(75,b);
export function colorActual(call,b,prefixes=true){
  assert.equal(b.readInt32LE(),0);const count=b.readUInt32LE(8),end=12+count*8;assert.ok(end<=b.length);
  let known=0;for(let i=0;i<count;i++){const kind=b.readInt32LE(12+i*8);known+=Number(kind>=0&&kind<=27);}
  const want=Buffer.concat([b.subarray(0,end),w(known),w(b.length-end),b.subarray(end)]);
  assert.deepEqual(colorRun(call,b),want);
  if(prefixes)for(let n=0;n<end;n++)assert.throws(()=>colorRun(call,b.subarray(0,n)),/UnexpectedEnd/);
  assert.deepEqual(colorRun(call,b),want);
  return {count,known,value:b.readUInt32LE(4),extra:b.length-end,rejected:prefixes?end:0};
}
export function colorEdges(call){
  let accepted=0,rejected=0;
  const good=Buffer.concat([w(0),w(0xffabcdef),w(2),w(27),w(0x7fc12345),w(-1),w(0x80000000),Buffer.from([8,7,6])]);
  const check=(b,prefixes=true)=>{rejected+=colorActual(call,b,prefixes).rejected;accepted++;};
  const reject=(b,error)=>{assert.throws(()=>colorRun(call,b),error);rejected++;check(good,false);};
  check(good);
  for(let at=4;at<good.length;at++){
    if(at>=8&&at<12)continue;
    for(const value of [0,128,255]){const b=Buffer.from(good);b[at]=value;check(b);}
  }
  for(let bit=0;bit<32;bit++){const b=Buffer.from(good);b.writeUInt32LE((2**bit)>>>0);reject(b,/UnsupportedPictureColorType/);}
  for(const count of [0,1,2]){const b=Buffer.from(good);b.writeUInt32LE(count,8);check(b);}
  for(const count of [3,0x7fffffff,0x80000000,0xffffffff]){const b=Buffer.from(good);b.writeUInt32LE(count,8);reject(b,/UnexpectedEnd/);}
  for(const kind of [-2147483648,-1,...Array.from({length:28},(_,i)=>i),28,2147483647])for(const bits of [0,0x80000000,0x7f800000,0xff800000,0x7fc12345,0x7f812345,1,0x3f800000])check(Buffer.concat([w(0),w(0),w(1),w(kind),w(bits)]));
  check(Buffer.concat([w(0),w(0),w(0)]));
  const large=Buffer.alloc(12+65537*8);large.writeUInt32LE(65537,8);check(large,false);
  return {accepted,rejected};
}
