import assert from 'node:assert/strict';
import {progressiveFrameInput,progressiveFrameOracle,progressiveFramePlanes} from './jpeg-progressive-frame.mjs';
import {progressiveFrameFixture,progressiveSharedQuantizationFixture,progressiveWideQuantizationFixture} from './jpeg-progressive-frame-cases.mjs';
import {jpegDequantizedMatrix} from './jpeg-dequant.mjs';
import {jpegIdctReference,jpegRestoredSample} from './jpeg-idct.mjs';

export function progressiveSamplesInput(raw,{samples=64000000,...frame}={}) {
  const head=Buffer.alloc(4);head.writeUInt32LE(samples);return Buffer.concat([head,progressiveFrameInput(raw,frame)]);
}

export function progressiveSamplesOracle(raw,options={}) {
  const frame=progressiveFrameOracle(raw,options),precision=frame.readUInt32LE(8),planes=progressiveFramePlanes(frame);
  const header=Buffer.alloc(16);[frame.readUInt32LE(0),frame.readUInt32LE(4),precision,planes.length].forEach((n,i)=>header.writeUInt32LE(n,i*4));
  const parts=[header];let samples=0;
  for(const p of planes) {
    assert.ok(p.quantizers,'unseen component cannot be reconstructed');
    const blocks=new Map();
    for(let y=0;y<Math.ceil(p.height/8);y++)for(let x=0;x<Math.ceil(p.width/8);x++) {
      const at=(y*p.columns+x)*256,values=Array.from({length:64},(_,k)=>p.coefficients.readInt32LE(at+k*4));
      const natural=jpegDequantizedMatrix(values,p.quantizers),dequantized=Array.from({length:64},(_,k)=>natural.readBigInt64LE(k*8));
      blocks.set(`${x},${y}`,jpegIdctReference(dequantized).map(v=>jpegRestoredSample(v,precision)));
    }
    const plane=Buffer.alloc(20+p.width*p.height*2);[p.id,p.sampling,p.destination,p.width,p.height].forEach((n,i)=>plane.writeUInt32LE(n,i*4));
    // Gather each sample by its coordinate, not by the product's clipped rows.
    for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)plane.writeUInt16LE(blocks.get(`${Math.floor(x/8)},${Math.floor(y/8)}`)[y%8*8+x%8],20+(y*p.width+x)*2);
    parts.push(plane);samples+=p.width*p.height;
  }
  assert.ok(samples<=(options.samples??64000000));
  const metadata=Buffer.alloc(16);[frame.readUInt32LE(24),frame.readUInt32LE(32),frame.readUInt32LE(36),frame.readUInt32LE(40)].forEach((n,i)=>metadata.writeUInt32LE(n,i*4));
  return Buffer.concat([...parts,metadata,...planes.map(p=>p.levels)]);
}

export function progressiveSamplesActual(call,raw,options={}) {
  const expected=progressiveSamplesOracle(raw,options);assert.deepEqual(call(282,progressiveSamplesInput(raw,options)),expected);
  const planes=expected.readUInt32LE(12),samples=(expected.length-32-planes*84)/2;
  return {planes,samples};
}

export function progressiveSamplesEdges(call) {
  let comparisons=0,rejected=0;
  const check=(raw,options={})=>{progressiveSamplesActual(call,raw,options);comparisons++;};
  const reject=(raw,error,options={},limit=67108864)=>{assert.throws(()=>call(282,progressiveSamplesInput(raw,options),limit),error);rejected++;};
  for(const precision of [8,12])for(const width of [1,8,9,17,33])for(const height of [1,9,17])for(const sampling of [[17],[68],[34,17,17],[49,17,18]])for(const initial of [0,1,3,13]) {
    const options={width,height,sampling,precision,initial,interval:1,dnl:true};
    check(progressiveFrameFixture(options),{full:true});
    check(progressiveFrameFixture({...options,refine:false}),{full:false});
  }
  for(const groups of [[[0,1,2]],[[2],[0],[1]],[[0,2],[1]]])for(const initial of [0,3])check(progressiveFrameFixture({groups,initial,ac:false,refine:false}));
  for(const groups of [[[0]],[[2],[0]],[[2]]]) {
    const raw=progressiveFrameFixture({groups});reject(raw,/UnseenJpegProgressiveComponent/);reject(raw,/IncompleteJpegProgressiveCoefficients/,{full:true});
  }
  const good=progressiveFrameFixture({width:17,height:9}),report=progressiveSamplesActual(call,good,{full:true});comparisons++;
  check(good,{full:true,samples:report.samples});reject(good,/LimitExceeded/,{full:true,samples:report.samples-1});
  reject(good,/LimitExceeded/,{full:true,visits:1});reject(good,/LimitExceeded/,{full:true,storageBytes:255});
  const expected=progressiveSamplesOracle(good,{full:true});reject(good,/LimitExceeded/,{full:true},expected.length-1);
  const partial=progressiveFrameFixture({refine:false});reject(partial,/IncompleteJpegProgressiveCoefficients/,{full:true});
  const bad=Buffer.from(good);bad[bad.length-3]&=0xfe;reject(bad,/InvalidJpegEntropyPadding/);
  const tail=Buffer.concat([good,Buffer.of(3)]);reject(tail,/TrailingJpegBytes/);check(tail,{full:true,trailing:true});
  check(progressiveSharedQuantizationFixture(),{full:true});
  check(progressiveWideQuantizationFixture(),{full:true});
  reject(progressiveWideQuantizationFixture(8),/InvalidJpegQuantizationPrecision/,{full:true});
  return {comparisons,rejected};
}
