import assert from "node:assert/strict";
import {documentRecords} from "./documents.mjs";
import {ownedShapeDocument} from "./owned-shape-document.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(tag,level,p=Buffer.alloc(0))=>Buffer.concat([w(tag|level<<10|p.length<<20),p]);
export const groupRun=(call,v,b)=>call(85,Buffer.concat([w(v),b]));
function nodes(bytes){
  const result=[],stack=[];
  for(const r of documentRecords(bytes)){const level=bytes.readUInt32LE(r.offset)>>>10&1023;stack.length=level;result.push({...r,level,parent:level?stack[level-1]:null,index:result.length});stack.push(result.length-1);}
  return result;
}
const isGroup=(b,n)=>n.tag===76&&b.readUInt32LE(n.start)===0x24636f6e;
function infoStart(b,n,rows){const base=n.start+(rows[n.parent]?.tag===71?8:4)+42;return base+50+b.readUInt16LE(base)*96;}
function subtreeEnd(b,n){let end=n.end;for(const child of nodes(b).slice(n.index+1)){if(child.level<=n.level)break;end=child.end;}return end;}
export function groupActual(call,v,b){
  const rows=nodes(b),stats=[0,0,0,0];
  for(const n of rows.filter(n=>isGroup(b,n))){
    const start=infoStart(b,n,rows),count=b.readUInt16LE(start),end=start+2+count*4;assert.ok(end<=n.end);
    const children=rows.filter(c=>c.parent===n.index&&c.tag===76);assert.equal(children.length,count);
    children.forEach((c,i)=>assert.equal(b.readUInt32LE(c.start),b.readUInt32LE(start+2+i*4)));
    stats[0]++;stats[1]+=count;stats[2]+=Number(count===0);stats[3]+=n.end-end;
  }
  assert.deepEqual(groupRun(call,v,b),Buffer.concat(stats.map(w)));return stats;
}
export function groupOwnerEdges(call){
  const v=0x05010001,ctrl=frame(71,0,w(0x67736f20));
  const shape=(id,level,ids=null)=>{const p=Buffer.alloc(level===1?100:96);p.writeUInt32LE(id);if(level===1)p.writeUInt32LE(id,4);const count=Buffer.alloc(2);count.writeUInt16LE(ids?.length??0);return frame(76,level,Buffer.concat([p,...(ids===null?[]:[count,...ids.map(w)])]));};
  const group=(ids,level=1)=>shape(0x24636f6e,level,ids),leaf=(id=0x24726563,level=2)=>shape(id,level);
  const good=Buffer.concat([ctrl,group([0x24726563,0x246c696e]),leaf(),leaf(0x246c696e)]);let accepted=0,rejected=0;
  const check=b=>{accepted++;return groupActual(call,v,b);};
  const reject=(b,e)=>{assert.throws(()=>groupRun(call,v,b),e);rejected++;check(good);};
  assert.deepEqual(check(good),[1,2,0,0]);assert.deepEqual(check(Buffer.concat([ctrl,group([])])),[1,0,1,0]);
  check(Buffer.concat([ctrl,group([0x24726563,0x24726563]),leaf(),leaf()]));
  check(Buffer.concat([ctrl,group([0xffffffff]),leaf(0xffffffff)]));
  check(Buffer.concat([ctrl,group([0x24636f6e]),group([0x24726563],2),leaf(0x24726563,3)]));
  check(Buffer.concat([ctrl,group([0x24726563]),frame(900,2),leaf()]));
  reject(Buffer.concat([ctrl,group([0x24726563])]),/GroupChildCountMismatch/);
  reject(Buffer.concat([ctrl,group([]),leaf()]),/GroupChildCountMismatch/);
  reject(Buffer.concat([ctrl,group([0x246c696e,0x24726563]),leaf(),leaf(0x246c696e)]),/GroupChildIdentityMismatch/);
  reject(Buffer.concat([ctrl,group([0x24726563]),leaf(0x246c696e)]),/GroupChildIdentityMismatch/);
  reject(Buffer.concat([ctrl,group([0x24726563]),ctrl,leaf(0x24726563,1)]),/GroupChildCountMismatch/);
  reject(Buffer.concat([ctrl,group([0x24726563]),group([0x24726563],2),leaf(0x24726563,3)]),/GroupChildIdentityMismatch/);
  reject(Buffer.concat([ctrl,leaf()]),/InvalidRecordHierarchy/);
  const full=good.subarray(12,122); // first component: common 100 + count 2 + two IDs 8
  for(let n=100;n<110;n++)reject(Buffer.concat([ctrl,frame(76,1,full.subarray(0,n)),leaf(),leaf(0x246c696e)]),/UnexpectedEnd/);
  return {accepted,rejected};
}
export function groupDocumentReference(call,cfb){
  return ownedShapeDocument(call,cfb,{
    tag:76,count:2,group:'shape_groups',field:2,actual:groupActual,run:groupRun,
    selectRecords:b=>nodes(b).filter(n=>isGroup(b,n)),
    subtreeEnd,
    minimum:(b,n)=>infoStart(b,n,nodes(b))+2+b.readUInt16LE(infoStart(b,n,nodes(b)))*4-n.start,
    missing:/MissingShapeComponent|GroupChildCountMismatch/,duplicate:/DuplicateShapeComponent|GroupChildCountMismatch/,orphan:/OrphanShapeComponent/,
    invalidMutations:(b,n)=>{
      const at=infoStart(b,n,nodes(b)),count=b.readUInt16LE(at),result=[];
      for(const c of [count-1,count+1,65535]){const bytes=Buffer.from(b);bytes.writeUInt16LE(c,at);result.push({bytes,error:/GroupChildCountMismatch|UnexpectedEnd/});}
      const bytes=Buffer.from(b);bytes.writeUInt32LE((bytes.readUInt32LE(at+2)^1)>>>0,at+2);result.push({bytes,error:/GroupChildIdentityMismatch/});return result;
    },
    mutateBody:(b,n)=>{
      const rows=nodes(b),at=infoStart(b,n,rows),end=subtreeEnd(b,n);
      const p=Buffer.concat([b.subarray(n.start,at),Buffer.alloc(2)]);
      return Buffer.concat([b.subarray(0,n.offset),frame(76,n.level,p),b.subarray(end)]);
    },
  });
}
