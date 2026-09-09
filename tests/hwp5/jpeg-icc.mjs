import assert from 'node:assert/strict';
import {segment} from './jpeg-structure.mjs';
import {jpegJfxxJpegFixture} from './jpeg-jfxx-jpeg.mjs';
import {jpegMarkerOracle,jpegEntropyOracle} from './jpeg-framing.mjs';
import {iccFixture} from './icc-fixture.mjs';
import {iccHeaderWire,iccDigest} from './icc-header-evidence.mjs';
import {iccTableWire} from './icc-table-evidence.mjs';
const signature=Buffer.from('ICC_PROFILE\0'),maximum=16707345;
const words=values=>{const b=Buffer.alloc(values.length*4);values.forEach((n,i)=>b.writeUInt32LE(n,i*4));return b;};
export function jpegIccChunk(sequence,count,data=Buffer.alloc(0)){return Buffer.concat([signature,Buffer.of(sequence,count),data]);}
export function jpegIccBatch(parts,max=maximum){return Buffer.concat([words([max]),...parts.flatMap(p=>[words([p.length]),p])]);}
export function jpegIccOracle(parts,max=maximum) {
  if(!parts.length)return words([0,0]);
  const rows=parts.map(p=>{assert.ok(p.length>=14&&p.length<=65533);assert.deepEqual(p.subarray(0,12),signature);assert.ok(p[12]>0&&p[13]>0&&p[12]<=p[13]);return {sequence:p[12],count:p[13],data:p.subarray(14)};}).sort((a,b)=>a.sequence-b.sequence);
  assert.equal(rows.length,rows[0].count);rows.forEach((r,i)=>{assert.equal(r.sequence,i+1);assert.equal(r.count,rows.length);});
  const bytes=Buffer.concat(rows.map(r=>r.data));assert.ok(bytes.length<=Math.min(max,maximum));return Buffer.concat([words([rows.length,bytes.length]),bytes]);
}
export function jpegIccFile(parts,late=false) {const raw=jpegJfxxJpegFixture({});const at=late?raw.length-2:2;return Buffer.concat([raw.subarray(0,at),...parts.map(p=>segment(226,p)),raw.subarray(at)]);}
export function jpegIccParts(raw) {
  let at=0,entropy=false;const parts=[];
  while(at<raw.length){if(entropy)at+=jpegEntropyOracle(raw.subarray(at)).consumed;const m=jpegMarkerOracle(raw.subarray(at));at+=m.consumed;const p=m.wire.subarray(20);if(m.code===226&&p.subarray(0,12).equals(signature))parts.push(p);entropy=m.code===218||(m.code>=208&&m.code<=215);if(m.code===217)break;}
  return parts;
}
export function jpegIccFileActual(call,raw){const expected=jpegIccOracle(jpegIccParts(raw));assert.deepEqual(call(272,Buffer.concat([words([maximum]),raw])),expected);return {chunks:expected.readUInt32LE(0),bytes:expected.readUInt32LE(4)};}
function inspected(parts,policy,maxTags=100000) {const assembled=jpegIccOracle(parts);if(!parts.length)return words([0,0,0,0]);const bytes=assembled.subarray(8),head=iccHeaderWire(bytes,maximum);iccTableWire(bytes,policy,maxTags);return Buffer.concat([assembled.subarray(0,8),words([bytes.readUInt32BE(128),head.readUInt32LE(128)]),bytes]);}
export function jpegIccInspectInput(raw,policy=1,maxTags=100000){return Buffer.concat([words([maximum]),Buffer.of(policy),words([maxTags]),raw]);}
export function jpegIccEdges(call) {
  let comparisons=0,rejected=0;
  const check=(parts,max=maximum)=>{assert.deepEqual(call(271,jpegIccBatch(parts,max)),jpegIccOracle(parts,max));comparisons++;};
  const reject=(mode,b,error,limit=67108864)=>{assert.throws(()=>call(mode,b,limit),error);rejected++;};
  check([]);check([jpegIccChunk(1,1)]);
  for(let count=0;count<256;count++)for(let sequence=0;sequence<256;sequence++){
    const p=jpegIccChunk(sequence,count,Buffer.of(7));
    if(!count||!sequence||sequence>count)reject(271,jpegIccBatch([p]),/InvalidJpegIccSequence/);
    else if(count===1)check([p]);else reject(271,jpegIccBatch([p]),/MissingJpegIccChunk/);
  }
  for(let count=1;count<=255;count++){
    const parts=Array.from({length:count},(_,i)=>jpegIccChunk(i+1,count,Buffer.of(i,255-i,(i*37)%256)));
    check(parts);check([...parts].reverse());const at=Math.floor(count/2);check([...parts.slice(at),...parts.slice(0,at)]);
    reject(271,jpegIccBatch([...parts,parts[0]]),/DuplicateJpegIccChunk/);
  }
  const pair=[jpegIccChunk(2,2,Buffer.of(9)),jpegIccChunk(1,2)];check(pair);
  reject(271,jpegIccBatch([pair[0],jpegIccChunk(1,1)]),/InconsistentJpegIccCount/);
  const maxParts=Array.from({length:255},(_,i)=>jpegIccChunk(i+1,255,Buffer.alloc(65519,i)));check(maxParts);
  reject(271,jpegIccBatch(maxParts,maximum-1),/LimitExceeded/);
  reject(271,jpegIccBatch([jpegIccChunk(1,1,Buffer.alloc(65520))]),/LimitExceeded/);
  const p=jpegIccChunk(1,1,Buffer.of(1));for(let n=0;n<14;n++)reject(271,jpegIccBatch([p.subarray(0,n)]),/UnexpectedEnd/);
  for(let i=0;i<12;i++){const bad=Buffer.from(p);bad[i]^=1;reject(271,jpegIccBatch([bad]),/InvalidJpegIccIdentifier/);}
  reject(271,jpegIccBatch([p]),/LimitExceeded/,8);
  for(const late of [false,true])for(const parts of [[],pair,[jpegIccChunk(1,1)]]){jpegIccFileActual(call,jpegIccFile(parts,late));comparisons++;}
  const opaque=Buffer.from(p);opaque[0]^=1;jpegIccFileActual(call,jpegIccFile([opaque]));comparisons++;
  for(const major of [2,4])for(const policy of [0,1]){
    const profile=iccFixture([['text',144,12]],156,major);if(major===4)iccDigest(profile).copy(profile,84);
    for(const split of [0,1,4,83,84,100,128,144,155,156]){
      const parts=[jpegIccChunk(2,2,profile.subarray(split)),jpegIccChunk(1,2,profile.subarray(0,split))];
      assert.deepEqual(call(273,jpegIccInspectInput(jpegIccFile(parts,true),policy)),inspected(parts,policy));comparisons++;
    }
  }
  reject(273,jpegIccInspectInput(jpegIccFile([jpegIccChunk(1,1)])),/InvalidIccProfileSize/);
  const corrupt=iccFixture();iccDigest(corrupt).copy(corrupt,84);corrupt[100]^=1;
  reject(273,jpegIccInspectInput(jpegIccFile([jpegIccChunk(1,1,corrupt)])),/InvalidIccProfileId/);
  const raw=jpegIccFile(pair,true);for(let n=0;n<raw.length;n++)reject(272,Buffer.concat([words([maximum]),raw.subarray(0,n)]));
  reject(272,Buffer.concat([words([maximum]),raw,Buffer.of(0)]),/TrailingJpegBytes/);
  return {comparisons,rejected};
}
