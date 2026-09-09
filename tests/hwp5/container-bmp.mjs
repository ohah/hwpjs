import assert from 'node:assert/strict';
import {containerJpegInput} from './container-jpeg.mjs';
import {imageContainerFixture} from './container-images.mjs';
import {bmpFixture} from './bmp-fixture.mjs';
import {bmpPixelsOracle,bmpWords} from './bmp-oracle.mjs';
import {profilePng} from './png-profile.mjs';
import {jpegJfifLayoutFixture} from './jpeg-jfif-layout.mjs';

export function containerBmpInput(bytes,{bmp=1,rgba=268435456,perImage=268435456,trailing=false,...options}={}) {
  const old=containerJpegInput(bytes,options);
  return Buffer.concat([old.subarray(0,16),Buffer.of(bmp),bmpWords([rgba,perImage]),Buffer.of(+trailing),old.subarray(16)]);
}
// Explicit independent wire order; PNG and selected JPEG retain dispatch priority.
export function containerBmpOracle(entries,{enabled=1,trailing=false}={}) {
  const sums=[0,0,0,0];
  for(const {raw,extension} of entries) {
    if(/^png$/i.test(extension??'')||raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))continue;
    if(enabled&&(/^(jpg|jpeg)$/i.test(extension??'')||raw.subarray(0,2).equals(Buffer.of(255,216))))continue;
    if(!/^bmp$/i.test(extension??'')&&!raw.subarray(0,2).equals(Buffer.from('BM')))continue;
    const pixels=bmpPixelsOracle(raw,{trailing});
    const row=[1,pixels.readUInt32LE(8),+!!(extension&&!/^bmp$/i.test(extension)),pixels.readUInt32LE(12)];
    row.forEach((n,i)=>sums[i]+=n);
  }
  return sums;
}
export function containerBmpActual(call,bytes,entries,options={}) {
  const old=call(284,containerJpegInput(bytes,options));
  const png=Buffer.from(old.subarray(-100,-56));
  const expected=containerBmpOracle(entries,options);
  png.writeUInt32LE(png.readUInt32LE(12)-expected[0],12);
  const want=Buffer.concat([old.subarray(0,-100),png,old.subarray(-56),bmpWords([1,...expected])]);
  assert.deepEqual(call(288,containerBmpInput(bytes,options)),want);
  return expected;
}
export function containerBmpEdges(call,cfb) {
  let comparisons=0,rejected=0;
  const check=(raw,refs,compressed,extension='bmp',options={})=>{
    const bytes=imageContainerFixture(cfb,raw,refs,compressed,extension),entries=Array.from({length:refs},()=>({raw,extension}));
    const old=call(284,containerJpegInput(bytes,options));
    assert.deepEqual(call(288,containerBmpInput(bytes,{...options,bmp:0})),Buffer.concat([old,Buffer.alloc(20)]));comparisons++;
    containerBmpActual(call,bytes,entries,options);comparisons++;
    return {bytes,entries};
  };
  const reject=(bytes,pattern,options={})=>{assert.throws(()=>call(288,containerBmpInput(bytes,options)),pattern);rejected++;};
  for(const kind of [12,40,108,124])for(const bits of kind===12?[1,4,8,24]:[1,4,8,16,24,32])for(const compressed of [false,true])for(const refs of [1,2,5]) {
    const raw=bmpFixture({kind,bits,width:3,height:2,gap:3,after:5,declared:bits%2===0});
    const {bytes,entries}=check(raw,refs,compressed,'BmP',{rgba:24*refs,perImage:24,png:0,rgb:0,binaries:refs});
    reject(bytes,/LimitExceeded/,{rgba:24*refs-1});
    reject(bytes,/LimitExceeded/,{perImage:23});
    reject(bytes,/LimitExceeded/,{binaries:refs-1});
    containerBmpActual(call,bytes,entries);comparisons++;
  }
  for(const kind of [40,108,124])for(const bits of [16,32])for(const top of [false,true]) {
    check(bmpFixture({kind,bits,top,compression:3}),2,true,'ole');
  }
  const raw=bmpFixture({width:2,height:2});
  for(let n=0;n<raw.length;n++)reject(imageContainerFixture(cfb,raw.subarray(0,n),1,n%2===0,'bmp'),/UnexpectedEnd/);
  for(const [compression,bits] of [[1,8],[2,4],[4,0],[5,0]])reject(imageContainerFixture(cfb,bmpFixture({compression,bits}),2,true,'bmp'),/UnsupportedBmpPixelCompression/);
  const broken=bmpFixture({bits:8,used:2});broken[broken.readUInt32LE(10)]=2;
  reject(imageContainerFixture(cfb,broken,1,true,'bmp'),/InvalidBmpPaletteIndex/);
  const tail=Buffer.concat([raw,Buffer.of(7)]),tailBytes=imageContainerFixture(cfb,tail,2,false,'bmp');
  reject(tailBytes,/TrailingBmpBytes/);check(tail,2,true,'bmp',{trailing:true});
  // Image signatures precede the BMP hint; contradictory older hints still fail.
  check(profilePng(2),2,true,'bmp');
  check(jpegJfifLayoutFixture({width:1,height:1,sampling:[17],groups:[[0]]}),2,false,'bmp');
  check(raw,1,false,'jpg',{enabled:0});
  reject(imageContainerFixture(cfb,raw,1,false,'jpg'),/InvalidJpegMarker/);
  reject(imageContainerFixture(cfb,raw,1,false,'png'),/InvalidPngSignature/);
  const bytes=imageContainerFixture(cfb,raw,1,false,'bmp');
  for(const at of [16,25]){const input=containerBmpInput(bytes);input[at]=2;assert.throws(()=>call(288,input),/InvalidMode/);rejected++;}
  const disabled=containerBmpInput(bytes,{enabled:0});disabled[0]=0;assert.throws(()=>call(288,disabled),/InvalidMode/);rejected++;
  for(let n=0;n<30;n++){assert.throws(()=>call(288,containerBmpInput(bytes).subarray(0,n)),/UnexpectedEnd/);rejected++;}
  return {comparisons,rejected};
}
