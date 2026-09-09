import assert from 'node:assert/strict';
import {bmpWords} from './bmp-oracle.mjs';
import {bmpFixture} from './bmp-fixture.mjs';
import {bmpRleFixture,rleAbsolute} from './bmp-rle-fixture.mjs';
import {bmpRleRgbaOracle} from './bmp-rle-rgba-oracle.mjs';
import {expectBmpError,isBmpOracleRejection} from './bmp-errors.mjs';
export function bmpRleSelection({rleEnabled=1,fill=2,padding=0,full=false,trailing=false,indices=268435456,commands=1000000,compressed=67108864}={}) {
  return Buffer.concat([Buffer.of(rleEnabled,fill,padding,+full,+trailing),bmpWords([indices,commands,compressed])]);
}
export function bmpRleRgbaInput(raw,options={}) {return Buffer.concat([bmpRleSelection(options),bmpWords([options.rgba??268435456]),raw]);}
export function bmpRleRgbaEdges(call) {
  let comparisons=0,rejected=0;
  const check=(raw,options={})=>{assert.deepEqual(call(290,bmpRleRgbaInput(raw,options)),bmpRleRgbaOracle(raw,options));comparisons++;};
  const reject=(raw,pattern,options={},limit=67108864)=>{expectBmpError(()=>call(290,bmpRleRgbaInput(raw,options),limit),pattern);rejected++;};
  for(const bits of [4,8]) {
    for(const kind of [40,108,124])for(const fill of [1,2])check(bmpRleFixture({bits,kind}),{fill});
    const partial=bmpRleFixture({bits});reject(partial,/UnwrittenBmpRlePixels/,{fill:0});reject(partial,/IncompleteBmpRleRaster/,{full:true});reject(partial,/UnsupportedBmpPixelCompression/,{rleEnabled:0});
    for(const count of [1,2,3,15,16,17,127,128,254,255])for(const fill of [0,1,2]){
      const commands=Buffer.of(count,0xab,0,1),raw=bmpRleFixture({bits,width:count,height:1,commands});
      check(raw,{fill,full:true,rgba:count*4,indices:count*2});reject(raw,/LimitExceeded/,{rgba:count*4-1});reject(raw,/LimitExceeded/,{indices:count*2-1});
    }
    for(const length of [3,4,5,6,7,15,16,17,254,255])for(const fill of [1,2]) {
      const values=Array.from({length},(_,i)=>(i*13+7)%(bits===4?16:256));
      check(bmpRleFixture({bits,width:length+2,height:2,commands:Buffer.concat([rleAbsolute(bits,values),Buffer.of(0,1)])}),{fill});
    }
    for(const dx of [0,1,127,128,255])for(const dy of [0,1,127,128,255])for(const fill of [1,2])check(bmpRleFixture({bits,width:dx+1,height:dy+1,commands:Buffer.of(0,2,dx,dy,1,0,0,1)}),{fill});
    const commands=Buffer.concat([rleAbsolute(bits,bits===4?[1,2,3,4,5]:[1,2,3],123),Buffer.of(0,1,99)]),raw=bmpRleFixture({bits,width:5,height:2,commands});
    reject(raw,/InvalidBmpRlePadding/);reject(raw,/TrailingBmpRleBytes/,{padding:1});check(raw,{padding:1,trailing:true});
  }
  check(bmpFixture());check(bmpFixture(),{rleEnabled:0});
  for(const compression of [4,5])reject(bmpFixture({bits:0,compression}),/UnsupportedBmpPixelCompression/);
  const raw=bmpRleFixture({width:1,height:1,commands:Buffer.of(1,0,0,1)});
  reject(raw,/LimitExceeded/,{commands:1});reject(raw,/LimitExceeded/,{compressed:3});
  for(const at of [0,1,2,3,4]){const input=bmpRleRgbaInput(raw);input[at]=at===1?3:2;expectBmpError(()=>call(290,input),/InvalidMode/);rejected++;}
  for(let n=0;n<21;n++){expectBmpError(()=>call(290,bmpRleRgbaInput(raw).subarray(0,n)),/UnexpectedEnd/);rejected++;}
  const big=bmpRleFixture({bits:4,width:255,height:3,commands:Buffer.of(255,0,0,0,255,0,0,0,255,0,0,1)}),size=bmpRleRgbaOracle(big).length;
  assert.ok(bmpRleRgbaInput(big).length<size-1);reject(big,/LimitExceeded/,{},size-1);
  let state=0x52474241,accepted=0,mutantRejected=0;
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
  for(const bits of [4,8]){
    const base=bmpRleFixture({bits}),offset=base.readUInt32LE(10),length=base.readUInt32LE(34);
    for(let i=0;i<1000;i++) {
      const raw=Buffer.from(base);raw[offset+random()%length]^=1+random()%255;
      const options={fill:i%3,full:i%7===0};let expected;
      try{expected=bmpRleRgbaOracle(raw,options);}catch(error){if(!isBmpOracleRejection(error))throw error;}
      if(expected){assert.deepEqual(call(290,bmpRleRgbaInput(raw,options)),expected);accepted++;}
      else{expectBmpError(()=>call(290,bmpRleRgbaInput(raw,options)),/^(UnexpectedEnd|MissingBmpRleEnd|TrailingBmpRleBytes|InvalidBmpRlePadding|InvalidBmpRlePosition|InvalidBmpPaletteIndex|UnwrittenBmpRlePixels|IncompleteBmpRleRaster)$/);mutantRejected++;}
    }
  }
  return {comparisons,rejected,mutations:{seed:0x52474241,cases:2000,accepted,rejected:mutantRejected,traps:0}};
}
