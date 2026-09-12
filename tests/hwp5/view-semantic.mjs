import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {loadMemoDocument} from './memo-references.mjs';
import {decodedDocumentInput, documentRecords} from './documents.mjs';
import {documentPrefixBytes} from './document-report-wire.mjs';
import {containerTotals} from './container-report-wire.mjs';
const word=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const words=xs=>Buffer.concat(xs.map(word));
export function viewSemanticInput(file,policy=1,cap=67108864){
  // The existing form selection is disabled, with all four unused caps zero.
  return Buffer.concat([Buffer.from([policy]),Buffer.alloc(17),word(cap),Buffer.from(file)]);
}
const exactError=name=>err=>err?.constructor===Error && err.message===name;
export function viewSemanticActual(call,cfb){
  const results=[];
  for(const name of ['issue5169_viewtext_changetracking.hwp','task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp']){
    const x=loadMemoDocument(call,cfb,name);
    const parent=x.nodes.findIndex(n=>n.parent===0&&n.name==='ViewText');
    assert.ok(parent>=0);
    const view=x.nodes.filter(n=>n.parent===parent&&/^Section\d+$/.test(n.name)).map(n=>({index:Number(n.name.slice(7)),bytes:call(3,Buffer.concat([x.h,Buffer.from(n.content)]))}));
    assert.equal(view.length,x.sections.length);
    const input=Buffer.concat([word(67108864),x.file]);
    const ordinary=call(25,input),framing=call(98,input),totals=containerTotals(ordinary);
    const offExpected=Buffer.concat([framing,words([totals.decoded_bytes,totals.uninspected_streams,0])]);
    assert.deepEqual(call(297,viewSemanticInput(x.file,0)),offExpected);
    const check=(file,sections)=>{
      const decoded=decodedDocumentInput(x.h,x.doc,sections);
      const doc=call(24,decoded),base=call(25,Buffer.concat([word(67108864),Buffer.from(file)])),v=call(98,Buffer.concat([word(67108864),Buffer.from(file)])),t=containerTotals(base);
      const records=sections.reduce((n,s)=>n+documentRecords(s.bytes).length,0);
      const expected=Buffer.concat([v,words([t.decoded_bytes,t.uninspected_streams,1,sections.length,records]),call(90,decoded),call(92,decoded),call(94,decoded),doc.subarray(documentPrefixBytes)]);
      assert.deepEqual(call(297,viewSemanticInput(file)),expected);
      const recordCap=base.readUInt32LE(16)+records;
      assert.deepEqual(call(297,viewSemanticInput(file,1,t.decoded_bytes),recordCap),expected);
      assert.throws(()=>call(297,viewSemanticInput(file,1,t.decoded_bytes-1),recordCap),exactError('LimitExceeded'));
      assert.throws(()=>call(297,viewSemanticInput(file,1,t.decoded_bytes),recordCap-1),exactError('LimitExceeded'));
      assert.deepEqual(call(297,viewSemanticInput(file)),expected);
      return expected.length;
    };
    let strict;
    if(name.startsWith('issue5169')){
      assert.throws(()=>call(297,viewSemanticInput(x.file)),exactError('InvalidLinePosition'));
      assert.deepEqual(call(297,viewSemanticInput(x.file,0)),offExpected);
      strict='InvalidLinePosition';
    }else strict=check(x.file,view);
    // Connection control: change only ViewText streams to already validated BodyText.
    const rebuilt=cfb.write({nodes:x.nodes.map(n=>{
      if(n.parent!==parent||!/^Section\d+$/.test(n.name))return n;
      const raw=x.sections.find(s=>s.index===Number(n.name.slice(7))).bytes;
      return {...n,content:x.h.readUInt32LE(36)&1?deflateRawSync(raw):raw};
    })});
    const controlBytes=check(rebuilt,x.sections);
    assert.throws(()=>call(297,viewSemanticInput(x.file,2)),exactError('InvalidMode'));
    results.push({name,strict,controlBytes,viewBytes:view.reduce((n,s)=>n+s.bytes.length,0),viewRecords:view.reduce((n,s)=>n+documentRecords(s.bytes).length,0)});
  }
  return results;
}
