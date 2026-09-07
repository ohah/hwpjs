import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {documentRecords} from './documents.mjs';
import {formPropertyEvidence} from './form-property.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const wide=s=>Buffer.from(s,'utf16le');
const formId=0x666f726d,kinds=new Map([['tbp+',1],['tbc+',2],['boc+',3],['tbr+',4],['tde+',5]]);
const frame=(tag,level,p)=>Buffer.concat([w(tag|(level<<10)|((p.length<4095?p.length:4095)<<20)),...(p.length<4095?[]:[w(p.length)]),p]);
const header=level=>frame(66,level,Buffer.alloc(24));
function control(level,o={}) {
  const b=Buffer.alloc(44);b.writeUInt32LE(o.id??formId);b.writeInt32LE(o.y??-17,8);b.writeInt32LE(o.x??31,12);b.writeUInt32LE(o.width??0xfffffffe,16);b.writeUInt32LE(o.height??12,20);b.writeInt32LE(-2,24);b.writeInt16LE(-3,28);b.writeUInt32LE(0x87654321,36);b.writeInt32LE(-1,40);
  const desc=o.description===null?Buffer.alloc(0):Buffer.concat([Buffer.alloc(2),wide(o.description??'')]);
  if(desc.length)desc.writeUInt16LE((desc.length-2)/2);
  return frame(71,level,Buffer.concat([b,desc,o.extra??Buffer.alloc(0)]));
}
function object(level,s='A:int:1 ',o={}) {
  const b=Buffer.alloc(14),p=wide(s);b.write(o.type??'tbp+',0,4,'latin1');b.write(o.secondary??o.type??'tbp+',4,4,'latin1');b.writeUInt32LE(o.length??p.length/2,8);b.writeUInt16LE(p.length/2,12);
  return frame(91,level,Buffer.concat([b,p,o.extra??Buffer.alloc(0)]));
}
const input=(bytes,o={})=>Buffer.concat([w(o.version??0x05000307),w(o.forms??100000),w(o.bytes??67108864),w(o.nodes??100000),w(o.depth??64),bytes]);
function evidence(bytes) {
  const stack=[],children=new Map(),nodes=[];
  for(const r of documentRecords(bytes)) {
    const level=(bytes.readUInt32LE(r.offset)>>>10)&1023;assert.ok(level<=stack.length);stack.length=level;
    const parent=stack.at(-1)??null,index=nodes.length,n={...r,index,parent,level,data:bytes.subarray(r.start,r.end)};
    nodes.push(n);if(!children.has(parent))children.set(parent,[]);children.get(parent).push(n);stack.push(index);
  }
  const isForm=n=>n?.tag===71&&n.data.length>=4&&n.data.readUInt32LE(0)===formId;
  for(const n of nodes)if(n.tag===91)assert.ok(isForm(nodes[n.parent]));
  let totalBytes=0,totalNodes=0,maxDepth=0;const forms=[];
  for(const n of nodes.filter(isForm)) {
    assert.equal(nodes[n.parent]?.tag,66);const kids=children.get(n.index)??[],objects=kids.filter(c=>c.tag===91);assert.equal(objects.length,1);
    const obj=objects[0],b=obj.data,c=n.data;assert.ok(b.length>=14&&c.length>=44);
    const p=b.subarray(14,14+b.readUInt16LE(12)*2);assert.equal(p.length,b.readUInt16LE(12)*2);
    const props=formPropertyEvidence(p),tail=b.subarray(14+p.length);totalBytes+=p.length;totalNodes+=props.rows.length;maxDepth=Math.max(maxDepth,props.maxDepth);
    let desc=null,extra=Buffer.alloc(0);
    if(c.length>44){assert.ok(c.length>=46);desc=c.subarray(46,46+c.readUInt16LE(44)*2);assert.equal(desc.length,c.readUInt16LE(44)*2);extra=c.subarray(46+desc.length);}
    const fields=[n.index,obj.index,kids.length-1,kinds.get(b.subarray(0,4).toString('latin1'))??0,props.rows.length,c.readUInt32LE(4),c.readInt32LE(8),c.readInt32LE(12),c.readUInt32LE(16),c.readUInt32LE(20),c.readInt32LE(24),c.readUInt32LE(36),c.readInt32LE(40),desc?.length??0xffffffff,extra.length,tail.length,b.readUInt32LE(8),p.length];
    forms.push({control:n,object:obj,nodes:props.rows.length,wire:Buffer.concat([...fields.map(w),c.subarray(28,36),b.subarray(0,8),desc??Buffer.alloc(0),extra,tail,p])});
  }
  return {forms,totalBytes,totalNodes,maxDepth,wire:Buffer.concat([w(forms.length),w(totalBytes),w(totalNodes),...forms.map(f=>f.wire)])};
}
export function formControlEdges(call) {
  let accepted=0,rejected=0;
  const check=(b,o={})=>{assert.deepEqual(call(106,input(b,o)),evidence(b).wire);accepted++;};
  const bad=(b,error,o={})=>{assert.throws(()=>call(106,input(b,o)),error);rejected++;};
  const one=Buffer.concat([header(0),control(1),object(2)]);
  const nested=Buffer.concat([frame(255,0,Buffer.alloc(0)),header(0),control(1),object(2),frame(255,2,Buffer.alloc(0)),header(3),control(4,{description:'😀',extra:Buffer.from([0xa5])}),object(5,'B:bool:-1 ',{type:'????',secondary:'tde+',length:0xffffffff,extra:Buffer.from([0xff])}),header(0),control(1,{description:null}),object(2,'')]);
  for(const b of [Buffer.alloc(0),frame(255,0,Buffer.alloc(0)),one,nested]) {
    check(b);const e=evidence(b);check(b,{forms:e.forms.length,bytes:e.totalBytes,nodes:e.totalNodes,depth:e.maxDepth});
    if(e.forms.length)bad(b,/FormControlLimit/,{forms:e.forms.length-1});
    if(e.totalBytes)bad(b,/FormPropertyInputLimit/,{bytes:e.totalBytes-1});
    if(e.totalNodes)bad(b,/FormPropertyNodeLimit/,{nodes:e.totalNodes-1});check(b);
  }
  for(const [b,error]of [
    [object(0),/InvalidFormObjectOwner/],
    [Buffer.concat([header(0),object(1)]),/InvalidFormObjectOwner/],
    [Buffer.concat([control(0),object(1)]),/InvalidFormControlOwner/],
    [Buffer.concat([header(0),control(1,{id:0x12345678}),object(2)]),/InvalidFormObjectOwner/],
    [Buffer.concat([header(0),control(1)]),/MissingFormObject/],
    [Buffer.concat([one,object(2)]),/DuplicateFormObject/],
    [Buffer.concat([header(0),control(1),frame(255,2,Buffer.alloc(0)),object(3)]),/MissingFormObject/],
    [Buffer.concat([one,frame(255,2,Buffer.alloc(0)),object(3)]),/InvalidFormObjectOwner/],
    [Buffer.concat([header(0),control(1),one]),/MissingFormObject/],
    [Buffer.concat([header(0),control(1),object(2,'G:set:6:A:int: 1')]),/InvalidFormPropertyNumber/],
  ]){bad(b,error);check(nested);}
  const p=evidence(one).forms[0];
  for(let n=4;n<44;n++){const b=Buffer.concat([header(0),frame(71,1,p.control.data.subarray(0,n)),object(2)]);bad(b,/UnexpectedEnd/);}check(one);
  for(let n=0;n<p.object.data.length;n++){bad(Buffer.concat([header(0),control(1),frame(91,2,p.object.data.subarray(0,n))]),/UnexpectedEnd/);}check(one);
  const set=Buffer.concat([header(0),control(1),object(2,'G:set:8:A:int:1 ')]);check(set,{depth:1});bad(set,/FormPropertyDepthLimit/,{depth:0});check(set);
  return {accepted,rejected};
}
export function formControlActual(call,cfb) {
  const results=[];
  for(const name of ['form-01.hwp','form-02.hwp']) {
    cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url)),{strict:true});
    const version=cfb.findExact('/FileHeader').content.readUInt32LE(32),bytes=inflateRawSync(cfb.findExact('/BodyText/Section0').content),e=evidence(bytes);
    const check=()=>assert.deepEqual(call(106,input(bytes,{version})),e.wire);check();
    assert.equal(e.forms.length,5);assert.equal(e.totalNodes,118);
    assert.deepEqual(call(106,input(bytes,{version,forms:5,bytes:e.totalBytes,nodes:118,depth:e.maxDepth})),e.wire);
    let rejected=0;
    for(const o of [{forms:4},{bytes:e.totalBytes-1},{nodes:117},{depth:0}]){assert.throws(()=>call(106,input(bytes,{version,...o})),/FormControlLimit|FormPropertyInputLimit|FormPropertyNodeLimit|FormPropertyDepthLimit/);rejected++;check();}
    for(const f of e.forms) {
      const r=f.object,missing=Buffer.concat([bytes.subarray(0,r.offset),bytes.subarray(r.end)]),duplicate=Buffer.concat([bytes.subarray(0,r.end),bytes.subarray(r.offset,r.end),bytes.subarray(r.end)]);
      assert.throws(()=>call(106,input(missing,{version})),/MissingFormObject/);rejected++;check();
      assert.throws(()=>call(106,input(duplicate,{version})),/DuplicateFormObject/);rejected++;check();
      const wrong=Buffer.from(bytes);wrong.writeUInt32LE(0x12345678,f.control.start);
      assert.throws(()=>call(106,input(wrong,{version})),/InvalidFormObjectOwner/);rejected++;check();
    }
    const shifted=Buffer.concat([frame(255,0,Buffer.alloc(0)),bytes]);assert.deepEqual(call(106,input(shifted,{version})),evidence(shifted).wire);
    results.push({name,forms:5,propertyBytes:e.totalBytes,propertyNodes:e.totalNodes,rejected});
  }
  return results;
}
