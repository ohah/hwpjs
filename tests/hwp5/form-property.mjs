import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {documentRecords} from './documents.mjs';
const wide=s=>Buffer.from(s,'utf16le');
const word=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const input=(bytes,o={})=>Buffer.concat([word(o.nodes??100000),word(o.depth??64),bytes]);
const kind={set:0,wstring:1,int:2,bool:3};
function evidence(bytes) {
  assert.equal(bytes.length%2,0);
  const text=bytes.toString('utf16le'),rows=[];let maxDepth=0;
  function scope(begin,end,parent,depth) {
    let at=begin;
    while(at<end) {
      while(at<end&&text[at]===' ')at++;
      if(at===end)break;
      const start=at,m=/^([^\x00-\x20:]+):(set|wstring|int|bool):/.exec(text.slice(at,end));assert.ok(m);
      at+=m[0].length;let valueStart=at,valueEnd;
      if(m[2]==='set'||m[2]==='wstring') {
        const length=/^([0-9]+):/.exec(text.slice(at,end));assert.ok(length);
        const n=Number(length[1]);assert.ok(Number.isSafeInteger(n));at+=length[0].length;
        valueStart=at;valueEnd=at+n;assert.ok(valueEnd<=end);
      }else{const number=/^-?[0-9]+/.exec(text.slice(at,end));assert.ok(number);valueEnd=at+number[0].length;}
      at=valueEnd;assert.ok(at===end||text[at]===' ');
      const index=rows.length,row={parent,end:index+1,kind:kind[m[2]],start:start*2,raw:(at-start)*2,key:wide(m[1]),valueStart:valueStart*2,value:bytes.subarray(valueStart*2,valueEnd*2)};
      rows.push(row);
      if(m[2]==='set'){maxDepth=Math.max(maxDepth,depth+1);scope(valueStart,valueEnd,index,depth+1);row.end=rows.length;}
    }
  }
  scope(0,text.length,null,0);
  return {rows,maxDepth,wire:Buffer.concat([word(rows.length),...rows.map(r=>Buffer.concat([word(r.parent??0xffffffff),word(r.end),word(r.kind),word(r.start),word(r.raw),word(r.key.length),word(r.valueStart),word(r.value.length),r.key,...(r.kind===0?[]:[r.value])]))])};
}
const set=(key,body)=>`${key}:set:${body.length}:${body}`;
const string=(key,value)=>`${key}:wstring:${value.length}:${value}`;
export function formPropertyEdges(call) {
  let accepted=0,rejected=0;
  const check=(s,o={},limit=67108864)=>{const b=typeof s==='string'?wide(s):s,before=Buffer.from(b);assert.deepEqual(call(105,input(b,o),limit),evidence(b).wire);assert.deepEqual(b,before);accepted++;};
  const bad=(s,error,o={},limit=67108864)=>{const b=typeof s==='string'?wide(s):s;assert.throws(()=>call(105,input(b,o),limit),error);rejected++;};
  const valid=['','  ','A:int:0 B:bool:-1 C:int:4294967295 D:int:0001 E:int:184467440737095516160000',string('한글','😀 :\0\ud800\r'),set('G','A:int:1 '+string('B','x y')+' ')+' C:bool:2 ',set('X',set('Y','A:int:-000 '))+' A:wstring:0: A:wstring:1:Z'];
  for(const s of valid) {
    check(s);const b=wide(s),e=evidence(b);
    check(s,{nodes:e.rows.length,depth:e.maxDepth},b.length);
    if(e.rows.length)bad(s,/FormPropertyNodeLimit/,{nodes:e.rows.length-1});
    if(e.maxDepth)bad(s,/FormPropertyDepthLimit/,{depth:e.maxDepth-1});
    if(b.length)bad(s,/FormPropertyInputLimit/,{},b.length-1);
    check(s);
  }
  for(const s of ['A','A:','A::1',':int:1','A:other:1','A:int:','A:int:-','A:int:+1','A:int:1x','A:bool:true','A:wstring::','A:wstring:-1:x','A:wstring:2:x','A:wstring:0:B:int:1','A:set:6:A:int: 1','A:int:1\t','A:wstring:9999999999999999999999999999:x']) {
    bad(s,/InvalidFormProperty|UnexpectedEnd|UnsupportedFormPropertyType|FormPropertyLengthOverflow/);check('X:int:7');
  }
  bad(Buffer.from([65]),/InvalidFormPropertyEncoding/);
  bad('A:wstring:4294967296:x',/UnexpectedEnd/);
  bad('A:wstring:18446744073709551615:x',/UnexpectedEnd/);
  bad('A:wstring:18446744073709551616:x',/FormPropertyLengthOverflow/);
  check('A:wstring:000000000000000000000000000001:X');
  // Every prefix is independently classified: some are valid complete scopes,
  // not malformed merely because they are shorter than the original input.
  const fixture=wide(valid[4]);
  for(let n=0;n<fixture.length;n++) {
    const b=fixture.subarray(0,n);let e;try{e=evidence(b);}catch{}
    if(e)check(b);else bad(b,/InvalidFormProperty|UnexpectedEnd|UnsupportedFormPropertyType/);
  }
  for(let n=0;n<=128;n++) {
    const s=string('S',('😀 :\0').repeat(n));check(s);
    if(n)bad(s.slice(0,-1),/UnexpectedEnd/);
  }
  let deep='A:int:1 ';for(let n=0;n<256;n++)deep=set('G',deep);
  check(deep,{depth:256});bad(deep,/FormPropertyDepthLimit/);bad(deep,/FormPropertyDepthLimit/,{depth:255});check(deep,{depth:256});
  const many='A:int:1 '.repeat(100000);check(many);bad(many+'A:int:1',/FormPropertyNodeLimit/);check(many);
  return {accepted,rejected,depth:256};
}
export function formPropertyActual(call,cfb) {
  const results=[];
  for(const name of ['form-01.hwp','form-02.hwp']) {
    cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url)),{strict:true});
    const bytes=inflateRawSync(cfb.findExact('/BodyText/Section0').content),records=documentRecords(bytes).filter(r=>r.tag===91);
    let nodes=0,sets=0,acceptedPrefixes=0,rejectedPrefixes=0;
    const captions=[];
    for(const rec of records) {
      const payload=bytes.subarray(rec.start,rec.end),b=payload.subarray(14,14+payload.readUInt16LE(12)*2),e=evidence(b);
      assert.deepEqual(call(105,input(b,{nodes:e.rows.length,depth:e.maxDepth}),b.length),e.wire);
      nodes+=e.rows.length;sets+=e.rows.filter(r=>r.kind===0).length;
      for(const r of e.rows)if(r.key.toString('utf16le')==='Caption')captions.push(r.value.toString('utf16le'));
      for(let n=0;n<b.length;n++) {
        const part=b.subarray(0,n);let expected;try{expected=evidence(part);}catch{}
        if(expected){assert.deepEqual(call(105,input(part)),expected.wire);acceptedPrefixes++;}
        else{assert.throws(()=>call(105,input(part)),/InvalidFormProperty|UnexpectedEnd|UnsupportedFormPropertyType/);rejectedPrefixes++;}
      }
      assert.throws(()=>call(105,input(b,{nodes:e.rows.length-1})),/FormPropertyNodeLimit/);
      assert.deepEqual(call(105,input(b)),e.wire);
    }
    assert.equal(records.length,5);assert.equal(sets,15);assert.equal(nodes,118);
    assert.equal(acceptedPrefixes,30);assert.equal(rejectedPrefixes,name==='form-01.hwp'?4276:4268);
    assert.deepEqual(captions,['명령 단추','선택 상자','라디오 단추']);
    results.push({name,forms:records.length,nodes,sets,acceptedPrefixes,rejectedPrefixes,captions});
  }
  return results;
}
