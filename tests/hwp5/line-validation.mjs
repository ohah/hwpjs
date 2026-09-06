import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export const lineOwnerRun=(call,v,b)=>call(57,Buffer.concat([w(v),b]));
export function lineOwnerActual(call,v,b){
  const nodes=[],stack=[],stats=[0,0,0,0,0,0,0];
  for(const r of documentRecords(b)){
    const level=b.readUInt32LE(r.offset)>>>10&1023;stack.length=level;
    nodes.push({...r,parent:level?stack[level-1]:null});stack.push(nodes.length-1);
  }
  const identity=n=>n?.tag===76?b.readUInt32LE(n.start):null;
  for(const [i,n] of nodes.entries()){
    if(n.tag===78){
      const owner=n.parent===null?null:identity(nodes[n.parent]);
      assert.ok([0x246c696e,0x24636f6c].includes(owner));
    }
    const connector=identity(n)===0x24636f6c;
    if(!connector&&identity(n)!==0x246c696e)continue;
    const children=nodes.filter(c=>c.parent===i&&c.tag===78);assert.equal(children.length,1);
    const c=children[0];assert.ok(c.end-c.start>=(connector?40:18));
    if(connector){
      const count=b.readUInt32LE(c.start+36),end=40+count*10;assert.ok(end<=c.end-c.start);
      stats[1]++;stats[3]+=c.end-c.start-end;stats[4]+=count;
      stats[5]+=Number(b.readUInt32LE(c.start+16)>8);stats[6]+=2;
    }else {stats[0]++;stats[2]+=Number(b.readUInt16LE(c.start+16)>1);stats[3]+=c.end-c.start-18;}
  }
  assert.deepEqual(lineOwnerRun(call,v,b),Buffer.concat(stats.map(w)));return stats;
}
export function lineOwnerEdges(call){
  const v=0x05010001,frame=(tag,level,p=Buffer.alloc(0))=>Buffer.concat([w(tag|(level<<10)|(p.length<<20)),p]);
  const owner=(id=0x246c696e,level=0)=>frame(76,level,w(id)),line=(level=1,p=Buffer.alloc(18))=>frame(78,level,p);
  const good=Buffer.concat([owner(),line()]);let accepted=0,rejected=0;
  const check=b=>{accepted++;return lineOwnerActual(call,v,b);};
  const reject=(b,e)=>{assert.throws(()=>lineOwnerRun(call,v,b),e);rejected++;check(good);};
  check(good);reject(Buffer.concat([owner(0x24636f6c),line(1,Buffer.alloc(0))]),/UnexpectedEnd/);
  reject(owner(),/MissingLine/);reject(line(0),/OrphanLine/);
  reject(Buffer.concat([owner(0x24726563),line()]),/OrphanLine/);
  reject(Buffer.concat([good,line()]),/DuplicateLine/);
  reject(Buffer.concat([owner(),frame(76,1,w(0x24636f6c)),line(2)]),/MissingLine/);
  reject(Buffer.concat([good,owner()]),/MissingLine/);
  for(let n=0;n<18;n++)reject(Buffer.concat([owner(),line(1,Buffer.alloc(n))]),/UnexpectedEnd/);
  const p=Buffer.alloc(21);p.writeUInt16LE(65535,16);assert.deepEqual(check(Buffer.concat([owner(),line(1,p)])),[1,0,1,3,0,0,0]);
  return {accepted,rejected};
}
