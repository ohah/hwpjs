import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {historyXmlPayloads} from './history-xml-source.mjs';
const decoders=['utf-8','utf-16le','utf-16be'].map(name=>new TextDecoder(name,{fatal:true,ignoreBOM:true}));
function expected(raw,encoding) {
  const text=decoders[encoding].decode(raw);
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(text))throw Error('forbidden XML character');
  let count=0,hash=2166136261;
  for(const c of text.replace(/\r\n?/g,'\n')){count++;hash=Math.imul(hash^c.codePointAt(0),16777619)>>>0;}
  const out=Buffer.alloc(12);[count,hash,raw.length].forEach((v,i)=>out.writeUInt32LE(v,i*4));return out;
}
function prefix(raw,encoding,maxBytes=raw.length) {
  const p=Buffer.alloc(5);p[0]=encoding;p.writeUInt32LE(maxBytes,1);return Buffer.concat([p,raw]);
}
export function xmlInputEdges(call,cfb) {
  let accepted=0,rejected=0;
  const compare=(raw,encoding)=>{
    let want;try{want=expected(raw,encoding);}catch{assert.throws(()=>call(118,prefix(raw,encoding)));rejected++;return;}
    const before=Buffer.from(raw);assert.deepEqual(call(118,prefix(raw,encoding)),want);assert.deepEqual(raw,before);accepted++;
  };
  for(let n=0;n<65536;n++){
    const raw=Buffer.from([n>>>8,n&255]);
    for(let encoding=0;encoding<3;encoding++)compare(raw,encoding);
  }
  for(let n=0;n<256;n++)compare(Buffer.from([n]),0);
  for(const text of ['','\r','\r\n','\r\r\n','\n\r','\r\u0085\u2028','한글😀\ufeff','\ufeff<x/>&#13;','\ufdd0\u{10ffff}']){
    const utf8=Buffer.from(text),le=Buffer.from(text,'utf16le'),be=Buffer.from(le).swap16();
    [utf8,le,be].forEach((raw,encoding)=>{
      compare(raw,encoding);
      for(let end=0;end<raw.length;end++)compare(raw.subarray(0,end),encoding);
      const count=expected(raw,encoding).readUInt32LE(0);
      assert.deepEqual(call(118,prefix(raw,encoding),count),expected(raw,encoding));
      if(count){assert.throws(()=>call(118,prefix(raw,encoding),count-1),/LimitExceeded/);rejected++;}
      if(raw.length){assert.throws(()=>call(118,prefix(raw,encoding,raw.length-1)),/LimitExceeded/);rejected++;}
    });
  }
  for(const raw of [Buffer.from([0xed,0xa0,0x80]),Buffer.from([0xf4,0x90,0x80,0x80]),Buffer.from([0xe0,0x80,0x80]),Buffer.from([0xf0,0x80,0x80,0x80]),Buffer.from([13,0xff])])compare(raw,0);
  for(let end=0;end<5;end++){assert.throws(()=>call(118,Buffer.alloc(end)),/UnexpectedEnd/);rejected++;}
  assert.throws(()=>call(118,prefix(Buffer.alloc(0),255)),/InvalidXmlEncoding/);rejected++;
  assert.deepEqual(call(118,prefix(Buffer.from('x'),0,0xffffffff),0xffffffff),expected(Buffer.from('x'),0));
  const actual=[];
  cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/basic/treatise sample.hwp',import.meta.url)),{strict:true});
  for(const p of historyXmlPayloads(cfb).payloads){
    compare(p.bytes,1);
    const want=expected(p.bytes,1),count=want.readUInt32LE(0);
    assert.deepEqual(call(118,prefix(p.bytes,1),count),want);
    assert.throws(()=>call(118,prefix(p.bytes,1),count-1),/LimitExceeded/);rejected++;
    actual.push({kind:p.kind,index:p.index,bytes:p.bytes.length,characters:count,hash:want.readUInt32LE(4)});
  }
  compare(Buffer.from('<recovered/>'),0);
  return {accepted,rejected,actual,xmlGrammarValidated:false};
}
