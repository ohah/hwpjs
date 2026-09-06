import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { documentRecords } from "./documents.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const run=(call,b,mode)=>call(52,Buffer.concat([Buffer.from([mode]),b]));
function check(call,b,mode) {
  const width=mode?13:11;
  assert.deepEqual(run(call,b,mode),Buffer.concat([b.subarray(0,width),w(b.length-width),b.subarray(width)]));
}
export function shapeBorderEdges(call) {
  let accepted=0,rejected=0;
  for(const mode of [0,1]) {
    const width=mode?13:11;
    for(let i=0;i<width;i++)for(const value of [1,128,255]){const b=Buffer.alloc(width+3);b[i]=value;b.set([7,8,9],width);check(call,b,mode);accepted++;}
    for(let n=0;n<width;n++){assert.throws(()=>run(call,Buffer.alloc(n),mode),/UnexpectedEnd/);rejected++;check(call,Buffer.alloc(width),mode);}
  }
  assert.throws(()=>run(call,Buffer.alloc(13),2),/InvalidMode/);rejected++;
  return {accepted,rejected};
}
export function shapeBorderReference(call,cfb) {
  const files=[],skipped=[];let borders=0,rejected=0;
  for(const [name,expected] of [["shape-group-02.hwp",2],["group-drawing-02.hwp",34],["shape-001.hwp",2]]) {
    const path=new URL(`../../reference/rhwp/samples/${name}`,import.meta.url);
    if(!existsSync(path)){skipped.push(name);continue;}
    cfb.parse(readFileSync(path),{strict:true});
    const h=Buffer.from(cfb.findExact('/FileHeader').content),flags=h.readUInt32LE(36);
    assert.equal(flags&(2|4|16|256|1024),0);
    const raw=Buffer.from(cfb.findExact('/BodyText/Section0').content),b=flags&1?inflateRawSync(raw):raw;
    assert.deepEqual(call(3,Buffer.concat([h,raw]),b.length),b);
    const stack=[];let count=0;
    for(const r of documentRecords(b)) {
      const level=b.readUInt32LE(r.offset)>>>10&1023;stack.length=level;
      if(r.tag===76&&[0x24726563,0x24706f6c,0x246c696e].includes(b.readUInt32LE(r.start))) {
        const parent=stack[level-1];assert.ok(parent);assert.ok([71,76].includes(parent.tag));
        const p=b.subarray(r.start,r.end),start=(parent.tag===71?8:4)+42,end=start+50+p.readUInt16LE(start)*96;
        const border=p.subarray(end);assert.ok(border.length>=13);check(call,border,1);
        for(let n=0;n<13;n++){assert.throws(()=>run(call,border.subarray(0,n),1),/UnexpectedEnd/);rejected++;}
        check(call,border,1);count++;borders++;
      }
      stack.push(r);
    }
    assert.equal(count,expected);files.push({name,count});
  }
  return {borders,rejected,files,skipped};
}
