import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync,deflateRawSync} from 'node:zlib';
import {distributionSamples} from './distribution.mjs';
import {distributionOracle,word} from './distribution-oracle.mjs';
import {decodedDocumentInput} from './documents.mjs';
import {containerTotals} from './container-report-wire.mjs';
export const distributionContainerInput=(file,policy=1,cap=67108864)=>Buffer.concat([Buffer.from([policy]),word(cap),Buffer.from(file)]);
const exactError=name=>e=>e?.constructor===Error&&e.message===name;
export function distributionContainerActual(call,cfb){
  return distributionSamples.map(name=>{
    const file=readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url));
    cfb.parse(file,{strict:true});
    const nodes=cfb.document().nodes,h=Buffer.from(cfb.findExact('/FileHeader').content),flags=h.readUInt32LE(36),selected=!!(flags&4);
    const doc=inflateRawSync(cfb.findExact('/DocInfo').content);
    const body=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText'),view=nodes.findIndex(n=>n.parent===0&&n.name==='ViewText'),scripts=nodes.findIndex(n=>n.parent===0&&n.name==='Scripts');
    assert.ok(body>=0&&view>=0);
    const sections=nodes.filter(n=>n.parent===(selected?view:body)&&/^Section\d+$/.test(n.name)).map(n=>({index:Number(n.name.slice(7)),bytes:selected?distributionOracle(Buffer.from(n.content)):inflateRawSync(n.content)}));
    const decoded=Buffer.concat([Buffer.of(1),decodedDocumentInput(h,doc,sections)]);
    const primary=call(299,decoded);
    assert.equal(primary.readUInt32LE(4),flags);
    let expected;
    if(selected){
      assert.throws(()=>call(298,distributionContainerInput(file,0)),exactError('UnsupportedDistribution'));
      assert.throws(()=>call(299,Buffer.concat([Buffer.of(0),decoded.subarray(1)])),exactError('UnsupportedDistribution'));
      const normalizedHeader=Buffer.from(h);normalizedHeader.writeUInt32LE(flags&~4,36);
      // Independent connection control: move decoded ViewText into ordinary BodyText.
      // The original BodyText is retained under an auxiliary storage name.
      const normalized=cfb.write({nodes:nodes.map((n,i)=>{
        if(n.parent===0&&n.name==='FileHeader')return {...n,content:normalizedHeader};
        if(i===body)return {...n,name:'AuxiliaryBody'};
        if(i===view)return {...n,name:'BodyText'};
        if(n.parent===scripts&&['JScriptVersion','DefaultJScript'].includes(n.name))return {...n,content:deflateRawSync(distributionOracle(Buffer.from(n.content)))};
        if(n.parent===view&&/^Section\d+$/.test(n.name))return {...n,content:deflateRawSync(sections.find(s=>s.index===Number(n.name.slice(7))).bytes)};
        return n;
      })});
      expected=call(25,Buffer.concat([word(67108864),Buffer.from(normalized)]));
      expected.writeUInt32LE(flags,4); // Expected report retains the original flags.
    }else expected=call(25,Buffer.concat([word(67108864),file]));
    assert.deepEqual(expected.subarray(0,primary.length),primary);
    const full=Buffer.concat([expected,word(+selected)]);
    assert.deepEqual(call(298,distributionContainerInput(file)),full);
    const totals=containerTotals(expected);
    const records=primary.readUInt32LE(16)+(selected?0:call(98,Buffer.concat([word(67108864),file])).readUInt32LE(12));
    assert.deepEqual(call(298,distributionContainerInput(file,1,totals.decoded_bytes),records),full);
    assert.throws(()=>call(298,distributionContainerInput(file,1,totals.decoded_bytes-1),records),exactError('LimitExceeded'));
    assert.throws(()=>call(298,distributionContainerInput(file,1,totals.decoded_bytes),records-1),exactError('LimitExceeded'));
    assert.throws(()=>call(298,distributionContainerInput(file,2)),exactError('InvalidMode'));
    assert.deepEqual(call(298,distributionContainerInput(file)),full);
    return {name,flags,primarySource:+selected,sections:sections.length,reportBytes:full.length,decodedBytes:totals.decoded_bytes,uninspectedStreams:totals.uninspected_streams};
  });
}
