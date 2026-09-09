import assert from 'node:assert/strict';
import {gifOracle,gifWords} from './gif-oracle.mjs';
import {gifFixture,gifControl,gifComment,gifApplication,gifText} from './gif-fixture.mjs';
export function gifInput(raw,{trailing=false,bytes=67108864,blocks=100000,subBlocks=1000000,frames=10000,pixels=268435456,codes=268435456}={}){return Buffer.concat([Buffer.of(Number(trailing)),gifWords([bytes,blocks,subBlocks,frames,pixels,codes]),Buffer.from(raw)]);}
export function gifActual(call,raw,options={}){const expected=gifOracle(raw,options);assert.deepEqual(call(295,gifInput(raw,options)),expected.wire);return expected;}
const reject=(run,pattern)=>assert.throws(run,e=>e?.constructor===Error&&pattern.test(e.message));
export function gifEdges(call){
  let comparisons=0,rejected=0;const check=(raw,options={})=>{const r=gifActual(call,raw,options);comparisons++;return r;};
  const bad=(raw,error,options={})=>{reject(()=>call(295,gifInput(raw,options)),error);rejected++;};
  const ordinary=gifFixture();
  for(const version of [87,89])for(const height of [0,1,2,3,4,5,7,8,9,15,16,17,33])for(const interlace of [false,true])for(const chunk of [1,2,255])check(gifFixture({version,height,interlace,chunk}));
  for(const minimum of [2,3,4,5,6,7,8])for(const chunk of [1,2,3,254,255])for(const repeat of [1,2,5])check(gifFixture({minimum,chunk,repeat,height:17}));
  for(const global of [null,Buffer.from([0,0,0,255,255,255])])for(const local of [null,Buffer.from([255,0,0,0,0,255])])for(const prefix of [gifControl(),Buffer.concat([gifControl(),gifComment(),gifApplication()]),Buffer.concat([gifControl(31),gifComment(),gifText()])])check(gifFixture({global,local,prefix}));
  check(gifFixture({width:0,height:0}));check(gifFixture({repeat:0}));check(gifFixture({codes:[4,0,6,5],width:3,height:1}));check(gifFixture({codes:[0,1,5],width:2,height:1}));
  // All code-width transitions, full-table freeze without clear, then explicit reset.
  for(const minimum of [2,8])for(const clearAtEnd of [false,true]){
    const clear=2**minimum,literals=Array.from({length:10000},(_,i)=>i%2),codes=[clear,...literals,...(clearAtEnd?[clear,1,0]:[]),clear+1];
    const raw=gifFixture({minimum,codes,width:clearAtEnd?10002:10000,height:1,chunk:1});const r=check(raw);assert.equal(r.frames[0].lzw.maximum,12);
  }
  for(let n=0;n<ordinary.length;n++)bad(ordinary.subarray(0,n),/UnexpectedEnd/);
  for(let n=0;n<25;n++){reject(()=>call(295,gifInput(ordinary).subarray(0,n)),/UnexpectedEnd/);rejected++;}
  const mode=gifInput(ordinary);mode[0]=2;reject(()=>call(295,mode),/InvalidMode/);rejected++;
  for(const options of [{bytes:ordinary.length-1},{blocks:1},{subBlocks:0},{frames:0},{pixels:5},{codes:1}])bad(ordinary,/LimitExceeded/,options);
  const output=call(295,gifInput(ordinary));assert.deepEqual(call(295,gifInput(ordinary),output.length),output);comparisons++;reject(()=>call(295,gifInput(ordinary),output.length-1),/LimitExceeded/);rejected++;
  const tail=Buffer.concat([ordinary,Buffer.of(0)]);bad(tail,/TrailingGifBytes/);check(tail,{trailing:true});
  for(const prefix of [Buffer.concat([gifControl(),gifControl()])])bad(gifFixture({prefix}),/DuplicateGifControl/);
  const orphan=Buffer.concat([ordinary.subarray(0,19),gifControl(),Buffer.of(59)]);bad(orphan,/UnconsumedGifControl/);
  bad(gifFixture({version:87,prefix:gifComment()}),/InvalidGifVersionFeature/);
  bad(gifFixture({version:87,aspect:1}),/InvalidGifVersionFeature/);
  bad(gifFixture({left:1}),/InvalidGifImageBounds/);bad(gifFixture({top:1}),/InvalidGifImageBounds/);
  bad(gifFixture({codes:[4,2,5],width:1,height:1}),/InvalidGifPaletteIndex/);
  bad(gifFixture({codes:[4,7,5],width:1,height:1}),/InvalidGifLzwCode/);
  bad(gifFixture({codes:[4,0,5]}),/IncompleteGifPixels/);
  bad(gifFixture({codes:[4,0,6,5],width:1,height:1}),/ExcessGifPixels/);
  bad(gifFixture({codes:[4,0],width:1,height:1}),/MissingGifEndCode/);
  bad(gifFixture({codes:[4,0,5,4,4,4],width:1,height:1}),/TrailingGifLzwBytes/);
  const prefix=gifControl();prefix[3]=224;bad(gifFixture({prefix}),/InvalidGifReservedBits/);
  for(const offset of [2,7]){const prefix=gifControl();prefix[offset]=offset===2?3:1;bad(gifFixture({prefix}),offset===2?/InvalidGifExtensionSize/:/InvalidGifTerminator/);}
  for(const f of [gifApplication,gifText]){const prefix=f();prefix[2]--;bad(gifFixture({prefix}),/InvalidGifExtensionSize/);}
  bad(gifFixture({prefix:Buffer.of(33,2,0)}),/UnsupportedGifExtension/);
  for(const at of [0,4,19,28,29]){const raw=Buffer.from(ordinary);raw[at]=at===4?56:at===28?24:at===29?1:0;bad(raw,at===0?/InvalidGifSignature/:at===4?/UnsupportedGifVersion/:at===19?/InvalidGifBlock/:at===28?/InvalidGifReservedBits/:/InvalidGifCodeSize/);}
  const fuzz=gifFuzz(call);return {comparisons,rejected,fuzz};
}

export function gifFuzz(call){
  const seed=0x47494635;let state=seed;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
  const fixtures=[gifFixture(),gifFixture({interlace:true,prefix:Buffer.concat([gifControl(),gifComment(),gifApplication(),gifText()])})];
  const limits={frames:8,pixels:4096,codes:20000,blocks:100,subBlocks:1000};let accepted=0,rejected=0,recoveries=0;
  const normal=/^(UnexpectedEnd|LimitExceeded|(?:Invalid|Unsupported|Duplicate|Unconsumed|Trailing|Missing|Excess|Incomplete)Gif[A-Za-z]*)$/;
  for(let i=0;i<4000;i++){
    let bytes=Buffer.from(fixtures[random()%fixtures.length]);
    switch(random()%4){case 0: bytes=bytes.subarray(0,random()%(bytes.length+1));break;case 1: bytes[random()%bytes.length]^=1<<(random()%8);break;case 2: bytes[random()%bytes.length]=random()&255;break;case 3: bytes=Buffer.concat([bytes,Buffer.of(random()&255)]);break;}
    let expected;try{expected=gifOracle(bytes,limits);}catch(error){if(!(error instanceof assert.AssertionError))throw error;}
    if(expected){assert.deepEqual(call(295,gifInput(bytes,limits)),expected.wire);accepted++;}
    else{reject(()=>call(295,gifInput(bytes,limits)),normal);rejected++;}
    if(i%64===0){gifActual(call,fixtures[0],limits);recoveries++;}
  }
  return {seed,mutations:4000,accepted,rejected,recoveries,traps:0};
}
