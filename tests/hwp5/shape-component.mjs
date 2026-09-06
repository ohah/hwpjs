import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { documentRecords } from "./documents.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const run=(call,b,mode)=>call(50,Buffer.concat([Buffer.from([mode]),b]));
function check(call,b,mode) {
  const start=(mode?8:4)+42, pairs=b.readUInt16LE(start),end=start+50+pairs*96;
  assert.ok(end<=b.length);
  assert.deepEqual(run(call,b,mode),Buffer.concat([b.subarray(0,end),w(b.length-end),b.subarray(end)]));
  return end;
}
export function shapeComponentEdges(call) {
  let rejected=0,accepted=0;
  for(const mode of [0,1]) {
    const size=mode?100:96,start=(mode?8:4)+42;
    const raw=Buffer.alloc(size+96);raw.writeUInt16LE(1,start);
    // Preserve NaN payloads, infinities, signed zero and subnormal values in every matrix.
    const bits=[0x8000000000000000n,0x7ff8000000000042n,0x7ff0000000000000n,0xfff0000000000000n,1n,0x3ff0000000000000n];
    for(let i=0;i<18;i++)raw.writeBigUInt64LE(bits[i%6],start+2+i*8);
    check(call,raw,mode);accepted++;
    for(let n=0;n<raw.length;n++){assert.throws(()=>run(call,raw.subarray(0,n),mode),/UnexpectedEnd/);rejected++;}
    check(call,raw,mode);
    for(let i=0;i<start;i++){const changed=Buffer.from(raw);changed[i]^=0x80;check(call,changed,mode);accepted++;}
    const maximum=Buffer.alloc(size+65535*96);maximum.writeUInt16LE(65535,start);check(call,maximum,mode);accepted++;
    const bad=Buffer.from(raw);bad.writeUInt16LE(65535,start);assert.throws(()=>run(call,bad,mode),/UnexpectedEnd/);rejected++;
    const zero=Buffer.alloc(size);check(call,zero,mode);accepted++;
    // Equal adjacent words cannot select the ID layout automatically.
    zero.writeUInt32LE(0x246f6c65,0);zero.writeUInt32LE(0x246f6c65,4);check(call,zero,mode);accepted++;
  }
  assert.throws(()=>run(call,Buffer.alloc(100),2),/InvalidMode/);rejected++;
  return {accepted,rejected};
}
export function shapeComponentReference(call,cfb) {
  const files=[],skipped=[];let components=0,single=0,double=0,rejected=0;
  for(const name of ["한셀OLE.hwp","shape-group-02.hwp","group-drawing-02.hwp"]) {
    const path=new URL(`../../reference/rhwp/samples/${name}`,import.meta.url);
    if(!existsSync(path)){skipped.push(name);continue;}
    cfb.parse(readFileSync(path),{strict:true});const h=Buffer.from(cfb.findExact('/FileHeader').content),flags=h.readUInt32LE(36);
    assert.equal(flags&(2|4|16|256|1024),0);
    const raw=Buffer.from(cfb.findExact('/BodyText/Section0').content),b=flags&1?inflateRawSync(raw):raw;
    assert.deepEqual(call(3,Buffer.concat([h,raw]),b.length),b);
    const stack=[];let count=0;
    for(const r of documentRecords(b)) {
      const level=b.readUInt32LE(r.offset)>>>10&1023;stack.length=level;
      if(r.tag===76) {
        const parent=stack[level-1];assert.ok(parent);
        let mode;
        if(parent.tag===71){assert.equal(b.readUInt32LE(parent.start),0x67736f20);mode=1;double++;}
        else{assert.equal(parent.tag,76);mode=0;single++;}
        const p=b.subarray(r.start,r.end),end=check(call,p,mode);
        for(let n=0;n<end;n++){assert.throws(()=>run(call,p.subarray(0,n),mode),/UnexpectedEnd/);rejected++;}
        check(call,p,mode);count++;components++;
      }
      stack.push(r);
    }
    assert.ok(count>0);files.push({name,count});
  }
  return {components,single,double,rejected,files,skipped};
}
