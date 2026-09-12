import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {containerBmpProfileInput,containerBmpProfileActual} from './container-bmp-profile.mjs';
import {imageContainerFixture} from './container-images.mjs';
import {consumeContainerStreams} from './container-report-wire.mjs';
import {gifOracle,gifWords as words} from './gif-oracle.mjs';
import {gifFixture,gifControl,gifComment,gifApplication,gifText} from './gif-fixture.mjs';
import {profilePng} from './png-profile.mjs';
import {jpegJfifLayoutFixture} from './jpeg-jfif-layout.mjs';
import {bmpFixture} from './bmp-fixture.mjs';
import {expectBmpError} from './bmp-errors.mjs';

export function previewImageInput(raw,o={}) {
  const base=containerBmpProfileInput(raw,o);
  return Buffer.concat([base.subarray(0,63),Buffer.of(o.preview??1,o.empty??0,o.unhandled??0,o.gif??1,+!!o.gifTrailing),words([o.streamBytes??67108864,o.blocks??100000,o.subBlocks??1000000,o.frames??10000,o.indices??268435456,o.codes??268435456,o.totalFrames??10000,o.totalIndices??268435456,o.totalCodes??268435456]),base.subarray(63)]);
}
export function previewImageFixture(cfb,payload,{name='PrvImage',nested=false,compressed=false,kind=2,absent=false}={}) {
  const header=Buffer.alloc(256);header.write('HWP Document File');header.writeUInt32LE(0x05000107,32);header[36]=+compressed;
  const record=(tag,raw)=>Buffer.concat([words([tag|(raw.length<<20)]),raw]);
  const doc=Buffer.concat([record(16,Buffer.alloc(26)),record(17,Buffer.alloc(60))]);
  const nodes=[{name:'Root Entry',kind:5},{name:'FileHeader',parent:0,content:header},{name:'DocInfo',parent:0,content:compressed?deflateRawSync(doc):doc},{name:'BodyText',parent:0,kind:1},{name:'Nested',parent:0,kind:1}];
  if(!absent)nodes.push({name,parent:nested?4:0,kind,content:payload});
  return cfb.write({nodes});
}
// The container framing oracle reuses established codec-specific differentials.
// GIF evidence comes from the independent full-string LZW dictionary oracle.
export function previewImageActual(call,cfb,bytes,payload,o={}) {
  const base=call(25,Buffer.concat([words([o.documentBytes??67108864]),bytes]));
  let expected;
  if(o.preview===0)expected=Buffer.concat([base,Buffer.alloc(280)]);
  else {
    const present=payload!==null,nonempty=present&&payload.length!==0;
    const extension=nonempty&&payload.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':nonempty&&payload[0]===255&&payload[1]===216?'jpg':nonempty&&payload.subarray(0,2).toString()==='BM'?'bmp':'dat';
    const synthetic=imageContainerFixture(cfb,payload??Buffer.alloc(0),nonempty?1:0,false,extension);
    const entries=nonempty?[{raw:payload,extension}]:[];
    containerBmpProfileActual(call,synthetic,entries,o);
    const image=Buffer.from(call(294,containerBmpProfileInput(synthetic,o)).subarray(-212));
    let gif=Array(14).fill(0);
    if(nonempty&&o.gif!==0&&payload.subarray(0,3).toString()==='GIF') {
      const reference=gifOracle(payload,{trailing:!!o.gifTrailing}).wire;
      const n=i=>reference.readUInt32LE(i*4);
      gif=[1,n(7),n(10),n(11),n(8),n(9),n(12),n(13),n(14),n(15),n(16),n(18),n(19),0];
      image.writeUInt32LE(image.readUInt32LE(12)-1,12);
    }
    const state=!present?0:!nonempty?1:image.readUInt32LE(12)?3:2;
    const body=present?consumeContainerStreams(base,payload.length,1):base;
    expected=Buffer.concat([body,words([1,state,payload?.length??0]),image,words(gif)]);
  }
  assert.deepEqual(call(296,previewImageInput(bytes,o)),expected);
  return expected;
}
export function previewImageEdges(call,cfb) {
  let comparisons=0,rejected=0;
  const check=(payload,fixture={},o={})=>{const bytes=previewImageFixture(cfb,payload,fixture);previewImageActual(call,cfb,bytes,fixture.absent||fixture.nested?null:payload,o);comparisons++;return bytes;};
  const reject=(bytes,pattern,o={})=>{expectBmpError(()=>call(296,previewImageInput(bytes,o)),pattern);rejected++;};
  const samples=[gifFixture(),gifFixture({version:87}),gifFixture({interlace:true,repeat:3,prefix:Buffer.concat([gifControl(31),gifComment(),gifApplication()])}),gifFixture({global:null,prefix:Buffer.concat([gifControl(),gifText()])}),profilePng(2),jpegJfifLayoutFixture(),bmpFixture(),Buffer.alloc(0),Buffer.from('unknown')];
  for(const payload of samples)for(const compressed of [false,true]) {
    const bytes=check(payload,{compressed});check(payload,{compressed},{preview:0});
    check(payload,{compressed,name:'prvimage'});check(payload,{compressed,nested:true});check(payload,{compressed,absent:true});
    if(payload.length){reject(bytes,/LimitExceeded/,{streamBytes:payload.length-1});reject(bytes,/LimitExceeded/,{documentBytes:350+payload.length-1});}
    if(!payload.length)reject(bytes,/EmptyPreviewImage/,{empty:1});
    if(payload.toString()==='unknown')reject(bytes,/UnsupportedPreviewImage/,{unhandled:1});
  }
  const g=gifFixture(),bytes=check(g);
  for(const o of [{frames:0},{totalFrames:0},{indices:5},{totalIndices:5},{codes:7},{totalCodes:7},{blocks:1},{subBlocks:0},{binaries:0}])reject(bytes,/LimitExceeded/,o);
  check(g,{}, {gif:0});reject(bytes,/UnsupportedPreviewImage/,{gif:0,unhandled:1});
  for(let n=3;n<g.length;n++){const raw=previewImageFixture(cfb,g.subarray(0,n));reject(raw,/^(UnexpectedEnd|MissingGifEndCode|IncompleteGifPixels|InvalidGif.*)$/);}
  reject(previewImageFixture(cfb,Buffer.from('GIF88a')),/UnsupportedGifVersion/);
  reject(previewImageFixture(cfb,Buffer.alloc(0),{kind:1}),/InvalidHwpEntryKind/);
  const tail=Buffer.concat([g,Buffer.of(99)]);check(tail,{}, {gifTrailing:true});reject(previewImageFixture(cfb,tail),/TrailingGifBytes/);
  for(let n=0;n<108;n++){expectBmpError(()=>call(296,previewImageInput(bytes).subarray(0,n)),/UnexpectedEnd/);rejected++;}
  for(let at=63;at<68;at++){const input=previewImageInput(bytes);input[at]=2;expectBmpError(()=>call(296,input),/InvalidMode/);rejected++;}
  return {comparisons,rejected};
}
