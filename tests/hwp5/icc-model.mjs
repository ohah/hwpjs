import assert from 'node:assert/strict';
import {iccFixture} from './icc-fixture.mjs';
function xyz(values){const b=Buffer.alloc(20);b.write('XYZ ');values.forEach((v,i)=>b.writeInt32BE(v,8+i*4));return b;}
function curve(values){const b=Buffer.alloc(12+values.length*2);b.write('curv');b.writeUInt32BE(values.length,8);values.forEach((v,i)=>b.writeUInt16BE(v,12+i*2));return b;}
export function modelEntries(){return [['rXYZ',xyz([1,2,3])],['gXYZ',xyz([4,5,6])],['bXYZ',xyz([7,8,9])],['rTRC',curve([])],['gTRC',curve([512])],['bTRC',curve([0,12345,65535])]];}
export function modelProfile(entries,cls='mntr',space='RGB ',pcs='XYZ '){
  let offset=132+12*entries.length;const descriptors=entries.map(([name,payload])=>{const e=[name,offset,payload.length];offset+=(payload.length+3)&~3;return e;});
  const b=iccFixture(descriptors,offset);b.write(cls,12);b.write(space,16);b.write(pcs,20);entries.forEach((e,i)=>e[1].copy(b,descriptors[i][1]));return b;
}
export function modelReference(entries){
  const map=new Map(entries),out=Buffer.alloc(44);let chunks=[out];
  ['rXYZ','gXYZ','bXYZ'].forEach((name,c)=>{const b=map.get(name);for(let r=0;r<3;r++)out.writeInt32LE(b.readInt32BE(8+r*4),(r*3+c)*4);});out.writeUInt32LE(1,36);out.writeUInt32LE(1,40);
  for(const name of ['rTRC','gTRC','bTRC']){const b=map.get(name),param=b.toString('ascii',0,4)==='para',fn=param?b.readUInt16BE(8):0,n=param?[1,3,4,5,7][fn]:b.readUInt32BE(8),part=Buffer.alloc(8+4*n);part.writeUInt32LE(param?3+fn:n===0?0:n===1?1:2);part.writeUInt32LE(n,4);for(let i=0;i<n;i++)part.writeInt32LE(param?b.readInt32BE(12+i*4):b.readUInt16BE(12+i*2),8+i*4);chunks.push(part);}return Buffer.concat(chunks);
}
function* permutations(xs){if(!xs.length){yield [];return;}for(let i=0;i<xs.length;i++)for(const tail of permutations(xs.filter((_,j)=>i!==j)))yield [xs[i],...tail];}
export function modelEdges(call){let comparisons=0,rejected=0;const entries=modelEntries(),expected=modelReference(entries);
  for(const order of permutations(entries)){assert.deepEqual(call(175,modelProfile(order)),expected);comparisons++;}
  for(let i=0;i<6;i++){
    assert.throws(()=>call(175,modelProfile(entries.filter((_,j)=>i!==j))),/MissingIccMatrixModelTag/);rejected++;
    const bad=entries.map(([name,b])=>[name,Buffer.from(b)]);bad[i][1].write('oops');assert.throws(()=>call(175,modelProfile(bad)),/InvalidIcc/);rejected++;
  }
  for(let fn=0;fn<5;fn++)for(let channel=3;channel<6;channel++){
    const n=[1,3,4,5,7][fn],b=Buffer.alloc(12+4*n);b.write('para');b.writeUInt16BE(fn,8);for(let i=0;i<n;i++)b.writeInt32BE(i%2?-i:i+65536,12+i*4);
    const changed=entries.map((e,i)=>i===channel?[e[0],b]:e);assert.deepEqual(call(175,modelProfile(changed)),modelReference(changed));comparisons++;
  }
  for(const cls of ['scnr','mntr'])for(const space of ['RGB ','3CLR','CMY ']){assert.deepEqual(call(175,modelProfile(entries,cls,space)),expected);comparisons++;}
  for(const [cls,space,pcs] of [['prtr','RGB ','XYZ '],['mntr','CMYK','XYZ '],['mntr','RGB ','Lab '],['link','RGB ','XYZ ']]){assert.throws(()=>call(175,modelProfile(entries,cls,space,pcs)),/InvalidIccRequiredModel/);rejected++;}
  const good=modelProfile(entries);for(let n=0;n<good.length;n++){assert.throws(()=>call(175,good.subarray(0,n)),/InvalidIcc/);rejected++;}
  assert.throws(()=>call(175,good,good.length-1),/LimitExceeded/);rejected++;
  const v2=Buffer.from(good);v2[8]=2;assert.throws(()=>call(175,v2),/UnsupportedIccMatrixModelEdition/);rejected++;
  assert.deepEqual(call(175,good),expected);comparisons++;return {comparisons,rejected};
}
