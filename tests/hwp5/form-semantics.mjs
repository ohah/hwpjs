import assert from 'node:assert/strict';
import {formSchemaEvidence} from './form-schema.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const set=(key,body)=>`${key}:set:${body.length}:${body} `;
const scalar=(key,type,value)=>value===null?'':`${key}:${type}:${value} `;
// Independent decimal oracle: no product enum/schema import and no JS truthiness.
export function formSemanticEvidence(e,kind) {
  const value=field=>{
    const index=e.wire.readUInt32LE(16+field*4);
    if(index===0xffffffff)return null;
    const raw=e.rows[index].value.toString('utf16le');
    return /^[0-9]+$/.test(raw)?BigInt(raw):'unknown';
  };
  const flag=n=>n===null?0:n===0n?1:n===1n?2:3;
  const follow=flag(value(13)),tri=flag(value(18)),stored=e.wire.readUInt32LE(8);
  const source=follow===1?1:follow===2?2:0;
  const active=source===1?[1,2,3][stored]:0;
  const v=value(17);
  const choice=![2,4].includes(kind)?0:v===0n?2:v===1n?3:v===2n&&tri===2?4:v===2n&&tri===1?5:1;
  return [follow,source,active,tri,choice];
}
export function formSemanticCounters(e,kind) {
  const [,source,active,,choice]=formSemanticEvidence(e,kind),c=Array(10).fill(0);
  c[source===1?({1:2,2:0,3:1}[active]):source===2?3:4]++;
  if(choice)c[({1:9,2:6,3:5,4:7,5:8}[choice])]++;
  return c;
}
export function formSemanticsEdges(call) {
  let accepted=0,rejected=0;
  const check=(s,kind,count=1,fixed)=>{
    const bytes=Buffer.from(s,'utf16le'),before=Buffer.from(bytes),e=formSchemaEvidence(bytes,kind,count),values=formSemanticEvidence(e,kind);
    if(fixed)assert.deepEqual(values,fixed);
    assert.deepEqual(call(111,Buffer.concat([w(kind),w(count),bytes])),Buffer.concat(values.map(w)));
    assert.deepEqual(bytes,before);accepted++;
  };
  const flags=[null,'0','1','2','-0','-1','0001','0000','9'.repeat(128)];
  const values=[null,'0','1','2','3','-0','-1','0002','9'.repeat(128)];
  for(let kind=0;kind<=5;kind++)for(const follow of flags)for(const tri of flags)for(const value of values)for(const id of [null,'0','1','4294967295']) {
    const text=set('CharShapeSet',scalar('FollowContext','bool',follow)+scalar('CharShapeID','int',id))+set('ButtonSet',scalar('TriState','bool',tri)+scalar('Value','int',value));
    check(text,kind);
  }
  check(set('CharShapeSet','FollowContext:bool:1 CharShapeID:int:7 ')+set('ButtonSet','TriState:bool:1 Value:int:2 '),2,7,[2,2,0,2,4]);
  check(set('CharShapeSet','FollowContext:bool:0 CharShapeID:int:7 ')+set('ButtonSet','TriState:bool:0 Value:int:2 '),4,7,[1,1,3,1,5]);
  check(set('Other',set('CharShapeSet','FollowContext:bool:1 ')+set('ButtonSet','TriState:bool:1 Value:int:2 ')),2,0,[0,0,0,0,1]);
  for(const follow of ['0','1'])for(const id of ['-0','-1','4294967296']) {
    const text=set('CharShapeSet',scalar('FollowContext','bool',follow)+scalar('CharShapeID','int',id));
    assert.throws(()=>call(111,Buffer.concat([w(2),w(7),Buffer.from(text,'utf16le')])),id[0]==='-'?/InvalidFormCharShapeId/:/FormCharShapeIdOverflow/);rejected++;
  }
  check('',5,0,[0,0,0,0,0]);
  return {accepted,rejected};
}
