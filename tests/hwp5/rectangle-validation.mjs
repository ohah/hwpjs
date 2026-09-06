import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export const rectangleOwnerRun=(call,v,b,mode=1)=>call(59,Buffer.concat([w(v),Buffer.from([mode]),b]));
export function rectangleOwnerActual(call,v,b,mode=1){
  const nodes=[],stack=[],stats=[0,0,0];
  for(const r of documentRecords(b)){
    const level=b.readUInt32LE(r.offset)>>>10&1023;stack.length=level;
    nodes.push({...r,parent:level?stack[level-1]:null});stack.push(nodes.length-1);
  }
  const owner=n=>n?.tag===76&&b.readUInt32LE(n.start)===0x24726563;
  for(const [i,n] of nodes.entries()){
    if(n.tag===79){assert.notEqual(n.parent,null);assert.ok(owner(nodes[n.parent]));}
    if(!owner(n))continue;
    const children=nodes.filter(c=>c.parent===i&&c.tag===79);assert.equal(children.length,1);
    const c=children[0];assert.ok(c.end-c.start>=33);stats[0]++;
    stats[1]+=Number(b[c.start]>100);stats[2]+=c.end-c.start-33;
  }
  assert.deepEqual(rectangleOwnerRun(call,v,b,mode),Buffer.concat(stats.map(w)));return stats;
}
export function rectangleOwnerEdges(call){
  const v=0x05010001,frame=(tag,level,p=Buffer.alloc(0))=>Buffer.concat([w(tag|(level<<10)|(p.length<<20)),p]);
  const owner=(id=0x24726563,level=0)=>frame(76,level,w(id)),rect=(level=1,p=Buffer.alloc(33))=>frame(79,level,p);
  const good=Buffer.concat([owner(),rect()]);let accepted=0,rejected=0;
  for(const mode of [0,1]){
    const check=b=>{accepted++;return rectangleOwnerActual(call,v,b,mode);};
    const reject=(b,e)=>{assert.throws(()=>rectangleOwnerRun(call,v,b,mode),e);rejected++;check(good);};
    check(good);
    reject(owner(),/MissingRectangle/);reject(rect(0),/OrphanRectangle/);
    reject(Buffer.concat([owner(0x246c696e),rect()]),/OrphanRectangle/);
    reject(Buffer.concat([good,rect()]),/DuplicateRectangle/);
    reject(Buffer.concat([owner(),owner(0x24636f6e,1),rect(2)]),/MissingRectangle/);
    reject(Buffer.concat([good,owner()]),/MissingRectangle/);
    for(let n=0;n<33;n++)reject(Buffer.concat([owner(),rect(1,Buffer.alloc(n))]),/UnexpectedEnd/);
    const p=Buffer.alloc(36);p[0]=255;assert.deepEqual(check(Buffer.concat([owner(),rect(1,p)])),[1,1,3]);
    for(const [rate,diagnostic] of [[0,0],[20,0],[50,0],[100,0],[101,1],[255,1]]){
      const payload=Buffer.alloc(33);payload[0]=rate;
      assert.deepEqual(check(Buffer.concat([owner(),rect(1,payload)])),[1,diagnostic,0]);
    }
  }
  assert.throws(()=>rectangleOwnerRun(call,v,good,2),/InvalidMode/);rejected++;
  return {accepted,rejected};
}
