import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export const ellipseOwnerRun=(call,v,b)=>call(61,Buffer.concat([w(v),b]));
export function ellipseOwnerActual(call,v,b){
  const nodes=[],stack=[],stats=[0,0,0,0,0];
  for(const r of documentRecords(b)){
    const level=b.readUInt32LE(r.offset)>>>10&1023;stack.length=level;
    nodes.push({...r,parent:level?stack[level-1]:null});stack.push(nodes.length-1);
  }
  const owner=n=>n?.tag===76&&b.readUInt32LE(n.start)===0x24656c6c;
  for(const [i,n] of nodes.entries()){
    if(n.tag===80){assert.notEqual(n.parent,null);assert.ok(owner(nodes[n.parent]));}
    if(!owner(n))continue;
    const children=nodes.filter(c=>c.parent===i&&c.tag===80);assert.equal(children.length,1);
    const c=children[0];assert.ok(c.end-c.start>=60);const attr=b.readUInt32LE(c.start);
    stats[0]++;stats[1]+=attr>>>1&1;stats[2]+=attr&1;stats[3]+=Number((attr&~1023)!==0);stats[4]+=c.end-c.start-60;
  }
  assert.deepEqual(ellipseOwnerRun(call,v,b),Buffer.concat(stats.map(w)));return stats;
}
export function ellipseOwnerEdges(call){
  const v=0x05010001,frame=(tag,level,p=Buffer.alloc(0))=>Buffer.concat([w(tag|(level<<10)|(p.length<<20)),p]);
  const owner=(id=0x24656c6c,level=0)=>frame(76,level,w(id)),ellipse=(level=1,p=Buffer.alloc(60))=>frame(80,level,p);
  const good=Buffer.concat([owner(),ellipse()]);let accepted=0,rejected=0;
  const check=b=>{accepted++;return ellipseOwnerActual(call,v,b);};
  const reject=(b,e)=>{assert.throws(()=>ellipseOwnerRun(call,v,b),e);rejected++;check(good);};
  check(good);reject(owner(),/MissingEllipse/);reject(ellipse(0),/OrphanEllipse/);
  reject(Buffer.concat([owner(0x24726563),ellipse()]),/OrphanEllipse/);
  reject(Buffer.concat([good,ellipse()]),/DuplicateEllipse/);
  reject(Buffer.concat([owner(),owner(0x24636f6e,1),ellipse(2)]),/MissingEllipse/);
  reject(Buffer.concat([good,owner()]),/MissingEllipse/);
  // Direct children may be separated by unrelated records or nested components.
  check(Buffer.concat([owner(),frame(900,1),frame(901,2),ellipse()]));
  check(Buffer.concat([owner(0x24636f6e),owner(0x24656c6c,1),ellipse(2),owner(0x24656c6c,1),ellipse(2)]));
  reject(Buffer.concat([owner(),ellipse(),frame(900,1),ellipse()]),/DuplicateEllipse/);
  reject(Buffer.concat([good,frame(900,0),ellipse(1)]),/OrphanEllipse/);
  for(let n=0;n<4;n++)reject(Buffer.concat([frame(76,0,Buffer.alloc(n)),ellipse()]),/UnexpectedEnd/);
  for(let n=0;n<60;n++)reject(Buffer.concat([owner(),ellipse(1,Buffer.alloc(n))]),/UnexpectedEnd/);
  for(const [attr,expected] of [[0,[0,0,0]],[1,[0,1,0]],[2,[1,0,0]],[1020,[0,0,0]],[0x80000003,[1,1,1]]]){
    const p=Buffer.alloc(63);p.writeUInt32LE(attr,0);assert.deepEqual(check(Buffer.concat([owner(),ellipse(1,p)])),[1,...expected,3]);
  }
  return {accepted,rejected};
}
