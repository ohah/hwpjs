import assert from 'node:assert/strict';

export function jpegJfxxFixture(code,width=1,height=1) {
  if(code!==17&&code!==19)return Buffer.from([74,70,88,88,0,code,0,255,17,128]);
  const b=Buffer.alloc(8+(code===17?768+width*height:width*height*3));
  b.set([74,70,88,88,0,code,width,height]);
  for(let i=8;i<b.length;i++)b[i]=(i*73+19)%256;
  return b;
}
export function jpegJfxxOracle(b) {
  assert.ok(b.length>=6&&b.length<=65533);assert.deepEqual(b.subarray(0,5),Buffer.from('JFXX\0'));
  const code=b[5],known=code===17||code===19,w=known?b[6]:0,h=known?b[7]:0;
  let rgb=Buffer.alloc(0);
  if(known){
    assert.ok(w&&h);assert.equal(b.length,8+(code===17?768+w*h:w*h*3));
    rgb=Buffer.alloc(w*h*3);
    for(let i=0;i<w*h;i++)for(let channel=0;channel<3;channel++)rgb[i*3+channel]=b[8+(code===17?b[776+i]:i)*3+channel];
  }
  const head=Buffer.alloc(24);[code,w,h,b.length-6,rgb.length,known?0:code===16?1:2].forEach((n,i)=>head.writeUInt32LE(n,i*4));
  return Buffer.concat([head,b.subarray(6),rgb]);
}
export function jpegJfxxActual(call,b){assert.deepEqual(call(263,b),jpegJfxxOracle(b));}

export function jpegJfxxEdges(call) {
  let comparisons=0,rejected=0;
  const check=b=>{jpegJfxxActual(call,b);comparisons++;};
  const reject=(b,error,limit=67108864)=>{assert.throws(()=>call(263,b,limit),error);rejected++;};
  for(let code=0;code<256;code++){check(jpegJfxxFixture(code));if(code!==17&&code!==19)check(jpegJfxxFixture(code).subarray(0,6));}
  for(const code of [17,19])for(let width=1;width<256;width++)for(const height of [1,2,17,85,86,254,255]){
    const b=jpegJfxxFixture(code,width,height);if(b.length>65533)reject(b,/LimitExceeded/);else check(b);
  }
  for(const code of [17,19]){
    const b=jpegJfxxFixture(code,3,5);
    for(let n=0;n<b.length;n++)reject(b.subarray(0,n),/UnexpectedEnd/);
    reject(Buffer.concat([b,Buffer.of(0)]),/TrailingJfxxBytes/);
    for(let axis=6;axis<8;axis++){const bad=Buffer.from(b);bad[axis]=0;reject(bad,/InvalidJpegThumbnailDimensions/);}
    for(let i=0;i<5;i++){const bad=Buffer.from(b);bad[i]^=1;reject(bad,/InvalidJfxxIdentifier/);}
    reject(b,/LimitExceeded/,jpegJfxxOracle(b).length-1);
  }
  const indexed=jpegJfxxFixture(17,16,16);for(let i=0;i<256;i++)indexed[776+i]=255-i;check(indexed);
  return {comparisons,rejected};
}
