import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {historyContainerPrefix} from './history-container.mjs';
import {historyContainerEvidence} from './history-container-evidence.mjs';
import {xmlTemplateContainerEvidence} from './xml-template-container-evidence.mjs';
import {historyXmlPayloads} from './history-xml-source.mjs';
import {xmlNamespaceEvidence} from './xml-namespace-evidence.mjs';
import {containerTotals} from './container-report-wire.mjs';
const word=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const envelope=raw=>Buffer.concat([word(raw.length/2),raw]);
const record=(tag,raw)=>Buffer.concat([Buffer.from([tag]),word(raw.length),raw]);
const log=raw=>Buffer.concat([record(16,Buffer.from([0,0,0,0,16,0])),record(48,raw),record(17,Buffer.alloc(0))]);
export function xmlContainerPrefix(o={}){
  return Buffer.concat([Buffer.from([o.enabled??1]),...[o.documents??4096,o.bytes??16777216,o.characters??16777216,o.elements??1000000,o.events??1000000,o.attributes??1000000,o.references??1000000].map(word),Buffer.from([o.template??1]),word(67108864),historyContainerPrefix({mode:o.history??2}),Buffer.from([o.last??1]),word(o.total??67108864)]);
}
function expected(base,model,payloads,o){
  const h=historyContainerEvidence(base,model,{mode:o.history??2,last_document:o.last??1}),t=xmlTemplateContainerEvidence(base,model,o.template??1);
  const root=model.nodes.findIndex(n=>n.parent===0&&n.name==='XMLTemplate');
  const templateStreams=o.template===0?0:model.nodes.filter(n=>root>=0&&n.parent===root&&['_SchemaName','Schema','Instance'].includes(n.name)).length;
  const totals=containerTotals(base),tail=[totals.decoded_bytes+h.decoded+t.decoded,totals.uninspected_streams-h.entries.length-Number(h.lastDocument!=null)-templateStreams];
  if(o.enabled===0)return {wire:Buffer.concat([word(0),...tail.map(word)]),caps:null};
  const selected=payloads.filter(p=>p.kind==='schema'||p.kind==='instance'?o.template!==0:o.history!==0&&(p.kind==='diff'||o.last!==0));
  const sums=Array(13).fill(0);sums[12]=1;
  for(const p of selected){const r=xmlNamespaceEvidence(p.bytes.toString('utf16le'),p.bytes.length).wire;for(let i=0;i<11;i++)sums[i]+=r.readUInt32LE(i*4);sums[11]=Math.max(sums[11],r.readUInt32LE(44));}
  const counts=['schema','instance','diff','last'].map(kind=>selected.filter(p=>p.kind===kind).length);
  return {wire:Buffer.concat([...[1,selected.length,...counts,...sums,...tail].map(word)]),caps:{documents:selected.length,bytes:sums[0],characters:sums[1],events:sums[2],elements:sums[3],attributes:sums[5],references:sums[6],total:tail[0]}};
}
export function xmlContainerEdges(call,cfb){
  let accepted=0,rejected=0;
  const run=(bytes,o={})=>call(125,Buffer.concat([xmlContainerPrefix(o),bytes]));
  const verify=(bytes,model,payloads,o={},limits=false)=>{
    const base=call(25,Buffer.concat([word(67108864),bytes])),want=expected(base,model,payloads,o);
    assert.deepEqual(run(bytes,o),want.wire);accepted++;
    if(limits&&want.caps){assert.deepEqual(run(bytes,{...o,...want.caps}),want.wire);for(const [key,n] of Object.entries(want.caps))if(n){assert.throws(()=>run(bytes,{...o,...want.caps,[key]:n-1}),/LimitExceeded/);rejected++;}}
    return want;
  };
  const file=readFileSync(new URL('../../reference/rhwp/samples/basic/treatise sample.hwp',import.meta.url));cfb.parse(file,{strict:true});
  const original=cfb.document(),real=historyXmlPayloads(cfb).payloads;
  const actual=verify(file,original,real,{},true);
  const root=original.nodes.findIndex(n=>n.parent===0&&n.name==='DocHistory');
  const tinyText=Buffer.from('<r xmlns:p="urn:a" p:a="&amp;"/>','utf16le');
  const templateRoot=original.nodes.length;
  const small={...original,nodes:[...original.nodes.map(n=>n.parent===root&&/^VersionLog[0-9]+$/.test(n.name)?{...n,content:deflateRawSync(log(tinyText))}:n.parent===root&&n.name==='HistoryLastDoc'?{...n,content:deflateRawSync(record(49,tinyText))}:n),{name:'XMLTemplate',kind:1,parent:0},{name:'_SchemaName',kind:2,parent:templateRoot,content:envelope(Buffer.from([0,0xd8]))},{name:'Schema',kind:2,parent:templateRoot,content:envelope(tinyText)},{name:'Instance',kind:2,parent:templateRoot,content:envelope(tinyText)}]};
  const payloads=[...Array.from({length:4},()=>({kind:'diff',bytes:tinyText})),{kind:'last',bytes:tinyText},{kind:'schema',bytes:tinyText},{kind:'instance',bytes:tinyText}];
  const smallBytes=cfb.write(small);verify(smallBytes,small,payloads,{},true);
  const extra={...small,nodes:small.nodes.map(n=>n.parent===templateRoot&&n.name==='Schema'?{...n,content:Buffer.concat([n.content,Buffer.from([255])])}:n)};
  verify(cfb.write(extra),extra,payloads);
  for(const o of [{enabled:0},{template:0},{history:0},{last:0},{template:0,history:0,documents:0,bytes:0}])verify(smallBytes,small,payloads,o);
  const indices=small.nodes.map((n,i)=>[n,i]).filter(([n])=>n.parent===root||n.parent===templateRoot&&n.name!=='_SchemaName');
  for(const [node,index] of indices)for(const text of ['','<r>','<p:r/>','<!DOCTYPE r><r/>','<r>&unknown;</r>','<r/>\0','<?xml version="1.0" encoding="UTF-8"?><r/>']){
    const raw=Buffer.from(text,'utf16le'),content=node.parent===templateRoot?envelope(raw):deflateRawSync(node.name==='HistoryLastDoc'?record(49,raw):log(raw));
    const modified={...small,nodes:small.nodes.map((n,i)=>i===index?{...n,content}:n)},bytes=cfb.write(modified);
    assert.throws(()=>run(bytes));rejected++;
    verify(bytes,modified,payloads,{enabled:0});
    const skip=node.parent===templateRoot?{template:0}:node.name==='HistoryLastDoc'?{last:0}:{history:0};
    verify(bytes,modified,payloads,skip);
    assert.deepEqual(run(smallBytes),expected(call(25,Buffer.concat([word(67108864),smallBytes])),small,payloads,{}).wire);
  }
  for(let end=0;end<xmlContainerPrefix().length;end++){assert.throws(()=>call(125,xmlContainerPrefix().subarray(0,end)),/UnexpectedEnd/);rejected++;}
  return {accepted,rejected,actualXmlDocuments:actual.caps.documents,actualXmlBytes:actual.caps.bytes,actualXmlTemplateSamples:0};
}
