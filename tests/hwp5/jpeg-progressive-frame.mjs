import assert from 'node:assert/strict';
import {jpegMarkerOracle,jpegEntropyOracle} from './jpeg-framing.mjs';
import {jpegStructureOracle} from './jpeg-structure.mjs';
import {jpegProgressiveOracle} from './jpeg-progressive.mjs';
import {jpegTablesOracle} from './jpeg-tables.mjs';
import {jpegScanGeometry,headerBytes as scanHeaderBytes,blockBytes as scanBlockBytes} from './jpeg-scan.mjs';
import {progressiveScanOracle} from './jpeg-progressive-scan.mjs';
import {progressiveZero} from './jpeg-progressive-block.mjs';

export const frameHeaderBytes=48,planeHeaderBytes=232;
export function progressiveFrameInput(raw,{full=false,trailing=false,stored=1000000,storageBytes=268435456,visits=16000000,scans=65536,restarts=65536,pixels=100000000n}={}) {
  const h=Buffer.alloc(30);h[0]=+full;h[1]=+trailing;
  [stored,storageBytes,visits,scans,restarts].forEach((n,i)=>h.writeUInt32LE(n,2+i*4));h.writeBigUInt64LE(pixels,22);return Buffer.concat([h,raw]);
}

// Independent whole-file scheduler. Values come only from the bit-string
// scan oracle. Table/history oracle is separate; no product output is fed back.
export function progressiveFrameOracle(raw,{full=false,trailing=false}={}) {
  assert.deepEqual(raw.subarray(0,2),Buffer.from([255,216]));
  const structure=jpegStructureOracle(raw),height=structure.readUInt32LE(28),tail=structure.readUInt32LE(40);
  if(!trailing)assert.equal(tail,0);
  const q=new Map(),h=new Map(),snapshots=new Map(),values=new Map(),events=[];
  let at=0,frame=null,visits=0,restarts=0,restartsInterval=0,ended=false;
  while(at<raw.length) {
    const marker=jpegMarkerOracle(raw.subarray(at)),p=marker.wire.subarray(20);at+=marker.consumed;
    if([192,193,194,195,201,202].includes(marker.code)){assert.equal(marker.code,194);assert.equal(frame,null);frame=p;}
    if(marker.code===219){jpegTablesOracle(0,p);events.push([0,p]);for(let pos=0;pos<p.length;){const n=1+64*(p[pos]>>4?2:1);q.set(p[pos]&15,p.subarray(pos,pos+n));pos+=n;}}
    if(marker.code===196){jpegTablesOracle(1,p);events.push([1,p]);for(let pos=0;pos<p.length;){const n=17+p.subarray(pos+1,pos+17).reduce((a,b)=>a+b,0);h.set(p[pos],p.subarray(pos,pos+n));pos+=n;}}
    if(marker.code===221)restartsInterval=p.readUInt16BE();
    if(marker.code===218) {
      assert.ok(frame);events.push([2,p]);
      const g=jpegScanGeometry(frame,p,height),prior=[];
      for(let my=0;my<g.rows;my++)for(let mx=0;mx<g.columns;mx++)for(const c of g.components)for(let y=0;y<(g.single?1:c.v);y++)for(let x=0;x<(g.single?1:c.h);x++) {
        const bx=g.single?mx:mx*c.h+x,by=g.single?my:my*c.v+y;
        prior.push(values.get(`${c.index}:${bx},${by}`)??progressiveZero());
      }
      const start=at;let terminal;
      for(;;){at+=jpegEntropyOracle(raw.subarray(at)).consumed;terminal=jpegMarkerOracle(raw.subarray(at));if(terminal.code<208||terminal.code>215)break;at+=terminal.consumed;}
      const scan=progressiveScanOracle(raw.subarray(start,at+terminal.consumed),{frame,scan:p,q:Buffer.concat([...q.values()]),h:Buffer.concat([...h.values()]),height,interval:restartsInterval,prior});
      visits+=scan.readUInt32LE(12);restarts+=scan.readUInt32LE(20);
      for(let pos=scanHeaderBytes;pos<scan.length;pos+=scanBlockBytes){const i=scan.readUInt32LE(pos+4),x=scan.readUInt32LE(pos+8),y=scan.readUInt32LE(pos+12);values.set(`${i}:${x},${y}`,Array.from({length:64},(_,k)=>scan.readInt32LE(pos+16+k*4)));}
      for(const c of g.components)snapshots.set(c.index,Buffer.from(q.get(frame[8+c.index*3])));
    }
    if(marker.code===217){ended=true;break;}
  }
  assert.ok(frame&&ended);
  const history=jpegProgressiveOracle(frame,events),levels=history.subarray(24);
  if(full)assert.ok(levels.every(n=>n===0));
  const components=Array.from({length:frame[5]},(_,i)=>({id:frame[6+3*i],h:frame[7+3*i]>>4,v:frame[7+3*i]&15,q:frame[8+3*i]}));
  const maxH=Math.max(...components.map(c=>c.h)),maxV=Math.max(...components.map(c=>c.v)),width=frame.readUInt16BE(3);
  const parts=[];let stored=0;
  for(const [i,c] of components.entries()) {
    const columns=Math.ceil(width/(8*maxH))*c.h,rows=Math.ceil(height/(8*maxV))*c.v,table=snapshots.get(i);
    const plane=Buffer.alloc(planeHeaderBytes+columns*rows*256);stored+=columns*rows;
    [c.id,c.h*16+c.v,c.q,Math.ceil(width*c.h/maxH),Math.ceil(height*c.v/maxV),columns,rows,table?1:0,table?table[0]>>4:255,table?table[0]&15:255].forEach((n,k)=>plane.writeUInt32LE(n,k*4));
    levels.copy(plane,40,i*64,(i+1)*64);
    if(table)for(let k=0;k<64;k++)plane.writeUInt16LE(table[0]>>4?table.readUInt16BE(1+k*2):table[1+k],104+k*2);
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const b=values.get(`${i}:${x},${y}`)??progressiveZero();b.forEach((v,k)=>plane.writeInt32LE(v,planeHeaderBytes+(y*columns+x)*256+k*4));}
    parts.push(plane);
  }
  const header=Buffer.alloc(frameHeaderBytes);
  [width,height,frame[0],components.length,stored,visits,history.readUInt32LE(0),restarts,history.readUInt32LE(4),history.readUInt32LE(8),history.readUInt32LE(12),tail].forEach((n,i)=>header.writeUInt32LE(n,i*4));
  return Buffer.concat([header,...parts]);
}

