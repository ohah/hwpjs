import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {revisionTextInput,revisionTextEvidence} from './revision-text.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(tag,level,p)=>Buffer.concat([w(tag|(level<<10)|(p.length<<20)),p]);
function allQueries(e) {
  const count=e.positions.reduce((n,p)=>n+p.units+1,0),queries=Buffer.alloc(count*8),expected=Buffer.alloc(count*16);
  let index=0,removedUnits=0;
  for(const row of e.positions) {
    const ranges=(e.sourceParagraphs.get(row.node).ranges??[]).filter(r=>r.kind===17);let kept=0;
    for(let unit=0;unit<=row.units;unit++) {
      const removed=unit<row.units&&ranges.some(r=>r.start<=unit&&unit<r.end);
      queries.writeUInt32LE(row.node,index*8);queries.writeUInt32LE(unit,index*8+4);
      expected.writeUInt32LE(row.group,index*16);expected.writeBigUInt64LE(BigInt(row.projectedStart+kept),index*16+4);expected.writeUInt32LE(Number(removed),index*16+12);index++;
      if(unit<row.units){if(removed)removedUnits++;else kept++;}
    }
  }
  return {queries,expected,count,removedUnits};
}
export function revisionCoordinateEdges(call) {
  let accepted=0,rejected=0;
  const text=Buffer.from('ABCDE\r','utf16le'),h=Buffer.alloc(24);h.writeUInt32LE(6);h.writeUInt16LE(3,14);
  const ranges=Buffer.concat([[3,5],[1,2],[2,4]].flatMap(([a,b])=>[w(a),w(b),w(0x11000000)]));
  const b=Buffer.concat([frame(255,0,Buffer.alloc(0)),frame(66,0,h),frame(67,1,text),frame(70,1,ranges)]),e=revisionTextEvidence(b),q=allQueries(e),input=revisionTextInput(b,undefined,{},q.queries);
  const recover=()=>{assert.deepEqual(call(103,input),q.expected);accepted++;};recover();
  for(const [node,unit,error]of [[0,0,/InvalidRevisionMember/],[2,0,/InvalidRevisionMember/],[0xffffffff,0,/InvalidRevisionMember/],[1,7,/RevisionCoordinateOutOfBounds/],[1,0xffffffff,/RevisionCoordinateOutOfBounds/]]) {
    // First query succeeds, second fails: no partial report must escape.
    const queries=Buffer.concat([w(1),w(0),w(node),w(unit)]);
    assert.throws(()=>call(103,revisionTextInput(b,undefined,{},queries)),error);rejected++;recover();
  }
  assert.throws(()=>call(103,input,6),/RevisionQueryLimit/);rejected++;recover();
  const short=revisionTextInput(Buffer.alloc(0),undefined,{},Buffer.concat([w(1),w(0)]));
  assert.throws(()=>call(103,short.subarray(0,-1)),/UnexpectedEnd/);rejected++;recover();
  assert.equal(call(103,revisionTextInput(Buffer.alloc(0),undefined,{},Buffer.alloc(0))).length,0);accepted++;
  return {accepted,rejected,boundaries:q.count};
}
export function revisionCoordinateActual(call,cfb) {
  const results=[];
  for(const name of ['issue5169_viewtext_changetracking.hwp','task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp']) {
    cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url)),{strict:true});
    const version=cfb.findExact('/FileHeader').content.readUInt32LE(32);
    for(const kind of ['BodyText','ViewText']) {
      const b=inflateRawSync(cfb.findExact('/'+kind+'/Section0').content),e=revisionTextEvidence(b),q=allQueries(e);
      assert.equal(q.count,e.inputBytes/2+e.paragraphs);
      assert.deepEqual(call(103,revisionTextInput(b,version,{cr:1},q.queries)),q.expected,name+'/'+kind);
      results.push({name,kind,paragraphs:e.paragraphs,boundaries:q.count,removedUnits:q.removedUnits});
    }
  }
  assert.deepEqual(results.map(r=>r.boundaries),[3828,10907,458769,458785]);
  return results;
}
