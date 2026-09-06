import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {loadMemoDocument} from './memo-references.mjs';
import {documentRecords,decodedDocumentInput} from './documents.mjs';
import {sectionFieldOffset} from './document-report-wire.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(tag,level,p)=>Buffer.concat([w(tag|(level<<10)|(p.length<<20)),p]);
export function revisionSignEdges(call){
  const command=Buffer.from('$RevisionSign;1;','utf16le');let accepted=0,rejected=0;
  const props=c=>{const n=Buffer.alloc(2);n.writeUInt16LE(c.length/2);return Buffer.concat([w(0),Buffer.from([0]),n,c,w(1)]);};
  const run=(p,id=0x25736967,header=0x25756e6b,code=3)=>{
    const token=Buffer.alloc(16);token.writeUInt16LE(code);token.writeUInt32LE(id,2);token.writeUInt16LE(code,14);
    return call(38,Buffer.concat([w(0x05000307),frame(66,0,Buffer.alloc(24)),frame(67,1,token),frame(71,1,Buffer.concat([w(header),p]))]));
  };
  const good=props(command),expected=Buffer.concat([0,1,2,0,3,0x25736967,0x25756e6b,3].map(w));
  const check=()=>{assert.deepEqual(run(good),expected);accepted++;};check();
  for(let cut=0;cut<good.length;cut++){assert.throws(()=>run(good.subarray(0,cut)),/UnexpectedEnd/);rejected++;check();}
  for(let at=0;at<command.length;at++)for(let bit=0;bit<8;bit++){const changed=Buffer.from(command);changed[at]^=1<<bit;assert.throws(()=>run(props(changed)),/ControlIdMismatch/);rejected++;}
  for(const text of ['$RevisionSign;0;','$RevisionSign;2;','$RevisionSign;1','$RevisionSign;1;;','$RevisionSign;1;\0','$RevisionDelete;']){assert.throws(()=>run(props(Buffer.from(text,'utf16le'))),/ControlIdMismatch/);rejected++;}
  for(const args of [[0x25256d65,0x25756e6b,3],[0x25252a64,0x25756e6b,3],[0x25736967,0x25686c6b,3],[0x25736967,0x25756e6b,2]]){assert.throws(()=>run(good,...args),/ControlIdMismatch/);rejected++;}
  assert.deepEqual(run(Buffer.concat([good,Buffer.from([255,0,17])])),expected);accepted++;
  check();return {accepted,rejected};
}
export function revisionSignActual(call,cfb){
  const x=loadMemoDocument(call,cfb,'task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp'),v=x.h.subarray(32,36),cmd=Buffer.from('$RevisionSign;1;','utf16le'),result=[];
  const wholeInput=Buffer.concat([w(67108864),x.file]),whole=call(25,wholeInput);
  for(const [kind,paragraph] of [['BodyText',34377],['ViewText',43359]]){
    const raw=cfb.findExact('/'+kind+'/Section0').content,b=call(3,Buffer.concat([x.h,Buffer.from(raw)]));
    const input=decodedDocumentInput(x.h,x.doc,[{index:0,bytes:b}]),original=call(24,input);
    assert.equal(original.readUInt32LE(sectionFieldOffset(0,'observed_field_links')),1);
    const links=call(38,Buffer.concat([v,b])),observed=[];
    for(let at=0;at<links.length;at+=32)if(links.readUInt32LE(at+28)===3)observed.push(Array.from({length:8},(_,i)=>links.readUInt32LE(at+4*i)));
    assert.equal(observed.length,1);const link=observed[0];assert.equal(link[0],paragraph);assert.deepEqual(link.slice(3),[133,3,0x25736967,0x25756e6b,3]);
    const rs=documentRecords(b),header=rs[link[2]],text=rs[link[1]];assert.equal(header.tag,71);assert.equal(text.tag,67);
    assert.deepEqual(b.subarray(header.start+11,header.start+11+cmd.length),cmd);
    const changed=Buffer.from(b);changed.writeUInt16LE('2'.charCodeAt(0),header.start+11+cmd.length-4);
    assert.throws(()=>call(38,Buffer.concat([v,changed])),/ControlIdMismatch/);
    assert.deepEqual(call(38,Buffer.concat([v,b])),links);
    assert.throws(()=>call(24,decodedDocumentInput(x.h,x.doc,[{index:0,bytes:changed}])),/ControlIdMismatch/);
    assert.deepEqual(call(24,input),original);
    if(kind==='BodyText'){
      const parent=x.nodes.findIndex(n=>n.parent===0&&n.name===kind),file=cfb.write({nodes:x.nodes.map(n=>n.parent===parent&&n.name==='Section0'?{...n,content:deflateRawSync(changed)}:n)});
      assert.throws(()=>call(25,Buffer.concat([w(67108864),Buffer.from(file)])),/ControlIdMismatch/);
      assert.deepEqual(call(25,wholeInput),whole);
    }
    result.push({kind,paragraph,unit:link[3],controlNode:link[2]});
  }
  return result;
}
