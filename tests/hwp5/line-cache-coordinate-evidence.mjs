// Read-only hypotheses, not permission to accept layout-cache coordinates.
import assert from 'node:assert/strict';
import {rangeFilteredCandidate} from './line-cache-evidence.mjs';

export function lineAvailability(paragraphs) {
  return {
    paragraphs:paragraphs.length,
    records:paragraphs.filter(p=>p.lineBytes!==null).length,
    emptyRecords:paragraphs.filter(p=>p.lineBytes!==null&&p.starts.length===0).length,
    lines:paragraphs.reduce((n,p)=>n+p.starts.length,0),
    rootLines:paragraphs.filter(p=>p.level===0).reduce((n,p)=>n+p.starts.length,0),
  };
}

// Assume head starts address concatenated declared UTF-16 units, including CR.
// The caller supplies a group from the existing ownership evidence collector.
export function declaredLineCandidates(members) {
  const projectedUnits=rangeFilteredCandidate(members,17).length/2;
  const sourceUnits=members.reduce((n,p)=>n+p.units,0);
  assert.ok(Number.isSafeInteger(sourceUnits));
  const starts=members[0]?.starts??[],wanted=new Set(starts),mapped=new Map();
  for(const s of starts)assert.ok(Number.isSafeInteger(s)&&s>=0&&s<=sourceUnits,'candidate line bounds');
  let source=0,kept=0;
  for(const p of members) {
    const b=p.text??Buffer.from('\r','utf16le'),ranges=(p.ranges??[]).filter(r=>r.kind===17);
    for(let unit=0;unit<p.units;unit++,source++) {
      const removed=ranges.some(r=>r.start<=unit&&unit<r.end);
      if(wanted.has(source))mapped.set(source,{source,projected:kept,node:p.index,unit,removed,codeUnit:b.readUInt16LE(unit*2)});
      if(!removed)kept++;
    }
  }
  assert.equal(source,sourceUnits);assert.equal(kept,projectedUnits);
  // A paragraph-end boundary has no right-hand character or source member.
  mapped.set(sourceUnits,{source:sourceUnits,projected:kept,node:null,unit:null,removed:false,codeUnit:null});
  return {sourceUnits,projectedUnits,lines:starts.map(s=>mapped.get(s))};
}
