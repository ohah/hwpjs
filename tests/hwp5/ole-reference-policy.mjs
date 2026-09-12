import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync,deflateRawSync} from 'node:zlib';
import {documentRecords,decodedDocumentInput} from './documents.mjs';
import {oleActual} from './ole-validation.mjs';
const word=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const words=values=>Buffer.concat(values.map(word));
const exactError=name=>e=>e?.constructor===Error&&e.message===name;

export function oleReferencePolicyActual(call,cfb){
  const results=[];
  for(const name of ['chart/분산형/곡선이있는분산형.hwp','한셀OLE.hwp','task1725/text_footnote_tail_overpagination.hwp']){
    const file=readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url));
    cfb.parse(file,{strict:true});
    const nodes=cfb.document().nodes,header=Buffer.from(cfb.findExact('/FileHeader').content),flags=header.readUInt32LE(36);
    const decode=bytes=>flags&1?inflateRawSync(bytes):Buffer.from(bytes);
    const info=decode(cfb.findExact('/DocInfo').content),body=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText');
    const sections=nodes.filter(n=>n.parent===body&&/^Section\d+$/.test(n.name));
    assert.equal(sections.length,1);
    const section=decode(sections[0].content),records=documentRecords(section),oles=records.filter(r=>r.tag===84);
    assert.equal(oles.length,1);
    const count=documentRecords(info).filter(r=>r.tag===18).length,offset=oles[0].start+12,originalId=section.readUInt16LE(offset);
    const stats=oleActual(call,header.readUInt32LE(32),section);
    const expected=(id,selected)=>{
      const prior=[...stats];prior[1]=selected&&id>0?0:1;
      return words([...prior,+(selected&&id>0),+(id===0),+!selected,0]);
    };
    const inputs=bytes=>{
      const encoded=cfb.write({nodes:nodes.map(n=>n===sections[0]?{...n,content:flags&1?deflateRawSync(bytes):bytes}:n)});
      return [[303,Buffer.concat([header.subarray(32,36),Buffer.of(1),word(count),bytes])],
        [304,decodedDocumentInput(header,info,[{index:Number(sections[0].name.slice(7)),bytes}])],
        [305,Buffer.concat([word(67108864),Buffer.from(encoded)])]];
    };
    const original=Buffer.concat([Buffer.of(1),word(67108864),file]);
    const originalReport=Buffer.concat([word(1),expected(originalId,true)]);
    assert.deepEqual(call(305,original),originalReport);
    let accepted=0,rejected=0;
    for(const id of new Set([0,1,count,count+1,65535])){
      const changed=Buffer.from(section);changed.writeUInt16LE(id,offset);
      for(const [mode,input] of inputs(changed)){
        const report=row=>mode===303?row:Buffer.concat([word(1),row]);
        assert.deepEqual(call(mode,Buffer.concat([Buffer.of(0),input])),report(expected(id,false)));accepted++;
        if(id>count){
          assert.throws(()=>call(mode,Buffer.concat([Buffer.of(1),input])),exactError('InvalidOleBinaryReference'));rejected++;
          assert.deepEqual(call(305,original),originalReport);
        }else{
          assert.deepEqual(call(mode,Buffer.concat([Buffer.of(1),input])),report(expected(id,true)));accepted++;
        }
      }
    }
    for(const [mode,input] of inputs(section)){
      assert.throws(()=>call(mode,Buffer.concat([Buffer.of(2),input])),exactError('InvalidMode'));rejected++;
      const limit=records.length+(mode===303?0:documentRecords(info).length);
      const selected=Buffer.concat([Buffer.of(1),input]);
      const report=mode===303?expected(originalId,true):originalReport;
      assert.deepEqual(call(mode,selected,limit),report);accepted++;
      assert.throws(()=>call(mode,selected,limit-1),exactError('LimitExceeded'));rejected++;
      assert.deepEqual(call(305,original),originalReport);
    }
    results.push({name,originalId,binItems:count,accepted,rejected});
  }
  return results;
}
