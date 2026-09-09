import assert from 'node:assert/strict';

function weights(reference,source,x) {
  assert.ok(reference>0&&source>0&&source<=reference&&x<reference);
  // Direct inverse of the published centered positions, not the product's
  // integer numerator branch. Integer weights recover the exact fraction.
  const p=Math.max(0,Math.min(source-1,(x+0.5)*source/reference-0.5));
  const lower=Math.floor(p),upper=p===0||p===source-1?lower:lower+1,d=2*reference;
  return [lower,upper,Math.round((p-lower)*d),d,Math.floor(p+0.5+1e-10)];
}
export function jpegAxisInput(entries) {const out=Buffer.alloc(entries.length*8);entries.forEach(([r,s,x],i)=>{out.writeUInt16LE(r,i*8);out.writeUInt16LE(s,i*8+2);out.writeUInt32LE(x,i*8+4);});return out;}
export function jpegAxisOracle(entries) {const out=Buffer.alloc(entries.length*20);entries.forEach(([r,s,x],i)=>weights(r,s,x).forEach((n,j)=>out.writeUInt32LE(n,i*20+j*4)));return out;}
export function jpegUpsamplingInput(width,height,referenceWidth,referenceHeight,method,samples) {
  const out=Buffer.alloc(9+samples.length*2);[width,height,referenceWidth,referenceHeight].forEach((n,i)=>out.writeUInt16LE(n,i*2));out[8]=method;samples.forEach((n,i)=>out.writeUInt16LE(n,9+i*2));return out;
}
export function jpegUpsamplingOracle(input) {
  const sw=input.readUInt16LE(0),sh=input.readUInt16LE(2),rw=input.readUInt16LE(4),rh=input.readUInt16LE(6),method=input[8];
  assert.ok(sw&&sh&&rw>=sw&&rh>=sh&&method<2);assert.equal(input.length,9+sw*sh*2);
  const out=Buffer.alloc(rw*rh*2),get=(x,y)=>input.readUInt16LE(9+2*(y*sw+x));
  for(let y=0;y<rh;y++)for(let x=0;x<rw;x++) {
    const h=weights(rw,sw,x),v=weights(rh,sh,y);let result;
    if(method===0)result=get(h[4],v[4]);
    else {
      const wx=BigInt(h[2]),wy=BigInt(v[2]),dx=BigInt(h[3]),dy=BigInt(v[3]);
      const n=BigInt(get(h[0],v[0]))*(dx-wx)*(dy-wy)+BigInt(get(h[1],v[0]))*wx*(dy-wy)+BigInt(get(h[0],v[1]))*(dx-wx)*wy+BigInt(get(h[1],v[1]))*wx*wy;
      const d=dx*dy;result=Number((2n*n+d)/(2n*d));
    }
    out.writeUInt16LE(result,2*(y*rw+x));
  }
  return out;
}
export function jpegUpsamplingActual(call,input){assert.deepEqual(call(270,input),jpegUpsamplingOracle(input));}
export function jpegUpsamplingEdges(call) {
  let comparisons=0,rejected=0,axisCoordinates=0;
  const axis=entries=>{assert.deepEqual(call(269,jpegAxisInput(entries)),jpegAxisOracle(entries));comparisons++;axisCoordinates+=entries.length;};
  for(let r=1;r<=256;r++){const entries=[];for(let s=1;s<=r;s++)for(let x=0;x<r;x++)entries.push([r,s,x]);axis(entries);}
  const boundaries=[];for(let r=1;r<=65535;r++)for(const x of [0,Math.floor(r/2),r-1])boundaries.push([r,Math.max(1,Math.floor(r/2)),x]);axis(boundaries);
  const check=b=>{jpegUpsamplingActual(call,b);comparisons++;};
  for(let sw=1;sw<=8;sw++)for(let sh=1;sh<=8;sh++)for(const rw of [sw,sw+1,sw*2-1,sw*3+1])for(const rh of [sh,sh+1,sh*2-1,sh*3+1])for(const m of [0,1])check(jpegUpsamplingInput(sw,sh,rw,rh,m,Array.from({length:sw*sh},(_,i)=>(i*12347+19)%65536)));
  for(const m of [0,1])check(jpegUpsamplingInput(1,1,65535,1,m,[65535]));
  const reject=(mode,b,error,limit=67108864)=>{assert.throws(()=>call(mode,b,limit),error);rejected++;};
  for(const triple of [[0,0,0],[0,1,0],[1,0,0],[1,2,0]])reject(269,jpegAxisInput([triple]),/InvalidJpegSampleAxis/);
  for(const x of [3,65535,4294967295])reject(269,jpegAxisInput([[3,2,x]]),/InvalidSampleCoordinate/);
  reject(269,Buffer.alloc(7),/InvalidAxisBatch/);reject(269,jpegAxisInput([[3,2,1]]),/LimitExceeded/,19);
  const good=jpegUpsamplingInput(2,2,3,3,1,[0,1,257,65535]);
  for(let n=0;n<good.length;n++)reject(270,good.subarray(0,n));
  reject(270,Buffer.concat([good,Buffer.of(0)]),/InvalidJpegSamplePlaneLength/);
  for(let method=2;method<256;method++){const bad=Buffer.from(good);bad[8]=method;reject(270,bad,/InvalidInterpolationMethod/);}
  for(const dims of [[0,1,1,1],[1,0,1,1],[1,1,0,1],[1,1,1,0],[2,1,1,1]])reject(270,jpegUpsamplingInput(...dims,1,Array(dims[0]*dims[1]).fill(0)),/InvalidJpegSampleAxis/);
  reject(270,good,/LimitExceeded/,17);
  return {comparisons,rejected,axisCoordinates};
}
