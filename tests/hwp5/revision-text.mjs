import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {paragraphEvidence,rangeFilteredCandidate} from './line-cache-evidence.mjs';
import {revisionGroupEvidence} from './revision-groups.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const q=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const frame=(tag,level,p)=>Buffer.concat([w(tag|(level<<10)|(p.length<<20)),p]);
const input=(bytes,version=0x05000307,o={},queries=null)=>Buffer.concat([w(version),w(o.input??67108864),w(o.output??67108864),w(o.ranges??100000),Buffer.from([o.cr??0]),...(queries===null?[]:[w(queries.length/8),queries]),bytes]);
function expected(bytes) {
  const index=revisionGroupEvidence(bytes),ps=new Map(paragraphEvidence(bytes).map(p=>[p.index,p])),byGroup=new Map(index.groupRows.map((g,i)=>[g,i])),parts=index.groupRows.map(()=>[]),sizes=index.groupRows.map(()=>0),members=[],positions=[];
  let inputBytes=0,outputBytes=0,ranges=0;
  for(const m of index.members){const p=ps.get(m.index),g=byGroup.get(m.group),out=rangeFilteredCandidate([p],17);if(p.text===null)assert.equal(p.units,1);inputBytes+=p.text?.length??2;outputBytes+=out.length;ranges+=p.ranges?.length??0;
    positions.push({node:m.index,group:g,units:p.units,projectedStart:sizes[g]/2});
    members.push(Buffer.concat([w(m.index),w(g),w(p.units),w(out.length/2),q(m.start),q(sizes[g]/2)]));parts[g].push(out);sizes[g]+=out.length;
  }
  const groups=index.groupRows.map((g,i)=>({...g,text:Buffer.concat(parts[i])}));
  const wire=Buffer.concat([w(groups.length),w(members.length),w(inputBytes),w(outputBytes),w(ranges),...groups.map(g=>Buffer.concat([w(g.head),w(g.flow),w(g.count),w(g.text.length),q(g.units),g.text])),...members]);
  return {wire,groups,paragraphs:members.length,inputBytes,outputBytes,ranges,positions,sourceParagraphs:ps};
}
export {input as revisionTextInput,expected as revisionTextEvidence};
function para(level,s,merge=0,remove=false) {
  const h=Buffer.alloc(24),b=Buffer.from(s,'utf16le');h.writeUInt32LE(s.length);h.writeUInt16LE(merge,22);if(remove)h.writeUInt16LE(1,14);
  return Buffer.concat([frame(66,level,h),frame(67,level+1,b),...(remove?[frame(70,level+1,Buffer.concat([w(s.length-1),w(s.length),w(0x11000000)]))]:[])]);
}
export function revisionTextEdges(call) {
  const b=Buffer.concat([para(0,'A\r',0,true),frame(72,1,Buffer.concat([w(2),w(0)])),para(1,'X\r',0,true),para(1,'Y\r',1),para(0,'B\r',1)]),e=expected(b);
  let accepted=0,rejected=0;
  const check=()=>{assert.deepEqual(call(102,input(b)),e.wire);accepted++;};check();
  assert.equal(e.inputBytes,16);assert.equal(e.outputBytes,12);assert.equal(e.ranges,2);
  assert.deepEqual(call(102,input(b,undefined,{input:16,output:12,ranges:2})),e.wire);accepted++;
  for(const [o,error]of [[{input:15},/RevisionProjectionInputLimit/],[{output:11},/RevisionProjectionOutputLimit/],[{ranges:1},/RevisionProjectionRangeLimit/]]){assert.throws(()=>call(102,input(b,undefined,o)),error);rejected++;check();}
  for(const [at,value]of [[4+12,1],[4+14,2],[4+16,1],[paragraphEvidence(b).at(-1).offset+4+14,1]]){
    const changed=Buffer.from(b);changed.writeUInt16LE(value,at);
    assert.throws(()=>call(102,input(changed)),/ParagraphMetadataCountMismatch/);rejected++;check();
  }
  assert.equal(e.paragraphs,4);
  const missing=Buffer.alloc(24);missing.writeUInt32LE(1);const empty=frame(66,0,missing);
  assert.throws(()=>call(102,input(empty)),/UnsupportedMissingRevisionText/);rejected++;
  assert.deepEqual(call(102,input(empty,undefined,{cr:1,input:2,output:2,ranges:0})),expected(empty).wire);accepted++;
  assert.throws(()=>call(102,input(empty,undefined,{cr:1,input:1})),/RevisionProjectionInputLimit/);rejected++;
  assert.deepEqual(call(102,input(Buffer.alloc(0),undefined,{input:0,output:0,ranges:0})),expected(Buffer.alloc(0)).wire);accepted++;
  const shifted=Buffer.concat([frame(255,0,Buffer.alloc(0)),b]);assert.deepEqual(call(102,input(shifted)),expected(shifted).wire);accepted++;
  for(const bytes of [para(0,'\r',0,true),para(0,'')]){const e=expected(bytes);assert.deepEqual(call(102,input(bytes,undefined,{input:e.inputBytes,output:0,ranges:e.ranges})),e.wire);accepted++;}
  return {accepted,rejected};
}
export function revisionTextActual(call,cfb) {
  const results=[];
  for(const name of ['issue5169_viewtext_changetracking.hwp','task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp']) {
    cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url)),{strict:true});
    const version=cfb.findExact('/FileHeader').content.readUInt32LE(32),read=kind=>inflateRawSync(cfb.findExact('/'+kind+'/Section0').content);
    const bodyRoots=paragraphEvidence(read('BodyText')).filter(p=>p.level===0);
    for(const kind of ['BodyText','ViewText']) {
      const b=read(kind),e=expected(b),wire=input(b,version,{cr:1}),out=call(102,wire);assert.deepEqual(out,e.wire,name+'/'+kind);
      assert.deepEqual(call(102,input(b,version,{cr:1,input:e.inputBytes,output:e.outputBytes,ranges:e.ranges})),out);
      for(const [key,value,error]of [['input',e.inputBytes,/RevisionProjectionInputLimit/],['output',e.outputBytes,/RevisionProjectionOutputLimit/],['ranges',e.ranges,/RevisionProjectionRangeLimit/]])if(value>0){assert.throws(()=>call(102,input(b,version,{cr:1,[key]:value-1})),error);assert.deepEqual(call(102,wire),out);}
      if(name.startsWith('issue5169')&&kind==='ViewText'){const roots=e.groups.filter(g=>g.flow===0);assert.equal(roots.length,99);assert.equal(bodyRoots.length,99);roots.forEach((g,i)=>assert.deepEqual(g.text,bodyRoots[i].text??Buffer.from('\r','utf16le')));}
      results.push({name,kind,groups:e.groups.length,paragraphs:e.paragraphs,inputBytes:e.inputBytes,outputBytes:e.outputBytes,ranges:e.ranges});
    }
  }
  return results;
}
