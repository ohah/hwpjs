import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync,deflateRawSync} from 'node:zlib';
import {decodedDocumentInput} from './documents.mjs';
const word=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const words=values=>Buffer.concat(values.map(word));
const frame=payload=>Buffer.concat([word(98|(payload.length<<20)),payload]);
const exactError=name=>e=>e?.constructor===Error&&e.message===name;

export function videoValidationActual(call,cfb){
  const file=readFileSync(new URL('../../reference/rhwp/samples/20250130-hongbo.hwp',import.meta.url));
  cfb.parse(file,{strict:true});
  const nodes=cfb.document().nodes;
  const header=Buffer.from(cfb.findExact('/FileHeader').content);
  const info=inflateRawSync(cfb.findExact('/DocInfo').content);
  const body=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText');
  const sections=nodes.filter(n=>n.parent===body&&/^Section\d+$/.test(n.name)).map(n=>({index:Number(n.name.slice(7)),bytes:inflateRawSync(n.content)}));
  assert.equal(sections.length,1);
  const original=Buffer.concat([Buffer.of(1),word(67108864),file]);
  const empty=words([1,0,0,0,0,0,0,0,0,0]);
  assert.deepEqual(call(302,original),empty);
  const inputs=payload=>{
    const raw=frame(payload);
    const modified=[{index:sections[0].index,bytes:Buffer.concat([sections[0].bytes,raw])}];
    const encoded=cfb.write({nodes:nodes.map(n=>n.parent===body&&n.name===`Section${modified[0].index}`?{...n,content:deflateRawSync(modified[0].bytes)}:n)});
    return [[300,Buffer.concat([header.subarray(32,36),raw])],[301,decodedDocumentInput(header,info,modified)],[302,Buffer.concat([word(67108864),Buffer.from(encoded)])]];
  };
  let accepted=0,rejected=0;
  const variants=[
    {payload:Buffer.from([0,0,0,0,255,255,0,0,7]),fields:[1,1,0,0,1,0,1,2,1]},
    {payload:Buffer.from([1,0,0,0,0,216,255,255]),fields:[1,1,0,0,0,1,1,1,0]},
  ];
  for(const {payload,fields} of variants){
    const expected=words(fields);
    const cases=inputs(payload);
    assert.deepEqual(call(300,Buffer.concat([Buffer.of(1),cases[0][1]])),expected);accepted++;
    for(const [mode,input] of cases.slice(1)){
      assert.deepEqual(call(mode,Buffer.concat([Buffer.of(1),input])),Buffer.concat([word(1),expected]));accepted++;
      assert.deepEqual(call(mode,Buffer.concat([Buffer.of(0),input])),words([1,1,0,1,payload.length,0,0,1,0,0]));accepted++;
      assert.throws(()=>call(mode,Buffer.concat([Buffer.of(3),input])),exactError('InvalidMode'));rejected++;
    }
    for(let cut=0;cut<8;cut++){
      const selection=Buffer.concat([Buffer.of(2),word(1)]);
      for(const [mode,input] of inputs(payload.subarray(0,cut))){
        assert.throws(()=>call(mode,Buffer.concat([selection,input])),exactError('UnexpectedEnd'));rejected++;
        assert.deepEqual(call(302,original),empty);
      }
    }
  }
  return {accepted,rejected,actualVideoFiles:0,syntheticPayloadVariants:variants.length};
}
