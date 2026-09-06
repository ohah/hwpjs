// Read-only evidence for merged revision paragraphs; not a product validator.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {createCfbReader} from '../../js/cfb.mjs';
import {documentRecords} from './documents.mjs';

function survey(bytes) {
  const records=documentRecords(bytes),stack=[],paragraphs=new Map();
  for(const [index,r] of records.entries()) {
    const level=(bytes.readUInt32LE(r.offset)>>>10)&1023;
    stack.length=level;
    const parent=stack[level-1],owner=paragraphs.get(parent);
    if(r.tag===66) {
      assert.ok(r.end-r.start>=24);
      paragraphs.set(index,{index,offset:r.offset,level,units:bytes.readUInt32LE(r.start)&0x7fffffff,merge:bytes.readUInt16LE(r.start+22),textUnits:0,starts:[]});
    }
    if(owner&&r.tag===67)owner.textUnits+=(r.end-r.start)/2;
    if(owner&&r.tag===69) {
      assert.equal((r.end-r.start)%36,0);
      for(let at=r.start;at<r.end;at+=36)owner.starts.push(bytes.readUInt32LE(at));
    }
    stack[level]=index;
  }
  // Only root flow: never concatenate unrelated table/list paragraphs by level.
  const roots=[...paragraphs.values()].filter(p=>p.level===0),groups=[];
  for(let i=0;i<roots.length;i++) {
    const head=roots[i],over=head.starts.filter(n=>n>head.units);
    if(!over.length)continue;
    const members=[head];
    for(let j=i+1;j<roots.length&&roots[j].merge===1;j++)members.push(roots[j]);
    groups.push({head:head.index,offset:head.offset,starts:head.starts,over,units:head.units,textUnits:head.textUnits,members:members.map(p=>({index:p.index,units:p.units,textUnits:p.textUnits,merge:p.merge,starts:p.starts})),sumUnits:members.reduce((n,p)=>n+p.units,0)});
  }
  return {paragraphs:paragraphs.size,allFlowOverruns:[...paragraphs.values()].reduce((n,p)=>n+p.starts.filter(v=>v>p.units).length,0),groups};
}

const cfb=await createCfbReader(readFileSync(process.argv[2]??'zig-out/bin/hwpjs.wasm'));
try {
  cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/issue5169_viewtext_changetracking.hwp',import.meta.url)),{strict:true});
  const header=cfb.findExact('/FileHeader').content;
  assert.equal(header.readUInt32LE(32)>=0x05000302,true);
  assert.equal(header.readUInt32LE(36),16385);
  const result={};
  for(const kind of ['BodyText','ViewText'])result[kind]=survey(inflateRawSync(cfb.findExact('/'+kind+'/Section0').content));
  assert.equal(result.BodyText.allFlowOverruns,0);
  assert.equal(result.ViewText.allFlowOverruns,9);
  assert.deepEqual(result.ViewText.groups.map(g=>g.head),[35,116,133,147,167]);
  for(const g of result.ViewText.groups) {
    assert.equal(g.units,g.textUnits);
    assert.equal(g.members[0].merge,0);
    assert.ok(g.members.length>1);
    assert.ok(g.members.slice(1).every(p=>p.starts.length===0));
    assert.ok(g.starts.every(n=>n<g.sumUnits));
  }
  console.log(JSON.stringify(result,null,2));
} finally {cfb.close();}
