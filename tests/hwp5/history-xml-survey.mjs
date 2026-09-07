// Explicit opt-in: requires the external xmllint command, never modifies fixtures.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {historyXmlPayloads} from './history-xml-source.mjs';
import {inspectXml,queryXml} from './history-xml-query.mjs';
const cfb=await createCfbReader(readFileSync(process.argv[2]??'zig-out/bin/hwpjs.wasm'));
try{
  cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/basic/treatise sample.hwp',import.meta.url)),{strict:true});
  const {payloads,decodedBytes}=historyXmlPayloads(cfb),reports=payloads.map(p=>({kind:p.kind,index:p.index,bytes:p.bytes.length,...inspectXml(p.bytes)}));
  assert.equal(decodedBytes,13292279);
  assert.deepEqual(reports.map(r=>[r.root,r.elements,r.pathAttributes]),[['HMLDIFF',1,0],['HMLDIFF',132,122],['HMLDIFF',289,263],['HMLDIFF',897,317],['HWPML',1235,0]]);
  assert.equal(reports[4].positionElements,9); // HWPML payload elements are not DiffML commands.
  const oldCaret=queryXml(payloads[3].bytes,'string(//UPDATE[@PATH="CARETPOS[1]"]/UPDATE[@PATH="@Pos"]/@OLD)'),lastCaret=queryXml(payloads[4].bytes,'string(/HWPML/HEAD/DOCSETTING/CARETPOS/@Pos)');
  assert.equal(oldCaret,'16');assert.equal(lastCaret,'32');
  let rejected=0;
  for(const text of ['<HWPML>','<HWPML a="1" a="2"/>','<HWPML>&unknown;</HWPML>','<HWPML>\0</HWPML>','<x>'.repeat(1000)+'</x>'.repeat(1000)]){assert.throws(()=>inspectXml(Buffer.from(text,'utf16le')),/XmlProcessFailed/);rejected++;}
  assert.equal(inspectXml(Buffer.from('<HWPML>😀</HWPML>','utf16le')).root,'HWPML');
  assert.equal(inspectXml(Buffer.from('<x:HWPML xmlns:x="urn:test"/>','utf16le')).root,'x:HWPML');
  console.log(JSON.stringify({decodedBytes,reports,caretObservation:{oldCaret,lastCaret,restorationDirectionVerified:false},rejectedXmlInputs:rejected},null,2));
}finally{cfb.close();}
