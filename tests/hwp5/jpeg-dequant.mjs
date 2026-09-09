import assert from 'node:assert/strict';
import {jpegTablesOracle,quantizationFixture} from './jpeg-tables.mjs';

// Independent diagonal enumeration instead of the product's Figure A.6 table.
const raster=[],wire=[];
for(let diagonal=0;diagonal<15;diagonal++){
  const cells=[];for(let y=0;y<8;y++){const x=diagonal-y;if(x>=0&&x<8)cells.push(y*8+x);}
  if(diagonal%2===0)cells.reverse();for(const cell of cells){raster.push(cell);wire[cell]=raster.length-1;}
}
export function jpegQuantizers(raw){
  const parsed=jpegTablesOracle(0,raw),tables=new Map();
  for(let at=4;at<parsed.length;at+=140){
    const destination=parsed.readUInt32LE(at),precision=parsed.readUInt32LE(at+4);
    tables.set(destination,{destination,precision,values:Array.from({length:64},(_,i)=>parsed.readUInt16LE(at+12+i*2))});
  }
  return {tables,count:parsed.readUInt32LE(0)};
}
export function jpegDequantizedMatrix(coefficients,values){
  const out=Buffer.alloc(512);
  for(let i=0;i<64;i++)out.writeBigInt64LE(BigInt(coefficients[i])*BigInt(values[i]),raster[i]*8);
  return out;
}
export function jpegDequantInput(table,coefficients){
  assert.equal(coefficients.length,64);const h=Buffer.alloc(2),c=Buffer.alloc(256);h.writeUInt16LE(table.length);coefficients.forEach((n,i)=>c.writeInt32LE(n,i*4));return Buffer.concat([h,table,c]);
}
export function jpegDequantOracle(table,coefficients){
  const parsed=jpegQuantizers(table);assert.equal(parsed.count,1);
  return Buffer.concat([Buffer.from(wire),Buffer.from(raster),jpegDequantizedMatrix(coefficients,[...parsed.tables.values()][0].values)]);
}
export function jpegDequantActual(call,table,coefficients){assert.deepEqual(call(255,jpegDequantInput(table,coefficients)),jpegDequantOracle(table,coefficients));}
export function jpegDequantEdges(call){
  let comparisons=0,rejected=0;
  const check=(table,c)=>{jpegDequantActual(call,table,c);comparisons++;};
  const reject=(input,error,limit=67108864)=>{assert.throws(()=>call(255,input,limit),error);rejected++;};
  for(const precision of [0,1])for(let at=0;at<64;at++)for(const value of [-2147483648,-32768,-1,0,1,32767,2147483647]){const c=Array(64).fill(0);c[at]=value;check(quantizationFixture(precision),c);}
  const c=Array.from({length:64},(_,i)=>i%2?2147483647:-2147483648);
  for(const precision of [0,1]){
    const table=quantizationFixture(precision);
    for(let q=1;q<(precision?65536:256);q++){
      for(let i=0;i<64;i++){if(precision)table.writeUInt16BE(q,1+i*2);else table[i+1]=q;}
      check(table,c);
    }
  }
  const q=quantizationFixture(1),input=jpegDequantInput(q,c);
  for(let n=0;n<input.length;n++)reject(input.subarray(0,n),/UnexpectedEnd/);
  reject(jpegDequantInput(Buffer.alloc(0),c),/EmptyJpegTableSegment/);
  reject(jpegDequantInput(Buffer.concat([q,q]),c),/MultipleJpegQuantizationTables/);
  const zero=Buffer.from(q);zero.writeUInt16BE(0,1+2*63);reject(jpegDequantInput(zero,c),/InvalidJpegQuantizationValue/);
  reject(Buffer.concat([input,Buffer.from([0])]),/TrailingJpegDequantizationBytes/);
  reject(input,/LimitExceeded/,639);
  return {comparisons,rejected};
}
