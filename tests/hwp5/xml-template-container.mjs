import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {xmlTemplateContainerEvidence} from './xml-template-container-evidence.mjs';
import {containerTotals} from './container-report-wire.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const envelope=(text,extra=Buffer.alloc(0))=>{const raw=Buffer.from(text,'utf16le');return Buffer.concat([w(raw.length/2),raw,extra]);};
export function xmlTemplateContainerEdges(call,cfb) {
  const file=readFileSync(new URL('../../reference/rhwp/samples/basic/treatise sample.hwp',import.meta.url));cfb.parse(file,{strict:true});
  const original=cfb.document();assert.ok(!original.nodes.some(n=>n.parent===0&&n.name.toLowerCase()==='xmltemplate'));
  const root=original.nodes.length,headerIndex=original.nodes.findIndex(n=>n.parent===0&&n.name==='FileHeader');
  const fields=[envelope(''),envelope('<schema/>',Buffer.from([1,0,2])),envelope('<!DOCTYPE x SYSTEM "https://invalid.invalid/a"><x>&unknown;</y>\0\ud800')];
  const names=['_SchemaName','Schema','Instance'];
  const model=(mask=7,mode=1,declared=false)=>{
    const header=Buffer.from(original.nodes[headerIndex].content);header.writeUInt32LE((header.readUInt32LE(36)&~32)|(declared?32:0),36);
    return {...original,nodes:[...original.nodes.map((n,i)=>i===headerIndex?{...n,content:header}:n),{name:'XMLTemplate',parent:0,kind:1},...fields.flatMap((b,i)=>mask&(1<<i)?[{name:names[i],parent:root,kind:2,content:mode===1?b:deflateRawSync(b)}]:[])]};
  };
  const ordinary=bytes=>call(25,Buffer.concat([w(67108864),bytes]));
  const run=(bytes,mode=1,xmlMax=67108864,total=67108864)=>call(115,Buffer.concat([Buffer.from([mode]),w(xmlMax),w(total),bytes]));
  let accepted=0,rejected=0;
  const check=(m,mode=1)=>{
    const bytes=cfb.write(m),before=Buffer.from(bytes),base=ordinary(bytes),e=xmlTemplateContainerEvidence(base,m,mode),total=containerTotals(base).decoded_bytes+e.decoded;
    assert.deepEqual(run(bytes,mode,e.decoded,total),e.wire);
    assert.deepEqual(run(bytes,0,0),Buffer.concat([base,w(0)]));
    assert.deepEqual(Buffer.from(bytes),before);accepted++;
    if(e.decoded){assert.throws(()=>run(bytes,mode,e.decoded-1),/LimitExceeded/);assert.throws(()=>run(bytes,mode,e.decoded,total-1),/LimitExceeded/);rejected+=2;}
    return {bytes,base,e};
  };
  const good=check(model());
  const reject=(m,mode,error)=>{const bytes=cfb.write(m),before=Buffer.from(bytes);assert.throws(()=>run(bytes,mode),error);assert.deepEqual(run(bytes,0),Buffer.concat([ordinary(bytes),w(0)]));assert.deepEqual(Buffer.from(bytes),before);assert.deepEqual(run(good.bytes),good.e.wire);rejected++;};
  for(const mode of [1,2])for(const declared of [false,true])for(let mask=0;mask<8;mask++)check(model(mask,mode,declared),mode);
  check(original); // A real document without XMLTemplate is not an XMLTemplate sample.
  const declaredAbsent=model(0,1,true);declaredAbsent.nodes[root].name='Unselected';check(declaredAbsent);
  const changed=(m,index,patch)=>({...m,nodes:m.nodes.map((n,i)=>i===index?{...n,...patch}:n)});
  for(let field=0;field<3;field++){
    const m=model(1<<field),index=m.nodes.length-1;
    reject(changed(m,index,{kind:1,content:undefined}),1,/InvalidHwpEntryKind/);
    const raw=envelope('x');
    for(let n=0;n<raw.length;n++)reject(changed(m,index,{content:raw.subarray(0,n)}),1,/UnexpectedEnd/);
    for(const n of [0x7fffffff,0x80000000,0xffffffff])reject(changed(m,index,{content:w(n)}),1,/UnexpectedEnd/);
    check(changed(m,index,{content:envelope('x'.repeat(65536),Buffer.from([255]))}));
    const compressed=model(1<<field,2),at=compressed.nodes.length-1;
    reject(changed(compressed,at,{content:Buffer.from([255,255])}),2,/Invalid|UnexpectedEnd/);
    reject(changed(compressed,at,{content:deflateRawSync(Buffer.from([0]))}),2,/UnexpectedEnd/);
    reject(changed(compressed,at,{content:Buffer.concat([deflateRawSync(fields[field]),Buffer.alloc(8,255)])}),2,/InvalidChecksum/);
    reject(changed(compressed,at,{content:Buffer.concat([deflateRawSync(fields[field]),Buffer.from([1])])}),2,/TrailingData/);
  }
  const empty=model(0);reject(changed(empty,root,{kind:2,content:Buffer.from([255])}),1,/InvalidHwpEntryKind/);
  const wrong=model(7,2);reject(wrong,1,/UnexpectedEnd|LimitExceeded/);
  reject(model(),2,/Invalid|UnexpectedEnd|TrailingData/);
  const mixed=model();mixed.nodes[root].name='xMlTeMpLaTe';for(const n of mixed.nodes)if(n.parent===root)n.name=n.name.toLowerCase();check(mixed);
  const nested=model(0),future=nested.nodes.length;
  nested.nodes.push({name:'Future',parent:root,kind:1},{name:'Schema',parent:future,kind:2,content:Buffer.from([255])},{name:'_SchemaName',parent:0,kind:2,content:Buffer.from([255])},{name:'SchemaExtra',parent:root,kind:2,content:Buffer.from([255])});check(nested);
  for(const b of [Buffer.from([3]),...Array.from({length:5},(_,n)=>Buffer.alloc(n))]){assert.throws(()=>call(115,b),/InvalidMode|UnexpectedEnd/);rejected++;}
  return {accepted,rejected,actualXmlTemplateSamples:0};
}
