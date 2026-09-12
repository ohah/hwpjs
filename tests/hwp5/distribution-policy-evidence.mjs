// Read-only policy evidence. Clearing bit 2 below is test-only isolation of the
// existing decoded inspector, never a product acceptance path or file rewrite.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {distributionSamples} from './distribution.mjs';
import {distributionOracle,word} from './distribution-oracle.mjs';
import {decodedDocumentInput,documentRecords} from './documents.mjs';
const expected=[
  {flags:5,bodyBytes:512,bodyRecords:11,viewSections:1,viewBytes:15540,viewRecords:306},
  {flags:1,bodyBytes:15540,bodyRecords:306,viewSections:1,viewBytes:15540,viewRecords:306},
  {flags:131077,bodyBytes:521,bodyRecords:11,viewSections:6,viewBytes:885120,viewRecords:27159},
  {flags:5,bodyBytes:521,bodyRecords:11,viewSections:1,viewBytes:30378,viewRecords:706},
];
const digest=b=>createHash('sha256').update(b).digest('hex');
export function distributionPolicyEvidence(call,cfb){
  return distributionSamples.map((name,index)=>{
    const file=readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url));
    cfb.parse(file,{strict:true});
    const nodes=cfb.document().nodes,h=Buffer.from(cfb.findExact('/FileHeader').content),original=Buffer.from(h),flags=h.readUInt32LE(36);
    assert.equal(flags,expected[index].flags);
    const decode=b=>flags&1?inflateRawSync(b):Buffer.from(b);
    const doc=decode(cfb.findExact('/DocInfo').content);
    const sections=root=>{
      const parent=nodes.findIndex(n=>n.parent===0&&n.name===root);
      assert.ok(parent>=0);
      return nodes.filter(n=>n.parent===parent&&/^Section\d+$/.test(n.name)).map(n=>{
        const raw=Buffer.from(n.content);
        const bytes=root==='ViewText'?distributionOracle(raw):decode(raw);
        if(root==='ViewText')assert.deepEqual(call(99,Buffer.concat([Buffer.from([+!!(flags&1)]),word(67108864),word(bytes.length),raw])),bytes);
        return {index:Number(n.name.slice(7)),bytes};
      }).sort((a,b)=>a.index-b.index);
    };
    const body=sections('BodyText'),view=sections('ViewText');
    const shape={flags,bodyBytes:body.reduce((n,s)=>n+s.bytes.length,0),bodyRecords:body.reduce((n,s)=>n+documentRecords(s.bytes).length,0),viewSections:view.length,viewBytes:view.reduce((n,s)=>n+s.bytes.length,0),viewRecords:view.reduce((n,s)=>n+documentRecords(s.bytes).length,0)};
    assert.deepEqual(shape,expected[index]);
    assert.equal(body.length,1);
    const diagnosticHeader=Buffer.from(h);
    diagnosticHeader.writeUInt32LE(flags&~4,36);
    const viewReport=call(24,decodedDocumentInput(diagnosticHeader,doc,view));
    assert.equal(viewReport.readUInt32LE(8),view.length);
    assert.equal(viewReport.readUInt32LE(24),view.length);
    if(index===2)assert.throws(()=>call(24,decodedDocumentInput(diagnosticHeader,doc,body)),e=>e?.constructor===Error&&e.message==='SectionCountMismatch');
    else call(24,decodedDocumentInput(diagnosticHeader,doc,body));
    if(flags&4)assert.throws(()=>call(25,Buffer.concat([word(67108864),file])),e=>e?.constructor===Error&&e.message==='UnsupportedDistribution');
    else call(25,Buffer.concat([word(67108864),file]));
    assert.deepEqual(h,original);
    assert.deepEqual(Buffer.from(cfb.findExact('/FileHeader').content),original);
    return {name,sha256:digest(file),...shape,viewReportBytes:viewReport.length,view:view.map(s=>({index:s.index,bytes:s.bytes.length,records:documentRecords(s.bytes).length,sha256:digest(s.bytes)}))};
  });
}
