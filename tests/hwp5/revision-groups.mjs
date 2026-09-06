import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {documentRecords} from './documents.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(tag,level,p)=>Buffer.concat([w(tag|(level<<10)|(p.length<<20)),p]);
const para=(level,units=1,merge=0,size=24)=>{const p=Buffer.alloc(size);p.writeUInt32LE(units);if(size>=24)p.writeUInt16LE(merge,22);return frame(66,level,p);};
const list=(level,count)=>frame(72,level,Buffer.concat([w(count),w(0)]));
const other=level=>frame(255,level,Buffer.alloc(0));
function expected(bytes) {
  const stack=[],lastList=new Map(),lastGroup=new Map(),rows=[],groups=[];
  for(const[index,r]of documentRecords(bytes).entries()) {
    const level=(bytes.readUInt32LE(r.offset)>>>10)&1023;assert.ok(level<=stack.length);stack.length=level;
    const parent=stack.at(-1);
    if(r.tag===72)lastList.set(parent,index);
    if(r.tag===66) {
      const flow=parent===undefined?0:lastList.get(parent);assert.notEqual(flow,undefined);
      assert.ok(r.end-r.start>=24);const merge=bytes.readUInt16LE(r.start+22);assert.ok(merge<=1);
      if(merge===0){lastGroup.set(flow,groups.length);groups.push({head:index,flow,count:0,units:0n});}
      const g=groups[lastGroup.get(flow)];assert.ok(g);
      rows.push({index,flow,group:g,start:g.units});g.units+=BigInt(bytes.readUInt32LE(r.start)&0x7fffffff);g.count++;
    }
    stack[level]=index;
  }
  const out=Buffer.alloc(rows.length*32);
  rows.forEach((r,i)=>{const at=i*32;[r.index,r.flow,r.group.head,r.group.count].forEach((n,j)=>out.writeUInt32LE(n,at+j*4));out.writeBigUInt64LE(r.start,at+16);out.writeBigUInt64LE(r.group.units,at+24);});
  return {out,paragraphs:rows.length,groups:groups.length};
}
export function revisionGroupEdges(call) {
  let accepted=0,rejected=0;
  const run=(b,version=0x05000307)=>call(101,Buffer.concat([w(version),b]));
  const good=Buffer.concat([para(0,2),other(1),list(2,2),para(2,3),other(3),list(4,1),para(4,5),para(2,7,1),list(2,0),list(2,1),para(2,11),para(0,13,1)]);
  const check=b=>{assert.deepEqual(run(b),expected(b).out);accepted++;};check(good);
  check(Buffer.concat([other(0),good])); // first paragraph/list IDs need not start at zero
  const reject=(b,error,version)=>{assert.throws(()=>run(b,version),error);rejected++;check(good);};
  reject(para(0,1,1),/OrphanRevisionMerge/);
  reject(Buffer.concat([para(0),list(1,1),para(1,1,1)]),/OrphanRevisionMerge/);
  reject(Buffer.concat([para(0),list(1,1),para(1),list(1,1),para(1,1,1)]),/OrphanRevisionMerge/);
  for(const merge of [2,255,65535])reject(Buffer.concat([para(0),para(0,1,merge)]),/UnsupportedRevisionMergeValue/);
  reject(para(0,1,0,22),/UnsupportedRevisionMergeValue/);
  reject(para(0,1,0,24),/UnsupportedRevisionMergeValue/,0x05000301);
  reject(Buffer.concat([para(0),para(1)]),/OrphanListParagraph/);
  check(Buffer.alloc(0));check(Buffer.concat([para(0,0),para(0,0,1)]));
  const large=Buffer.concat([para(0,0x7fffffff),para(0,0xffffffff,1),para(0,0x7fffffff,1)]);check(large);
  assert.equal(run(large).readBigUInt64LE(24),6442450941n);
  reject(para(0,0,1),/OrphanRevisionMerge/); // previous calls do not establish a head
  return {accepted,rejected};
}
export function revisionGroupActual(call,cfb) {
  const results=[];
  for(const name of ['issue5169_viewtext_changetracking.hwp','task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp']) {
    cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url)),{strict:true});
    const h=Buffer.from(cfb.findExact('/FileHeader').content);
    for(const kind of ['BodyText','ViewText']) {
      const b=inflateRawSync(cfb.findExact('/'+kind+'/Section0').content),oracle=expected(b),input=Buffer.concat([h.subarray(32,36),b]);
      const out=call(101,input);assert.deepEqual(out,oracle.out,name+'/'+kind);
      const counts=name.startsWith('task2070/')?[53448,53448]:kind==='BodyText'?[228,228]:[590,524];
      assert.deepEqual([oracle.paragraphs,oracle.groups],counts);
      const records=documentRecords(b),first=records.find(r=>r.tag===66),changed=Buffer.from(b);changed.writeUInt16LE(1,first.start+22);
      assert.throws(()=>call(101,Buffer.concat([h.subarray(32,36),changed])),/OrphanRevisionMerge/);
      assert.deepEqual(call(101,input),out);
      let firstNested,nestedContinuations=0;
      for(let at=0;at<out.length;at+=32)if(out.readUInt32LE(at+4)!==0){firstNested??=out.readUInt32LE(at);if(out.readUInt32LE(at)!==out.readUInt32LE(at+8))nestedContinuations++;}
      assert.notEqual(firstNested,undefined);
      const nestedBad=Buffer.from(b);nestedBad.writeUInt16LE(1,records[firstNested].start+22);
      assert.throws(()=>call(101,Buffer.concat([h.subarray(32,36),nestedBad])),/OrphanRevisionMerge/);
      assert.deepEqual(call(101,input),out);
      if(name.startsWith('issue5169')&&kind==='ViewText')assert.equal(nestedContinuations,1);
      results.push({name,kind,paragraphs:oracle.paragraphs,groups:oracle.groups,nestedContinuations});
    }
  }
  return results;
}
