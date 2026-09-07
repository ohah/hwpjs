import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {deflateSync,deflateRawSync,gzipSync} from 'node:zlib';
import {signature,png,pngChunk as chunk,pngHeader as header,pngStructureEvidence} from './png-structure-evidence.mjs';
import {internationalWire} from './png-international-evidence.mjs';
import {pngPixelsEvidence} from './png-pixels-evidence.mjs';
import {transparencyEvidence} from './png-transparency-evidence.mjs';
import {compressedTextWire} from './png-compressed-text-evidence.mjs';
export function pngInternationalEdges(call,cfb){
  let accepted=0,rejected=0,mutations=0,actualPng=0,actualInternational=0;
  const hd=chunk('IHDR',header(8,0)),id=chunk('IDAT',deflateSync(Buffer.from([0,0]))),end=chunk('IEND');
  const payload=(body,{flag=0,method=0,language='',translated='',key='K',raw=false}={})=>Buffer.concat([Buffer.from(key),Buffer.from([0,flag,method]),Buffer.from(language),Buffer.from([0]),Buffer.from(translated),Buffer.from([0]),flag===1&&!raw?deflateSync(Buffer.from(body)):Buffer.from(body)]);
  const wrap=p=>png(hd,chunk('iTXt',p),id,end);
  const check=(bytes,maxText=64*1024*1024,maxLanguage=4096,maxSubtags=512)=>{
    const prefix=Buffer.alloc(12);[maxText,maxLanguage,maxSubtags].forEach((v,i)=>prefix.writeUInt32LE(v,i*4));const input=Buffer.concat([prefix,bytes]);
    let expected;try{expected=internationalWire(pngStructureEvidence(bytes),maxText,maxLanguage,maxSubtags);}catch{}
    if(expected){assert.deepEqual(call(139,input,bytes.length),expected);accepted++;}
    else{assert.throws(()=>call(139,input,bytes.length),e=>!(e instanceof WebAssembly.RuntimeError));rejected++;}
    return expected;
  };
  for(let flag=0;flag<256;flag++)for(const method of [0,255])check(wrap(payload('ABC',{flag,method})));
  for(let method=0;method<256;method++)assert.ok(check(wrap(payload('ABC',{method}))));
  for(const flag of [0,1])for(const language of ['', 'ko-KR','en-GB','es-419','zh-Hans-CN','tlh-Cyrl-AQ','ar-AE-u-nu-latn','x-private','i-klingon'])for(const translated of ['', '번역','é😀','\n\t'])for(const body of ['', '한글😀','\ufeff\uffff','\r\n\t\u0080'])assert.ok(check(wrap(payload(body,{flag,language,translated}))));
  for(const value of [0,1,9,10,11,31,32,127,128,159,160,0x7ff,0x800,0xd7ff,0xe000,0xffff,0x10000,0x10ffff])for(const flag of [0,1])check(wrap(payload(String.fromCodePoint(value),{flag})));
  for(const raw of [Buffer.from([0x80]),Buffer.from([0xc0,0x80]),Buffer.from([0xed,0xa0,0x80]),Buffer.from([0xf4,0x90,0x80,0x80]),Buffer.from([0xf0,0x9f]),Buffer.from([0xff])])for(const flag of [0,1]){assert.equal(check(wrap(payload(raw,{flag}))),undefined);assert.equal(check(wrap(payload('',{flag,translated:raw}))),undefined);}
  for(const language of ['en-cmn','zzzz','en-abcde','en--US','en-u-ca-u-nu'])assert.equal(check(wrap(payload('',{language}))),undefined);
  for(const base of [payload('한글',{language:'ko-KR',translated:'번역'}),payload('ABC',{flag:1}),payload('')]){
    for(let length=0;length<base.length;length++)check(wrap(base.subarray(0,length)));
    for(let pos=0;pos<base.length;pos++)for(let b=0;b<256;b++){const raw=Buffer.from(base);raw[pos]=b;check(wrap(raw));mutations++;}
  }
  const compressed=deflateSync(Buffer.from('ABC'));
  for(const raw of [Buffer.concat([compressed,compressed]),Buffer.concat([compressed,Buffer.from([0])]),gzipSync(Buffer.from('ABC')),deflateRawSync(Buffer.from('ABC')),deflateSync(Buffer.from('ABC'),{dictionary:Buffer.from('ABC')})])assert.equal(check(wrap(payload(raw,{flag:1,raw:true}))),undefined);
  const parts=[chunk('tEXt',Buffer.from('K\0AB')),chunk('zTXt',Buffer.concat([Buffer.from('K\0\0'),deflateSync(Buffer.from('ABC'))])),chunk('iTXt',payload('한',{flag:1,language:'ko'}))];
  for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){const bytes=png(hd,...order.map(i=>parts[i]),id,end);assert.ok(check(bytes,8));assert.equal(check(bytes,7),undefined);const p=pngPixelsEvidence(bytes),limit=Buffer.alloc(4);limit.writeUInt32LE(p.decoded.length);assert.deepEqual(call(130,Buffer.concat([limit,bytes])),p.wire);
    const s=pngStructureEvidence(bytes),t=transparencyEvidence(s);limit.writeUInt32LE(8);assert.deepEqual(call(136,Buffer.concat([limit,bytes])),compressedTextWire(s,t,8));limit.writeUInt32LE(7);assert.throws(()=>compressedTextWire(s,t,7));assert.throws(()=>call(136,Buffer.concat([limit,bytes])),/LimitExceeded/);
  }
  for(const flag of [0,1]){assert.ok(check(wrap(payload('',{flag})),0));assert.equal(check(wrap(payload('A',{flag})),0),undefined);}
  const long='x-'+Array(4095).fill('a').join('-');assert.equal(check(wrap(payload('',{language:long}))),undefined);assert.ok(check(wrap(payload('',{language:long})),0,long.length,4096));assert.equal(check(wrap(payload('',{language:'en'})),0,1),undefined);
  const large=wrap(payload('A'.repeat(1024*1024),{flag:1}));assert.ok(check(large,1024*1024));assert.equal(check(large,1024*1024-1),undefined);
  const valid=payload('hello',{language:'en'});assert.ok(check(png(hd,id,chunk('iTXt',valid),end)));assert.equal(check(png(hd,id,chunk('iTXt',valid),chunk('IDAT'),end)),undefined);
  const dir=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.hwp'))){cfb.parse(readFileSync(new URL(name,dir)),{strict:true});const entry=cfb.findExact('/PrvImage');if(!entry)continue;const bytes=Buffer.from(entry.content);if(!bytes.subarray(0,8).equals(signature))continue;const result=check(bytes);assert.ok(result);actualPng++;actualInternational+=result.readUInt32LE(0);}
  assert.ok(check(wrap(payload('recovery'))));return {accepted,rejected,mutations,actualPng,actualInternational};
}
