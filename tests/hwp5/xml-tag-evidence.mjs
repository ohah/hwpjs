import assert from 'node:assert/strict';
import {xmlNamePattern,xmlReferenceExpected} from './xml-reference.mjs';
export const xmlEncode=(text,e)=>e===0?Buffer.from(text):e===1?Buffer.from(text,'utf16le'):Buffer.from(text,'utf16le').swap16();
const words=(...values)=>{const out=Buffer.alloc(values.length*4);values.forEach((v,i)=>out.writeUInt32LE(v,i*4));return out;};
export function xmlTagEvidence(source,e,limit=67108864){
  let at=0,kind=0,references=0,unresolved=0;const attrs=[],seen=new Set();
  const eat=c=>{assert.equal(source[at++],c);};
  const space=()=>{const before=at;while(at<source.length&&/[ \t\r\n]/.test(source[at]))at++;return at!==before;};
  const name=()=>{const n=xmlNamePattern.exec(source.slice(at))?.[0];assert.ok(n);at+=n.length;return n;};
  eat('<');if(source[at]==='/'){at++;kind=1;}const tagName=name();
  while(true){
    const separated=space();assert.ok(at<source.length);
    if(source[at]==='>'){at++;break;}
    assert.notEqual(kind,1);
    if(source[at]==='/'){at++;eat('>');kind=2;break;}
    assert.ok(separated);const n=name();assert.ok(!seen.has(n));seen.add(n);space();eat('=');space();
    const start=at,quote=source[at++];assert.ok(quote==='"'||quote==="'");const parts=[];
    while(true){
      assert.ok(at<source.length);if(source[at]===quote){at++;break;}
      assert.notEqual(source[at],'<');
      if(source[at]==='&'){const ref=xmlReferenceExpected(source.slice(at));at+=ref.token.length;parts.push(ref);continue;}
      let cp=source.codePointAt(at);at+=String.fromCodePoint(cp).length;
      if(cp===13){if(source[at]==='\n')at++;cp=32;}else if(cp===9||cp===10)cp=32;
      assert.ok(cp>=32||cp===9||cp===10||cp===13);parts.push({kind:0,value:cp});
    }
    const refs=parts.filter(p=>p.kind!==0).length,unknown=parts.filter(p=>p.kind===3).length;
    references+=refs;unresolved+=unknown;attrs.push({name:n,raw:source.slice(start,at),parts,refs,unknown});
  }
  const raw=xmlEncode(source.slice(0,at),e),nameBytes=xmlEncode(tagName,e),characters=[...source.slice(0,at).replace(/\r\n?/g,'\n')].length;
  const out=[words(kind,raw.length,nameBytes.length,attrs.length,references,unresolved,raw.length,limit-characters),raw,nameBytes];
  for(const a of attrs){const n=xmlEncode(a.name,e),v=xmlEncode(a.raw,e);out.push(words(n.length,v.length,a.parts.length-a.unknown,a.refs,a.unknown),n,v);for(const p of a.parts){if(p.kind===3){const bytes=xmlEncode(p.name,e);out.push(words(3,bytes.length),bytes);}else out.push(words(p.kind,p.value));}}
  return {wire:Buffer.concat(out),kind,name:tagName,units:at,bytes:raw.length,characters,attributes:attrs.length,references,unresolved,maxNameBytes:Math.max(nameBytes.length,...attrs.map(a=>xmlEncode(a.name,e).length))};
}
