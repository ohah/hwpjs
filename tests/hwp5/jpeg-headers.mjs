import assert from 'node:assert/strict';
const words = ns => {const b=Buffer.alloc(ns.length*4);ns.forEach((n,i)=>b.writeUInt32LE(n,i*4));return b;};
const processes = new Map([[192,[0,0]],[193,[1,0]],[194,[2,0]],[195,[3,0]],[201,[1,1]],[202,[2,1]],[203,[3,1]]]);
export const jpegFrameMarker = code => code >= 192 && code <= 207 && ![196,200,204].includes(code);
export function jpegFrameFixture({precision=8,count=1,width=2,height=1}={}) {
  const b=Buffer.alloc(6+3*count);b[0]=precision;b.writeUInt16BE(height,1);b.writeUInt16BE(width,3);b[5]=count;
  for(let i=0;i<count;i++){b[6+3*i]=(9+i)&255;b[7+3*i]=17;}
  return b;
}
export function jpegHeaderInput(code,f,s=null,{pixels=100000000n,components=255}={}) {
  const b=Buffer.alloc(14);b[0]=+(s!==null);b[1]=code;b.writeBigUInt64LE(pixels,2);b.writeUInt16LE(components,10);b.writeUInt16LE(f.length,12);
  return Buffer.concat([b,f,...(s===null?[]:[s])]);
}
function expected(code,f,s) {
  const p=processes.get(code);
  const parts=[words([f.readUInt16BE(3),f.readUInt16BE(1),f[0],...p,f[5],+(f.readUInt16BE(1)===0)]),f.subarray(6)];
  if(s!==null)parts.push(words([s[0],s.at(-3),s.at(-2),s.at(-1)>>4,s.at(-1)&15]),s.subarray(1,-3));
  return Buffer.concat(parts);
}
export function jpegHeaderActual(call,code,f,s=null) {
  assert.deepEqual(call(246,jpegHeaderInput(code,f,s)),expected(code,f,s));
}
export function jpegHeaderEdges(call) {
  let comparisons=0,rejected=0;
  const good=jpegFrameFixture();
  const check=(c,f,s=null,options={})=>{assert.deepEqual(call(246,jpegHeaderInput(c,f,s,options)),expected(c,f,s));comparisons++;};
  const reject=(c,f,s,error,options={})=>{assert.throws(()=>call(246,jpegHeaderInput(c,f,s,options)),error);rejected++;check(192,good);};
  for(const [code,[mode]] of processes) {
    for(let precision=0;precision<256;precision++) {
      const f=jpegFrameFixture({precision});
      const valid=mode===0?precision===8:mode===3?precision>=2&&precision<=16:precision===8||precision===12;
      if(valid)check(code,f);else reject(code,f,null,/InvalidJpegPrecision/);
    }
    for(const count of [1,4,5,255]) {
      const f=jpegFrameFixture({count});
      if(mode===2&&count>4)reject(code,f,null,/InvalidJpegComponentCount/);else check(code,f);
    }
    for(let selector=0;selector<256;selector++) {
      const s=Buffer.from([1,9,selector,mode===3?1:0,mode===2||mode===3?0:63,0]);
      const max=mode===0?1:3;
      const valid=(selector>>4)<=max&&(selector&15)<=max&&(mode!==3||(selector&15)===0);
      if(valid)check(code,good,s);else reject(code,good,s,/InvalidJpegEntropySelector/);
    }
  }
  for(let sampling=0;sampling<256;sampling++) {
    const f=Buffer.from(good);f[7]=sampling;
    if((sampling>>4)>=1&&(sampling>>4)<=4&&(sampling&15)>=1&&(sampling&15)<=4)check(192,f);else reject(192,f,null,/InvalidJpegSampling/);
  }
  for(let n=0;n<good.length;n++)reject(192,good.subarray(0,n),null,/UnexpectedEnd/);
  reject(192,Buffer.concat([good,Buffer.from([0])]),null,/InvalidJpegFrameLength/);
  reject(192,good,null,/LimitExceeded/,{pixels:1n});
  reject(192,good,null,/LimitExceeded/,{components:0});
  check(192,jpegFrameFixture({height:0}),null,{pixels:0n});
  const f=jpegFrameFixture({count:2}); f[6]=9;f[9]=1;
  check(192,f,Buffer.from([2,9,0,1,0,0,63,0]));
  reject(192,f,Buffer.from([2,1,0,9,0,0,63,0]),/InvalidJpegComponentOrder/);
  reject(192,f,Buffer.from([2,9,0,9,0,0,63,0]),/InvalidJpegComponentOrder/);
  reject(192,f,Buffer.from([1,8,0,0,63,0]),/InvalidJpegComponentReference/);
  for(const [ss,se] of [[0,0],[1,5],[6,63],[63,63]])check(194,good,Buffer.from([1,9,0,ss,se,0]));
  for(const [ss,se] of [[0,1],[1,0],[64,64]])reject(194,good,Buffer.from([1,9,0,ss,se,0]),/InvalidJpegScanParameters/);
  for(let v=0;v<256;v++) {
    const s=Buffer.from([1,9,0,0,0,v]),high=v>>4,low=v&15;
    if(high<=13&&low<=13&&(high===0||high===low+1))check(194,good,s);else reject(194,good,s,/InvalidJpegApproximation/);
  }
  return {comparisons,rejected};
}
