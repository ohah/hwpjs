// Read-only evidence for merged revision paragraphs; not a product validator.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {createCfbReader} from '../../js/cfb.mjs';
import {paragraphEvidence,textCandidates,rangeFilteredCandidate,rootMergeGroups} from './line-cache-evidence.mjs';
import {declaredLineCandidates,lineAvailability} from './line-cache-coordinate-evidence.mjs';
import {revisionGroupEvidence} from './revision-groups.mjs';

function allFlowCoordinateSummary(bytes,paragraphs) {
  const index=revisionGroupEvidence(bytes),byNode=new Map(paragraphs.map(p=>[p.index,p]));
  const groups=new Map(index.groupRows.map(g=>[g,[]]));
  for(const m of index.members)groups.get(m.group).push(byNode.get(m.index));
  let lines=0,removedStarts=0,endStarts=0;
  for(const members of groups.values()) {
    // A continuation with its own cache needs another explicit axis hypothesis.
    assert.ok(members.slice(1).every(p=>p.starts.length===0),'continuation cache needs separate evidence');
    const result=declaredLineCandidates(members);
    lines+=result.lines.length;
    removedStarts+=result.lines.filter(l=>l.removed).length;
    endStarts+=result.lines.filter(l=>l.codeUnit===null).length;
  }
  assert.equal(lines,lineAvailability(paragraphs).lines);
  return {groups:groups.size,lines,removedStarts,endStarts};
}

function survey(paragraphs,bodyParagraphs) {
  // Only root flow: never concatenate unrelated table/list paragraphs by level.
  const groups=[];
  for(const members of rootMergeGroups(paragraphs)) {
    const head=members[0],over=head.starts.filter(n=>n>head.units);
    if(!over.length)continue;
    const {raw,stripped}=textCandidates(members);
    groups.push({head:head.index,offset:head.offset,starts:head.starts,over,units:head.units,textUnits:head.textUnits,members:members.map(p=>({index:p.index,units:p.units,textUnits:p.textUnits,merge:p.merge,starts:p.starts})),sumUnits:members.reduce((n,p)=>n+p.units,0),rawUnits:raw.length/2,strippedUnits:stripped.length/2,bodyRawMatches:bodyParagraphs.filter(p=>p.text?.equals(raw)).map(p=>p.index),bodyStrippedMatches:bodyParagraphs.filter(p=>p.text?.equals(stripped)).map(p=>p.index),bodyLineMatches:bodyParagraphs.filter(p=>p.lineBytes?.equals(head.lineBytes)).map(p=>p.index)});
    const filtered=rangeFilteredCandidate(members,0x11),negative=rangeFilteredCandidate(members,0x10);
    Object.assign(groups.at(-1),{filteredUnits:filtered.length/2,bodyFilteredMatches:bodyParagraphs.filter(p=>p.text?.equals(filtered)).map(p=>p.index),bodyNegativeMatches:bodyParagraphs.filter(p=>p.text?.equals(negative)).map(p=>p.index)});
    // Removing a nonempty selected range must change this candidate's bytes.
    for(const p of members)for(const [at,r] of (p.ranges??[]).entries())if(r.kind===0x11&&r.start<r.end) {
      const changed=members.map(m=>m===p?{...m,ranges:m.ranges.filter((_,i)=>i!==at)}:m);
      assert.notDeepEqual(rangeFilteredCandidate(changed,0x11),filtered);
    }
  }
  return {paragraphs:paragraphs.length,allFlowOverruns:paragraphs.reduce((n,p)=>n+p.starts.filter(v=>v>p.units).length,0),groups};
}

