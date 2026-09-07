import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bcp47Evidence} from './bcp47-evidence.mjs';
export const catalog=JSON.parse(readFileSync(new URL('../../src/text/bcp47/data/source.json',import.meta.url),'utf8'));
const groups=Object.fromEntries(['language','script','region','variant'].map(k=>[k,catalog[k].split(' ').map(s=>s.split('..'))]));
export function member(kind,value){return groups[kind].some(([lo,hi])=>hi?value.length===lo.length&&value>=lo&&value<=hi:value===lo);}
export function registryEvidence(bytes,maxBytes=4096,maxSubtags=512){
  const syntax=bcp47Evidence(bytes,maxBytes,maxSubtags),raw=bytes.toString('latin1').toLowerCase();
  const span=i=>raw.slice(syntax.readUInt32LE(28+i*8),syntax.readUInt32LE(28+i*8)+syntax.readUInt32LE(32+i*8));
  let lookups=0,prefix=0,deferred=0;
  if(syntax.readUInt32LE(0)===0){
    assert.ok(member('language',span(0)));lookups++;
    assert.ok(syntax.readUInt32LE(8)<=1);
    if(span(1)){assert.equal(catalog.extlang[span(1)],span(0));lookups++;prefix=1;}
    for(const [i,kind] of [[2,'script'],[3,'region'],[4,'variant']])if(span(i))for(const v of span(i).split('-')){assert.ok(member(kind,v));lookups++;}
    if(span(5))for(const v of span(5).split('-'))if(v.length===1){assert.ok(catalog.extensions.split(' ').includes(v));lookups++;deferred++;}
  }
  syntax.writeUInt32LE(1,24);
  const tail=Buffer.alloc(20);
  [lookups,prefix,deferred,Number(catalog.date.replaceAll('-','')),Number(catalog.extension_date.replaceAll('-',''))].forEach((v,i)=>tail.writeUInt32LE(v,i*4));
  return Buffer.concat([syntax,tail]);
}
