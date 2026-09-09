import assert from 'node:assert/strict';
import {containerBmpInput,selectedBmpEntries} from './container-bmp.mjs';
import {bmpRleSelection} from './bmp-rle-rgba.mjs';
import {bmpRleRgbaOracle} from './bmp-rle-rgba-oracle.mjs';
import {bmpWords} from './bmp-oracle.mjs';
import {bmpRleFixture,rleAbsolute} from './bmp-rle-fixture.mjs';
import {bmpFixture} from './bmp-fixture.mjs';
import {imageContainerFixture} from './container-images.mjs';
import {expectBmpError} from './bmp-errors.mjs';
export function containerBmpRleInput(bytes,options={}) {
  const old=containerBmpInput(bytes,{...options,trailing:options.fileTrailing??false});return Buffer.concat([old.subarray(0,26),bmpRleSelection(options),old.subarray(26)]);
}
export function containerBmpRleActual(call,bytes,entries,options={}) {
  const base=call(288,containerBmpInput(bytes,{...options,bmp:0,trailing:options.fileTrailing??false})),png=Buffer.from(base.subarray(-120,-76)),sums=Array(12).fill(0);
  for(const {raw,extension} of selectedBmpEntries(entries,options)) {
    const pixels=bmpRleRgbaOracle(raw,options),rle=pixels.readUInt32LE(16),written=pixels.readUInt32LE(24),missing=pixels.readUInt32LE(28),fill=pixels.readUInt32LE(20);
    const row=[1,pixels.readUInt32LE(8),+!!(extension&&!/^bmp$/i.test(extension)),1,rle,written,missing,pixels.readUInt32LE(32),pixels.readUInt32LE(36),pixels.readUInt32LE(40),fill===1?missing:0,fill===2?missing:0];
    row.forEach((n,i)=>sums[i]+=n);
  }
  png.writeUInt32LE(png.readUInt32LE(12)-sums[0],12);
  const expected=Buffer.concat([base.subarray(0,-120),png,base.subarray(-76,-20),bmpWords([1,...sums.slice(0,4),options.rleEnabled??1,...sums.slice(4)])]);
  assert.deepEqual(call(291,containerBmpRleInput(bytes,options)),expected);return sums;
}
export function containerBmpRleEdges(call,cfb) {
  let comparisons=0,rejected=0;
  const reject=(bytes,pattern,options={})=>{expectBmpError(()=>call(291,containerBmpRleInput(bytes,options)),pattern);rejected++;};
  for(const bits of [4,8])for(const compressed of [false,true])for(const refs of [1,2,5])for(const fill of [1,2]) {
    const raw=bmpRleFixture({bits}),bytes=imageContainerFixture(cfb,raw,refs,compressed,'BmP'),entries=Array.from({length:refs},()=>({raw,extension:'BmP'}));
    const options={fill,rgba:512*refs,perImage:512,binaries:refs,png:0,rgb:0};
    containerBmpRleActual(call,bytes,entries,options);comparisons++;
    reject(bytes,/LimitExceeded/,{rgba:512*refs-1});reject(bytes,/LimitExceeded/,{perImage:511});reject(bytes,/LimitExceeded/,{binaries:refs-1});
    reject(bytes,/LimitExceeded/,{indices:255});reject(bytes,/IncompleteBmpRleRaster/,{full:true});reject(bytes,/UnwrittenBmpRlePixels/,{fill:0});reject(bytes,/UnsupportedBmpPixelCompression/,{rleEnabled:0});
    containerBmpRleActual(call,bytes,entries,options);comparisons++;
  }
  for(const bits of [4,8])for(const fill of [0,1,2]) {
    const raw=bmpRleFixture({bits,width:5,height:1,commands:Buffer.concat([rleAbsolute(bits,[0,1,2,3,4]),Buffer.of(0,1)])});
    const bytes=imageContainerFixture(cfb,raw,2,true,'ole');containerBmpRleActual(call,bytes,[{raw,extension:'ole'},{raw,extension:'ole'}],{fill,full:true});comparisons++;
  }
  const raw=bmpFixture(),bytes=imageContainerFixture(cfb,raw,2,false,'bmp'),entries=[{raw,extension:'bmp'},{raw,extension:'bmp'}];
  containerBmpRleActual(call,bytes,entries);comparisons++;
  const old=call(288,containerBmpInput(bytes));assert.deepEqual(call(291,containerBmpRleInput(bytes,{rleEnabled:0})),Buffer.concat([old,Buffer.alloc(36)]));comparisons++;
  for(const hasFileTail of [false,true])for(const hasRleTail of [false,true]) {
    const commands=Buffer.from([1,0,0,1,...(hasRleTail?[99]:[])]),base=bmpRleFixture({width:1,height:1,commands});
    const raw=hasFileTail?Buffer.concat([base,Buffer.of(7)]):base;
    const document=imageContainerFixture(cfb,raw,2,true,'bmp'),entries=[{raw,extension:'bmp'},{raw,extension:'bmp'}];
    for(const fileTrailing of [false,true])for(const trailing of [false,true]) {
      const options={fileTrailing,trailing},input=containerBmpRleInput(document,options);
      assert.equal(input[25],+fileTrailing);assert.equal(input[30],+trailing);
      if(hasFileTail&&!fileTrailing)reject(document,/TrailingBmpBytes/,options);
      else if(hasRleTail&&!trailing)reject(document,/TrailingBmpRleBytes/,options);
      else{containerBmpRleActual(call,document,entries,options);comparisons++;}
    }
  }
  for(let n=0;n<47;n++){expectBmpError(()=>call(291,containerBmpRleInput(bytes).subarray(0,n)),/UnexpectedEnd/);rejected++;}
  reject(bytes,/InvalidMode/,{bmp:0});
  for(const at of [26,27,28,29,30]){const input=containerBmpRleInput(bytes);input[at]=at===27?3:2;expectBmpError(()=>call(291,input),/InvalidMode/);rejected++;}
  return {comparisons,rejected};
}
