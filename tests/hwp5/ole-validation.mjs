import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(tag,level,p=Buffer.alloc(0))=>Buffer.concat([w(tag|(level<<10)|(p.length<<20)),p]);
export const oleRun=(call,v,b,mode=1)=>call(47,Buffer.concat([w(v),Buffer.from([mode]),b]));
export function oleActual(call,v,b,mode=1) {
  const nodes=[],stack=[],stats=Array(7).fill(0);
  for(const r of documentRecords(b)){const level=b.readUInt32LE(r.offset)>>>10&1023;stack.length=level;nodes.push({...r,index:nodes.length,parent:level?stack[level-1]:null});stack.push(nodes.length-1);}
  const owner=n=>n.tag===76&&b.readUInt32LE(n.start)===0x246f6c65;
  for(const n of nodes){
    if(n.tag===84){assert.notEqual(n.parent,null);assert.ok(owner(nodes[n.parent]));}
    if(!owner(n))continue;
    const children=nodes.filter(c=>c.parent===n.index&&c.tag===84);assert.equal(children.length,1);
    const r=children[0],attrs=mode?b.readUInt32LE(r.start):b.readUInt16LE(r.start),aspect=attrs&255;
    stats[0]++;stats[1]++;stats[2]+=!!(attrs&256);stats[3]+=![1,2,4,8].includes(aspect);stats[4]+=((attrs>>>9)&127)>101;stats[5]+=!!mode&&((attrs>>>16)&63)>4;stats[6]+=r.end-r.start-(mode?26:24);
  }
  assert.deepEqual(oleRun(call,v,b,mode),Buffer.concat(stats.map(w)));return stats;
}
export function oleValidationEdges(call){
  const v=0x05010001;
  const shape=(id=0x246f6c65,level=0)=>frame(76,level,w(id));
  const ole=(level=1,size=26)=>frame(84,level,Buffer.alloc(size));
  const good=Buffer.concat([shape(),ole()]);let accepted=0,rejected=0;
  const check=(b,mode=1)=>{accepted++;return oleActual(call,v,b,mode);};
  const reject=(b,e,mode=1)=>{assert.throws(()=>oleRun(call,v,b,mode),e);rejected++;check(good);};
  for(const mode of [0,1]){
    const width=mode?26:24;
    check(Buffer.concat([shape(),ole(1,width),shape(),ole(1,width)]),mode);
    for(let n=0;n<width;n++)reject(Buffer.concat([shape(),ole(1,n)]),/UnexpectedEnd/,mode);
  }
  reject(shape(),/MissingOle/);reject(ole(0),/OrphanOle/);
  reject(Buffer.concat([shape(0x24726563),ole()]),/OrphanOle/);
  reject(Buffer.concat([shape(),ole(),ole()]),/DuplicateOle/);
  reject(Buffer.concat([shape(),shape(0x24726563,1),ole(2)]),/MissingOle/);
  reject(Buffer.concat([shape(),ole(),shape()]),/MissingOle/);
  check(Buffer.concat([shape(),ole(),shape(0x246f6c65,2),ole(3)]));
  for(let n=0;n<4;n++)reject(frame(76,0,Buffer.alloc(n)),/UnexpectedEnd/);
  const reserved=Buffer.alloc(29,255);check(Buffer.concat([shape(),frame(84,1,reserved)]));
  return {accepted,rejected};
}
