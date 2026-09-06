import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {documentRecords} from './documents.mjs';
import {headerXml} from './fixture-xml.mjs';
const word=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
function oracle(b){
  if(b.length<16)throw new RangeError('short header');
  let at=16;const lists=[];
  for(let i=0;i<4;i++){const n=b.readUInt32LE(i*4);if(n>(b.length-at)/2)throw new RangeError('short list');lists.push(b.subarray(at,at+2*n));at+=2*n;}
  return {lists,extra:b.subarray(at)};
}
function wire(p){return Buffer.concat([...p.lists.flatMap(b=>[word(b.length/2),b]),word(p.extra.length),p.extra]);}
function check(call,b){const p=oracle(b);assert.deepEqual(call(95,b),wire(p));return p;}
export function forbiddenCharEdges(call){
  let accepted=0,rejected=0;
  const good=Buffer.concat([...[1,2,3,4].map(word),Buffer.from('00d8000000dc00ff0123456789abcdef10203040','hex'),Buffer.from([255])]);
  assert.equal(good.length,37);
  const recover=()=>{check(call,good);accepted++;};recover();
  for(let cut=0;cut<36;cut++){assert.throws(()=>call(95,good.subarray(0,cut)),/UnexpectedEnd/);rejected++;recover();}
  // All four count words, not only the first; no allocation from hostile lengths.
  for(let at=0;at<16;at++)for(let bit=0;bit<8;bit++){
    const b=Buffer.from(good);b[at]^=1<<bit;let p;
    try{p=oracle(b);}catch(e){assert.ok(e instanceof RangeError);}
    if(p){assert.deepEqual(call(95,b),wire(p));accepted++;}else{assert.throws(()=>call(95,b),/UnexpectedEnd/);rejected++;}recover();
  }
  for(let bits=0;bits<256;bits++){
    const counts=Array.from({length:4},(_,i)=>(bits>>>(2*i))&3),lists=counts.map((n,i)=>Buffer.alloc(n*2,0x80+i));
    check(call,Buffer.concat([...counts.map(word),...lists,Buffer.from([0,255,0xd8])]));accepted++;
  }
  for(let cut=36;cut<=37;cut++){check(call,good.subarray(0,cut));accepted++;}
  check(call,Buffer.alloc(16));accepted++;
  return {accepted,rejected};
}
export function forbiddenCharActual(call,cfb){
  const root=new URL('../../reference/rhwp/samples/',import.meta.url),errors={},nonempty=new Map();
  let files=0,decoded=0,records=0,empty=0;const owners={},sizes={};
  for(const name of readdirSync(root,{recursive:true}).filter(n=>n.endsWith('.hwp'))){
    files++;let b;
    try{cfb.parse(readFileSync(new URL(name,root)),{strict:true});const h=Buffer.from(cfb.findExact('/FileHeader').content);b=call(3,Buffer.concat([h,Buffer.from(cfb.findExact('/DocInfo').content)]));}
    catch(e){errors[e.message]=(errors[e.message]??0)+1;continue;}
    decoded++;let owner=null;
    for(const r of documentRecords(b)){
      const level=(b.readUInt32LE(r.offset)>>>10)&1023;if(level===0)owner=r.tag;if(r.tag!==94)continue;
      const bytes=b.subarray(r.start,r.end),p=check(call,bytes);records++;assert.equal(level,1);assert.equal(p.extra.length,0);
      owners[owner]=(owners[owner]??0)+1;sizes[bytes.length]=(sizes[bytes.length]??0)+1;
      assert.equal(p.lists[0].length,0);assert.equal(p.lists[1].length,0);
      if(p.lists.every(b=>b.length===0))empty++;else nonempty.set(name,p);
    }
  }
  assert.equal(decoded,430);assert.equal(records,420);assert.equal(empty,417);assert.deepEqual(sizes,{16:417,196:1,302:2});
  const pairs=[];let identicalNonempty=0,emptySpaceDifferences=0;
  for(const [hwp,hwpx,counts] of [['pr-1674.hwp','hwpx/pr-1674.hwpx',[0,0,90,0]],['task1749/saved_bounds_cumulative_page_break.hwp','task1749/saved_bounds_cumulative_page_break.hwpx',[0,0,92,51]],['task1749/saved_bounds_cumulative_vpos.hwp','task1749/saved_bounds_cumulative_vpos.hwpx',[0,0,92,51]]]){
    const p=nonempty.get(hwp);assert.ok(p);assert.deepEqual(p.lists.map(b=>b.length/2),counts);
    const xml=headerXml(readFileSync(new URL(hwpx,root))),block=xml.match(/<hh:forbiddenWordList\b[^>]*itemCnt="4"[^>]*>([\s\S]*?)<\/hh:forbiddenWordList>/);assert.ok(block);
    const lists=[...block[1].matchAll(/<hh:forbiddenWord>([\s\S]*?)<\/hh:forbiddenWord>/g)].map(m=>Buffer.from(m[1],'base64'));assert.equal(lists.length,4);
    for(let i=0;i<4;i++){if(p.lists[i].length){assert.deepEqual(p.lists[i],lists[i]);identicalNonempty++;}else{assert.deepEqual(lists[i],Buffer.from([32,0]));emptySpaceDifferences++;}}
    pairs.push({hwp,hwpx,counts});
  }
  assert.equal(identicalNonempty,5);assert.equal(emptySpaceDifferences,7);
  return {files,decoded,errors,records,empty,owners,sizes,pairs,identicalNonempty,emptySpaceDifferences};
}
