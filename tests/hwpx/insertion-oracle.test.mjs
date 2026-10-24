import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from '../../tools/oracle-process.mjs';
import {verifyHwpxInsertion} from '../../tools/hwpx-insertion-oracle.mjs';
function packages(){return JSON.parse(execFileSync('python3',['-c',String.raw`
import base64,io,json,zipfile
xml='<s xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph"><p:p><p:run charPrIDRef="2"><p:t>A<p:tab width="1"/>B</p:t></p:run></p:p></s>'
def pack(s):
 o=io.BytesIO()
 with zipfile.ZipFile(o,'w') as z:z.writestr('Contents/section0.xml',s);z.writestr('other','unchanged')
 return base64.b64encode(o.getvalue()).decode()
print(json.dumps(dict(before=pack(xml),after=pack(xml.replace('<p:t>A','<p:t>검증😀A')),bad=pack(xml.replace('width="1"','width="2"').replace('<p:t>A','<p:t>검증😀A')))))
`],{encoding:'utf8'}));}
test('unsupported inline tree receives an independent prefix check in both Python modes',()=>{
 const p=packages(),request={before:Buffer.from(p.before,'base64'),after:Buffer.from(p.after,'base64'),section:0,sectionIndex:0,startUnit:0,text:'검증😀'};
 const result=verifyHwpxInsertion(request);assert.equal(result.state,'verified');assert.equal(result.kind,'direct-prefix');
 assert(result.controls.every(r=>r.wrongExpectedRejected));assert(result.plainControls.every(r=>r.status==='unsupported'));
 assert.equal(verifyHwpxInsertion({...request,after:Buffer.from(p.bad,'base64')}).state,'mismatch');
 assert.equal(verifyHwpxInsertion({...request,text:'WRONG'}).state,'mismatch');
 const offset=verifyHwpxInsertion({...request,startUnit:1});assert.equal(offset.state,'unsupported');assert.equal(offset.kind,'plain-splice');
});
test('plain XML mismatches do not try an alternative oracle',()=>{
 const p=packages(),plain=bytes=>Buffer.from(JSON.parse(execFileSync('python3',['-c',String.raw`
import sys,json,base64,io,zipfile
b=base64.b64decode(json.load(sys.stdin));o=io.BytesIO()
with zipfile.ZipFile(io.BytesIO(b)) as z,zipfile.ZipFile(o,'w') as w:
 for n in z.namelist():w.writestr(n,z.read(n).replace(b'<p:tab width="1"/>',b''))
print(json.dumps(base64.b64encode(o.getvalue()).decode()))
`],{input:JSON.stringify(bytes),encoding:'utf8'})),'base64');
 const result=verifyHwpxInsertion({before:plain(p.before),after:plain(p.after),section:0,sectionIndex:0,startUnit:0,text:'WRONG'});
 assert.equal(result.state,'mismatch');assert.equal(result.kind,'plain-splice');assert.equal(result.plainControls,undefined);
});

test('source empty-run affinity is selected before inspecting the edited output',()=>{
 const before=Buffer.from(execFileSync('python3',['-c',String.raw`
import io,sys,zipfile
b=io.BytesIO()
with zipfile.ZipFile(b,'w') as z:z.writestr('Contents/section0.xml','<s xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph"><p:p><p:run charPrIDRef="4"/><p:run charPrIDRef="1"><p:t>text</p:t></p:run></p:p></s>')
sys.stdout.buffer.write(b.getvalue())
`],{maxBuffer:1024*1024}));
 function edit(incorrect){return execFileSync('python3',['-c',String.raw`
import io,sys,zipfile,json,base64
r=json.load(sys.stdin);o=io.BytesIO()
with zipfile.ZipFile(io.BytesIO(base64.b64decode(r['before']))) as z,zipfile.ZipFile(o,'w') as w:
 for n in z.namelist():
  s=z.read(n).decode();s=s.replace('<p:t>text','<p:t>검증😀text') if r['incorrect'] else s.replace('charPrIDRef="4"/>','charPrIDRef="4"><p:t>검증😀</p:t></p:run>')
  w.writestr(n,s)
sys.stdout.buffer.write(o.getvalue())
`],{input:JSON.stringify({before:before.toString('base64'),incorrect}),maxBuffer:1024*1024});}
 const request={before,after:edit(false),section:0,sectionIndex:0,startUnit:0,text:'검증😀'};
 const valid=verifyHwpxInsertion(request);assert.equal(valid.kind,'empty-run-prefix');assert.equal(valid.state,'verified');
 const invalid=verifyHwpxInsertion({...request,after:edit(true)});assert.equal(invalid.kind,'empty-run-prefix');assert.equal(invalid.state,'mismatch');
});

test('unknown controls before text cannot be guessed to have zero display width',()=>{
 const p=packages();function control(bytes){return execFileSync('python3',['-c',String.raw`
import base64,io,json,sys,zipfile
b=base64.b64decode(json.load(sys.stdin));o=io.BytesIO()
with zipfile.ZipFile(io.BytesIO(b)) as z,zipfile.ZipFile(o,'w') as w:
 for n in z.namelist():w.writestr(n,z.read(n).replace(b'<p:t>',b'<p:ctrl><p:unknown/></p:ctrl><p:t>'))
sys.stdout.buffer.write(o.getvalue())
`],{input:JSON.stringify(bytes),maxBuffer:1024*1024});}
 const result=verifyHwpxInsertion({before:control(p.before),after:control(p.after),section:0,sectionIndex:0,startUnit:0,text:'검증😀'});
 assert.equal(result.state,'unsupported');assert.equal(result.kind,'plain-splice');
});
