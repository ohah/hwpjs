import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync,crc32} from 'node:zlib';
import {prepareXml,queryXml,inspectXml} from './history-xml-query.mjs';
import {decodeObservedHistory,historyXmlPayloads} from './history-xml-source.mjs';
const bytes=s=>Buffer.from(s,'utf16le');
test('XML evidence guards encoding and byte limits before starting any process',()=>{
  const raw=bytes('<x/>'),before=Buffer.from(raw);let calls=0;
  const run=()=>{calls++;return {status:0,stdout:Buffer.from('ok')};};
  assert.equal(queryXml(raw,'name(/*)',{maxBytes:raw.length,run}),'ok');assert.equal(calls,1);
  for(const b of [raw.subarray(0,raw.length-1),bytes('\ud800'),bytes('\udc00')])assert.throws(()=>queryXml(b,'x',{run}),/InvalidXmlUtf16/);
  assert.throws(()=>queryXml(raw,'x',{maxBytes:raw.length-1,run}),/XmlByteLimitExceeded/);
  assert.equal(calls,1);assert.deepEqual(raw,before);
  assert.deepEqual(prepareXml(bytes('\ufeff<x/>')),bytes('\ufeff<x/>'));
  assert.deepEqual(prepareXml(bytes('<x>😀</x>')),bytes('\ufeff<x>😀</x>'));
});
test('DOCTYPE is deferred even in comments and cannot start local or network entity resolution',()=>{
  for(const s of ['<!DOCTYPE x SYSTEM "file:///not-read"><x/>','<!DOCTYPE x SYSTEM "https://invalid.invalid/x"><x/>','<!DOCTYPE x [<!ENTITY a "x">]><x>&a;</x>','<x><![CDATA[<!DOCTYPE]]></x>','<!-- <!DOCTYPE x> --><x/>'])assert.throws(()=>queryXml(bytes(s),'x',{run:()=>assert.fail('must not spawn')}),/XmlDoctypeDeferred/);
});
test('XML evidence pins non-network stdin arguments, output bounds and timeout',()=>{
  const raw=bytes('<x/>');let invocation;
  assert.equal(queryXml(raw,'name(/*)',{maxOutput:32,timeoutMs:123,run:(...args)=>{invocation=args;return {status:0,stdout:Buffer.from('x\n')};}}),'x');
  assert.deepEqual(invocation.slice(0,2),['xmllint',['--nonet','--xpath','name(/*)','-']]);
  assert.equal(invocation[2].timeout,123);assert.equal(invocation[2].maxBuffer,32);assert.equal(invocation[2].shell,undefined);assert.deepEqual(invocation[2].input,bytes('\ufeff<x/>'));
  for(const result of [{status:1},{status:0,error:{code:'ENOBUFS'}},{status:null,signal:'SIGTERM'},{status:null,error:{code:'ENOENT'}}])assert.throws(()=>queryXml(raw,'x',{run:()=>({...result,stderr:Buffer.from('private document text')})}),/^Error: XmlProcessFailed$/);
  assert.throws(()=>queryXml(raw,'x',{maxOutput:1,run:()=>({status:0,stdout:Buffer.from('xx')})}),/XmlOutputLimitExceeded/);
});
test('XML evidence rejects malformed process outputs and invalid resource options',()=>{
  assert.throws(()=>queryXml(bytes('<p:x/>'),'name(/*)',{run:()=>({status:0,stdout:Buffer.from('p:x'),stderr:Buffer.from('namespace error : Namespace prefix p on x is not defined')})}),/^Error: XmlProcessDiagnostic$/);
  for(const stderr of [Buffer.from('namespace warning : relative URI'),Buffer.from('private document text'),'unexpected text type'])assert.throws(()=>queryXml(bytes('<x/>'),'name(/*)',{run:()=>({status:0,stdout:Buffer.from('x'),stderr})}),/^Error: XmlProcessDiagnostic$/);
  assert.equal(queryXml(bytes('<x/>'),'name(/*)',{run:()=>({status:0,stdout:Buffer.from('x'),stderr:Buffer.alloc(0)})}),'x');
  for(const value of ['','HMLDIFF|1','HMLDIFF|-1|0|0|0|0|0|0','HMLDIFF|9007199254740992|0|0|0|0|0|0'])assert.throws(()=>inspectXml(bytes('<x/>'),{run:()=>({status:0,stdout:Buffer.from(value)})}),/InvalidXmlEvidenceOutput/);
  const actual=inspectXml(bytes('<x/>'),{run:()=>({status:0,stdout:Buffer.from('HMLDIFF|1|0|0|0|0|0|0')})});assert.deepEqual(actual,{root:'HMLDIFF',elements:1,pathAttributes:0,updateElements:0,positionElements:0,deleteElements:0,insertElements:0,oldAttributes:0});
  assert.equal(inspectXml(bytes('<x/>'),{run:()=>({status:0,stdout:Buffer.from('한글:문서|1|0|0|0|0|0|0')})}).root,'한글:문서');
  for(const n of [-1,NaN,Infinity,1.5]){assert.throws(()=>prepareXml(bytes('<x/>'),n),/Invalid XML byte limit/);assert.throws(()=>queryXml(bytes('<x/>'),'x',{timeoutMs:n}),/Invalid XML process limits/);assert.throws(()=>queryXml(bytes('<x/>'),'x',{maxOutput:n}),/Invalid XML process limits/);}
});
test('history research decode enforces aggregate-compatible byte limits and CRC/size tails',()=>{
  const plain=Buffer.from('known fixture payload'),raw=deflateRawSync(plain),tail=Buffer.alloc(8);tail.writeUInt32LE(crc32(plain),0);tail.writeUInt32LE(plain.length,4);
  assert.deepEqual(decodeObservedHistory(raw,plain.length),plain);assert.deepEqual(decodeObservedHistory(Buffer.concat([raw,tail]),plain.length),plain);
  assert.throws(()=>decodeObservedHistory(raw,plain.length-1));
  for(const bad of [Buffer.from([1]),Buffer.alloc(7),Buffer.alloc(9),Buffer.alloc(8)])assert.throws(()=>decodeObservedHistory(Buffer.concat([raw,bad]),plain.length),/InvalidHistoryCompressionTrailer/);
  const wrongSize=Buffer.from(tail);wrongSize.writeUInt32LE(plain.length-1,4);assert.throws(()=>decodeObservedHistory(Buffer.concat([raw,wrongSize]),plain.length),/InvalidHistoryCompressionTrailer/);
});
test('history XML source uses public entry type and one shared decoded-byte budget',()=>{
  const record=(tag,b)=>{const h=Buffer.alloc(5);h[0]=tag;h.writeUInt32LE(b.length,1);return Buffer.concat([h,b]);};
  const log=Buffer.concat([record(16,Buffer.from([0,0,0,0,16,0])),record(48,bytes('<HMLDIFF/>')),record(17,Buffer.alloc(0))]),last=record(49,bytes('<HWPML/>'));
  const total=log.length*4+last.length,cfb={findExact:path=>({type:2,content:deflateRawSync(path.endsWith('HistoryLastDoc')?last:log)})};
  const result=historyXmlPayloads(cfb,total);assert.equal(result.decodedBytes,total);assert.equal(result.payloads.length,5);assert.deepEqual(result.payloads.at(-1).bytes,bytes('<HWPML/>'));
  assert.throws(()=>historyXmlPayloads(cfb,total-1));
  assert.throws(()=>historyXmlPayloads({findExact:()=>null}),/Missing expected history stream/);
  assert.throws(()=>historyXmlPayloads({findExact:()=>({type:1})}),/Expected history stream/);
});
