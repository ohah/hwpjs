import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(tag,level,p=Buffer.alloc(0))=>Buffer.concat([w(tag|(level<<10)|(p.length<<20)),p]);
export const shapeRun=(call,v,b)=>call(51,Buffer.concat([w(v),b]));
export function shapeActual(call,v,b) {
  const nodes=[],stack=[],stats=Array(8).fill(0);
  for(const r of documentRecords(b)){const level=b.readUInt32LE(r.offset)>>>10&1023;stack.length=level;nodes.push({...r,index:nodes.length,parent:level?stack[level-1]:null});stack.push(nodes.length-1);}
  const gso=n=>n.tag===71&&b.readUInt32LE(n.start)===0x67736f20;
  for(const n of nodes){
    if(gso(n))assert.equal(nodes.filter(c=>c.parent===n.index&&c.tag===76).length,1);
    if(n.tag!==76)continue;
    assert.notEqual(n.parent,null);const owner=nodes[n.parent],double=gso(owner);
    if(!double){assert.equal(owner.tag,76);assert.equal(b.readUInt32LE(owner.start),0x24636f6e);}
    const p=b.subarray(n.start,n.end),offset=double?8:4,count=p.readUInt16LE(offset+42),end=offset+92+count*96;
    assert.ok(end<=p.length);stats[0]++;stats[double?1:2]++;stats[3]+=count;
    if(double)stats[4]+=p.readUInt32LE(0)!==p.readUInt32LE(4);
    stats[5]+=(p.readUInt32LE(offset+28)>>>2)!==0;
    for(let at=offset+44;at<end;at+=8)stats[6]+=(p.readBigUInt64LE(at)&0x7ff0000000000000n)===0x7ff0000000000000n;
    stats[7]+=p.length-end;
  }
  assert.deepEqual(shapeRun(call,v,b),Buffer.concat(stats.map(w)));return stats;
}
export function shapeValidationEdges(call){
  const v=0x05010001;
  const ctrl=(id=0x67736f20,level=0)=>frame(71,level,w(id));
  const payload=(double=true,id=0x24726563)=>{const b=Buffer.alloc(double?100:96);b.writeUInt32LE(id,0);if(double)b.writeUInt32LE(id,4);return b;};
  const shape=(level=1,double=true,id)=>frame(76,level,payload(double,id));
  const good=Buffer.concat([ctrl(),shape()]);let accepted=0,rejected=0;
  const check=b=>{accepted++;return shapeActual(call,v,b);};
  const reject=(b,e)=>{assert.throws(()=>shapeRun(call,v,b),e);rejected++;check(good);};
  const group=(level,ids)=>{const count=Buffer.alloc(2);count.writeUInt16LE(ids.length);return frame(76,level,Buffer.concat([payload(level===1,0x24636f6e),count,...ids.map(w)]));};
  check(Buffer.concat([ctrl(),group(1,[0x24636f6e]),group(2,[0x24726563]),shape(3,false),ctrl(),shape()]));
  reject(ctrl(),/MissingShapeComponent/);reject(shape(0,false),/OrphanShapeComponent/);
  reject(Buffer.concat([ctrl(0x12345678),shape()]),/OrphanShapeComponent/);
  reject(Buffer.concat([good,shape()]),/DuplicateShapeComponent/);
  reject(Buffer.concat([ctrl(),ctrl(0x12345678,1),shape(2)]),/MissingShapeComponent/);
  reject(Buffer.concat([ctrl(),shape(1,true,0x24726563),shape(2,false)]),/OrphanShapeComponent/);
  reject(Buffer.concat([good,ctrl()]),/MissingShapeComponent/);
  for(let n=0;n<100;n++)reject(Buffer.concat([ctrl(),frame(76,1,payload().subarray(0,n))]),/UnexpectedEnd/);
  for(let n=0;n<96;n++)reject(Buffer.concat([ctrl(),group(1,[0x24726563]),frame(76,2,payload(false).subarray(0,n))]),/UnexpectedEnd/);
  const changed=payload();changed.writeUInt32LE(0x12345678,4);changed.writeUInt32LE(0x80000000,36);changed.writeBigUInt64LE(0x7ff8000000000042n,52);
  const stats=check(Buffer.concat([ctrl(),frame(76,1,changed)]));assert.deepEqual(stats.slice(4,7),[1,1,1]);
  const matrices=Buffer.concat([changed,Buffer.alloc(96)]);matrices.writeUInt16LE(1,50);matrices.writeBigUInt64LE(0x7ff0000000000000n,100);matrices.writeBigUInt64LE(0xfff0000000000000n,148);
  assert.equal(check(Buffer.concat([ctrl(),frame(76,1,matrices)]))[6],3);
  return {accepted,rejected};
}
