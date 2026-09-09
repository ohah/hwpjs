import assert from 'node:assert/strict';
import {bmpWords} from './bmp-oracle.mjs';
import {bmpFixture} from './bmp-fixture.mjs';
import {bmpRleFixture,rleExample4,rleExample8,rleAbsolute} from './bmp-rle-fixture.mjs';
import {bmpRleOracle} from './bmp-rle-oracle.mjs';
import {expectBmpError as parserError,isBmpOracleRejection} from './bmp-errors.mjs';
export function bmpRleInput(raw,{padding=0,full=false,trailing=false,indices=268435456,commands=1000000,compressed=67108864}={}) {
  return Buffer.concat([Buffer.of(padding,+full,+trailing),bmpWords([indices,commands,compressed]),raw]);
}
export function bmpRleEdges(call) {
  let comparisons=0,rejected=0;
  for(const error of [new WebAssembly.RuntimeError('UnexpectedEnd'),new RangeError('UnexpectedEnd'),new TypeError('UnexpectedEnd')]){
    assert.throws(()=>parserError(()=>{throw error;},/^UnexpectedEnd$/),assert.AssertionError);
  }
  const check=(raw,options={})=>{assert.deepEqual(call(289,bmpRleInput(raw,options)),bmpRleOracle(raw,options));comparisons++;};
  const reject=(raw,pattern,options={},limit=67108864)=>{parserError(()=>call(289,bmpRleInput(raw,options),limit),pattern);rejected++;};
  for(const bits of [4,8]) {
    for(const kind of [40,108,124])check(bmpRleFixture({bits,kind,gap:3,after:5}));
    for(const dx of [0,1,2,127,128,254,255])for(const dy of [0,1,2,127,128,254,255]) {
      check(bmpRleFixture({bits,width:dx+1,height:dy+1,commands:Buffer.of(0,2,dx,dy,1,bits===4?0x30:3,0,1)}));
    }
    check(bmpRleFixture({bits,width:4,height:3,commands:Buffer.of(1,0,0,2,0,1,1,bits===4?0x10:1,0,2,1,1,1,bits===4?0x20:2,0,1)}));
    for(let n=1;n<=255;n++)for(const value of bits===4?[0,1,15,16,171,255]:[0,1,127,255]) {
      const commands=Buffer.from([n,value,0,1]);check(bmpRleFixture({bits,width:n,height:1,commands}),{full:true,indices:n*2,commands:2,compressed:4});
    }
    for(let n=3;n<=255;n++){
      const values=Array.from({length:n},(_,i)=>(i*7+3)%(bits===4?16:256)),absolute=rleAbsolute(bits,values);
      const commands=Buffer.concat([absolute,Buffer.of(0,0,1,0,0,1)]);
      check(bmpRleFixture({bits,width:n,height:2,commands}));
      for(let cut=1;cut<absolute.length;cut++)if(cut<4||cut>=absolute.length-2)reject(bmpRleFixture({bits,width:n,height:1,commands:absolute.subarray(0,cut)}),/UnexpectedEnd/);
    }
    for(const commands of [Buffer.of(0,1),Buffer.of(0,2,0,0,0,1),Buffer.of(0,2,5,1,2,0,0,0,0,1)]) {
      const raw=bmpRleFixture({bits,width:7,height:3,commands});check(raw);reject(raw,/IncompleteBmpRleRaster/,{full:true});
    }
    const example=bits===4?rleExample4:rleExample8;
    for(let cut=1;cut<example.length;cut++)reject(bmpRleFixture({bits,commands:example.subarray(0,cut)}),/UnexpectedEnd|MissingBmpRleEnd/);
    for(const commands of [[2,0,0,1],[0,0,1,0,0,1],[0,0,0,0,0,1],[0,2,2,0,0,1],[0,2,0,1,0,1],[0,0,0,2,0,0,0,1]])reject(bmpRleFixture({bits,width:1,height:1,commands:Buffer.from(commands)}),/InvalidBmpRlePosition/);
    const tail=bmpRleFixture({bits,commands:Buffer.concat([example,Buffer.of(9,7)])});reject(tail,/TrailingBmpRleBytes/);check(tail,{trailing:true});
    const values=bits===4?[1,2,3,4,5]:[1,2,3];
    const pad=bmpRleFixture({bits,width:values.length,height:1,commands:Buffer.concat([rleAbsolute(bits,values,123),Buffer.of(0,1)])});
    reject(pad,/InvalidBmpRlePadding/);check(pad,{padding:1,full:true});
  }
  const raw=bmpRleFixture({bits:8,width:1,height:1,commands:Buffer.of(1,0,0,1)});
  reject(raw,/LimitExceeded/,{indices:1});reject(raw,/LimitExceeded/,{compressed:3});reject(raw,/LimitExceeded/,{commands:1});
  reject(bmpRleFixture({commands:Buffer.of(0,1)}),/LimitExceeded/,{commands:0});
  reject(bmpRleFixture({width:1,height:1,commands:Buffer.of(1,2,0,1),used:2}),/InvalidBmpPaletteIndex/);
  check(bmpRleFixture({bits:4,width:1,height:1,commands:Buffer.of(1,15,0,1),used:1}),{full:true});
  check(bmpRleFixture({bits:4,width:3,height:1,commands:Buffer.of(0,3,0,15,0,1),used:1}),{full:true});
  reject(bmpFixture(),/UnsupportedBmpRleCompression/);
  const top=Buffer.from(raw);top.writeInt32LE(-1,22);reject(top,/InvalidBmpOrientation/);
  const huge=Buffer.from(raw);huge.writeInt32LE(2147483647,18);reject(huge,/LimitExceeded/);
  const big=bmpRleFixture({bits:4,width:255,height:3,commands:Buffer.of(255,0,0,0,255,0,0,0,255,0,0,1)}),length=bmpRleOracle(big).length;
  assert.ok(bmpRleInput(big).length<length-1);reject(big,/LimitExceeded/,{},length-1);
  for(const at of [0,1,2]){const input=bmpRleInput(raw);input[at]=2;parserError(()=>call(289,input),/InvalidMode/);rejected++;}
  for(let n=0;n<15;n++){parserError(()=>call(289,bmpRleInput(raw).subarray(0,n)),/UnexpectedEnd/);rejected++;}
  return {comparisons,rejected,errorClassGuards:3,mutations:mutationChecks(call)};
}

function mutationChecks(call) {
  let state=0x43524c45,accepted=0,rejected=0,recoveries=0;
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
  for(const bits of [4,8]){
    const original=bmpRleFixture({bits}),offset=original.readUInt32LE(10),size=original.readUInt32LE(34);
    for(let i=0;i<1500;i++){
      const raw=Buffer.from(original);raw[offset+random()%size]^=1+random()%255;
      let expected;try{expected=bmpRleOracle(raw);}catch(error){
        if(!isBmpOracleRejection(error))throw error;
      }
      if(expected){assert.deepEqual(call(289,bmpRleInput(raw)),expected);accepted++;}
      else{parserError(()=>call(289,bmpRleInput(raw)),/^(UnexpectedEnd|MissingBmpRleEnd|TrailingBmpRleBytes|InvalidBmpRlePadding|InvalidBmpRlePosition|InvalidBmpPaletteIndex)$/);rejected++;}
      if(i%64===0){assert.deepEqual(call(289,bmpRleInput(original)),bmpRleOracle(original));recoveries++;}
    }
  }
  return {seed:0x43524c45,cases:3000,accepted,rejected,recoveries,traps:0};
}
