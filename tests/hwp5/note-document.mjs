import assert from "node:assert/strict";
import { inflateRawSync, deflateRawSync } from "node:zlib";
import { documentRecords, documentActual, decodedDocumentInput } from "./documents.mjs";
import { containerActual } from "./containers.mjs";
import { noteActual, noteRun } from "./note-validation.mjs";
const w = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
export function noteDocument(call, cfb, file, h, b) {
  const flags = h.readUInt32LE(36), version = h.readUInt32LE(32);
  const raw = Buffer.from(cfb.findExact('/DocInfo').content), doc = flags & 1 ? inflateRawSync(raw) : raw;
  const sections = [{index:0, bytes:b}];
  const stats = noteActual(call, version, b);
  const document = documentActual(call, h, doc, sections);
  const container = containerActual(call, file, cfb, h, doc, sections);
  const nodes = cfb.document().nodes;
  const bodyIndex = nodes.findIndex(n => n.name === 'BodyText' && n.parent === 0);
  const sectionIndex = nodes.findIndex(n => n.name === 'Section0' && n.parent === bodyIndex);
  assert.ok(sectionIndex >= 0);
  const full = plain => {
    const copy = nodes.map(n => ({...n}));
    copy[sectionIndex].content = flags & 1 ? deflateRawSync(plain) : plain;
    return call(25, Buffer.concat([w(67108864), Buffer.from(cfb.write({nodes:copy}))]));
  };
  const rows = documentRecords(b), control = rows.find(r => r.tag === 71 && [0x666e2020,0x656e2020].includes(b.readUInt32LE(r.start)));
  assert.ok(control);
  const list = rows[rows.indexOf(control)+1];
  assert.equal(list.tag, 72);
  const level = r => (b.readUInt32LE(r.offset) >>> 10) & 1023;
  let end = control.end;
  for (const r of rows.slice(rows.indexOf(control)+1)) { if(level(r)<=level(control)) break; end = r.end; }
  const missing = Buffer.concat([b.subarray(0,control.end),b.subarray(end)]);
  const count = Buffer.from(b); count.writeUInt16LE(count.readUInt16LE(list.start)+1,list.start);
  const short = Buffer.concat([b.subarray(0,control.start+4+11),b.subarray(control.end)]);
  short.writeUInt32LE(((b.readUInt32LE(control.offset)&0xfffff)|(15<<20))>>>0,control.offset);
  let rejected = 0;
  const baseline = call(24,decodedDocumentInput(h,doc,sections));
  for(const [bad,error] of [[missing,/MissingNoteList/],[count,/ListParagraphCountMismatch/],[short,/UnexpectedEnd/]]) {
    for(const invoke of [()=>noteRun(call,version,bad,2),()=>call(24,decodedDocumentInput(h,doc,[{index:0,bytes:bad}])),()=>full(bad)]) {
      assert.throws(invoke,error); rejected++;
    }
    assert.deepEqual(call(24,decodedDocumentInput(h,doc,sections)),baseline);
  }
  // Different note kinds in the two sections catch row/field-position bias.
  const changed = Buffer.from(b);
  const oldId = b.readUInt32LE(control.start), newId = oldId===0x666e2020?0x656e2020:0x666e2020;
  changed.writeUInt32LE(newId,control.start);
  let replaced = false;
  for(const r of rows) if(r.tag===67 && !replaced) {
    for(let pos=r.start;pos+16<=r.end;pos+=2) if(b.readUInt16LE(pos)===17 && b.readUInt32LE(pos+2)===oldId && b.readUInt16LE(pos+14)===17) {
      changed.writeUInt32LE(newId,pos+2); replaced=true; break;
    }
  }
  assert.ok(replaced);
  const info=Buffer.from(doc), properties=documentRecords(doc).find(r=>r.tag===16);
  info.writeUInt16LE(2,properties.start);
  documentActual(call,h,info,[{index:0,bytes:b},{index:1,bytes:changed}]);
  return {stats,document,container,rejected};
}
