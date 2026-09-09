import assert from 'node:assert/strict';
import {bmpLayoutOracle,bmpWords} from './bmp-oracle.mjs';
// Decode storage rows independently, with null for unspecified cells. Reverse
// complete row arrays only at serialization; no native cursor/index formula.
export function bmpRleOracle(raw,{padding=0,full=false,trailing=false}={}) {
  const v=bmpLayoutOracle(raw);assert.ok([1,2].includes(v.compression));
  const bits=v.bits,data=Array.from(v.pixels),rows=Array.from({length:v.height},()=>Array(v.width).fill(null));
  let x=0,y=0,at=0,commands=0;
  const take=()=>{assert.ok(at<data.length,'truncated command');return data[at++];};
  while(at<data.length) {
    const n=take(),value=take();commands++;
    if(n===0&&value===1){
      if(!trailing)assert.equal(at,data.length);
      const indices=rows.reverse().flat(),written=indices.filter(n=>n!==null).length;
      if(full)assert.equal(written,v.width*v.height);
      const samples=Buffer.alloc(indices.length*2);indices.forEach((value,i)=>samples.writeUInt16LE(value??256,i*2));
      return Buffer.concat([bmpWords([v.width,v.height,indices.length,written,indices.length-written,commands,at,data.length-at]),samples]);
    }
    if(n===0&&value===0){assert.ok(y<v.height);x=0;y++;continue;}
    if(n===0&&value===2){const dx=take(),dy=take();x+=dx;y+=dy;assert.ok(x<=v.width&&y<v.height);continue;}
    let values=[];
    if(n!==0)values=Array.from({length:n},(_,i)=>bits===8?value:i%2===0?Math.floor(value/16):value%16);
    else {
      const size=bits===8?value:Math.ceil(value/2);
      for(let i=0;i<size;i++){const byte=take();if(bits===8)values.push(byte);else values.push(Math.floor(byte/16),byte%16);}
      values.length=value;
      if(size%2){const pad=take();if(padding===0)assert.equal(pad,0);}
    }
    assert.ok(y<v.height&&x+values.length<=v.width);
    for(const index of values){assert.ok(index<v.palette.length/v.entry);assert.equal(rows[y][x],null);rows[y][x++]=index;}
  }
  throw Error('missing EOB');
}
