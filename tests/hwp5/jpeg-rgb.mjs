import assert from 'node:assert/strict';
import {jpegUpsamplingInput,jpegUpsamplingOracle} from './jpeg-upsampling.mjs';
import {jpegJfifColourOracle} from './jpeg-jfif-colour.mjs';
import {jpegPlanesOracle} from './jpeg-planes.mjs';
import {jpegSequentialScans} from './jpeg-scan.mjs';
import {jpegJfifLayoutFixture,jpegJfifLayoutOracle} from './jpeg-jfif-layout.mjs';
import {jpegJfxxJpegFixture} from './jpeg-jfxx-jpeg.mjs';
import {adobePayload,adobeParts} from './jpeg-adobe.mjs';
import {jpegIccChunk,jpegIccParts,jpegIccOracle} from './jpeg-icc.mjs';
import {segment} from './jpeg-structure.mjs';

const words=ns=>{const b=Buffer.alloc(ns.length*4);ns.forEach((n,i)=>b.writeUInt32LE(n,i*4));return b;};
export function jpegRgbInput(raw,method=0,encoding=0,maximum=192000000){return Buffer.concat([words([maximum]),Buffer.of(encoding,method),raw]);}
export function rgbPlanesWire(width,height,components,precision=8) {
  return Buffer.concat([words([width,height,precision,components.length]),...components.map(({w,h,values},i)=>{
    const b=Buffer.alloc(20+values.length*2);words([9-i,17,0,w,h]).copy(b);values.forEach((v,j)=>b.writeUInt16LE(v,20+j*2));return b;
  })]);
}
export function jpegRgbRasterOracle(planes,method,encoding) {
  const width=planes.readUInt32LE(0),height=planes.readUInt32LE(4),precision=planes.readUInt32LE(8),count=planes.readUInt32LE(12);
  assert.ok(width&&height&&width<=65535&&height<=65535);assert.equal(precision,8);assert.equal(count,encoding===0?1:3);
  let at=16;const expanded=[];
  for(let c=0;c<count;c++){
    const w=planes.readUInt32LE(at+12),h=planes.readUInt32LE(at+16);
    const values=Array.from({length:w*h},(_,i)=>planes.readUInt16LE(at+20+i*2));values.forEach(n=>assert.ok(n<=255));
    expanded.push(jpegUpsamplingOracle(jpegUpsamplingInput(w,h,width,height,method,values)));at+=20+w*h*2;
  }
  assert.equal(at,planes.length);
  const packed=Buffer.alloc(width*height*3);
  // Each channel is expanded independently before a separate interleave pass.
  for(let c=0;c<3;c++)for(let i=0;i<width*height;i++)packed[i*3+c]=expanded[encoding===0?0:c].readUInt16LE(i*2);
  const rgb=encoding===2?jpegJfifColourOracle(packed,266):packed;
  return Buffer.concat([words([width,height,rgb.length]),rgb]);
}
export function jpegRgbOracle(raw,method) {
  const metadata=jpegJfifLayoutOracle(raw),planes=jpegPlanesOracle(raw),count=planes.readUInt32LE(12),headers=adobeParts(raw);
  for(const h of headers){assert.ok(h.length>=12);assert.equal(h[11],count===1?0:1);}
  const profile=jpegIccOracle(jpegIccParts(raw));
  const raster=jpegRgbRasterOracle(planes,method,count===1?0:2);
  return Buffer.concat([raster.subarray(0,12),words([metadata.readUInt32LE(16),headers.length,profile.readUInt32LE(0),metadata.readUInt32LE(12),metadata.readUInt32LE(8),metadata.readUInt32LE(4),1]),raster.subarray(12)]);
}
export function jpegRgbFileActual(call,raw) {
  if(jpegSequentialScans(raw).deferred){assert.throws(()=>call(278,jpegRgbInput(raw)),/UnsupportedJpegSequentialProcess/);return {deferred:true};}
  for(const method of [0,1])assert.deepEqual(call(278,jpegRgbInput(raw,method)),jpegRgbOracle(raw,method));
  const parsed=jpegSequentialScans(raw);return {deferred:false,pixelsPerMethod:parsed.frame.readUInt16BE(3)*parsed.height};
}
export function jpegRgbEdges(call) {
  let comparisons=0,rejected=0;
  const reject=(mode,b,error,limit=67108864)=>{assert.throws(()=>call(mode,b,limit),error);rejected++;};
  for(const width of [1,2,3,7])for(const height of [1,2,5])for(const encoding of [0,1,2])for(const method of [0,1]) {
    const components=Array.from({length:encoding===0?1:3},(_,c)=>{const w=c%2?Math.ceil(width/2):width,h=c===2?Math.ceil(height/2):height;return {w,h,values:Array.from({length:w*h},(_,i)=>(i*71+c*97+19)%256)};});
    const planes=rgbPlanesWire(width,height,components),expected=jpegRgbRasterOracle(planes,method,encoding);
    assert.deepEqual(call(277,jpegRgbInput(planes,method,encoding)),expected);comparisons++;
  }
  for(const width of [1,8,17])for(const height of [1,9])for(const sampling of [[17],[34,17,17],[49,17,18]])
    for(const groups of sampling.length===1?[[[0]]]:[[[0,1,2]],[[2],[0],[1]]])for(const interval of [0,1])for(const dnl of [false,true]) {
      const raw=jpegJfifLayoutFixture({width,height,sampling,groups,interval,dnl,redefine:true});
      for(const method of [0,1]){assert.deepEqual(call(278,jpegRgbInput(raw,method)),jpegRgbOracle(raw,method));comparisons++;}
    }
  const raw=jpegJfifLayoutFixture({width:3,height:2}),good=adobePayload(),bad=adobePayload(100,0,0,0);
  for(const late of [false,true])for(const parts of [[segment(238,good)],[segment(238,good),segment(238,good)],[segment(226,jpegIccChunk(1,1,Buffer.of(9,2,7)))]]){
    const at=late?raw.length-2:20,b=Buffer.concat([raw.subarray(0,at),...parts,raw.subarray(at)]);
    assert.deepEqual(call(278,jpegRgbInput(b)),jpegRgbOracle(b,0));comparisons++;
  }
  for(const parts of [[good,bad],[bad,good],[adobePayload(100,0,0,255)]]){
    const b=Buffer.concat([raw.subarray(0,raw.length-2),...parts.map(p=>segment(238,p)),raw.subarray(raw.length-2)]);
    reject(278,jpegRgbInput(b),parts.length===1?/UnsupportedAdobeTransform/:/ConflictingJfifAdobeColour/);
  }
  const result=jpegRgbOracle(raw,0);assert.deepEqual(call(278,jpegRgbInput(raw,0,0,18)),result);comparisons++;
  const missing=segment(226,jpegIccChunk(1,2,Buffer.of(9)));
  reject(278,jpegRgbInput(Buffer.concat([raw.subarray(0,raw.length-2),missing,raw.subarray(raw.length-2)])),/MissingJpegIccChunk/);
  reject(278,jpegRgbInput(raw,0,0,17),/LimitExceeded/);reject(278,jpegRgbInput(raw),/LimitExceeded/,result.length-1);
  reject(278,jpegRgbInput(jpegJfxxJpegFixture({})),/MissingJfifHeader/);
  reject(278,jpegRgbInput(jpegJfifLayoutFixture({precision:12})),/InvalidJfifPrecision/);
  for(let n=0;n<raw.length;n++)reject(278,jpegRgbInput(raw.subarray(0,n)),/./);
  const plane=rgbPlanesWire(1,1,[{w:1,h:1,values:[256]}]);reject(277,jpegRgbInput(plane),/InvalidJpegRgbSample/);
  plane.writeUInt16LE(129,36);reject(277,jpegRgbInput(plane,0,1),/InvalidJpegRgbComponentCount/);
  for(let m=2;m<256;m++)reject(277,jpegRgbInput(plane,m),/InvalidInterpolationMethod/);
  for(let e=3;e<256;e++)reject(277,jpegRgbInput(plane,0,e),/InvalidRgbEncoding/);
  for(let n=0;n<plane.length+6;n++)reject(277,jpegRgbInput(plane).subarray(0,n),/./);
  for(const method of [0,1])for(const [width,height] of [[65535,1],[1,65535]]) {
    const p=rgbPlanesWire(width,height,[{w:1,h:1,values:[253]}]);
    assert.deepEqual(call(277,jpegRgbInput(p,method)),jpegRgbRasterOracle(p,method,0));comparisons++;
  }
  return {comparisons,rejected};
}
