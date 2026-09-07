import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync,deflateRawSync} from 'node:zlib';
import {decodedDocumentInput,documentRecords} from './documents.mjs';
import {sectionFieldOffset,reportBytes} from './document-report-wire.mjs';
import {unselectedForms} from './form-report-evidence.mjs';
import {formSchemaEvidence,rewriteFormProperties} from './form-schema.mjs';
import {formPropertyEvidence} from './form-property.mjs';
import {formSemanticCounters} from './form-semantics.mjs';
import {controlLinkEvidence} from './links.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const selection=(o={})=>Buffer.concat([Buffer.from([o.mode??1]),w(o.forms??100000),w(o.bytes??67108864),w(o.nodes??100000),w(o.depth??64)]);
const kinds=['????','tbp+','tbc+','boc+','tbr+','tde+'];
function selected(bytes,count) {
  const records=documentRecords(bytes),v=unselectedForms(bytes,records);v[2]=v[3]=0;
  for(const r of records.filter(r=>r.tag===91)) {
    const b=bytes.subarray(r.start,r.end),kind=Math.max(0,kinds.indexOf(b.subarray(0,4).toString())),p=b.subarray(14,14+b.readUInt16LE(12)*2),e=formSchemaEvidence(p,kind,count);
    v[4]++;v[5]+=Number(kind===0);v[6]+=p.length;v[7]+=e.rows.length;v[8]+=e.checked;v[9]+=e.deferred;
    if(kind===0)v[13]++;else{const tag=e.wire.readUInt32LE(8);v[tag===1?10:tag===2?11:12]++;}
    formSemanticCounters(e,kind).forEach((n,j)=>v[14+j]+=n);
  }
  return v;
}
function expected(base,sections,count,mode=1) {
  const out=Buffer.from(base);
  for(const [i,s]of [...sections].sort((a,b)=>a.index-b.index).entries()) {
    const values=mode?selected(s.bytes,count):unselectedForms(s.bytes,documentRecords(s.bytes));
    values.forEach((v,j)=>out.writeUInt32LE(v,sectionFieldOffset(i,'forms',j)));
  }
  return out;
}
function replace(bytes,r,payload) {
  const bits=bytes.readUInt32LE(r.offset)&0xfffff,n=payload.length;
  return Buffer.concat([bytes.subarray(0,r.offset),w(bits|((n<4095?n:4095)<<20)),...(n<4095?[]:[w(n)]),payload,bytes.subarray(r.end)]);
}
function changeProperty(bytes,index,key,value,kind=2) {
  const r=documentRecords(bytes).filter(r=>r.tag===91)[index],b=bytes.subarray(r.start,r.end),p=b.subarray(14,14+b.readUInt16LE(12)*2),{rows}=formPropertyEvidence(p),node=rows.findIndex(n=>n.key.toString('utf16le')===key);
  assert.ok(node>=0);
  const text=rewriteFormProperties(rows,new Map([[node,value===null?'':`${key}:${['set','wstring','int','bool'][kind]}:${kind<2?value.length+':':''}${value} `]])),wide=Buffer.from(text,'utf16le'),prefix=Buffer.from(b.subarray(0,14));prefix.writeUInt32LE(wide.length/2,8);prefix.writeUInt16LE(wide.length/2,12);
  return replace(bytes,r,Buffer.concat([prefix,wide,b.subarray(14+p.length)]));
}
export function formDocumentActual(call,cfb) {
  const saved=[],results=[];let rejected=0,semanticMutations=0;
  for(const name of ['form-01.hwp','form-02.hwp']) {
    const file=readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url));cfb.parse(file,{strict:true});
    const model=cfb.document(),h=Buffer.from(cfb.findExact('/FileHeader').content),doc=inflateRawSync(cfb.findExact('/DocInfo').content),body=inflateRawSync(cfb.findExact('/BodyText/Section0').content),sections=[{index:0,bytes:body}],count=documentRecords(doc).filter(r=>r.tag===21).length;
    const decoded=decodedDocumentInput(h,doc,sections),base=call(24,decoded),want=expected(base,sections,count),values=selected(body,count);
    assert.deepEqual(values.slice(14),[5,0,0,0,0,1,1,0,0,0]);
    const run=(b=decoded,o={})=>call(109,Buffer.concat([selection(o),b]));
    assert.deepEqual(run(),want);assert.deepEqual(run(decoded,{mode:0}),base);
    const exact={forms:5,bytes:values[6],nodes:values[7],depth:1};assert.deepEqual(run(decoded,exact),want);
    const check=()=>assert.deepEqual(run(),want);
    for(const o of [{forms:4},{bytes:values[6]-1},{nodes:values[7]-1},{depth:0}]){assert.throws(()=>run(decoded,o),/FormControlLimit|FormPropertyInputLimit|FormPropertyNodeLimit|FormPropertyDepthLimit/);rejected++;check();}
    const container=Buffer.concat([w(67108864),file]),containerBase=call(25,container),containerWant=expected(containerBase,sections,count);
    assert.deepEqual(call(110,Buffer.concat([selection(exact),container])),containerWant);
    assert.deepEqual(call(110,Buffer.concat([selection({mode:0}),container])),containerBase);
    const records=documentRecords(body),firstObject=records.find(r=>r.tag===91),formLink=controlLinkEvidence(body).find(r=>r[6]===0x666f726d),codeOffset=records[formLink[1]].start+formLink[3]*2;
    const wrongCode=Buffer.from(body);wrongCode.writeUInt16LE(12,codeOffset);wrongCode.writeUInt16LE(12,codeOffset+14);
    const wrongOwner=Buffer.from(body);wrongOwner.writeUInt32LE((wrongOwner.readUInt32LE(firstObject.offset)&~(1023<<10))|(1<<10),firstObject.offset);
    const duplicate=Buffer.concat([body.subarray(0,firstObject.end),body.subarray(firstObject.offset,firstObject.end),body.subarray(firstObject.end)]);
    const bodyRoot=model.nodes.findIndex(n=>n.kind===1&&n.parent===0&&n.name==='BodyText');assert.ok(bodyRoot>=0);
    const formRecords=records.filter(r=>r.tag===91);
    for(const index of formRecords.map((r,i)=>[r,i]).filter(([r])=>['tbc+','tbr+'].includes(body.subarray(r.start,r.start+4).toString())).map(([,i])=>i)) {
      for(const follow of ['0','1',null,'2','-1'])for(const tri of ['0','1',null,'2']) {
        let changed=changeProperty(body,index,'CharShapeID',String(count));
        changed=changeProperty(changed,index,'FollowContext',follow,3);
        changed=changeProperty(changed,index,'TriState',tri,3);
        changed=changeProperty(changed,index,'Value','2');
        const sections=[{index:0,bytes:changed}],d=decodedDocumentInput(h,doc,sections),out=run(d),v=selected(changed,count);
        assert.deepEqual(out,expected(call(24,d),sections,count));
        assert.equal(v[11],1);assert.equal(v[14],4);
        assert.equal(v[15],Number(follow==='0'));
        assert.equal(v[17],Number(follow==='1'));
        assert.equal(v[18],Number(!['0','1'].includes(follow)));
        assert.equal(v[21],Number(tri==='1'));assert.equal(v[22],Number(tri==='0'));assert.equal(v[23],Number(tri===null||tri==='2'));
        assert.deepEqual(run(d,{mode:0}),call(24,d));
        const changedModel={...model,nodes:model.nodes.map(n=>n.kind===2&&n.parent===bodyRoot&&n.name==='Section0'?{...n,content:deflateRawSync(changed)}:n)};
        const rebuilt=Buffer.concat([w(67108864),cfb.write(changedModel)]),b=call(25,rebuilt);
        assert.deepEqual(call(110,Buffer.concat([selection(),rebuilt])),expected(b,sections,count));
        assert.deepEqual(call(110,Buffer.concat([selection({mode:0}),rebuilt])),b);
        semanticMutations++;check();
      }
    }
    for(const [changed,error]of [
      [changeProperty(body,0,'CharShapeID','0',1),/FormSchemaTypeMismatch/],
      [changeProperty(body,4,'CharShapeID','4294967296'),/FormCharShapeIdOverflow/],
      [wrongCode,/FormControlCodeMismatch/],
      [wrongOwner,/MissingFormObject/],
      [duplicate,/DuplicateFormObject/],
    ]) {
      const d=decodedDocumentInput(h,doc,[{index:0,bytes:changed}]);assert.throws(()=>run(d),error);rejected++;
      // Unselected mode does not interpret the changed form payload.
      assert.deepEqual(run(d,{mode:0}),call(24,d));check();
      const changedModel={...model,nodes:model.nodes.map(n=>n.kind===2&&n.parent===bodyRoot&&n.name==='Section0'?{...n,content:deflateRawSync(changed)}:n)};
      const rebuilt=Buffer.concat([w(67108864),cfb.write(changedModel)]);assert.throws(()=>call(110,Buffer.concat([selection(),rebuilt])),error);rejected++;
      assert.deepEqual(call(110,Buffer.concat([selection({mode:0}),rebuilt])),call(25,rebuilt));
    }
    saved.push({h,doc,body,count});results.push({name,values});
  }
  const a=saved[0],b=saved[1],doc=Buffer.from(a.doc),props=documentRecords(doc).find(r=>r.tag===16);doc.writeUInt16LE(2,props.start);
  let second=changeProperty(b.body,0,'CharShapeID','7');const unknown=documentRecords(second).filter(r=>r.tag===91)[1];second=Buffer.from(second);second.write('????',unknown.start,4,'latin1');
  const sections=[{index:1,bytes:second},{index:0,bytes:a.body}],decoded=decodedDocumentInput(a.h,doc,sections),base=call(24,decoded),want=expected(base,sections,a.count),v0=selected(a.body,a.count),v1=selected(second,a.count),exact={forms:10,bytes:v0[6]+v1[6],nodes:v0[7]+v1[7],depth:1};
  const run=(o={})=>call(109,Buffer.concat([selection(o),decoded]));
  assert.deepEqual(run(exact),want);assert.equal(want.length,reportBytes(2));
  assert.equal(want.readUInt32LE(sectionFieldOffset(0,'forms',10)),5);
  assert.equal(want.readUInt32LE(sectionFieldOffset(1,'forms',10)),3);
  assert.equal(want.readUInt32LE(sectionFieldOffset(1,'forms',11)),1);
  assert.equal(want.readUInt32LE(sectionFieldOffset(1,'forms',13)),1);
  for(const o of [{...exact,forms:9},{...exact,bytes:exact.bytes-1},{...exact,nodes:exact.nodes-1}]){assert.throws(()=>run(o),/FormControlLimit|FormPropertyInputLimit|FormPropertyNodeLimit/);rejected++;assert.deepEqual(run(exact),want);}
  assert.deepEqual(run({mode:0,forms:0,bytes:0,nodes:0,depth:0}),base);
  assert.deepEqual(call(109,Buffer.concat([selection(exact),decodedDocumentInput(a.h,doc,[...sections].reverse())])),want);
  assert.throws(()=>run({mode:2}),/InvalidMode/);rejected++;
  return {actual:results,multiSection:{values:[v0,v1],budget:exact},rejected,semanticMutations};
}
