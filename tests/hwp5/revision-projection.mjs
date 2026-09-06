import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {paragraphEvidence,rootMergeGroups,rangeFilteredCandidate} from './line-cache-evidence.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
function input(p,options={}) {
  const b=p.text??Buffer.alloc(0);
  return Buffer.concat([Buffer.from([p.text===null?0:1,options.cr??0]),w(p.units),w(options.input??67108864),w(options.output??67108864),w(options.ranges??100000),w(b.length),b,...(p.ranges??[]).flatMap(r=>[w(r.start),w(r.end),w((r.kind<<24)|r.data)])]);
}
export function revisionProjectionEdges(call) {
  let accepted=0,rejected=0;
  const range=(start,end,kind=17,data=0)=>({start,end,kind,data});
  const p={text:Buffer.from('ABCDE\r','utf16le'),units:6,ranges:[]};
  const check=(p,options={})=>{assert.deepEqual(call(100,input(p,options)),rangeFilteredCandidate([p],17));accepted++;};
  const reject=(p,options,error)=>{assert.throws(()=>call(100,input(p,options)),error);rejected++;check({...p,ranges:[]},options.cr?{cr:1}:{});};
  // Exhaustive pairwise intervals include empty, adjacent, nested, duplicated,
  // reversed input order and complete deletion, with an independent unit mask.
  for(let a=0;a<=6;a++)for(let b=a;b<=6;b++)for(let c=0;c<=6;c++)for(let d=c;d<=6;d++)check({...p,ranges:[range(a,b),range(c,d)]});
  let seed=0x6e624eb7;
  const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  for(let i=0;i<512;i++){
    const units=next()%65,text=Buffer.alloc(units*2),ranges=[];
    for(let n=0;n<units;n++)text.writeUInt16LE(next()&65535,n*2);
    const count=next()%40;
    for(let n=0;n<count;n++){const a=next()%(units+1),b=next()%(units+1);ranges.push(range(Math.min(a,b),Math.max(a,b),next()%4===0?18:17,next()&0xffffff));}
    check({text,units,ranges});
  }
  for(const kind of [0,16,18,19,255])check({...p,ranges:[range(0,6,kind,0xffffff)]});
  check(p);check(p,{input:12,output:12,ranges:0});
  for(const bad of [range(2,1),range(0,7),range(0,0xffffffff),range(0,7,18)])reject({...p,ranges:[bad]}, {},/InvalidRangePosition/);
  for(const [options,error] of [[{input:11},/RevisionProjectionInputLimit/],[{output:11},/RevisionProjectionOutputLimit/],[{ranges:0},/RevisionProjectionRangeLimit/]])reject({...p,ranges:[range(1,1)]},options,error);
  const missing={text:null,units:1,ranges:[]};check(missing,{cr:1});
  assert.throws(()=>call(100,input(missing)),/UnsupportedMissingRevisionText/);rejected++;
  check({...missing,ranges:[range(0,1)]},{cr:1,output:0});
  for(const units of [0,2,0xffffffff]){assert.throws(()=>call(100,input({...missing,units},{cr:1})),/UnsupportedMissingRevisionText/);rejected++;}
  for(const units of [0,5,7,0xffffffff]){assert.throws(()=>call(100,input({...p,units})),/RevisionProjectionTextCountMismatch/);rejected++;}
  assert.throws(()=>call(100,input({...p,text:p.text.subarray(0,11)})),/RevisionProjectionTextCountMismatch/);rejected++;
  const wire=input({...p,ranges:[range(0,1)]});
  for(const [at,value] of [[0,2],[1,2],[0,0]]){const bad=Buffer.from(wire);bad[at]=value;assert.throws(()=>call(100,bad),/InvalidMode/);rejected++;}
  for(let n=0;n<wire.length;n++)if(n!==wire.length-12){assert.throws(()=>call(100,wire.subarray(0,n)));rejected++;}
  check({...p,ranges:[range(0,6)]},{output:0});
  check({text:Buffer.alloc(0),units:0,ranges:[]},{input:0,output:0,ranges:0});
  check({text:Buffer.from([0,0xd8,0,0xdc,9,0,13,0]),units:4,ranges:[range(0,1)]}); // raw units, no Unicode repair
  const capInput=count=>{
    const base=input({text:Buffer.from('\r','utf16le'),units:1,ranges:[]},{output:0}),raw=Buffer.alloc(count*12);
    for(let i=0;i<count;i++){raw.writeUInt32LE(1,i*12+4);raw[i*12+11]=17;}
    return Buffer.concat([base,raw]);
  };
  const capped=capInput(100000);
  assert.equal(call(100,capped).length,0);accepted++;
  assert.throws(()=>call(100,capInput(100001)),/RevisionProjectionRangeLimit/);rejected++;
  assert.equal(call(100,capped).length,0);accepted++;
  return {accepted,rejected};
}
export function revisionProjectionActual(call,cfb) {
  cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/issue5169_viewtext_changetracking.hwp',import.meta.url)),{strict:true});
  const read=kind=>paragraphEvidence(inflateRawSync(cfb.findExact('/'+kind+'/Section0').content));
  const groups=rootMergeGroups(read('ViewText')),body=read('BodyText').filter(p=>p.level===0);
  assert.equal(groups.length,99);assert.equal(body.length,99);
  let paragraphs=0,mutations=0;
  for(const [i,g] of groups.entries()) {
    const outputs=[];
    for(const p of g) {
      const options={cr:1},wire=input(p,options),out=call(100,wire);
      assert.deepEqual(out,rangeFilteredCandidate([p],17));
      assert.deepEqual(call(100,input(p,{...options,output:out.length})),out);
      if(out.length>0){assert.throws(()=>call(100,input(p,{...options,output:out.length-1})),/RevisionProjectionOutputLimit/);mutations++;}
      const changed={...p,ranges:[...(p.ranges??[]),{start:0,end:p.units+1,kind:17,data:0}]};
      assert.throws(()=>call(100,input(changed,options)),/InvalidRangePosition/);mutations++;
      assert.deepEqual(call(100,wire),out);
      outputs.push(out);paragraphs++;
    }
    if(body[i].text===null)assert.equal(body[i].units,1);
    assert.deepEqual(Buffer.concat(outputs),body[i].text??Buffer.from('\r','utf16le'),`BodyText root ${i}`);
  }
  assert.equal(paragraphs,164);
  return {paragraphs,groups:groups.length,mutations};
}
