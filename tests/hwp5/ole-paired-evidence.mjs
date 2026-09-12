import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {createCfbReader} from '../../js/cfb.mjs';

export function pairedTarget(chart,embedded,targets){
  assert.ok(chart.length>0,'empty chart is not correspondence evidence');
  assert.deepEqual(chart,embedded,'HWPX chart and embedded chart disagree');
  const matches=targets.filter(t=>t.xml.equals(chart));
  assert.equal(matches.length,1,'paired XML must identify exactly one candidate');
  return matches[0].id;
}

// Trusted, fixed research fixture only. Existing MIT legacy ZIP reader is an
// independent test dependency; it is not linked into the product HWPX parser.
export async function olePairedEvidence(outer){
  const path=new URL('../../reference/rhwp/samples/chart/분산형/곡선이있는분산형.hwpx',import.meta.url);
  if(!existsSync(path))return {skipped:'paired fixture unavailable'};
  const context={module:{exports:{}},require:createRequire(import.meta.url),Buffer,process,console};
  runInNewContext(readFileSync(new URL('../../legacy/cfb.js',import.meta.url),'utf8'),context);
  const legacy=context.module.exports;
  const zip=legacy.read(readFileSync(path),{type:'buffer'});
  const entry=name=>{const item=legacy.find(zip,name);assert.ok(item?.content);return Buffer.from(item.content);};
  const chart=entry('/Chart/chart1.xml'),ole=entry('/BinData/ole1.ole');
  const inner=await createCfbReader(readFileSync(new URL('../../zig-out/bin/hwpjs.wasm',import.meta.url)));
  const extract=bytes=>{
    assert.equal(bytes.readUInt32LE(0),bytes.length-4);
    inner.parse(bytes.subarray(4),{strict:true});
    return Buffer.from(inner.findExact('/OOXMLChartContents').content);
  };
  try{
    const embedded=extract(ole);
    const targets=[1,2,3].map(id=>({id,xml:extract(inflateRawSync(outer.findExact(`/BinData/BIN000${id}.OLE`).content))}));
    const storageId=pairedTarget(chart,embedded,targets);
    assert.equal(storageId,3);
    return {storageId,xmlBytes:chart.length,xmlSha256:createHash('sha256').update(chart).digest('hex'),evidence:'paired XML equality; not a universal ID rule or a live Hancom run'};
  }finally{inner.close();}
}
