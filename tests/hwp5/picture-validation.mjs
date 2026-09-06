import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
import { effectsActual } from "./picture-effects.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export const pictureOwnerRun=(call,v,b,mode=0)=>call(79,Buffer.concat([w(v),Buffer.from([mode]),b]));
export const pictureReferenceRun=(call,v,b,count,mode=0)=>call(82,Buffer.concat([w(v),w(count),Buffer.from([mode]),b]));
export function pictureOwnerActual(call,v,b,mode=0,count=undefined){
  const stage=mode%6,nodes=[],stack=[],stats=[0,0,0,0,0,0,0,0,0];
  for(const r of documentRecords(b)){const level=b.readUInt32LE(r.offset)>>>10&1023;stack.length=level;nodes.push({...r,parent:level?stack[level-1]:null});stack.push(nodes.length-1);}
  const owner=n=>n?.tag===76&&b.readUInt32LE(n.start)===0x24706963;
  for(const [i,n] of nodes.entries()){
    if(n.tag===85){assert.notEqual(n.parent,null);assert.ok(owner(nodes[n.parent]));}
    if(!owner(n))continue;const children=nodes.filter(c=>c.parent===i&&c.tag===85);assert.equal(children.length,1);
    const c=children[0],p=b.subarray(c.start,c.end);let end=[73,74,78,78,78,78][stage];assert.ok(p.length>=end);
    stats[0]++;stats[1]+=Number(p[70]>3);
    if(count===undefined)stats[2]++;else {const id=p.readUInt16LE(71);assert.ok(id<=count);stats[id===0?8:7]++;}
    if(stage>=3){end+=effectsActual(call,p.subarray(78),false).bytes;stats[3]++;if(stage>=4){end+=stage===4?8:9;stats[4]++;stats[5]+=Number(stage===5);}}
    assert.ok(end<=p.length);stats[6]+=p.length-end;
  }
  assert.deepEqual(count===undefined?pictureOwnerRun(call,v,b,mode):pictureReferenceRun(call,v,b,count,mode),Buffer.concat(stats.map(w)));return stats;
}
export function pictureOwnerEdges(call){
  const v=0x05010001,frame=(tag,level,p=Buffer.alloc(0))=>Buffer.concat([w(tag|level<<10|p.length<<20),p]);
  const owner=(id=0x24706963,level=0)=>frame(76,level,w(id));let accepted=0,rejected=0;
  for(let mode=0;mode<12;mode++){
    const stage=mode%6,raw=Buffer.alloc(95);raw[70]=255;const p=frame(85,1,raw),good=Buffer.concat([owner(),p]);
    const check=b=>{accepted++;return pictureOwnerActual(call,v,b,mode);};
    const reject=(b,error)=>{assert.throws(()=>pictureOwnerRun(call,v,b,mode),error);rejected++;check(good);};
    assert.deepEqual(check(good),[1,1,1,Number(stage>=3),Number(stage>=4),Number(stage===5),95-[73,74,78,82,90,91][stage],0,0]);
    reject(owner(),/MissingPicture/);reject(frame(85,0,raw),/OrphanPicture/);reject(Buffer.concat([owner(0x24637572),p]),/OrphanPicture/);
    reject(Buffer.concat([good,frame(900,1),p]),/DuplicatePicture/);
    reject(Buffer.concat([owner(),owner(0x24636f6e,1),frame(85,2,raw)]),/MissingPicture/);
    reject(Buffer.concat([good,owner()]),/MissingPicture/);
    reject(Buffer.concat([good,frame(900,0),p]),/OrphanPicture/);
    check(Buffer.concat([owner(),frame(900,1),frame(901,2),p]));check(Buffer.concat([good,good]));
    for(let n=0;n<[73,74,78,82,90,91][stage];n++)reject(Buffer.concat([owner(),frame(85,1,raw.subarray(0,n))]),/UnexpectedEnd/);
    if(stage>=3){const bad=Buffer.from(raw);bad.writeUInt32LE(16,78);reject(Buffer.concat([owner(),frame(85,1,bad)]),/UnsupportedPictureEffects/);}
  }
  for(const mode of [12,255]){assert.throws(()=>pictureOwnerRun(call,v,Buffer.alloc(0),mode),/InvalidMode/);rejected++;}
  return {accepted,rejected};
}
