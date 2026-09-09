import assert from 'node:assert/strict';
import {jpegFrameMarker,jpegHeaderActual} from './jpeg-headers.mjs';
import {jpegTablesActual} from './jpeg-tables.mjs';
import {jpegStoreActual} from './jpeg-store.mjs';
import {jpegProgressiveActual} from './jpeg-progressive.mjs';
const words = ns => {const b = Buffer.alloc(ns.length * 4); ns.forEach((n,i)=>b.writeUInt32LE(n,i*4)); return b;};
export function jpegFramingInput(mode, raw, maximum = 65533) {
  return Buffer.concat([Buffer.from([mode]), words([maximum]), raw]);
}
export function jpegMarkerOracle(b) {
  if(b.length < 2) throw Error('UnexpectedEnd');
  if(b[0] !== 255) throw Error('InvalidJpegMarker');
  let i=1;
  while(i < b.length && b[i] === 255) i++;
  if(i === b.length) throw Error('UnexpectedEnd');
  const code=b[i++], fill=i-2;
  if(code===0) throw Error('InvalidJpegMarker');
  if(code>=2 && code<=191) throw Error('UnsupportedJpegReservedMarker');
  const standalone=code===1 || (code>=208 && code<=217);
  let payload=Buffer.alloc(0);
  if(!standalone) {
    if(i+2>b.length) throw Error('UnexpectedEnd');
    const len=b[i]*256+b[i+1];
    if(len<2) throw Error('InvalidJpegSegmentLength');
    if(i+len>b.length) throw Error('UnexpectedEnd');
    payload=b.subarray(i+2,i+len); i+=len;
  }
  return {consumed:i,code,wire:Buffer.concat([words([i,code,+standalone,fill,payload.length]),payload])};
}
export function jpegEntropyOracle(b) {
  let i=0, stuffed=0;
  while(i<b.length) {
    if(b[i]!==255) {i++;continue;}
    const start=i++;
    while(i<b.length && b[i]===255)i++;
    if(i===b.length)throw Error('UnexpectedEnd');
    if(b[i]!==0)return {consumed:start,wire:Buffer.concat([words([start,stuffed,start-stuffed]),b.subarray(0,start)])};
    if(i!==start+1)throw Error('InvalidJpegStuffing');
    i++;stuffed++;
  }
  throw Error('UnexpectedEnd');
}
export function jpegFramingEdges(call) {
  let comparisons=0,rejected=0;
  const good=Buffer.from([255,216]);
  const check=(mode,b)=>{const expected=(mode===0?jpegMarkerOracle:jpegEntropyOracle)(b);assert.deepEqual(call(245,jpegFramingInput(mode,b)),expected.wire);comparisons++;};
  const reject=(mode,b,pattern,limit=65533)=>{assert.throws(()=>call(245,jpegFramingInput(mode,b,limit)),pattern);rejected++;check(0,good);};
  for(let c=0;c<256;c++) {
    const b=Buffer.from([255,c,0,2]);
    if(c===0||c===255)reject(0,b,/InvalidJpegMarker/);
    else if(c>=2&&c<=191)reject(0,b,/UnsupportedJpegReservedMarker/);
    else check(0,b);
    check(1,Buffer.from([c,0,255,217]));
  }
  for(const length of [2,3,255,256,65535]) {
    const b=Buffer.alloc(length+2,42); b[0]=255;b[1]=225;b.writeUInt16BE(length,2);
    check(0,b);
    if(length>2)reject(0,b,/LimitExceeded/,length-3);
  }
  for(const fill of [0,1,2,31,255])check(0,Buffer.concat([Buffer.alloc(fill,255),good]));
  const b=Buffer.from([255,255,225,0,5,1,2,3]);
  for(let n=0;n<b.length;n++)reject(0,b.subarray(0,n),/UnexpectedEnd/);
  for(const b of [[],[1],[255],[255,0],[255,255]])reject(1,Buffer.from(b),/UnexpectedEnd/);
  reject(1,Buffer.from([255,255,0,255,217]),/InvalidJpegStuffing/);
  reject(1,Buffer.from([255,0,255,217]),/LimitExceeded/,1);
  return {comparisons,rejected};
}
/// Framing walk for observed scans, not a JPEG process/pixel oracle.
export function jpegFramingActual(call, raw, headers = false, tables = false) {
  let offset=0, markers=0, entropyBytes=0, scan=false;
  let frame=null;
  const tableEvents=[];
  while(offset<raw.length) {
    if(scan) {
      const e=jpegEntropyOracle(raw.subarray(offset));
      assert.deepEqual(call(245,jpegFramingInput(1,raw.subarray(offset),raw.length)),e.wire);
      offset+=e.consumed; entropyBytes+=e.consumed;
    }
    const m=jpegMarkerOracle(raw.subarray(offset));
    assert.deepEqual(call(245,jpegFramingInput(0,raw.subarray(offset))),m.wire);
    if(tables && (m.code===219 || m.code===196)) jpegTablesActual(call,m.code===196?1:0,m.wire.subarray(20));
    if(tables && [219,196,218].includes(m.code)) tableEvents.push([m.code===219?0:m.code===196?1:2,m.wire.subarray(20)]);
    if(headers && jpegFrameMarker(m.code)) {
      frame={code:m.code,payload:m.wire.subarray(20)};
      jpegHeaderActual(call,frame.code,frame.payload);
    }
    if(headers && m.code===218) {
      assert.ok(frame,'observed scan requires a frame');
      jpegHeaderActual(call,frame.code,frame.payload,m.wire.subarray(20));
    }
    offset+=m.consumed;markers++;
    if(m.code===217){
      if(tables && headers){assert.ok(frame);jpegStoreActual(call,frame.code,frame.payload,tableEvents);}
      if(tables && headers && frame.code===194) jpegProgressiveActual(call,frame.payload,tableEvents);
      return {markers,entropyBytes,trailing:raw.length-offset};
    }
    scan=m.code===218 || (scan && (m.code===1 || (m.code>=208 && m.code<=215)));
  }
  throw Error('Missing EOI in observed JPEG');
}
