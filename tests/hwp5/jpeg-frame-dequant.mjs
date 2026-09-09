import assert from 'node:assert/strict';
import {jpegSequentialScans,jpegScanOracle} from './jpeg-scan.mjs';
import {jpegFrameInput,jpegFrameOracle,jpegFrameFixture} from './jpeg-frame.mjs';
import {jpegQuantizers,jpegDequantizedMatrix} from './jpeg-dequant.mjs';
import {segment} from './jpeg-structure.mjs';

export function jpegFrameDequantOracle(raw){
  const header=jpegFrameOracle(raw).subarray(0,36),{scans,height}=jpegSequentialScans(raw),parts=[header];
  for(const scan of scans){
    const coefficients=jpegScanOracle(scan.raw,{...scan.options,height}),tables=jpegQuantizers(scan.options.q).tables;
    for(let at=24;at<coefficients.length;at+=272){
      const fi=coefficients.readUInt32LE(at+4),destination=scan.options.frame[8+fi*3],table=tables.get(destination);assert.ok(table);
      const block=Buffer.alloc(152);coefficients.copy(block,0,at,at+16);block.writeUInt32LE(table.destination,16);block.writeUInt32LE(table.precision,20);
      table.values.forEach((n,i)=>block.writeUInt16LE(n,24+i*2));
      const values=Array.from({length:64},(_,i)=>coefficients.readInt32LE(at+16+i*4));
      parts.push(block,jpegDequantizedMatrix(values,table.values));
    }
  }
  return Buffer.concat(parts);
}
export function jpegFrameDequantActual(call,raw,options={}){assert.deepEqual(call(256,jpegFrameInput(raw,options)),jpegFrameDequantOracle(raw));}
export function jpegFrameDequantFileActual(call,raw){
  if(jpegSequentialScans(raw).deferred)return {deferred:true};
  const expected=jpegFrameDequantOracle(raw);assert.deepEqual(call(256,jpegFrameInput(raw)),expected);
  return {blocks:expected.readUInt32LE(20),deferred:false};
}
export function jpegFrameDequantEdges(call){
  let comparisons=0,rejected=0;
  const check=raw=>{jpegFrameDequantActual(call,raw);comparisons++;};
  for(const groups of [[[0,1,2]],[[2],[0],[1]],[[0,2],[1]]])for(const precision of [8,12])for(const interval of [0,1,3])for(const redefine of [false,true])check(jpegFrameFixture({groups,precision,interval,redefine}));
  const base=jpegFrameFixture({groups:[[2],[0],[1]],width:1,height:1,sampling:[17,17,17],redefine:true});
  assert.throws(()=>call(256,jpegFrameInput(base),36+3*664-1),/LimitExceeded/);rejected++;
  // Explicitly different Q destinations and nonuniform 16-bit values. SOF is
  // extended 12-bit sequential, so use of the wide tables is valid.
  const parsed=jpegSequentialScans(jpegFrameFixture({groups:[[2],[0],[1]],width:1,height:1,sampling:[17,17,17],precision:12}));
  const frame=Buffer.from(parsed.frame);[2,0,3].forEach((n,i)=>frame[8+3*i]=n);
  const definitions=[];
  for(const id of [0,2,3]){const table=Buffer.alloc(129);table[0]=16+id;for(let i=0;i<64;i++)table.writeUInt16BE(257*i+id+1,1+2*i);definitions.push(table);}
  const parts=[Buffer.from([255,216]),segment(219,Buffer.concat(definitions)),segment(196,parsed.scans[0].options.h),segment(193,frame)];
  // This 1x1, single-component-per-scan fixture has one entropy byte per scan.
  for(const s of parsed.scans)parts.push(segment(218,s.options.scan),s.raw.subarray(0,1));
  parts.push(Buffer.from([255,217]));check(Buffer.concat(parts));
  return {comparisons,rejected};
}
