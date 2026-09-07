import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync,deflateRawSync} from 'node:zlib';
import {formSchemaEvidence} from './form-schema.mjs';
import {maxLengthEvidence} from './form-max-length-evidence.mjs';
import {formDocumentSelection,formDocumentExpected,changeFormProperty} from './form-document.mjs';
import {decodedDocumentInput,documentRecords} from './documents.mjs';
import {sectionFieldOffset} from './document-report-wire.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;};
const wide=s=>Buffer.from(s,'utf16le');
const set=(key,body)=>`${key}:set:${body.length}:${body} `;
function check(call,bytes,kind,count) {
  const before=Buffer.from(bytes),e=formSchemaEvidence(bytes,kind,7),{state,order,raw}=maxLengthEvidence(e,kind,count);
  const out=call(112,Buffer.concat([w(kind),u64(count),bytes]));
  assert.deepEqual(out,Buffer.concat([w(state),w(order),w(raw===null?0xffffffff:raw.length),raw??Buffer.alloc(0)]));
  assert.deepEqual(bytes,before);
  return state;
}
export function formMaxLengthEdges(call) {
  let accepted=0,rejected=0;
  const values=[null,'-1','-01','-0001','-0','-2','-2147483648','0','0000','1','00001','2147483647','2147483648','4294967295','4294967296','18446744073709551615','18446744073709551616','0'.repeat(300)+'1','9'.repeat(300),'-'+'9'.repeat(300)];
  for(let kind=0;kind<=5;kind++)for(const v of values)for(const count of [0n,1n,2n,2147483647n,4294967296n,18446744073709551615n]){
    const text=v===null?'':set('EditSet',`MaxLength:int:${v} `);
    check(call,wide(text),kind,count);accepted++;
  }
  for(const text of [set('Unknown',set('EditSet','MaxLength:int:-1 ')),'MaxLength:int:-1 ',set('EditSet',set('Unknown','MaxLength:int:-1 '))]){
    assert.equal(check(call,wide(text),5,0n),1);accepted++;
  }
  for(const [text,error]of [[set('EditSet','MaxLength:wstring:2:-1 '),/FormSchemaTypeMismatch/],[set('EditSet','MaxLength:int:1 MaxLength:int:2 '),/DuplicateFormSchemaField/],[set('EditSet','MaxLength:int:+1 '),/InvalidFormPropertyNumber/]]){
    assert.throws(()=>call(112,Buffer.concat([w(5),u64(0n),wide(text)])),error);rejected++;
    check(call,wide(set('EditSet','MaxLength:int:-1 ')),5,0n);accepted++;
  }
  return {accepted,rejected};
}
export function formMaxLengthActual(call,cfb) {
  const results=[];let mutations=0,multiSection=0;
  for(const name of ['form-01.hwp','form-02.hwp']){
    const file=readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url));cfb.parse(file,{strict:true});
    const model=cfb.document(),h=Buffer.from(cfb.findExact('/FileHeader').content),doc=inflateRawSync(cfb.findExact('/DocInfo').content),body=inflateRawSync(cfb.findExact('/BodyText/Section0').content);
    const records=documentRecords(body).filter(r=>r.tag===91),index=records.findIndex(r=>body.subarray(r.start,r.start+4).toString()==='tde+');assert.ok(index>=0);
    const r=records[index],p=body.subarray(r.start+14,r.start+14+body.readUInt16LE(r.start+12)*2),e=formSchemaEvidence(p,5,7);
    assert.equal(maxLengthEvidence(e,5).raw.toString('utf16le'),'2147483647');
    check(call,p,5,2147483647n);
    const root=model.nodes.findIndex(n=>n.kind===1&&n.parent===0&&n.name==='BodyText');assert.ok(root>=0);
    for(const [value,state]of [[null,1],['-1',2],['-0001',2],['0',3],['2',3],['2147483648',3],['18446744073709551616',3],['-0',4],['-2',4]]){
      // A setting is not proof that existing Text must be truncated or rejected.
      let changed=changeFormProperty(body,index,'MaxLength',value);
      changed=changeFormProperty(changed,index,'Text','A😀한\r\nB',1);
      const rr=documentRecords(changed).filter(r=>r.tag===91)[index],pp=changed.subarray(rr.start+14,rr.start+14+changed.readUInt16LE(rr.start+12)*2);
      assert.equal(check(call,pp,5,7n),state);
      const sections=[{index:0,bytes:changed}],d=decodedDocumentInput(h,doc,sections),base=call(24,d),out=call(109,Buffer.concat([formDocumentSelection(),d]));
      assert.deepEqual(out,formDocumentExpected(base,sections,7));
      for(let j=0;j<4;j++)assert.equal(out.readUInt32LE(sectionFieldOffset(0,'forms',24+j)),Number(j===state-1));
      assert.deepEqual(call(109,Buffer.concat([formDocumentSelection({mode:0}),d])),base);
      const nodes=model.nodes.map(n=>n.kind===2&&n.parent===root&&n.name==='Section0'?{...n,content:deflateRawSync(changed)}:n),container=Buffer.concat([w(67108864),cfb.write({...model,nodes})]);
      const cb=call(25,container);
      assert.deepEqual(call(110,Buffer.concat([formDocumentSelection(),container])),formDocumentExpected(cb,sections,7));
      assert.deepEqual(call(110,Buffer.concat([formDocumentSelection({mode:0}),container])),cb);
      check(call,p,5,2147483647n);mutations++;
    }
    const doc2=Buffer.from(doc),props=documentRecords(doc).find(r=>r.tag===16);doc2.writeUInt16LE(2,props.start);
    const body2=changeFormProperty(body,index,'MaxLength','-1'),sections=[{index:1,bytes:body2},{index:0,bytes:body}],d=decodedDocumentInput(h,doc2,sections),out=call(109,Buffer.concat([formDocumentSelection(),d]));
    assert.deepEqual(out,formDocumentExpected(call(24,d),sections,7));
    for(let i=0;i<2;i++)for(let j=0;j<4;j++)assert.equal(out.readUInt32LE(sectionFieldOffset(i,'forms',24+j)),Number(j===(i===0?2:1)));
    assert.deepEqual(call(109,Buffer.concat([formDocumentSelection(),decodedDocumentInput(h,doc2,[...sections].reverse())])),out);
    const first=model.nodes.find(n=>n.kind===2&&n.parent===root&&n.name==='Section0');assert.ok(first);
    const nodes=[...model.nodes.map(n=>n.kind===2&&n.parent===0&&n.name==='DocInfo'?{...n,content:deflateRawSync(doc2)}:n),{...first,name:'Section1',content:deflateRawSync(body2)}];
    const container=Buffer.concat([w(67108864),cfb.write({...model,nodes})]);
    assert.deepEqual(call(110,Buffer.concat([formDocumentSelection(),container])),formDocumentExpected(call(25,container),sections,7));
    multiSection++;
    results.push({name,maxLength:'2147483647'});
  }
  return {actual:results,mutations,multiSection};
}
