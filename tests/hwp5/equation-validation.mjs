import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(tag,level,p=Buffer.alloc(0))=>Buffer.concat([w(tag|(level<<10)|(p.length<<20)),p]);
export const equationRun=(call,v,b,mode=0)=>call(45,Buffer.concat([w(v),Buffer.from([mode]),b]));
export function equationActual(call,v,b,mode=0) {
  const nodes=[],stack=[],stats=Array(8).fill(0);
  for(const r of documentRecords(b)) {
    const level=b.readUInt32LE(r.offset)>>>10&1023;stack.length=level;
    nodes.push({...r,parent:level?stack[level-1]:null,index:nodes.length});stack.push(nodes.length-1);
  }
  const owner=n=>n.tag===71&&b.readUInt32LE(n.start)===0x65716564;
  for(const n of nodes) {
    if(n.tag===88) {assert.notEqual(n.parent,null);assert.ok(owner(nodes[n.parent]));}
    if(!owner(n)) continue;
    const children=nodes.filter(c=>c.parent===n.index&&c.tag===88);assert.equal(children.length,1);
    const r=children[0],p=b.subarray(r.start,r.end);let at=4;
    const str=()=>{const units=p.readUInt16LE(at);at+=2+units*2;assert.ok(at<=p.length);return units;};
    stats[0]++;stats[1]+=str();
    at+=10; // font size, color, signed baseline
    stats[6]+=p.readUInt16LE(at)!==0;at+=2;
    stats[2]+=str();if(mode)stats[3]+=str();
    stats[4]+=p.readUInt32LE(0)&1;
    stats[5]+=(p.readUInt32LE(0)>>>1)!==0;
    stats[7]+=p.length-at;
  }
  assert.deepEqual(equationRun(call,v,b,mode),Buffer.concat(stats.map(w)));
  return stats;
}
export function equationValidationEdges(call) {
  const v=0x05000300;
  const ctrl=(id=0x65716564,level=0)=>frame(71,level,w(id));
  const eq=(level=1,mode=0)=>frame(88,level,Buffer.alloc(mode?22:20));
  const good=Buffer.concat([ctrl(),eq()]);let accepted=0,rejected=0;
  const check=(b,mode=0)=>{accepted++;return equationActual(call,v,b,mode);};
  const reject=(b,e,mode=0)=>{assert.throws(()=>equationRun(call,v,b,mode),e);rejected++;check(good);};
  for(const mode of [0,1]) {
    check(Buffer.concat([ctrl(),frame(900,1),eq(1,mode),ctrl(),eq(1,mode)]),mode);
    check(Buffer.concat([ctrl(),eq(1,mode),ctrl(0x65716564,2),eq(3,mode)]),mode);
    for(let n=0;n<(mode?22:20);n++)reject(Buffer.concat([ctrl(),frame(88,1,Buffer.alloc(n))]),/UnexpectedEnd/,mode);
  }
  reject(eq(0),/OrphanEquation/);
  reject(Buffer.concat([ctrl(0x12345678),eq()]),/OrphanEquation/);
  reject(ctrl(),/MissingEquation/);
  reject(Buffer.concat([ctrl(),eq(),eq()]),/DuplicateEquation/);
  reject(Buffer.concat([ctrl(),ctrl(0x12345678,1),eq(2)]),/MissingEquation/);
  reject(Buffer.concat([ctrl(),eq(),frame(900,1),eq(2)]),/OrphanEquation/);
  reject(Buffer.concat([ctrl(),eq(),ctrl()]),/MissingEquation/);
  check(ctrl(0x12345678));
  const diagnostics=Buffer.alloc(23);diagnostics.writeUInt32LE(0x80000001);diagnostics.writeUInt16LE(7,16);diagnostics[22]=9;
  check(Buffer.concat([ctrl(),frame(88,1,diagnostics)]),1);
  return {accepted,rejected};
}