const cfb=await createCfbReader(readFileSync(process.argv[2]??'zig-out/bin/hwpjs.wasm'));
try {
  cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/issue5169_viewtext_changetracking.hwp',import.meta.url)),{strict:true});
  const header=cfb.findExact('/FileHeader').content;
  assert.equal(header.readUInt32LE(32)>=0x05000302,true);
  assert.equal(header.readUInt32LE(36),16385);
  const result={},paragraphs={},decoded={};
  for(const kind of ['BodyText','ViewText']) {
    decoded[kind]=inflateRawSync(cfb.findExact('/'+kind+'/Section0').content);
    paragraphs[kind]=paragraphEvidence(decoded[kind]);
  }
  for(const kind of ['BodyText','ViewText'])result[kind]=survey(paragraphs[kind],paragraphs.BodyText);
  assert.equal(result.BodyText.allFlowOverruns,0);
  assert.equal(result.ViewText.allFlowOverruns,9);
  assert.deepEqual(result.ViewText.groups.map(g=>g.head),[35,116,133,147,167]);
  assert.deepEqual(result.ViewText.groups.map(g=>[g.rawUnits,g.strippedUnits,g.bodyStrippedMatches]),[[122,119,[]],[258,256,[]],[110,109,[73]],[121,119,[]],[99,98,[85]]]);
  assert.ok(result.ViewText.groups.every(g=>g.bodyRawMatches.length===0&&g.bodyLineMatches.length===0));
  assert.deepEqual(result.ViewText.groups.map(g=>[g.filteredUnits,g.bodyFilteredMatches]),[[51,[27]],[125,[68]],[109,[73]],[120,[79]],[98,[85]]]);
  assert.ok(result.ViewText.groups.every(g=>g.bodyNegativeMatches.length===0));
  const roots=paragraphs.ViewText.filter(p=>p.level===0),bodyRoots=paragraphs.BodyText.filter(p=>p.level===0),merged=rootMergeGroups(paragraphs.ViewText);
  assert.equal(roots.length,164);assert.equal(merged.length,99);assert.equal(bodyRoots.length,99);
  for(const [i,g] of merged.entries()) {
    const expected=bodyRoots[i];
    if(expected.text===null)assert.equal(expected.units,1);
    assert.deepEqual(rangeFilteredCandidate(g,0x11),expected.text??Buffer.from('\r','utf16le'),`ordered root pair ${i}`);
  }
  result.orderedRootPairs={viewParagraphs:roots.length,groups:merged.length,bodyParagraphs:bodyRoots.length,matched:merged.length};
  result.lineAvailability=Object.fromEntries(Object.entries(paragraphs).map(([kind,ps])=>[kind,lineAvailability(ps)]));
  result.allFlowCoordinateCandidates=Object.fromEntries(Object.entries(paragraphs).map(([kind,ps])=>[kind,allFlowCoordinateSummary(decoded[kind],ps)]));
  assert.deepEqual(result.allFlowCoordinateCandidates,{
    BodyText:{groups:228,lines:2,removedStarts:0,endStarts:0},
    ViewText:{groups:524,lines:723,removedStarts:45,endStarts:0},
  });
  assert.deepEqual(result.lineAvailability,{
    BodyText:{paragraphs:228,records:2,emptyRecords:0,lines:2,rootLines:0},
    ViewText:{paragraphs:590,records:524,emptyRecords:0,lines:723,rootLines:133},
  });
  const candidates=merged.map(g=>({head:g[0].index,...declaredLineCandidates(g)}));
  assert.equal(candidates.reduce((n,g)=>n+g.lines.length,0),133);
  result.declaredAxisCandidates=candidates.filter(g=>[35,116,133,147,167].includes(g.head));
  assert.deepEqual(result.declaredAxisCandidates.map(g=>g.lines.map(l=>l.projected)),[[0,26,48],[0,50,93],[0,51,91],[0,47,90],[0,46,83]]);
  assert.deepEqual(result.declaredAxisCandidates.map(g=>g.lines.map(l=>l.removed)),[[true,false,false],[false,false,false],[false,false,false],[false,false,false],[false,false,false]]);
  for(const g of result.ViewText.groups) {
    assert.equal(g.units,g.textUnits);
    assert.equal(g.members[0].merge,0);
    assert.ok(g.members.length>1);
    assert.ok(g.members.slice(1).every(p=>p.starts.length===0));
    assert.ok(g.starts.every(n=>n<g.sumUnits));
  }
  // Independent second sample: absence is not a value mismatch or agreement.
  cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp',import.meta.url)),{strict:true});
  result.task2070LineAvailability={};
  result.task2070AllFlowCoordinateCandidates={};
  for(const kind of ['BodyText','ViewText']) {
    const bytes=inflateRawSync(cfb.findExact('/'+kind+'/Section0').content),ps=paragraphEvidence(bytes);
    result.task2070LineAvailability[kind]=lineAvailability(ps);
    result.task2070AllFlowCoordinateCandidates[kind]=allFlowCoordinateSummary(bytes,ps);
  }
  assert.deepEqual(result.task2070LineAvailability,{
    BodyText:{paragraphs:53448,records:0,emptyRecords:0,lines:0,rootLines:0},
    ViewText:{paragraphs:53448,records:53447,emptyRecords:0,lines:54552,rootLines:2354},
  });
  assert.deepEqual(result.task2070AllFlowCoordinateCandidates,{
    BodyText:{groups:53448,lines:0,removedStarts:0,endStarts:0},
    ViewText:{groups:53448,lines:54552,removedStarts:0,endStarts:0},
  });
  console.log(JSON.stringify(result,null,2));
} finally {cfb.close();}
