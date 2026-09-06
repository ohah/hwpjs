import assert from "node:assert/strict";
import { decodedDocumentInput, documentRecords } from "./documents.mjs";
import { sectionFieldOffset } from "./document-report-wire.mjs";
// Receives the independent style oracle's absolute image-ID offset; no duplicate Fill parser.
export function imageReferenceEdges(call,h,doc,sections,s,at,mode,checkCfbMutation){
  const count=documentRecords(doc).filter(r=>r.tag===18).length;
  const id=s.bytes.readUInt16LE(at);assert.ok(id>0&&id<=count);
  let rejected=0,accepted=0;
  const normal=decodedDocumentInput(h,doc,sections);
  const selected=b=>call(54,Buffer.concat([Buffer.from([mode]),b]));
  const baseline=selected(normal);
  for(const bad of new Set([0,count+1,65535])){
    if(bad>65535||bad>0&&bad<=count)continue;
    const changed=Buffer.from(s.bytes);changed.writeUInt16LE(bad,at);
    const input=decodedDocumentInput(h,doc,sections.map(v=>v.index===s.index?{...v,bytes:changed}:v));
    assert.throws(()=>selected(input),/InvalidShapeImageReference/);rejected++;
    const unselected=call(24,input);
    assert.equal(unselected.readUInt32LE(sectionFieldOffset(s.index,"drawing_styles",6)),0);
    checkCfbMutation?.(s.index,changed,/InvalidShapeImageReference/);
    assert.deepEqual(selected(normal),baseline);
  }
  for(const good of new Set([1,count])){
    assert.ok(good>0&&good<=65535);
    const changed=Buffer.from(s.bytes);changed.writeUInt16LE(good,at);
    const input=decodedDocumentInput(h,doc,sections.map(v=>v.index===s.index?{...v,bytes:changed}:v));
    assert.deepEqual(selected(input),baseline);accepted++;
  }
  return {id,rejected,accepted};
}
