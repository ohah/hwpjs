import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { documentRecords } from "./documents.mjs";
import { equationDocument } from "./equation-document.mjs";
const w = n => { const b=Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const str = raw => { const n=Buffer.alloc(2); n.writeUInt16LE(raw.length/2); return Buffer.concat([n,raw]); };
const run = (call,b,mode) => call(44,Buffer.concat([Buffer.from([mode]),b]));
function check(call,b,mode,end=b.length) {
  assert.deepEqual(run(call,b,mode),Buffer.concat([b.subarray(0,end),w(b.length-end),b.subarray(end)]));
}
export function equationEdges(call) {
  let accepted=0,rejected=0;
  for(const mode of [0,1]) {
    const make=(script,version,font)=>Buffer.concat([w(0xffffffff),str(script),w(0xffffffff),w(0x80000000),Buffer.from([0,0x80,0xff,0xff]),str(version),...(mode?[str(font)]:[])]);
    const raw=make(Buffer.from([0,0xd8]),Buffer.from([0,0,0xff,0xfe]),Buffer.alloc(0));
    check(call,raw,mode); accepted++;
    check(call,Buffer.concat([raw,Buffer.from([9,8,7])]),mode,raw.length); accepted++;
    for(let n=0;n<raw.length;n++) {
      assert.throws(()=>run(call,raw.subarray(0,n),mode),/UnexpectedEnd/); rejected++;
      check(call,raw,mode);
    }
    for(const position of [4,20,...(mode?[26]:[])]) {
      const bad=Buffer.from(raw); bad.writeUInt16LE(65535,position);
      assert.throws(()=>run(call,bad,mode),/UnexpectedEnd/); rejected++;
    }
    // Each counted string independently reaches the full u16 code-unit boundary.
    for(let field=0;field<(mode?3:2);field++) {
      const strings=[Buffer.alloc(0),Buffer.alloc(0),Buffer.alloc(0)]; strings[field]=Buffer.alloc(65535*2,0xff);
      check(call,make(...strings),mode); accepted++;
    }
    // Independent scalar byte mutations, not a parser-generated expectation.
    for(const position of [0,1,2,3,8,9,10,11,12,13,14,15,16,17,18,19]) {
      const changed=Buffer.from(raw); changed[position]^=0x80;
      check(call,changed,mode); accepted++;
    }
  }
  assert.throws(()=>run(call,Buffer.alloc(22),2),/InvalidMode/); rejected++;
  return {accepted,rejected};
}
export function equationReference(call,cfb) {
  const files=[],skipped=[]; let equations=0,rejected=0;
  for(const [name,mode,count] of [["atop-equation-01.hwp",0,3],["equation-lim.hwp",1,1],["math-001.hwp",1,44]]) {
    const path=new URL(`../../reference/rhwp/samples/${name}`,import.meta.url);
    if(!existsSync(path)){skipped.push(name);continue;}
    cfb.parse(readFileSync(path),{strict:true});
    const h=Buffer.from(cfb.findExact('/FileHeader').content),flags=h.readUInt32LE(36);
    assert.equal(flags&(2|4|16|256|1024),0);
    const raw=Buffer.from(cfb.findExact('/BodyText/Section0').content),b=flags&1?inflateRawSync(raw):raw;
    assert.deepEqual(call(3,Buffer.concat([h,raw]),b.length),b);
    const records=documentRecords(b).filter(r=>r.tag===88);
    assert.equal(records.length,count);
    for(const r of records) {
      const payload=b.subarray(r.start,r.end);
      check(call,payload,mode);
      for(let n=0;n<payload.length;n++) {
        assert.throws(()=>run(call,payload.subarray(0,n),mode),/UnexpectedEnd/); rejected++;
      }
      check(call,payload,mode);
      if(mode===0) assert.throws(()=>run(call,payload,1),/UnexpectedEnd/);
      equations++;
    }
    files.push({name,mode,count,document:equationDocument(call,cfb,readFileSync(path),h,b)});
  }
  return {equations,rejected,files,skipped};
}
