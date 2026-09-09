import assert from 'node:assert/strict';
import {progressiveFrameFixture} from './jpeg-progressive-frame-cases.mjs';
import {progressiveSamplesInput,progressiveSamplesOracle} from './jpeg-progressive-samples.mjs';
import {jpegRgbRasterOracle,jpegRgbMetadataOracle} from './jpeg-rgb.mjs';
import {jpegJfifFixture} from './jpeg-jfif.mjs';
import {jpegJfxxFixture} from './jpeg-jfxx.mjs';
import {jpegJfifLayoutFixture} from './jpeg-jfif-layout.mjs';
import {adobePayload} from './jpeg-adobe.mjs';
import {jpegIccChunk} from './jpeg-icc.mjs';
import {segment} from './jpeg-structure.mjs';

export function progressiveRgbFixture(options={}) {
  const sampling=options.sampling??[34,17,17];
  const raw=progressiveFrameFixture({...options,sampling,ids:sampling.map((_,i)=>i+1)});
  return Buffer.concat([raw.subarray(0,2),segment(224,jpegJfifFixture()),raw.subarray(2)]);
}

export function progressiveRgbInput(raw,{rgb=192000000,adobe=256,icc=16707345,method=0,...samples}={}) {
  const header=Buffer.alloc(13);[rgb,adobe,icc].forEach((n,i)=>header.writeUInt32LE(n,i*4));header[12]=method;
  return Buffer.concat([header,progressiveSamplesInput(raw,samples)]);
}

export function progressiveRgbOracle(raw,options={}) {
  const planes=progressiveSamplesOracle(raw,options),count=planes.readUInt32LE(12);
  const end=planes.length-16-count*64,samples=planes.subarray(0,end);
  const metadata=jpegRgbMetadataOracle(raw,count),raster=jpegRgbRasterOracle(samples,options.method??0,count===1?0:2);
  assert.ok(raster.readUInt32LE(8)<=(options.rgb??192000000));
  assert.ok(metadata.readUInt32LE(4)<=(options.adobe??256));
  const components=Buffer.alloc(4);components.writeUInt32LE(count);
  return Buffer.concat([raster.subarray(0,12),metadata,components,planes.subarray(end,end+16),raster.subarray(12),planes.subarray(end+16)]);
}

export function progressiveRgbActual(call,raw,options={}) {
  const expected=progressiveRgbOracle(raw,options);assert.deepEqual(call(283,progressiveRgbInput(raw,options)),expected);
  return {pixels:expected.readUInt32LE(0)*expected.readUInt32LE(4),components:expected.readUInt32LE(40),scans:expected.readUInt32LE(44),unseen:expected.readUInt32LE(48),partial:expected.readUInt32LE(52)};
}

export function progressiveRgbEdges(call) {
  let comparisons=0,rejected=0;
  const check=(raw,options={})=>{progressiveRgbActual(call,raw,options);comparisons++;};
  const reject=(raw,error,options={},limit=67108864)=>{assert.throws(()=>call(283,progressiveRgbInput(raw,options),limit),error);rejected++;};
  for(const width of [1,8,9,17])for(const height of [1,9])for(const sampling of [[17],[34,17,17],[49,17,18]])
    for(const groups of sampling.length===1?[[[0]]]:[[[0,1,2]],[[2],[0],[1]]])for(const initial of [0,1,3])for(const interval of [0,1,3])for(const dnl of [false,true])for(const refine of [false,true]){
      const raw=progressiveRgbFixture({width,height,sampling,groups,initial,interval,dnl,refine});
      for(const method of [0,1])check(raw,{method,full:refine});
    }
  for(const initial of [0,3])check(progressiveRgbFixture({initial,refine:false,ac:false}));
  const partial=progressiveRgbFixture({refine:false});reject(partial,/IncompleteJpegProgressiveCoefficients/,{full:true});
  const unseen=progressiveRgbFixture({groups:[[0]]});reject(unseen,/UnseenJpegProgressiveComponent/);reject(unseen,/IncompleteJpegProgressiveCoefficients/,{full:true});
  const raw=progressiveRgbFixture(),late=(parts)=>Buffer.concat([raw.subarray(0,raw.length-2),...parts,raw.subarray(raw.length-2)]);
  const good=segment(238,adobePayload()),bad=segment(238,adobePayload(100,0,0,0));
  const profile=segment(226,jpegIccChunk(1,1,Buffer.of(9,2,7)));
  for(const parts of [[good],[good,good],[profile],[good,profile]])check(late(parts),{full:true});
  for(const parts of [[good,bad],[bad,good]])reject(late(parts),/ConflictingJfifAdobeColour/);
  reject(late([segment(238,adobePayload(100,0,0,255))]),/UnsupportedAdobeTransform/);
  reject(late([segment(226,jpegIccChunk(1,2,Buffer.of(9)))]),/MissingJpegIccChunk/);
  reject(late([profile]),/LimitExceeded/,{icc:2});check(late([profile]),{icc:3});
  reject(late([good]),/LimitExceeded/,{adobe:0});check(late([good]),{adobe:1});
  for(const code of [16,255])check(Buffer.concat([raw.subarray(0,20),segment(224,jpegJfxxFixture(code)),raw.subarray(20)]));
  reject(late([segment(224,jpegJfxxFixture(255))]),/InvalidJfxxPosition/);
  reject(late([segment(224,jpegJfifFixture())]),/DuplicateJfifHeader/);
  reject(late([segment(224,Buffer.from('acme'))]),/UnterminatedJfifApplicationId/);
  const bytes=raw.length,expected=progressiveRgbOracle(raw,{full:true});assert.ok(bytes<expected.length-1);
  check(raw,{full:true,rgb:17*9*3});reject(raw,/LimitExceeded/,{rgb:17*9*3-1});
  reject(raw,/LimitExceeded/,{},expected.length-1);
  reject(raw,/LimitExceeded/,{samples:0});reject(raw,/LimitExceeded/,{storageBytes:255});reject(raw,/LimitExceeded/,{visits:1});
  for(let n=0;n<bytes;n++)reject(raw.subarray(0,n),/UnexpectedEnd|MissingJpegSoi|MissingJpegFrame|MissingJpegScan|MissingJpegEoi/);
  for(let method=2;method<256;method++)reject(raw,/InvalidInterpolationMethod/,{method});
  const invalidPolicy=progressiveRgbInput(raw);invalidPolicy[17]=2;assert.throws(()=>call(283,invalidPolicy),/InvalidJpegCompletionPolicy/);rejected++;
  for(let n=0;n<47;n++){assert.throws(()=>call(283,progressiveRgbInput(raw).subarray(0,n)),/UnexpectedEnd/);rejected++;}
  const broken=Buffer.from(raw);broken[broken.length-3]&=0xfe;reject(broken,/InvalidJpegEntropyPadding/);
  reject(Buffer.concat([raw,Buffer.of(7)]),/TrailingJpegBytes/);
  assert.deepEqual(call(283,progressiveRgbInput(Buffer.concat([raw,Buffer.of(7)]),{trailing:true})),progressiveRgbOracle(raw));comparisons++;
  reject(progressiveFrameFixture(),/MissingJfifHeader/);
  reject(progressiveRgbFixture({precision:12}),/InvalidJfifPrecision/);
  reject(progressiveRgbFixture({sampling:[17,17]}),/InvalidJfifComponentCount/);
  reject(jpegJfifLayoutFixture(),/UnsupportedJpegProgressionProcess/);
  return {comparisons,rejected};
}
