import assert from 'node:assert/strict';
export const grandfathered=['en-GB-oed','i-ami','i-bnn','i-default','i-enochian','i-hak','i-klingon','i-lux','i-mingo','i-navajo','i-pwn','i-tao','i-tay','i-tsu','sgn-BE-FR','sgn-BE-NL','sgn-CH-DE','art-lojban','cel-gaulish','no-bok','no-nyn','zh-guoyu','zh-hakka','zh-min','zh-min-nan','zh-xiang'];
const variant='(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3})';
const extension='[0-9a-wy-z](?:-[a-z0-9]{2,8})+';
const normal=new RegExp(`^(?<language>[a-z]{2,8})(?:-(?<extlangs>[a-z]{3}(?:-[a-z]{3}){0,2}))?(?:-(?<script>[a-z]{4}))?(?:-(?<region>[a-z]{2}|[0-9]{3}))?(?:-(?<variants>${variant}(?:-${variant})*))?(?:-(?<extensions>${extension}(?:-${extension})*))?(?:-(?<private_use>x(?:-[a-z0-9]{1,8})+))?$`,'id');
export function bcp47Evidence(bytes,maxBytes=4096,maxSubtags=512){
  assert.ok(bytes.length<=maxBytes&&bytes.length>0);
  assert.ok(bytes.every(b=>(b>=65&&b<=90)||(b>=97&&b<=122)||(b>=48&&b<=57)||b===45));
  const raw=bytes.toString('latin1'),parts=raw.split('-');assert.ok(parts.length<=maxSubtags&&parts.every(p=>p.length>=1&&p.length<=8));
  let kind=0,extlangs=0,variants=0,extensions=0,privateCount=0,spans=Array(14).fill(0);
  if(grandfathered.some(t=>t.toLowerCase()===raw.toLowerCase()))kind=2;
  else if(/^x(?:-[a-z0-9]{1,8})+$/i.test(raw)){kind=1;privateCount=parts.length-1;spans[12]=0;spans[13]=bytes.length;}
  else {
    const match=normal.exec(raw);assert.ok(match);const g=match.groups;
    assert.ok(!g.extlangs||g.language.length<=3);
    extlangs=g.extlangs?g.extlangs.split('-').length:0;
    const vs=g.variants?.toLowerCase().split('-')??[];variants=vs.length;assert.equal(new Set(vs).size,variants);
    const es=g.extensions?[...('-'+g.extensions).matchAll(/-([0-9a-wy-z])(?=-)/gi)].map(m=>m[1].toLowerCase()):[];extensions=es.length;assert.equal(new Set(es).size,extensions);
    privateCount=g.private_use?g.private_use.split('-').length-1:0;
    spans=['language','extlangs','script','region','variants','extensions','private_use'].flatMap(k=>{const span=match.indices.groups[k];return span?[span[0],span[1]-span[0]]:[0,0];});
  }
  const fields=[kind,parts.length,extlangs,variants,extensions,privateCount,0,...spans],wire=Buffer.alloc(fields.length*4);fields.forEach((v,i)=>wire.writeUInt32LE(v,i*4));return wire;
}
