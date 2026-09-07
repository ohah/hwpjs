import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {controlLinkEvidence} from './links.mjs';
import {documentRecords} from './documents.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const wide=s=>Buffer.from(s,'utf16le');
const id=0x666f726d;
const frame=(tag,level,b)=>Buffer.concat([w(tag|(level<<10)|((b.length<4095?b.length:4095)<<20)),...(b.length<4095?[]:[w(b.length)]),b]);
const head=level=>frame(66,level,Buffer.alloc(24));
const token=(value=id,code=11)=>{const b=Buffer.alloc(16,0xff);b.writeUInt16LE(code);b.writeUInt32LE(value,2);b.writeUInt16LE(code,14);return b;};
const ctrl=(level,value=id)=>frame(71,level,Buffer.concat([w(value),Buffer.alloc(40)]));
const object=level=>frame(91,level,Buffer.concat([Buffer.from('tbp+tbp+'),Buffer.alloc(6)]));
const input=(b,v=0x05000300)=>Buffer.concat([w(v),b]);
function expected(bytes) {
  const rows=controlLinkEvidence(bytes).filter(r=>r[6]===id).sort((a,b)=>a[2]-b[2]);
  for(const r of rows){assert.equal(r[4],11);assert.equal(r[5],id);assert.equal(r[7],0);}
  return {rows,wire:Buffer.concat(rows.flatMap((r,i)=>[i,...r.slice(0,7)].map(w)))};
}
export function formLinkEdges(call) {
  let accepted=0,rejected=0;
  const check=b=>{assert.deepEqual(call(107,input(b)),expected(b).wire);accepted++;};
  const bad=(b,error)=>{assert.throws(()=>call(107,input(b)),error);rejected++;};
  const one=Buffer.concat([head(0),frame(67,1,token()),ctrl(1),object(2)]);
  // Same IDs, outer sibling emitted before nested control by generic Links.build.
  const nested=Buffer.concat([head(0),frame(67,1,Buffer.concat([wide('😀'),token(0,9),token(),token(),wide('\r')])),ctrl(1),object(2),head(2),frame(67,3,token()),ctrl(3),object(4),ctrl(1),object(2)]);
  for(const b of [Buffer.alloc(0),one,nested,Buffer.concat([frame(255,0,Buffer.alloc(0)),nested]),Buffer.concat([head(0),ctrl(1),object(2),frame(67,1,token())]),Buffer.concat([head(0),frame(67,1,Buffer.concat([token(0x12345678,12),token()])),ctrl(1,0x12345678),ctrl(1),object(2)])])check(b);
  const nestedRows=expected(nested).rows;
  assert.deepEqual(nestedRows.map(r=>r[2]),[2,6,8]);
  assert.deepEqual(nestedRows.map(r=>r[3]),[10,0,18]);
  for(const code of [1,2,3,12,14,15,16,17,18,21,22,23]) {
    bad(Buffer.concat([head(0),frame(67,1,token(id,code)),ctrl(1),object(2)]),/FormControlCodeMismatch/);check(one);
  }
  for(const [b,error]of [
    [Buffer.concat([head(0),ctrl(1),object(2)]),/MissingControlToken/],
    [Buffer.concat([head(0),frame(67,1,token())]),/MissingControlHeader/],
    [Buffer.concat([head(0),frame(67,1,Buffer.concat([token(),token()])),ctrl(1),object(2)]),/MissingControlHeader/],
    [Buffer.concat([head(0),frame(67,1,token(0x12345678)),ctrl(1),object(2)]),/ControlIdMismatch/],
    [Buffer.concat([head(0),frame(67,1,token()),frame(67,1,token()),ctrl(1),object(2)]),/DuplicateParagraphRecord/],
    [Buffer.concat([head(0),frame(67,1,token(id,9)),ctrl(1),object(2)]),/MissingControlToken/],
    [Buffer.concat([head(0),frame(67,1,token()),ctrl(1)]),/MissingFormObject/],
    [Buffer.concat([one,object(2)]),/DuplicateFormObject/],
    [Buffer.concat([one,head(0),ctrl(1,0x12345678)]),/MissingControlToken/],
  ]){bad(b,error);check(nested);}
  const broken=Buffer.from(one);broken.writeUInt16LE(12,46);bad(broken,/InvalidControlTerminator/);check(one);
  return {accepted,rejected};
}
export function formLinkActual(call,cfb) {
  const result=[];
  for(const name of ['form-01.hwp','form-02.hwp']) {
    cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url)),{strict:true});
    const version=cfb.findExact('/FileHeader').content.readUInt32LE(32),bytes=inflateRawSync(cfb.findExact('/BodyText/Section0').content),e=expected(bytes),records=documentRecords(bytes);
    const check=()=>assert.deepEqual(call(107,input(bytes,version)),e.wire);check();
    assert.equal(e.rows.length,5);assert.deepEqual(e.rows.map(r=>r[3]),[16,0,0,0,0]);
    let rejected=0;
    for(const row of e.rows) {
      const start=records[row[1]].start+row[3]*2;
      for(const kind of ['code','id','missing']) {
        const b=Buffer.from(bytes);
        if(kind==='code'){b.writeUInt16LE(12,start);b.writeUInt16LE(12,start+14);}
        else if(kind==='id')b.writeUInt32LE(0x12345678,start+2);
        else wide('        ').copy(b,start);
        assert.throws(()=>call(107,input(b,version)),kind==='code'?/FormControlCodeMismatch/:kind==='id'?/ControlIdMismatch/:/MissingControlToken/);rejected++;check();
      }
    }
    const shifted=Buffer.concat([frame(255,0,Buffer.alloc(0)),bytes]);assert.deepEqual(call(107,input(shifted,version)),expected(shifted).wire);
    result.push({name,forms:e.rows.length,startUnits:e.rows.map(r=>r[3]),rejected});
  }
  return result;
}
