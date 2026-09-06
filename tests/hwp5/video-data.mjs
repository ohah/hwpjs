import assert from "node:assert/strict";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const run=(call,b,units=null)=>call(86,Buffer.concat([Buffer.from([units===null?0:1]),...(units===null?[]:[w(units)]),b]));
export function videoEdges(call){
  let accepted=0,rejected=0;
  const check=(b,units=null)=>{
    const kind=b.readInt32LE();let end,want;
    if(kind===0){end=8;want=b.subarray(0,8);}
    else {const n=units??((b.length-6)/2);assert.ok(Number.isInteger(n)&&n>=0);end=6+n*2;want=Buffer.concat([w(1),w(n),b.subarray(4,end)]);}
    assert.ok(end<=b.length);assert.deepEqual(run(call,b,units),Buffer.concat([want,w(b.length-end),b.subarray(end)]));accepted++;
  };
  const reject=(b,error,units=null)=>{assert.throws(()=>run(call,b,units),error);rejected++;};
  const local=Buffer.from([0,0,0,0,0,128,255,255,9,128,255]);
  const web=Buffer.concat([w(1),Buffer.from([0,0,97,0,0,216,255,255,34,0,1,128])]);
  for(const units of [null,5]){
    const b=units===null?web:Buffer.concat([web,Buffer.from([9,128,255])]);check(b,units);
    for(let at=4;at<b.length;at++)for(let bit=0;bit<8;bit++){const changed=Buffer.from(b);changed[at]^=1<<bit;check(changed,units);}
    for(let cut=0;cut<6;cut++)reject(b.subarray(0,cut),/UnexpectedEnd/,units);
    if(units!==null)for(let cut=6;cut<16;cut++)reject(b.subarray(0,cut),/UnexpectedEnd/,units);
    else for(let cut=6;cut<16;cut++)if(cut%2)reject(b.subarray(0,cut),/OddVideoWebTagBytes/);else check(b.subarray(0,cut));
    check(b,units);
  }
  for(let cut=0;cut<8;cut++)reject(local.subarray(0,cut),/UnexpectedEnd/);
  check(local);check(local,0xffffffff);
  for(let at=4;at<local.length;at++)for(let bit=0;bit<8;bit++){const b=Buffer.from(local);b[at]^=1<<bit;check(b);}
  for(const units of [0,1,65536]){const b=Buffer.concat([w(1),Buffer.alloc(units*2+2)]);check(b);check(b,units);}
  for(const units of [6,0x80000000,0xffffffff]){reject(web,/UnexpectedEnd/,units);check(web,5);}
  for(const kind of [2,-1,-2147483648,2147483647]){reject(w(kind),/UnsupportedVideoType/);check(local);}
  for(const mode of [2,255]){assert.throws(()=>call(86,Buffer.from([mode])),/InvalidMode/);rejected++;}
  for(let n=0;n<5;n++){assert.throws(()=>call(86,Buffer.concat([Buffer.from([1]),Buffer.alloc(n)])),/UnexpectedEnd/);rejected++;}
  assert.throws(()=>call(86,Buffer.alloc(0)),/UnexpectedEnd/);rejected++;
  return {accepted,rejected,actualVideoFixtures:0};
}
