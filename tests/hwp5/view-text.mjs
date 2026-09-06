import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {loadMemoDocument} from './memo-references.mjs';
import {documentRecords} from './documents.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const words=xs=>Buffer.concat(xs.map(w));
export function viewTextDocument(call,cfb){
  const x=loadMemoDocument(call,cfb,'issue5169_viewtext_changetracking.hwp'),parent=x.nodes.findIndex(n=>n.parent===0&&n.name==='ViewText'),target=x.nodes.findIndex(n=>n.parent===parent&&n.name==='Section0');
  assert.ok(parent>=0&&target>=0);
  const view=call(3,Buffer.concat([x.h,Buffer.from(x.nodes[target].content)])),records=documentRecords(view).length;
  assert.equal(records,2814);assert.equal(view.length,105182);
  const input=(file,cap=67108864)=>Buffer.concat([w(cap),Buffer.from(file)]),original=call(25,input(x.file)),expected=words([1,1,1,records,view.length,records]);
  assert.deepEqual(call(98,input(x.file)),expected);
  const rebuild=nodes=>cfb.write({nodes});
  const withRaw=raw=>rebuild(x.nodes.map((n,i)=>i===target?{...n,content:raw}:n));
  let rejected=0,accepted=1;
  const recover=()=>{assert.deepEqual(call(98,input(x.file)),expected);assert.deepEqual(call(25,input(x.file)),original);};
  const reject=(file,error)=>{for(const mode of [25,98]){assert.throws(()=>call(mode,input(file)),error);rejected++;}recover();};
  // No fallback to BodyText or raw bytes after decompression failure.
  reject(withRaw(Buffer.from([255])));
  reject(withRaw(deflateRawSync(Buffer.alloc(0))),/EmptyViewTextSection/);
  for(const plain of [Buffer.from([0]),w(999|(1<<20)),Buffer.concat([w(999|(4095<<20)),w(0xffffffff)])]){
    reject(withRaw(deflateRawSync(plain)),plain.length===8?/LimitExceeded/:/UnexpectedEnd/);
  }
  // Renaming avoids rewriting unrelated CFB parent indices.
  reject(rebuild(x.nodes.map((n,i)=>i===parent?{...n,name:'OtherView'}:n)),/MissingViewText/);
  for(const name of ['Other','Section01','Section1']){
    reject(rebuild(x.nodes.map((n,i)=>i===target?{...n,name}:n)),name==='Other'?/SectionCountMismatch/:name==='Section01'?/InvalidSectionName/:/InvalidSectionIndex/);
  }
  reject(rebuild([...x.nodes,{...x.nodes[target],name:'Section1'}]),/SectionCountMismatch/);
  const h=Buffer.from(x.h);h.writeUInt32LE(h.readUInt32LE(36)&~16384,36);
  const unflagged=rebuild(x.nodes.map(n=>n.parent===0&&n.name==='FileHeader'?{...n,content:h}:n));
  assert.deepEqual(call(98,input(unflagged)),words([0,1,1,records,view.length,records]));accepted++;recover();
  const total=original.readUInt32LE(original.length-8),bodyRecords=original.readUInt32LE(16);
  assert.deepEqual(call(98,input(x.file,total),bodyRecords+records),expected);accepted++;
  for(const [cap,limit] of [[total-1,bodyRecords+records],[total,bodyRecords+records-1]]){
    for(const mode of [25,98]){assert.throws(()=>call(mode,input(x.file,cap),limit),/LimitExceeded/);rejected++;}recover();
  }
  // Framing-only explicitly defers unknown payloads instead of claiming semantics.
  const unknown=Buffer.concat([w(999|(1023<<10)|(3<<20)),Buffer.from([0,255,17])]);
  assert.deepEqual(call(98,input(withRaw(deflateRawSync(unknown)))),words([1,1,1,1,7,1]));accepted++;recover();
  return {accepted,rejected,records,decodedBytes:view.length};
}
