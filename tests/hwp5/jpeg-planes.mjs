import assert from 'node:assert/strict';
import {jpegSequentialScans} from './jpeg-scan.mjs';
import {jpegFrameFixture} from './jpeg-frame.mjs';
import {jpegFrameDequantOracle} from './jpeg-frame-dequant.mjs';
import {jpegIdctReference, jpegRestoredSample} from './jpeg-idct.mjs';

export function jpegPlanesInput(raw, maximum = 64000000) {
  const prefix = Buffer.alloc(4); prefix.writeUInt32LE(maximum); return Buffer.concat([prefix, raw]);
}

export function jpegPlanesOracle(raw) {
  const parsed = jpegSequentialScans(raw); assert.ok(!parsed.deferred);
  const {frame, height} = parsed, width = frame.readUInt16BE(3), precision = frame[0], count = frame[5];
  const components = Array.from({length: count}, (_, i) => ({id: frame[6+i*3], sampling: frame[7+i*3], quantization: frame[8+i*3], h: frame[7+i*3]>>4, v: frame[7+i*3]&15, blocks: new Map()}));
  const hmax = Math.max(...components.map(c => c.h)), vmax = Math.max(...components.map(c => c.v));
  const coefficients = jpegFrameDequantOracle(raw);
  for (let at = 36; at < coefficients.length; at += 664) {
    const component = components[coefficients.readUInt32LE(at+4)], x = coefficients.readUInt32LE(at+8), y = coefficients.readUInt32LE(at+12);
    const key = `${x},${y}`; assert.ok(!component.blocks.has(key));
    const values = Array.from({length:64}, (_, i) => coefficients.readBigInt64LE(at+152+i*8));
    component.blocks.set(key, jpegIdctReference(values).map(value => jpegRestoredSample(value, precision)));
  }
  const header = Buffer.alloc(16); [width,height,precision,count].forEach((n,i) => header.writeUInt32LE(n,i*4));
  const parts = [header];
  // Gather by visible sample coordinates, independently of the product's
  // block-wise clipped row copies. Padded blocks are never output here.
  for (const c of components) {
    const w = Math.ceil(width*c.h/hmax), h = Math.ceil(height*c.v/vmax), out = Buffer.alloc(20+w*h*2);
    [c.id,c.sampling,c.quantization,w,h].forEach((n,i) => out.writeUInt32LE(n,i*4));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const block = c.blocks.get(`${Math.floor(x/8)},${Math.floor(y/8)}`); assert.ok(block);
      out.writeUInt16LE(block[(y%8)*8+x%8], 20+(y*w+x)*2);
    }
    parts.push(out);
  }
  return Buffer.concat(parts);
}

export function jpegPlanesActual(call, raw, maximum = 64000000) {
  if (jpegSequentialScans(raw).deferred) return {deferred: true};
  const expected = jpegPlanesOracle(raw);
  assert.deepEqual(call(260, jpegPlanesInput(raw, maximum)), expected);
  const planes = expected.readUInt32LE(12);
  return {deferred: false, planes, samples: (expected.length-16-planes*20)/2};
}

export function jpegPlanesEdges(call) {
  let comparisons = 0, rejected = 0;
  for (let h1=1;h1<=4;h1++) for (let v1=1;v1<=4;v1++)
    for (let h2=1;h2<=4;h2++) for (let v2=1;v2<=4;v2++) {
      if (h1*v1+h2*v2>10) continue;
      for (const groups of [[[0,1]],[[1],[0]]]) for (const interval of [0,1,3]) {
        jpegPlanesActual(call,jpegFrameFixture({width:31,height:29,sampling:[h1*16+v1,h2*16+v2],groups,interval})); comparisons++;
      }
    }
  for (const width of [1,7,8,9,16,17,31]) for (const height of [1,8,17])
    for (const sampling of [[34,17,17], [49,17,18], [17,17,17]])
      for (const groups of [[[0,1,2]], [[2],[0],[1]]]) for (const precision of [8,12]) {
        jpegPlanesActual(call, jpegFrameFixture({width,height,sampling,groups,precision,interval:1,dnl:true,redefine:true})); comparisons++;
      }
  const raw = jpegFrameFixture({width:17,height:17});
  const result = jpegPlanesActual(call,raw); comparisons++;
  jpegPlanesActual(call,raw,result.samples); comparisons++;
  assert.throws(() => call(260,jpegPlanesInput(raw,result.samples-1)), /LimitExceeded/); rejected++;
  const size = jpegPlanesOracle(raw).length;
  assert.throws(() => call(260,jpegPlanesInput(raw),size-1), /LimitExceeded/); rejected++;
  return {comparisons,rejected};
}
