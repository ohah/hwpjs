import assert from 'node:assert/strict';
import {xmlNamePattern} from './xml-reference.mjs';
import {xmlDocumentEvidence} from './xml-document-evidence.mjs';
const xml='http://www.w3.org/XML/1998/namespace',xmlns='http://www.w3.org/2000/xmlns/';
const ncname=s=>assert.ok(!s.includes(':')&&xmlNamePattern.exec(s)?.[0]===s);
const qname=s=>{const parts=s.split(':');assert.ok(parts.length<=2);parts.forEach(ncname);return parts.length===1?['',parts[0]]:parts;};
// Independent copied-Map scopes; product uses a rollback log and hash index.
export function xmlNamespaceEvidence(source,bytes){
  const scopes=[{map:new Map([['xml',xml]]),bindings:0,bytes:0}];let maxBindings=0,maxUriBytes=0;
  const report=xmlDocumentEvidence(source,bytes,{
    pi:ncname,
    tag(tag){
      if(tag.kind===1){scopes.pop();return;}
      const parent=scopes.at(-1),current={map:new Map(parent.map),bindings:parent.bindings,bytes:parent.bytes};
      const attrs=tag.attributeValues.map(a=>({name:qname(a.name),value:a.parts.map(p=>{assert.notEqual(p.kind,3);return String.fromCodePoint(p.value);}).join('')}));
      for(const {name:[prefix,local],value} of attrs){
        if(prefix!=='xmlns'&&(prefix||local!=='xmlns'))continue;
        const binding=prefix?local:'';
        assert.notEqual(binding,'xmlns');assert.notEqual(value,xmlns);assert.equal(binding==='xml',value===xml);assert.ok(!binding||value.length>0);
        current.map.set(binding,value);current.bindings++;current.bytes+=Buffer.byteLength(value);
      }
      maxBindings=Math.max(maxBindings,current.bindings);maxUriBytes=Math.max(maxUriBytes,current.bytes);
      const expand=([prefix,local],attribute)=>{
        assert.notEqual(prefix,'xmlns');if(prefix)assert.ok(current.map.has(prefix));
        return JSON.stringify([prefix?current.map.get(prefix):attribute?'':current.map.get('')??'',local]);
      };
      expand(qname(tag.name),false);const seen=new Set();
      for(const {name} of attrs){if(name[0]==='xmlns'||(!name[0]&&name[1]==='xmlns'))continue;const key=expand(name,true);assert.ok(!seen.has(key));seen.add(key);}
      if(tag.kind===0)scopes.push(current);
    }
  });
  report.wire.writeUInt32LE(1,48);
  return {...report,maxBindings,maxUriBytes};
}
