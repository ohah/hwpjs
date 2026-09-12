import assert from 'node:assert/strict';
import {oleContainerSurvey} from './ole-container-survey.mjs';

export async function oleContainers(call) {
 let accepted=0,rejected=0;
 const input=(layout,bytes)=>Buffer.concat([Buffer.from([layout]),bytes]);
 const reject=(bytes,limit,message)=>{
  assert.throws(()=>call(306,bytes,limit),e=>e.constructor===Error&&e.message===message);
  rejected++;
 };
 const survey=await oleContainerSurvey((envelope,payload)=>{
  assert.equal(envelope.readUInt32LE(),payload.length);
  for(const [layout,bytes] of [[0,payload],[1,envelope]]) {
   assert.deepEqual(call(306,input(layout,bytes),bytes.length),payload);accepted++;
   reject(input(layout,bytes),bytes.length-1,'LimitExceeded');
  }
  for(let byte=0;byte<4;byte++) {
   const broken=Buffer.from(envelope);broken[byte]^=1;
   reject(input(1,broken),broken.length,'InvalidOleEnvelopeSize');
  }
  for(let cut=0;cut<4;cut++)reject(input(1,envelope.subarray(0,cut)),envelope.length,'UnexpectedEnd');
  reject(input(1,envelope.subarray(0,envelope.length-1)),envelope.length,'InvalidOleEnvelopeSize');
  reject(input(2,envelope),envelope.length,'InvalidMode');
  const reserved=Buffer.from(envelope);reserved[12]=1;
  reject(input(1,reserved),reserved.length,'InvalidHeader');
  assert.deepEqual(call(306,input(1,envelope),envelope.length),payload);
 });
 assert.equal(survey.items,52);
 assert.deepEqual(survey.envelopes,{size_prefixed:52});
 assert.equal(survey.innerAccepted,52);
 assert.deepEqual(survey.innerErrors,{});
 assert.deepEqual(survey.exceptions,[]);
 assert.equal(accepted,104);
 assert.equal(rejected,676);
 return {accepted,rejected,survey};
}
