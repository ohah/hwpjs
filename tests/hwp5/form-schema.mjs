import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {documentRecords} from './documents.mjs';
import {formPropertyEvidence} from './form-property.mjs';
const fields='Name ForeColor BackColor GroupName TabStop TabOrder Enabled BorderType DrawFrame Command Editable Printable CharShapeID FollowContext AutoSize WordWrap Caption Value TriState BackStyle RadioGroupName ListBoxRows Text ListBoxWidth EditEnable MultiLine PasswordChar MaxLength ScrollBars TabKeyBehavior Number ReadOnly AlignText'.split(' ');
const common={Name:1,ForeColor:2,BackColor:2,GroupName:1,TabStop:3,TabOrder:2,Enabled:3,BorderType:2,DrawFrame:3,Command:1,Editable:3,Printable:3};
const charShape={CharShapeID:2,FollowContext:3,AutoSize:3,WordWrap:3};
const button={Caption:1},choice={...button,Value:2,TriState:3,BackStyle:2};
const typeGroups=[null,['ButtonSet',button],['ButtonSet',choice],['ComboBoxSet',{ListBoxRows:2,Text:1,ListBoxWidth:2,EditEnable:3}],['ButtonSet',{...choice,RadioGroupName:1}],['EditSet',{Text:1,MultiLine:3,PasswordChar:1,MaxLength:2,ScrollBars:2,TabKeyBehavior:2,Number:3,ReadOnly:3,AlignText:2}]];
const groups=kind=>kind?{CommonSet:common,CharShapeSet:charShape,[typeGroups[kind][0]]:typeGroups[kind][1]}:{};
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const set=(key,body)=>`${key}:set:${body.length}:${body}`;
const scalar=(key,kind,value='1')=>`${key}:${['set','wstring','int','bool'][kind]}:${kind<2?value.length+':':''}${value} `;
const wide=s=>Buffer.from(s,'utf16le');
function oracle(bytes,kind,count) {
  const {rows}=formPropertyEvidence(bytes),known=groups(kind),indexes=fields.map(()=>0xffffffff),seen=new Set();let checked=0;
  rows.forEach((root,ri)=>{
    if(root.parent!==null)return;
    const name=root.key.toString('utf16le'),spec=Object.hasOwn(known,name)?known[name]:null;if(!spec)return;
    assert.equal(root.kind,0);assert.ok(!seen.has(name));seen.add(name);checked++;
    rows.forEach((node,i)=>{if(node.parent!==ri)return;const key=node.key.toString('utf16le');if(!Object.hasOwn(spec,key))return;assert.equal(node.kind,spec[key]);const fi=fields.indexOf(key);assert.equal(indexes[fi],0xffffffff);indexes[fi]=i;checked++;});
  });
  let tag=0,ordinal=0xffffffff;
  if(indexes[12]!==0xffffffff){const s=rows[indexes[12]].value.toString('utf16le');assert.match(s,/^[0-9]+$/);const n=BigInt(s);assert.ok(n<=0xffffffffn);tag=n<BigInt(count)?1:2;if(tag===1)ordinal=Number(n);}
  return {rows,checked,deferred:rows.length-checked,wire:Buffer.concat([checked,rows.length-checked,tag,ordinal,...indexes].map(w))};
}
const input=(s,kind,count)=>Buffer.concat([w(kind),w(count),typeof s==='string'?wide(s):s]);
export function formSchemaEdges(call) {
  let accepted=0,rejected=0;
  const check=(s,kind=5,count=2)=>{const b=typeof s==='string'?wide(s):s,before=Buffer.from(b);assert.deepEqual(call(108,input(b,kind,count)),oracle(b,kind,count).wire);assert.deepEqual(b,before);accepted++;};
  const bad=(s,error,kind=5,count=2)=>{assert.throws(()=>call(108,input(s,kind,count)),error);rejected++;};
  for(let kind=1;kind<=5;kind++) {
    check('',kind);let all='';
    for(const [group,spec]of Object.entries(groups(kind))) {
      let body='';
      for(const [key,type]of Object.entries(spec)) {
        const prop=scalar(key,type);check(set(group,prop),kind);body+=prop;
        bad(set(group,scalar(key,type===1?2:1)),/FormSchemaTypeMismatch/,kind);
        bad(set(group,prop+prop),/DuplicateFormSchemaField/,kind);
      }
      all+=set(group,body)+' ';
      bad(set(group,'')+' '+set(group,''),/DuplicateFormSchemaSet/,kind);
      bad(scalar(group,1,''),/FormSchemaTypeMismatch/,kind);
    }
    check(all,kind);check(set('Unknown',all)+' '+all,kind);
  }
  for(const s of [set('CommonSet',set('Unknown',scalar('Name',2)))+' '+scalar('CharShapeID',2,'-1'),set('CharShapeSet',scalar('CharShapeId',1,'invalid')),set('Other',set('CharShapeSet',scalar('CharShapeID',2,'-1'))),set('CharShapeSet',scalar('FollowContext',3,'-999')),set('EditSet',scalar('Text',1,'😀\0 :\ud800'))])check(s);
  check(set('CharShapeSet',scalar('CharShapeID',1,'invalid'))+' '+set('CharShapeSet',''),0);
  check(set('ButtonSet',scalar('Value',1,'future')),1);
  check(set('__proto__',set('CharShapeSet',scalar('CharShapeID',2,'-1')))+' '+set('constructor',scalar('Name',1)));
  for(const [value,count]of [['0',0],['0',1],['0001',2],['1',1],['4294967295',0xffffffff],['0000000000000000000001',2]])check(set('CharShapeSet',scalar('CharShapeID',2,value)),5,count);
  for(const value of ['-0','-1','4294967296','18446744073709551616'])bad(set('CharShapeSet',scalar('CharShapeID',2,value)),value[0]==='-'?/InvalidFormCharShapeId/:/FormCharShapeIdOverflow/);
  bad('',/InvalidFormKind/,6);check('');
  return {accepted,rejected};
}
function rewrite(rows,changed) {
  const children=new Map();rows.forEach((r,i)=>{if(!children.has(r.parent))children.set(r.parent,[]);children.get(r.parent).push(i);});
  const write=parent=>(children.get(parent)??[]).map(i=>{const r=rows[i],key=r.key.toString('utf16le');return changed.has(i)?changed.get(i):r.kind===0?set(key,write(i))+' ':scalar(key,r.kind,r.value.toString('utf16le'));}).join('');
  return write(null);
}
export {oracle as formSchemaEvidence,rewrite as rewriteFormProperties};
export function formSchemaActual(call,cfb) {
  const results=[],ids=['????','tbp+','tbc+','boc+','tbr+','tde+'];
  for(const name of ['form-01.hwp','form-02.hwp']) {
    cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url)),{strict:true});
    const doc=inflateRawSync(cfb.findExact('/DocInfo').content),count=documentRecords(doc).filter(r=>r.tag===21).length,body=inflateRawSync(cfb.findExact('/BodyText/Section0').content);let forms=0,known=0,deferred=0,rejected=0;
    for(const r of documentRecords(body).filter(r=>r.tag===91)) {
      const raw=body.subarray(r.start,r.end),kind=ids.indexOf(raw.subarray(0,4).toString()),bytes=raw.subarray(14,14+raw.readUInt16LE(12)*2),e=oracle(bytes,kind,count);assert.ok(kind>0);forms++;known+=e.checked;deferred+=e.deferred;
      const check=()=>assert.deepEqual(call(108,input(bytes,kind,count)),e.wire);check();assert.equal(e.wire.readUInt32LE(8),1);assert.equal(e.wire.readUInt32LE(12),0);
      const ci=e.rows.findIndex(n=>n.key.toString('utf16le')==='CharShapeID');
      const past=rewrite(e.rows,new Map([[ci,scalar('CharShapeID',2,String(count))]]));const out=call(108,input(past,kind,count));assert.deepEqual(out,oracle(wide(past),kind,count).wire);assert.equal(out.readUInt32LE(8),2);check();
      for(let i=0;i<e.rows.length;i++){const n=e.rows[i];if(n.kind===0)continue;const wrong=rewrite(e.rows,new Map([[i,scalar(n.key.toString('utf16le'),n.kind===1?2:1)]]));assert.throws(()=>call(108,input(wrong,kind,count)),/FormSchemaTypeMismatch/);rejected++;check();}
      const shifted=set('Future',set('CharShapeSet',scalar('CharShapeID',2,'-1')))+' '+bytes.toString('utf16le');assert.deepEqual(call(108,input(shifted,kind,count)),oracle(wide(shifted),kind,count).wire);
    }
    assert.equal(forms,5);assert.equal(known,118);assert.equal(deferred,0);results.push({name,forms,charShapes:count,known,deferred,rejected});
  }
  return results;
}
