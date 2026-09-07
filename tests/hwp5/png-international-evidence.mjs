import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {keywordPrefixEvidence,textEvidence} from './png-text-evidence.mjs';
import {compressedTextEvidence} from './png-compressed-text-evidence.mjs';
import {registryEvidence} from './bcp47-registry-evidence.mjs';
const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
function utf8(bytes){assert.ok(!bytes.includes(0));const text=decoder.decode(bytes);let controls=0,linefeeds=0;for(const char of text){const c=char.codePointAt(0);if(c===10)linefeeds++;else if(c<32||(c>=127&&c<=159))controls++;}return {controls,linefeeds};}
export function internationalEvidence({chunks},maxText=64*1024*1024,maxLanguage=4096,maxSubtags=512){
  const entries=[],fields=Array(9).fill(0);let payloadBytes=0;
  for(const {name,payload} of chunks){if(name!=='iTXt')continue;
    const {key,remaining:r}=keywordPrefixEvidence(payload);assert.ok(r.length>=2);const flag=r[0],method=r[1];assert.ok(flag<=1);if(flag)assert.equal(method,0);
    const le=r.indexOf(0,2);assert.ok(le>=2);const language=r.subarray(2,le);assert.ok(language.length<=maxLanguage);
    const te=r.indexOf(0,le+1);assert.ok(te>le);const translated=r.subarray(le+1,te),raw=r.subarray(te+1);
    const registered=language.length?registryEvidence(language,maxLanguage,maxSubtags):null;
    const tr=utf8(translated),budget=maxText-fields[4];assert.ok(budget>=0);
    let text=raw;if(flag){const result=inflateSync(raw,{info:true,maxOutputLength:Math.max(1,budget)});assert.equal(result.engine.bytesWritten,raw.length);text=result.buffer;}
    assert.ok(text.length<=budget);const body=utf8(text);
    fields[0]++;fields[1]+=key.length;fields[2]+=language.length;fields[3]+=translated.length;fields[4]+=text.length;fields[5]+=registered?.readUInt32LE(92)??0;fields[6]+=tr.controls+body.controls;fields[7]+=tr.linefeeds;fields[8]+=!flag&&method!==0?1:0;
    entries.push({flag,method,key,language,translated,text});payloadBytes+=payload.length;
  }
  return {entries,fields,payloadBytes};
}
export function internationalWire(structure,maxText=64*1024*1024,maxLanguage=4096,maxSubtags=512){
  const p=textEvidence(structure);assert.ok(p.textBytes<=maxText);const z=compressedTextEvidence(structure,maxText-p.textBytes);
  const r=internationalEvidence(structure,maxText-p.textBytes-z.textBytes,maxLanguage,maxSubtags),head=Buffer.alloc(36);
  r.fields.forEach((v,i)=>head.writeUInt32LE(v,i*4));
  const parts=[head];for(const v of r.entries){const h=Buffer.alloc(24);[v.flag,v.method,v.key.length,v.language.length,v.translated.length,v.text.length].forEach((n,i)=>h.writeUInt32LE(n,i*4));parts.push(h,v.key,v.language,v.translated,v.text);}
  return Buffer.concat(parts);
}
