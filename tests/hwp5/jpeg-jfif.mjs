import assert from 'node:assert/strict';
import {jpegMarkerOracle} from './jpeg-framing.mjs';

const words = values => {const b=Buffer.alloc(values.length*4);values.forEach((n,i)=>b.writeUInt32LE(n,i*4));return b;};
export function jpegJfifFixture(width=0,height=0) {
  const b=Buffer.alloc(14+width*height*3);b.write('JFIF\0',0,'ascii');b.writeUInt16BE(258,5);b[7]=1;b.writeUInt16BE(300,8);b.writeUInt16BE(150,10);b[12]=width;b[13]=height;
  for(let i=14;i<b.length;i++)b[i]=(i*37+11)%256;return b;
}
export function jpegJfifOracle(b) {
  assert.ok(b.length<=65533);assert.ok(b.length>=14);assert.deepEqual(b.subarray(0,5),Buffer.from('JFIF\0'));
  assert.equal(b[5],1);assert.ok(b[7]<=2);
  const h=b[8]*256+b[9],v=b[10]*256+b[11];assert.ok(h&&v);
  assert.equal(b.length,14+b[12]*b[13]*3);
  return Buffer.concat([words([256+b[6],b[7],h,v,b[12],b[13],b.length-14]),b.subarray(14)]);
}
export function jpegJfifActual(call,b){assert.deepEqual(call(261,b),jpegJfifOracle(b));}

// Known-file survey before the first SOS. This is not the whole-file ordering,
// duplicate APP0, JFXX, or conflicting colour metadata validator.
export function jpegJfifFileActual(call,raw) {
  let at=0,headers=0,frame=null;
  while(at<raw.length){
    const m=jpegMarkerOracle(raw.subarray(at)),payload=m.wire.subarray(20);at+=m.consumed;
    if(m.code===218)break;
    if(m.code===224&&payload.subarray(0,5).equals(Buffer.from('JFIF\0'))){jpegJfifActual(call,payload);headers++;}
    if([192,193,194,195,201,202,203].includes(m.code))frame={code:m.code,payload};
  }
  if(headers&&frame){
    const f=frame.payload;assert.equal(f[0],8);assert.ok([1,3].includes(f[5]));for(let i=0;i<f[5];i++)assert.equal(f[6+i*3],i+1);
    assert.deepEqual(call(262,Buffer.concat([Buffer.of(frame.code),f])),words([f.readUInt16BE(3),f.readUInt16BE(1),f[0],f[5]]));
  }
  return {headers,frameChecked:!!(headers&&frame)};
}

export function jpegJfifEdges(call) {
  let comparisons=0,rejected=0;
  const check=b=>{jpegJfifActual(call,b);comparisons++;};
  const reject=(b,error,limit=67108864)=>{assert.throws(()=>call(261,b,limit),error);rejected++;};
  const b=jpegJfifFixture();
  for(let version=0;version<65536;version++){b.writeUInt16BE(version,5);if(b[5]===1)check(b);else reject(b,/UnsupportedJfifVersion/);}
  b.writeUInt16BE(258,5);
  for(let unit=0;unit<256;unit++){b[7]=unit;if(unit<3)check(b);else reject(b,/InvalidJfifUnits/);}b[7]=0;
  for(let density=0;density<65536;density++){b.writeUInt16BE(density,8);b.writeUInt16BE(65535-density,10);if(density&&density<65535)check(b);else reject(b,/InvalidJfifDensity/);}
  for(let w=0;w<256;w++)for(const h of [0,1,2,17,85,86,255]){
    const thumb=jpegJfifFixture(w,h);if(thumb.length<=65533)check(thumb);else reject(thumb,/LimitExceeded/);
  }
  const thumb=jpegJfifFixture(2,3);
  for(let n=0;n<thumb.length;n++)reject(thumb.subarray(0,n),/UnexpectedEnd/);
  for(let i=0;i<5;i++){const bad=Buffer.from(thumb);bad[i]^=1;reject(bad,/InvalidJfifIdentifier/);}
  reject(Buffer.concat([thumb,Buffer.of(0)]),/TrailingJfifBytes/);
  reject(thumb,/LimitExceeded/,jpegJfifOracle(thumb).length-1);
  const mono=Buffer.from([192,8,0,1,0,1,1,1,17,0]);
  assert.deepEqual(call(262,mono),words([1,1,8,1]));comparisons++;
  for(let id=0;id<256;id++)if(id!==1){const bad=Buffer.from(mono);bad[7]=id;assert.throws(()=>call(262,bad),/InvalidJfifComponentId/);rejected++;}
  const wide=Buffer.from(mono);wide[0]=193;wide[1]=12;assert.throws(()=>call(262,wide),/InvalidJfifPrecision/);rejected++;
  assert.throws(()=>call(262,mono,15),/LimitExceeded/);rejected++;
  return {comparisons,rejected};
}
