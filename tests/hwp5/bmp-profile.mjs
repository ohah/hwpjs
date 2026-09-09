import assert from 'node:assert/strict';
import {bmpFixture} from './bmp-fixture.mjs';
import {bmpLayoutOracle,bmpWords} from './bmp-oracle.mjs';
import {iccFixture} from './icc-fixture.mjs';
import {iccHeaderWire} from './icc-header-evidence.mjs';
import {iccTableWire} from './icc-table-evidence.mjs';
import {expectBmpError} from './bmp-errors.mjs';
export function bmpProfileFixture({kind=0x4d424544,data=Buffer.from([7,8,9]),gap=0,tail=0,...bitmap}={}) {
  const base=bmpFixture({kind:124,...bitmap}),raw=Buffer.concat([base,Buffer.alloc(gap,0xa5),data,Buffer.alloc(tail,0x5a)]);
  raw.writeUInt32LE(raw.length,2);raw.writeUInt32LE(kind,70);raw.writeUInt32LE(base.length+gap-14,126);raw.writeUInt32LE(data.length,130);return raw;
}
export function bmpProfileInput(raw,{maximum=67108864,link=4096,tags=100000,layout=1,trailing=false}={}) {
  return Buffer.concat([bmpWords([maximum,link,tags]),Buffer.of(layout,+trailing),raw]);
}
export function bmpProfileOracle(raw,{maximum=67108864,link=4096,tags=100000,layout=1,trailing=false}={},inspect=false) {
  bmpLayoutOracle(raw,{trailing});
  const size=raw.readUInt32LE(2),header=raw.readUInt32LE(14),space=header>=108?raw.readUInt32LE(70):0;
  if(header!==124||![0x4c494e4b,0x4d424544].includes(space))return Buffer.alloc(inspect?40:32);
  const file=raw.subarray(0,size),width=file.readInt32LE(18),height=Math.abs(file.readInt32LE(22)),bits=file.readUInt16LE(28),compression=file.readUInt32LE(30);
  const pixelBytes=[0,3].includes(compression)?Math.ceil(width*bits/32)*4*height:file.readUInt32LE(34),pixelEnd=file.readUInt32LE(10)+pixelBytes;
  const start=14+file.readUInt32LE(126),declared=file.readUInt32LE(130);assert.ok(start>=pixelEnd&&start<=size);
  let stored,data;
  if(space===0x4d424544){assert.ok(declared<=maximum&&start+declared<=size);stored=declared;data=file.subarray(start,start+stored);}
  else {const end=file.subarray(start,start+Math.min(link,size-start)).indexOf(0);assert.ok(end>=0);stored=end+1;data=file.subarray(start,start+end);}
  const words=[space===0x4d424544?1:2,start,declared,data.length,stored,start-pixelEnd,size-start-stored,1];
  if(inspect){assert.equal(space,0x4d424544);const table=iccTableWire(data,layout,tags,maximum),header=iccHeaderWire(data,maximum);words.push(table.readUInt32LE(0),header.readUInt32LE(128));}
  return Buffer.concat([bmpWords(words),data]);
}
export function bmpProfileActual(call,raw) {
  const want=bmpProfileOracle(raw,{layout:0});
  assert.deepEqual(call(292,bmpProfileInput(raw,{layout:0})),want);
  if(want.readUInt32LE(0)!==2)assert.deepEqual(call(293,bmpProfileInput(raw,{layout:0})),bmpProfileOracle(raw,{layout:0},true));
  else expectBmpError(()=>call(293,bmpProfileInput(raw,{layout:0})),/UnsupportedBmpLinkedProfile/);
  return want.readUInt32LE(0);
}
export function bmpProfileEdges(call) {
  let comparisons=0,rejected=0;
  const check=(raw,options={},inspect=false)=>{const mode=inspect?293:292;assert.deepEqual(call(mode,bmpProfileInput(raw,options)),bmpProfileOracle(raw,options,inspect));comparisons++;};
  const reject=(raw,error,options={},inspect=false)=>{expectBmpError(()=>call(inspect?293:292,bmpProfileInput(raw,options)),error);rejected++;};
  for(const kind of [0x4d424544,0x4c494e4b])for(const gap of [0,1,3,4,31])for(const tail of [0,1,9])for(const top of [false,true]) {
    const data=kind===0x4d424544?Buffer.from([1,2,3,4]):Buffer.from([92,92,115,92,128,233,0]);
    check(bmpProfileFixture({kind,data,gap,tail,top}));
  }
  for(const kind of [12,40,108]){const raw=bmpFixture({kind,bits:24});check(raw);check(raw,{},true);}
  for(const space of [0,0x73524742,0x57696e20,0xffffffff]){const raw=bmpProfileFixture({kind:space});raw.writeUInt32LE(0xffffffff,126);raw.writeUInt32LE(0xffffffff,130);check(raw,{maximum:0,link:0});check(raw,{},true);}
  const raw=bmpProfileFixture({data:Buffer.alloc(12,5),gap:3,tail:7}),end=raw.length;
  for(let offset=0;offset<end+2;offset++)for(const size of [0,1,2,7,12,19,20,21,0xffffffff]) {
    const bad=Buffer.from(raw);bad.writeUInt32LE(offset,126);bad.writeUInt32LE(size,130);
    const start=offset+14,pixelEnd=raw.readUInt32LE(10)+24;
    if(start<pixelEnd||start>end)reject(bad,/InvalidBmpProfileOffset/);
    else if(size>67108864)reject(bad,/LimitExceeded/);
    else if(start+size>end)reject(bad,/UnexpectedEnd/);
    else check(bad);
  }
  const high=Buffer.from(raw);high.writeUInt32LE(0xffffffff,126);reject(high,/InvalidBmpProfileOffset/);
  reject(raw,/LimitExceeded/,{maximum:11});check(raw,{maximum:12});
  for(let n=0;n<raw.length;n++)reject(raw.subarray(0,n),/UnexpectedEnd/);
  for(let n=0;n<14;n++){expectBmpError(()=>call(292,bmpProfileInput(raw).subarray(0,n)),/UnexpectedEnd/);rejected++;}
  for(const at of [12,13]){const input=bmpProfileInput(raw);input[at]=2;expectBmpError(()=>call(292,input),/InvalidMode/);rejected++;}
  for(const size of [0,1,5,0xffffffff]) {
    const link=bmpProfileFixture({kind:0x4c494e4b,data:Buffer.from([65,128,233,0,5]),tail:3});link.writeUInt32LE(size,130);
    check(link,{link:4,maximum:0});reject(link,/LimitExceeded/,{link:3});reject(link,/UnsupportedBmpLinkedProfile/,{},true);
  }
  const unterminated=bmpProfileFixture({kind:0x4c494e4b,data:Buffer.from([65,66,0])});unterminated.writeUInt32LE(unterminated.length-1,2);
  reject(unterminated,/TrailingBmpBytes/);reject(unterminated,/UnterminatedBmpProfileLink/,{trailing:true});reject(unterminated,/LimitExceeded/,{trailing:true,link:1});
  check(bmpProfileFixture({kind:0x4c494e4b,data:Buffer.of(0)}),{link:1});
  for(const major of [2,4])for(const layout of [0,1])for(const gap of [0,3,17]) {
    const data=iccFixture([['text',144,12]],156,major),raw=bmpProfileFixture({data,gap,tail:5});check(raw,{layout},true);reject(raw,/LimitExceeded/,{tags:0},true);
  }
  const data=iccFixture(),valid=bmpProfileFixture({data});check(valid,{},true);
  const corrupt=Buffer.from(valid);corrupt[valid.length-data.length+84]=1;reject(corrupt,/InvalidIccProfileId/,{},true);
  const empty=bmpProfileFixture({data:Buffer.alloc(0)});check(empty);reject(empty,/InvalidIccProfileSize/,{},true);
  for(const inspect of [false,true]){const bytes=inspect?valid:raw,mode=inspect?293:292,want=bmpProfileOracle(bytes,{},inspect);assert.deepEqual(call(mode,bmpProfileInput(bytes),want.length),want);comparisons++;expectBmpError(()=>call(mode,bmpProfileInput(bytes),want.length-1),/LimitExceeded/);rejected++;}
  let seed=0x42565035,accepted=0,mutatedRejected=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let i=0;i<2000;i++) {
    const inspect=i%2===0,bad=Buffer.from(valid),positions=[70,71,72,73,126,127,128,129,130,131,132,133,valid.length-1];
    for(let n=1+random()%3;n>0;n--)bad[positions[random()%positions.length]]^=1+random()%255;
    let expected;try{expected=bmpProfileOracle(bad,{},inspect);}catch(error){if(!(error instanceof assert.AssertionError))throw error;}
    if(expected){assert.deepEqual(call(inspect?293:292,bmpProfileInput(bad)),expected);accepted++;}
    else{expectBmpError(()=>call(inspect?293:292,bmpProfileInput(bad)),/^(InvalidBmpProfileOffset|UnexpectedEnd|LimitExceeded|InvalidIcc\w+|UnsupportedBmpLinkedProfile|UnterminatedBmpProfileLink)$/);mutatedRejected++;}
  }
  return {comparisons,rejected,mutations:{seed:0x42565035,cases:2000,accepted,rejected:mutatedRejected,traps:0}};
}
