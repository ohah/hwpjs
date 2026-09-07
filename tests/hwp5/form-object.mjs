import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {documentRecords} from './documents.mjs';
const kinds=new Map([['tbp+',1],['tbc+',2],['boc+',3],['tbr+',4],['tde+',5]]);
function payload(id,text,tail=Buffer.alloc(0)) {
  const h=Buffer.alloc(14),b=Buffer.from(text,'utf16le');
  h.write(id,0,4,'latin1');h.write(id,4,4,'latin1');h.writeUInt32LE(b.length/2,8);h.writeUInt16LE(b.length/2,12);
  return Buffer.concat([h,b,tail]);
}
function expected(b) {
  assert.ok(b.length>=14);
  const n=b.readUInt16LE(12)*2;assert.ok(b.length>=14+n);
  const h=Buffer.alloc(24);b.copy(h,0,0,12);
  h.writeUInt32LE(n,12);h.writeUInt32LE(b.length-14-n,16);h.writeUInt32LE(kinds.get(b.subarray(0,4).toString('latin1'))??0,20);
  return Buffer.concat([h,b.subarray(14)]);
}
export function formObjectEdges(call) {
  let accepted=0,rejected=0;
  const check=b=>{const copy=Buffer.from(b);assert.deepEqual(call(104,b),expected(b));assert.deepEqual(b,copy);accepted++;};
  for(const id of [...kinds.keys(),'????','+pbt','TBP+'])for(const text of ['', 'A: B\0😀\ud800\r']) {
    const b=payload(id,text,Buffer.from([255,0,128]));check(b);
    for(let cut=0;cut<14+Buffer.byteLength(text,'utf16le');cut++) {
      assert.throws(()=>call(104,b.subarray(0,cut)),/UnexpectedEnd/);rejected++;
    }
    check(b);
    for(const raw of [0,1,0x80000000,0xffffffff]) {const c=Buffer.from(b);c.writeUInt32LE(raw,8);c.fill(0xff,4,8);check(c);}
  }
  for(const id of kinds.keys())for(let pos=0;pos<4;pos++)for(let bit=0;bit<8;bit++) {
    const b=payload(id,'X');b[pos]^=1<<bit;check(b);
  }
  const max=payload('tde+','\udfff'.repeat(65535));check(max);
  assert.throws(()=>call(104,max.subarray(0,-1)),/UnexpectedEnd/);rejected++;check(max);
  return {accepted,rejected,maxUnits:65535};
}
export function formObjectActual(call,cfb) {
  const results=[];
  for(const name of ['form-01.hwp','form-02.hwp']) {
    cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url)),{strict:true});
    const h=cfb.findExact('/FileHeader').content,raw=cfb.findExact('/BodyText/Section0').content;
    assert.equal(h.readUInt32LE(32),0x05000300);
    const bytes=(h.readUInt32LE(36)&1)?inflateRawSync(raw):raw,forms=documentRecords(bytes).filter(r=>r.tag===91);
    assert.equal(forms.length,5);
    let rejected=0;
    const types=[];
    for(const r of forms) {
      const b=bytes.subarray(r.start,r.end),want=expected(b),id=b.subarray(0,4).toString('latin1');types.push(id);
      assert.deepEqual(b.subarray(0,4),b.subarray(4,8));
      assert.equal(b.readUInt32LE(8),b.readUInt16LE(12));assert.equal(b.length,14+b.readUInt16LE(12)*2);
      assert.deepEqual(call(104,b),want);
      for(let cut=0;cut<b.length;cut++) {assert.throws(()=>call(104,b.subarray(0,cut)),/UnexpectedEnd/);rejected++;}
      assert.deepEqual(call(104,b),want);
      const longer=Buffer.from(b);longer.writeUInt16LE(65535,12);
      assert.throws(()=>call(104,longer),/UnexpectedEnd/);rejected++;
      assert.deepEqual(call(104,b),want);
    }
    assert.deepEqual(types,[...kinds.keys()]);
    results.push({name,version:'5.0.3.0',forms:forms.length,types,rejected});
  }
  return results;
}
