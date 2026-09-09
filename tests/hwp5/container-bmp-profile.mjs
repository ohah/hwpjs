import assert from 'node:assert/strict';
import {containerBmpRleInput,containerBmpRleActual} from './container-bmp-rle.mjs';
import {selectedBmpEntries} from './container-bmp.mjs';
import {bmpProfileFixture,bmpProfileOracle} from './bmp-profile.mjs';
import {bmpRleFixture} from './bmp-rle-fixture.mjs';
import {bmpFixture} from './bmp-fixture.mjs';
import {bmpWords} from './bmp-oracle.mjs';
import {iccFixture} from './icc-fixture.mjs';
import {iccDigest} from './icc-header-evidence.mjs';
import {imageContainerFixture} from './container-images.mjs';
import {expectBmpError} from './bmp-errors.mjs';
import {profilePng} from './png-profile.mjs';
import {jpegJfifLayoutFixture} from './jpeg-jfif-layout.mjs';
export function containerBmpProfileInput(raw,{profileEnabled=1,content=2,linked=1,semantics=0,profileMaximum=67108864,linkMaximum=4096,profileTags=100000,profileTotal=67108864,...options}={}) {
  const old=containerBmpRleInput(raw,options),selection=Buffer.concat([Buffer.of(profileEnabled,content,linked,semantics),bmpWords([profileMaximum,linkMaximum,profileTags,profileTotal])]);
  return Buffer.concat([old.subarray(0,43),selection,old.subarray(43)]);
}
export function bmpProfileStats(raw,{profileEnabled=1,content=2,linked=1,semantics=0,profileMaximum=67108864,linkMaximum=4096,profileTags=100000,fileTrailing=false}={}) {
  const r=Array(13).fill(0);if(!profileEnabled)return r;
  const options={maximum:profileMaximum,link:linkMaximum,tags:profileTags,layout:content===1?0:1,trailing:fileTrailing},view=bmpProfileOracle(raw,options),kind=view.readUInt32LE(0);
  if(!kind)return r;r[2]=view.readUInt32LE(16);r[8]=1;
  if(kind===2){assert.equal(linked,1);r[1]=1;return r;}
  r[0]=1;if(!content)return r;
  const inspected=bmpProfileOracle(raw,options,true),tags=inspected.readUInt32LE(32),id=inspected.readUInt32LE(36);r[3]=1;r[4]=tags;r[id===2?5:id===1?6:7]=1;
  if(semantics){
    // This semantic fixture oracle intentionally covers only one unknown text tag.
    const data=view.subarray(32);assert.equal(data.toString('latin1',12,24),'mntrRGB XYZ ');assert.equal(data.readUInt32BE(128),1);assert.equal(data.toString('latin1',132,136),'text');
    r[9]=1;r[10]=9;r[11]=1;r[12]=1;
  }
  return r;
}
export function containerBmpProfileActual(call,bytes,entries,options={}) {
  containerBmpRleActual(call,bytes,entries,options);
  const sums=Array(13).fill(0);
  for(const {raw} of selectedBmpEntries(entries,options))bmpProfileStats(raw,options).forEach((n,i)=>sums[i]+=n);
  const base=call(291,containerBmpRleInput(bytes,options));
  assert.deepEqual(call(294,containerBmpProfileInput(bytes,options)),Buffer.concat([base,bmpWords([options.profileEnabled??1,...sums])]));return sums;
}
export function containerBmpProfileEdges(call,cfb) {
  let comparisons=0,rejected=0;
  const check=(raw,refs=1,compressed=false,options={})=>{const bytes=imageContainerFixture(cfb,raw,refs,compressed,'bmp'),entries=Array.from({length:refs},()=>({raw,extension:'bmp'}));containerBmpProfileActual(call,bytes,entries,options);comparisons++;return bytes;};
  const reject=(bytes,error,options={})=>{expectBmpError(()=>call(294,containerBmpProfileInput(bytes,options)),error);rejected++;};
  for(const major of [2,4])for(const compressed of [false,true])for(const refs of [1,2,5])for(const content of [0,1,2]) {
    const data=iccFixture([['text',144,12]],156,major);if(major===4)iccDigest(data).copy(data,84);
    const raw=bmpProfileFixture({data,gap:3,tail:7}),bytes=check(raw,refs,compressed,{content,profileTotal:156*refs,profileMaximum:156});
    reject(bytes,/LimitExceeded/,{content,profileTotal:156*refs-1});reject(bytes,/LimitExceeded/,{content,profileMaximum:155});
    if(content)reject(bytes,/LimitExceeded/,{content,profileTags:0});
    check(raw,refs,compressed,{content,profileEnabled:0,profileTotal:0});
  }
  for(const bits of [4,8])for(const compressed of [false,true])for(const fill of [1,2]) {
    const base=bmpRleFixture({kind:124,bits}),data=iccFixture(),raw=Buffer.concat([base,data]);raw.writeUInt32LE(raw.length,2);raw.writeUInt32LE(0x4d424544,70);raw.writeUInt32LE(base.length-14,126);raw.writeUInt32LE(data.length,130);
    const bytes=check(raw,2,compressed,{fill});reject(bytes,/IncompleteBmpRleRaster/,{fill,full:true});reject(bytes,/UnwrittenBmpRlePixels/,{fill:0});reject(bytes,/LimitExceeded/,{fill,rgba:1023});
  }
  const link=bmpProfileFixture({kind:0x4c494e4b,data:Buffer.from('C:\\p.icc\0')});
  for(const compressed of [false,true])for(const content of [0,1,2]){const bytes=check(link,2,compressed,{content,profileTotal:18,linkMaximum:9});reject(bytes,/UnsupportedBmpLinkedProfile/,{content,linked:0});reject(bytes,/LimitExceeded/,{content,linkMaximum:8});reject(bytes,/LimitExceeded/,{content,profileTotal:17});}
  const data=iccFixture([['text',144,12]],156);data.write('mntrRGB XYZ ',12,'latin1');check(bmpProfileFixture({data}),2,true,{semantics:1});
  const empty=bmpProfileFixture({data:Buffer.alloc(0)}),emptyDoc=check(empty,2,false,{content:0,profileTotal:0});reject(emptyDoc,/InvalidIccProfileSize/);
  const corrupt=Buffer.from(data);corrupt[84]=1;const corruptDoc=check(bmpProfileFixture({data:corrupt}),1,true,{content:0});reject(corruptDoc,/InvalidIccProfileId/);
  const ordinary=check(bmpFixture(),2,true,{profileTotal:0});
  check(bmpFixture({kind:124}),2,true,{profileTotal:0});
  check(profilePng(2),2,true,{profileTotal:0});
  check(jpegJfifLayoutFixture(),2,true,{profileTotal:0});
  const invalidOffset=bmpProfileFixture({data:iccFixture()});invalidOffset.writeUInt32LE(0xffffffff,126);
  const invalidOffsetDoc=check(invalidOffset,2,true,{profileEnabled:0});reject(invalidOffsetDoc,/InvalidBmpProfileOffset/);
  const fileTail=bmpProfileFixture({kind:0x4c494e4b,data:Buffer.from([65,66,0])});fileTail.writeUInt32LE(fileTail.length-1,2);
  const tailDoc=check(fileTail,1,true,{profileEnabled:0,fileTrailing:true});
  reject(tailDoc,/TrailingBmpBytes/);reject(tailDoc,/UnterminatedBmpProfileLink/,{fileTrailing:true});
  for(let n=0;n<67;n++){expectBmpError(()=>call(294,containerBmpProfileInput(ordinary).subarray(0,n)),/UnexpectedEnd/);rejected++;}
  for(const at of [43,44,45,46]){const input=containerBmpProfileInput(ordinary);input[at]=at===44?3:2;expectBmpError(()=>call(294,input),/InvalidMode/);rejected++;}
  reject(ordinary,/InvalidMode/,{bmp:0,rleEnabled:0});reject(ordinary,/InvalidMode/,{content:0,semantics:1});
  // Container probe's limit is document record count, not serialized byte size.
  const input=containerBmpProfileInput(ordinary),out=call(294,input);assert.deepEqual(call(294,input,out.length-1),out);comparisons++;
  expectBmpError(()=>call(294,input,0),/InvalidDocumentLimit/);rejected++;
  expectBmpError(()=>call(294,input,1),/LimitExceeded/);rejected++;
  return {comparisons,rejected};
}
