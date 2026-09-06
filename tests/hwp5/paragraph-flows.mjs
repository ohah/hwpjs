import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {documentRecords} from './documents.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(tag,level,p)=>Buffer.concat([w(tag|(level<<10)|(p.length<<20)),p]);
const para=level=>frame(66,level,Buffer.alloc(24));
const list=(level,count)=>frame(72,level,Buffer.concat([w(count),w(0)]));
const other=level=>frame(255,level,Buffer.alloc(0));
export function paragraphFlowEdges(call){
  const run=b=>call(93,Buffer.concat([w(0x05000307),b]));let accepted=0,rejected=0;
  const b=Buffer.concat([para(0),other(1),list(2,2),para(2),other(3),list(4,1),para(4),para(2),list(2,0),list(2,1),para(2),para(0)]);
  const expected=Buffer.concat([0,0,3,2,6,5,7,2,10,9,11,0].map(w));
  const recover=()=>{assert.deepEqual(run(b),expected);accepted++;};recover();
  for(const[bytes,error]of [[list(0,0),/OrphanListHeader/],[Buffer.concat([para(0),para(1)]),/OrphanListParagraph/],[Buffer.concat([para(0),list(1,0),para(1)]),/ListParagraphCountMismatch/],[Buffer.concat([para(0),list(2,0)]),/InvalidRecordHierarchy/]]){assert.throws(()=>run(bytes),error);rejected++;recover();}
  for(const[bytes,rows]of [[Buffer.alloc(0),[]],[Buffer.concat([para(0),para(0)]),[0,0,1,0]],[Buffer.concat([para(0),list(1,0),other(1),list(1,1),para(1)]),[0,0,4,3]],[Buffer.concat([para(0),list(1,1),other(1),para(1)]),[0,0,3,1]]]){assert.deepEqual(run(bytes),Buffer.concat(rows.map(w)));accepted++;}
  return {accepted,rejected};
}
export function paragraphFlowActual(call,cfb){
  let sections=0,paragraphs=0,memoPairs=0,crossParagraphPairs=0,nestedMemoPairs=0;const names=['aift.hwp','issue5169_viewtext_changetracking.hwp','basic/NewYear_s_Day.hwp','basic/english.hwp','issue5866/memo_field_hwp5.hwp','task2287/1342000_edu_curriculum_map.hwp'];
  for(const name of names){
    cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url)),{strict:true});const h=Buffer.from(cfb.findExact('/FileHeader').content),nodes=cfb.document().nodes,body=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText');
    for(const section of nodes.filter(n=>n.parent===body&&/^Section\d+$/.test(n.name))){
      const b=call(3,Buffer.concat([h,Buffer.from(section.content)])),stack=[],lastList=new Map(),scope=new Map(),expected=[],fields=[],ends=[];
      const records=documentRecords(b);
      for(const[rIndex,r]of records.entries()){
        const level=(b.readUInt32LE(r.offset)>>>10)&1023;assert.ok(level<=stack.length);stack.length=level;const parent=stack.at(-1),p=b.subarray(r.start,r.end);
        if(r.tag===72)lastList.set(parent,rIndex);
        if(r.tag===66){const key=parent===undefined?0:lastList.get(parent);assert.notEqual(key,undefined);scope.set(rIndex,key);expected.push(rIndex,key);paragraphs++;}
        if(r.tag===71&&p.length>=15){const end=11+p.readUInt16LE(9)*2,match=/^MEMO\/65535\/(\d+)\//.exec(p.subarray(11,end).toString('utf16le'));if(match)fields.push({id:Number(match[1]),parent});}
        if(r.tag===67){const rows=call(91,p);for(let at=0;at<rows.length;at+=12)ends.push({id:rows.readUInt32LE(at+8),parent});}
        stack.push(rIndex);
      }
      assert.deepEqual(call(93,Buffer.concat([h.subarray(32,36),b])),Buffer.concat(expected.map(w)),name+'/'+section.name);sections++;
      assert.equal(fields.length,ends.length);
      for(const field of fields){const matches=ends.filter(e=>e.id===field.id);assert.equal(matches.length,1);assert.ok(scope.has(field.parent)&&scope.has(matches[0].parent));assert.equal(scope.get(field.parent),scope.get(matches[0].parent));memoPairs++;crossParagraphPairs+=Number(field.parent!==matches[0].parent);nestedMemoPairs+=Number(scope.get(field.parent)!==0);}
    }
  }
  assert.equal(memoPairs,28);assert.equal(crossParagraphPairs,1);
  return {sections,paragraphs,memoPairs,crossParagraphPairs,nestedMemoPairs};
}
