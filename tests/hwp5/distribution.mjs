import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {documentRecords} from './documents.mjs';
import {word as w,makeDistribution,distributionOracle} from './distribution-oracle.mjs';
const input=(raw,output=67108864,cipher=67108864,compressed=true)=>Buffer.concat([Buffer.from([compressed?1:0]),w(cipher),w(output),raw]);
export function distributionEdges(call){
  let accepted=0,rejected=0;
  const original=makeDistribution(Buffer.from('distribution'));
  const recover=()=>assert.deepEqual(call(99,input(original)),Buffer.from('distribution'));
  const alignments=new Set();
  for(let seed=0;seed<256;seed++)for(const extended of [false,true]){
    const expected=Buffer.from(Array.from({length:seed%65},(_,i)=>(i*73)^seed)),raw=makeDistribution(expected,{seed:(seed%2?0xffffff00:0)+seed,extended,mutate:(p,n)=>alignments.add(n%16)});
    assert.deepEqual(call(99,input(raw,expected.length,raw.length-(extended?264:260))),expected);accepted++;
  }
  assert.equal(alignments.size,16);
  for(let cut=0;cut<original.length;cut++){
    assert.throws(()=>call(99,input(original.subarray(0,cut))));rejected++;recover();
  }
  for(const [at,value,error] of [[0,0x1000001d,/InvalidDistributionRecord/],[0,0x1000041c,/InvalidDistributionRecord/],[0,0x0ff0001c,/InvalidDistributionDataSize/]]){
    const raw=Buffer.from(original);raw.writeUInt32LE(value,at);assert.throws(()=>call(99,input(raw)),error);rejected++;recover();
  }
  for(let position=0;position<32;position++){
    const raw=makeDistribution(Buffer.from('A'),{mutate:(p,n,at)=>{p[at+position]^=1;}});
    assert.throws(()=>call(99,input(raw)),position<4||(position>=16&&position<20)?/InvalidChecksum/:/InvalidDistributionPadding/);rejected++;recover();
  }
  const badPad=makeDistribution(Buffer.from('A'),{mutate:(p,n,at)=>{assert.ok(n<at);p[n]=1;}});
  assert.throws(()=>call(99,input(badPad)),/InvalidDistributionPadding/);rejected++;recover();
  for(const bytes of [input(original,11),input(original,100,original.length-261)]){assert.throws(()=>call(99,bytes),/LimitExceeded/);rejected++;recover();}
  const plain=Buffer.alloc(32,16),raw=makeDistribution(plain,{compressed:false});assert.deepEqual(call(99,input(raw,32,32,false)),plain);accepted++;
  assert.throws(()=>call(99,input(raw,31,32,false)),/LimitExceeded/);rejected++;recover();
  return {accepted,rejected};
}
export function distributionActual(call,cfb){
  const out=[];
  for(const name of ['20250130-hongbo-no.hwp','20250130-hongbo.hwp','한글문서파일형식_5.0_revision1.3.hwp','issue5756/156732409_superscript_advance.hwp']){
    const file=readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url));cfb.parse(file,{strict:true});
    const raw=Buffer.from(cfb.findExact('/ViewText/Section0').content),expected=distributionOracle(raw);
    assert.deepEqual(call(99,input(raw,expected.length,raw.length-260)),expected);
    assert.throws(()=>call(99,input(raw,expected.length-1)),/LimitExceeded/);
    out.push({name,decoded:expected.length,records:documentRecords(expected).length});
    if(name==='20250130-hongbo.hwp'){
      assert.deepEqual(expected,inflateRawSync(cfb.findExact('/BodyText/Section0').content));
      assert.deepEqual(call(98,Buffer.concat([w(67108864),file])),Buffer.concat([0,1,1,306,15540,306].map(w)));
      const nodes=cfb.document().nodes,parent=nodes.findIndex(n=>n.parent===0&&n.name==='ViewText');
      const changed=cfb.write({nodes:nodes.map(n=>n.parent===parent&&n.name==='Section0'?{...n,content:raw.subarray(0,-1)}:n)});
      for(const mode of [25,98])assert.throws(()=>call(mode,Buffer.concat([w(67108864),Buffer.from(changed)])),/InvalidDistributionBlockSize/);
      assert.deepEqual(call(98,Buffer.concat([w(67108864),file])),Buffer.concat([0,1,1,306,15540,306].map(w)));
    }
  }
  return out;
}
