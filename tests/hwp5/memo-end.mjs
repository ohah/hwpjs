import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {documentRecords} from './documents.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const token=()=>Buffer.from('0400656d250001ffff00010000000400','hex');
export function memoEndEdges(call){
  let accepted=0,rejected=0;const b=token();
  const check=bytes=>{assert.deepEqual(call(91,bytes),Buffer.concat([0,bytes.readUInt32LE(6),bytes.readUInt32LE(10)].map(w)));accepted++;};
  check(b);
  for(let cut=1;cut<16;cut++){assert.throws(()=>call(91,b.subarray(0,cut)),cut%2?/InvalidTextSize/:/UnexpectedEnd/);rejected++;check(b);}
  for(let at=6;at<14;at++)for(let bit=0;bit<8;bit++){const c=Buffer.from(b);c[at]^=1<<bit;check(c);}
  for(let at=2;at<6;at++)for(let bit=0;bit<8;bit++){const c=Buffer.from(b);c[at]^=1<<bit;assert.deepEqual(call(91,c),Buffer.alloc(0));accepted++;}
  for(const value of [0,65536,0x80000000,0xffffffff]){const c=Buffer.from(b);c.writeUInt32LE(value,10);check(c);}
  const other=Buffer.from(b);other.writeUInt16LE(3);other.writeUInt16LE(3,14);assert.deepEqual(call(91,other),Buffer.alloc(0));accepted++;
  const bad=Buffer.from(b);bad.writeUInt16LE(3,14);assert.throws(()=>call(91,bad),/InvalidControlTerminator/);rejected++;check(b);
  const prefix=Buffer.from('😀','utf16le');assert.deepEqual(call(91,Buffer.concat([prefix,b,b])),Buffer.concat([2,b.readUInt32LE(6),1,10,b.readUInt32LE(6),1].map(w)));accepted++;
  assert.deepEqual(call(91,Buffer.alloc(0)),Buffer.alloc(0));accepted++;
  return {accepted,rejected};
}
export function memoEndActual(call,cfb){
  let begins=0,ends=0,crossParagraph=0,texts=0;const middleCounts={};
  for(const name of ['aift.hwp','issue5169_viewtext_changetracking.hwp','basic/NewYear_s_Day.hwp','basic/english.hwp','issue5866/memo_field_hwp5.hwp','task2287/1342000_edu_curriculum_map.hwp']){
    cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url)),{strict:true});
    const h=Buffer.from(cfb.findExact('/FileHeader').content),nodes=cfb.document().nodes,parent=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText'),fields=[],closing=[];
    for(const section of nodes.filter(n=>n.parent===parent&&/^Section\d+$/.test(n.name))){
      const b=call(3,Buffer.concat([h,Buffer.from(section.content)])),stack=[];
      for(const r of documentRecords(b)){
        r.level=(b.readUInt32LE(r.offset)>>>10)&1023;
        while(stack.length&&stack.at(-1).level>=r.level)stack.pop();const owner=stack.at(-1)?.offset,p=b.subarray(r.start,r.end);
        if(r.tag===71&&p.length>=15){const e=11+p.readUInt16LE(9)*2,command=p.subarray(11,e).toString('utf16le'),match=/^MEMO\/65535\/(\d+)\//.exec(command);if(match){assert.ok(e+8<=p.length);const id=p.readUInt32LE(e+4);assert.equal(id,Number(match[1]));fields.push({section:section.name,owner,id});}}
        if(r.tag===67){
          const rows=[];
          for(let at=0;at<p.length;){assert.ok(at+2<=p.length);const code=p.readUInt16LE(at),wide=(code>=1&&code<=9)||(code>=11&&code<=12)||(code>=14&&code<=23);if(wide){assert.ok(at+16<=p.length);assert.equal(p.readUInt16LE(at+14),code);}
            if(code===3&&p.readUInt32LE(at+2)===0x25256d65){assert.deepEqual(p.subarray(at+6,at+14),Buffer.alloc(8));begins++;}
            if(code===4&&p.readUInt32LE(at+2)===0x00256d65){const middle=p.readUInt32LE(at+6),id=p.readUInt32LE(at+10);rows.push(at/2,middle,id);closing.push({section:section.name,owner,id});middleCounts[middle]=(middleCounts[middle]??0)+1;ends++;}
            at+=wide?16:2;
          }
          assert.deepEqual(call(91,p),Buffer.concat(rows.map(w)));texts++;
        }
        stack.push(r);
      }
    }
    assert.equal(closing.length,fields.length,name);
    for(const end of closing){const targets=fields.filter(f=>f.section===end.section&&f.id===end.id);assert.equal(targets.length,1,name);crossParagraph+=Number(targets[0].owner!==end.owner);}
  }
  assert.equal(begins,28);assert.equal(ends,28);assert.equal(crossParagraph,1);
  return {begins,ends,crossParagraph,texts,middleCounts};
}
