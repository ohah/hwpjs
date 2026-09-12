import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {distributionSamples} from './distribution.mjs';
import {distributionOracle,makeDistribution,word} from './distribution-oracle.mjs';
import {distributionContainerInput} from './distribution-container.mjs';
const exactError=name=>e=>e?.constructor===Error&&e.message===name;
export function distributionContainerEdges(call,cfb){
  const file=readFileSync(new URL('../../reference/rhwp/samples/'+distributionSamples[0],import.meta.url));
  cfb.parse(file,{strict:true});
  const nodes=cfb.document().nodes;
  const body=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText');
  const view=nodes.findIndex(n=>n.parent===0&&n.name==='ViewText');
  const scripts=nodes.findIndex(n=>n.parent===0&&n.name==='Scripts');
  assert.ok(body>=0&&view>=0&&scripts>=0);
  const targets=nodes.map((n,i)=>({n,i})).filter(({n})=>n.parent===view&&n.name==='Section0'||n.parent===scripts&&['JScriptVersion','DefaultJScript'].includes(n.name));
  assert.equal(targets.length,3);
  const baseline=call(298,distributionContainerInput(file));
  let rejected=0,accepted=0;
  const recover=()=>assert.deepEqual(call(298,distributionContainerInput(file)),baseline);
  const rebuild=(index,content)=>cfb.write({nodes:nodes.map((n,i)=>i===index?{...n,content}:n)});
  const reject=(bytes,error)=>{
    assert.throws(()=>call(298,distributionContainerInput(bytes)),exactError(error));
    rejected++;recover();
  };
  for(const {n,i} of targets){
    const raw=Buffer.from(n.content),decoded=distributionOracle(raw);
    for(const cut of [0,259,260,raw.length-1])reject(rebuild(i,raw.subarray(0,cut)),cut<260?'UnexpectedEnd':'InvalidDistributionBlockSize');
    const badTag=Buffer.from(raw);badTag.writeUInt32LE((badTag.readUInt32LE(0)&0xfffffc00)|29,0);
    reject(rebuild(i,badTag),'InvalidDistributionRecord');
    reject(rebuild(i,makeDistribution(decoded,{mutate:(plain,length,aligned)=>{plain[aligned]^=1;}})),'InvalidChecksum');
    // Valid record framing is still not a distribution envelope.
    reject(rebuild(i,Buffer.concat([word(999|(1<<20)),Buffer.of(0)])),'InvalidDistributionRecord');
    reject(rebuild(i,makeDistribution(Buffer.alloc(0))),n.parent===view?'EmptyViewTextSection':'UnexpectedEnd');
    assert.deepEqual(call(298,distributionContainerInput(rebuild(i,makeDistribution(decoded)))),baseline);
    accepted++;recover();
  }
  reject(cfb.write({nodes:nodes.map((n,i)=>i===view?{...n,name:'OtherView'}:n)}),'MissingViewText');
  const target=targets.find(({n})=>n.parent===view).i;
  reject(cfb.write({nodes:nodes.map((n,i)=>i===target?{...n,name:'Section1'}:n)}),'InvalidSectionIndex');
  for(const [bit,error] of [[2,'UnsupportedEncryption'],[256,'UnsupportedEncryption'],[16,'UnsupportedDrm'],[1024,'UnsupportedDrm']]){
    reject(cfb.write({nodes:nodes.map(n=>{
      if(n.parent!==0||n.name!=='FileHeader')return n;
      const h=Buffer.from(n.content);h.writeUInt32LE(h.readUInt32LE(36)|bit,36);return {...n,content:h};
    })}),error);
  }
  // Auxiliary BodyText is not parsed or used as recovery input.
  const auxiliary=nodes.findIndex(n=>n.parent===body&&n.name==='Section0');
  assert.ok(auxiliary>=0);
  assert.deepEqual(call(298,distributionContainerInput(rebuild(auxiliary,Buffer.of(255)))),baseline);accepted++;
  const renamed=cfb.write({nodes:nodes.map((n,i)=>i===body?{...n,name:'UnusedBody'}:n)});
  assert.deepEqual(call(298,distributionContainerInput(renamed)),baseline);accepted++;
  recover();
  return {targets:targets.length,accepted,rejected};
}
