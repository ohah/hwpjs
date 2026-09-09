import assert from 'node:assert/strict';
import {imageContainerInput,imageContainerFixture} from './container-images.mjs';
import {jpegJfifLayoutFixture} from './jpeg-jfif-layout.mjs';
import {progressiveRgbFixture,progressiveRgbOracle} from './jpeg-progressive-rgb.mjs';
import {jpegRgbOracle} from './jpeg-rgb.mjs';
import {jpegSequentialScans} from './jpeg-scan.mjs';
import {segment} from './jpeg-structure.mjs';
import {adobePayload} from './jpeg-adobe.mjs';
import {jpegIccChunk} from './jpeg-icc.mjs';

const words=values=>{const out=Buffer.alloc(values.length*4);values.forEach((n,i)=>out.writeUInt32LE(n,i*4));return out;};
export function containerJpegInput(bytes,{enabled=1,method=0,full=true,rgb=268435456,png=268435456,binaries=100000,documentBytes=67108864}={}) {
  const old=imageContainerInput(bytes,1,png,binaries,documentBytes);
  return Buffer.concat([old.subarray(0,9),Buffer.of(enabled,method,+full),words([rgb]),old.subarray(9)]);
}
// Explicit wire order independent of product struct reflection.
export function containerJpegOracle(entries,{method=0,full=true}={}) {
  const sums=Array(13).fill(0);
  for(const {raw,extension} of entries) {
    if(!raw.subarray(0,2).equals(Buffer.of(255,216)))continue;
    const scan=jpegSequentialScans(raw),progressive=scan.deferred;
    const rgb=progressive?progressiveRgbOracle(raw,{method,full}):jpegRgbOracle(raw,method);
    const row=[1,+progressive,rgb.readUInt32LE(8),+!!(extension&&!/^(jpg|jpeg)$/i.test(extension)),+(rgb.readUInt32LE(20)!==0),rgb.readUInt32LE(36),
      progressive?rgb.readUInt32LE(44):scan.scans.length,
      ...[48,52,56].map(at=>progressive?rgb.readUInt32LE(at):0),
      rgb.readUInt32LE(16),rgb.readUInt32LE(28),rgb.readUInt32LE(32)];
    row.forEach((v,i)=>sums[i]+=v);
  }
  return sums;
}
export function containerJpegActual(call,bytes,entries,options={}) {
  const off=call(244,imageContainerInput(bytes,1,undefined,undefined,options.documentBytes));
  const old=Buffer.from(off.subarray(-44));
  const expected=containerJpegOracle(entries,options);
  old.writeUInt32LE(old.readUInt32LE(12)-expected[0],12);
  const want=Buffer.concat([off.subarray(0,-44),old,words([1,...expected])]);
  assert.deepEqual(call(284,containerJpegInput(bytes,options)),want);
  return expected;
}
export function containerJpegEdges(call,cfb) {
  let comparisons=0,rejected=0;
  const check=(raw,refs,compressed,extension='jpg',options={})=>{
    const bytes=imageContainerFixture(cfb,raw,refs,compressed,extension);
    const entries=Array.from({length:refs},()=>({raw,extension}));
    const old=call(244,imageContainerInput(bytes));
    assert.deepEqual(call(284,containerJpegInput(bytes,{enabled:0})),Buffer.concat([old,Buffer.alloc(56)]));comparisons++;
    containerJpegActual(call,bytes,entries,options);comparisons++;
    return {bytes,entries};
  };
  const reject=(bytes,pattern,options={})=>{assert.throws(()=>call(284,containerJpegInput(bytes,options)),pattern);rejected++;};
  for(const generate of [jpegJfifLayoutFixture,progressiveRgbFixture])for(const sampling of [[17],[34,17,17],[49,17,18]])for(const compressed of [false,true])for(const refs of [1,2,5])for(const method of [0,1]){
    const raw=generate({width:9,height:1,sampling,groups:[sampling.map((_,i)=>i)],interval:1,dnl:true});
    const {bytes,entries}=check(raw,refs,compressed,'JpEg',{method,rgb:27*refs,png:0,binaries:refs});
    reject(bytes,/LimitExceeded/,{rgb:27*refs-1});reject(bytes,/LimitExceeded/,{binaries:refs-1});
    containerJpegActual(call,bytes,entries,{method});comparisons++;
  }
  const raw=progressiveRgbFixture({width:1,height:1,sampling:[17],refine:false,ac:false});
  const partial=check(raw,2,true,'bmp',{full:false});reject(partial.bytes,/IncompleteJpegProgressiveCoefficients/);
  const seq=jpegJfifLayoutFixture({width:1,height:1,sampling:[17],groups:[[0]]});
  const late=parts=>Buffer.concat([seq.subarray(0,-2),...parts,seq.subarray(-2)]);
  const good=segment(238,adobePayload(100,0,0,0)),bad=segment(238,adobePayload(100,0,0,1));
  check(late([good,segment(226,jpegIccChunk(1,1,Buffer.of(9,2,7)))]),2,false);
  for(const parts of [[good,bad],[bad,good]])reject(imageContainerFixture(cfb,late(parts),1,false,'jpg'),/ConflictingJfifAdobeColour/);
  reject(imageContainerFixture(cfb,late([segment(226,jpegIccChunk(1,2,Buffer.of(9)))]),1,true,'jpg'),/MissingJpegIccChunk/);
  for(let n=0;n<seq.length;n++)reject(imageContainerFixture(cfb,seq.subarray(0,n),1,n%2===0,'jpg'),/UnexpectedEnd|MissingJpegSoi|MissingJpegFrame|MissingJpegScan|MissingJpegEoi/);
  const broken=Buffer.from(seq);broken[broken.length-3]&=0xfe;
  reject(imageContainerFixture(cfb,broken,2,true,'jpg'),/InvalidJpegEntropyPadding/);
  reject(imageContainerFixture(cfb,Buffer.concat([seq,Buffer.of(7)]),1,false,'jpg'),/TrailingJpegBytes/);
  reject(imageContainerFixture(cfb,Buffer.concat([seq.subarray(0,2),seq.subarray(20)]),1,false,'jpg'),/MissingJfifHeader/);
  const bytes=imageContainerFixture(cfb,seq,1,false,'jpg');
  for(let method=2;method<256;method++)reject(bytes,/InvalidInterpolationMethod/,{method});
  const input=containerJpegInput(bytes);input[11]=2;assert.throws(()=>call(284,input),/InvalidJpegCompletionPolicy/);rejected++;
  input[11]=1;input[9]=2;assert.throws(()=>call(284,input),/InvalidMode/);rejected++;
  for(let n=0;n<20;n++){assert.throws(()=>call(284,containerJpegInput(bytes).subarray(0,n)),/UnexpectedEnd/);rejected++;}
  return {comparisons,rejected};
}