export function progressiveFrameActual(call,raw,options={}) {
  const expected=progressiveFrameOracle(raw,options);assert.deepEqual(call(281,progressiveFrameInput(raw,options)),expected);
  return {stored:expected.readUInt32LE(16),visits:expected.readUInt32LE(20),scans:expected.readUInt32LE(24),restarts:expected.readUInt32LE(28),unseen:expected.readUInt32LE(32),partial:expected.readUInt32LE(36)};
}

// Reader for this test-only frame wire. Consumers share descriptor offsets
// here; it is never used to derive expectations from a product frame result.
export function progressiveFramePlanes(wire) {
  const planes=[];let at=frameHeaderBytes;
  for(let i=0;i<wire.readUInt32LE(12);i++) {
    assert.ok(at+planeHeaderBytes<=wire.length);
    const get=k=>wire.readUInt32LE(at+k*4);
    const [id,sampling,destination,width,height,columns,rows,present]=Array.from({length:8},(_,k)=>get(k));
    const levels=wire.subarray(at+40,at+104);
    const quantizers=present?Array.from({length:64},(_,k)=>wire.readUInt16LE(at+104+k*2)):null;
    const end=at+planeHeaderBytes+columns*rows*256;assert.ok(end<=wire.length);
    planes.push({id,sampling,destination,width,height,columns,rows,levels,quantizers,coefficients:wire.subarray(at+planeHeaderBytes,end)});at=end;
  }
  assert.equal(at,wire.length);return planes;
}
