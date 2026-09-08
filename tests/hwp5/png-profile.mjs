import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {png,pngChunk as chunk,pngHeader as header} from './png-structure-evidence.mjs';
export function profileInput(bytes, payload = 67108864, decoded = 67108864, tags = 100000) {
  const prefix=Buffer.alloc(12);[payload,decoded,tags].forEach((v,i)=>prefix.writeUInt32BE(v,4*i));return Buffer.concat([prefix,bytes]);
}
export function profileFixture(space='RGB ',major=4,tag=false) {
  const b=Buffer.alloc(tag?152:132);b.writeUInt32BE(b.length);b[8]=major;b.write(space,16);b.write('acsp',36);
  if(tag){b.writeUInt32BE(1,128);b.write('test',132);b.writeUInt32BE(144,136);b.writeUInt32BE(8,140);b.write('test',144);}
  return b;
}
export const profilePayload=raw=>Buffer.concat([Buffer.from([80,0,0]),deflateSync(raw)]);
export function profilePng(color, payloads=[], position='early', srgb=false) {
  const h=chunk('IHDR',header(8,color)),pal=color===3?[chunk('PLTE',Buffer.from([0,0,0]))]:[];
  const id=chunk('IDAT',deflateSync(Buffer.alloc(1+({0:1,2:3,3:1,4:2,6:4})[color]))),end=chunk('IEND');
  const profiles=payloads.map(p=>chunk('iCCP',p));
  return png(h,...(srgb?[chunk('sRGB',Buffer.from([0]))]:[]),...(position==='early'?profiles:[]),...pal,...(position==='palette'?profiles:[]),id,...(position==='data'?profiles:[]),end);
}
export function pngProfileEdges(call) {
  let accepted=0,rejected=0;
  const reject=(b,re,limit)=>{assert.throws(()=>call(239,b,limit),re);rejected++;};
  function check(color,major,tag,srgb=false) {
    const space=color===0||color===4?'GRAY':'RGB ',raw=profileFixture(space,major,tag),payload=profilePayload(raw);
    const bytes=profilePng(color,[payload],'early',srgb),input=profileInput(bytes,payload.length,raw.length,tag?1:0);
    const out=call(239,input);assert.equal(out.length,48);
    const expected=[1,raw.length,Number(tag),major,Buffer.from(space).readUInt32BE(),1,0,0,0,1,1,payload.length];
    expected.forEach((v,i)=>assert.equal(out.readUInt32LE(4*i),v));accepted++;
    reject(profileInput(bytes,payload.length-1,raw.length,10),/LimitExceeded/);
    reject(profileInput(bytes,payload.length,raw.length-1,10),/LimitExceeded/);
    if(tag)reject(profileInput(bytes,payload.length,raw.length,0),/LimitExceeded/);
    return {input,bytes,payload};
  }
  for(const color of [0,2,3,4,6])for(const major of [2,4])for(const tag of [false,true])for(const srgb of [false,true])check(color,major,tag,srgb);
  for(const color of [0,2,3,4,6])for(const space of ['RGB ','GRAY','CMYK']) {
    if(space===(color===0||color===4?'GRAY':'RGB '))continue;
    reject(profileInput(profilePng(color,[profilePayload(profileFixture(space))])),/InvalidPngProfileColorSpace/);
  }
  const good=check(3,4,true);
  reject(profileInput(profilePng(3,[good.payload,good.payload])),/DuplicatePngProfile/);
  for(const position of ['palette','data'])reject(profileInput(profilePng(3,[good.payload],position)),/InvalidPngProfileOrder/);
  for(const raw of [Buffer.alloc(0),Buffer.from('not ICC')])reject(profileInput(profilePng(2,[profilePayload(raw)])),/InvalidIccProfileSize/);
  for(const offset of [0,36,136,140,148]) {
    const raw=profileFixture('RGB ',4,true);raw[offset]^=255;
    reject(profileInput(profilePng(2,[profilePayload(raw)])),/InvalidIcc/);
  }
  const corrupt=Buffer.from(good.payload);corrupt[corrupt.length-1]^=1;
  reject(profileInput(profilePng(3,[corrupt])),/Adler|Checksum/);
  reject(profileInput(profilePng(3,[Buffer.concat([good.payload,Buffer.from([0])])])),/TrailingData/);
  for(let n=0;n<good.input.length;n++)reject(good.input.subarray(0,n),/Invalid|Missing|Truncated|EndOfStream|UnexpectedEnd/);
  reject(good.input,/LimitExceeded/,good.input.length-1);
  const absent=call(239,profileInput(profilePng(2)));assert.deepEqual(absent,Buffer.alloc(48));accepted++;
  check(3,4,true);
  return {accepted,rejected};
}
