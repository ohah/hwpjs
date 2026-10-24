import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from '../../tools/oracle-process.mjs';
const code=String.raw`
import base64, io, runpy, warnings, zipfile
verify=runpy.run_path('tools/hwpx-anchor-prefix-oracle.py')['verify']
xml='<s xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph"><p:p id="1"><p:run charPrIDRef="2"><p:secPr><p:pagePr width="10"/></p:secPr><p:t>A<p:tab width="10"/>B</p:t><p:ctrl><p:header/></p:ctrl></p:run></p:p></s>'
edited=xml.replace('<p:t>A','<p:t>검증😀A')
def package(text,patch=None,other=b'keep',duplicate=False):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as z:
        for name,payload in [('Contents/section0.xml',text.encode()),('other',other)]:
            info=zipfile.ZipInfo(name,date_time=(2020,1,2,3,4,6))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o600<<16
            if patch:
                for key,value in patch.items():setattr(info,key,value)
            z.writestr(info,payload)
        if duplicate:
            with warnings.catch_warnings():
                warnings.simplefilter('ignore');z.writestr('other',b'duplicate')
    return base64.b64encode(out.getvalue()).decode()
request=dict(before=package(xml),after=package(edited),section=0,paragraph=1,mode='direct_text',text='검증😀')
verify(request)
def reject(patch):
    try:verify(dict(request,**patch))
    except (ValueError,AssertionError):return
    raise RuntimeError('Oracle accepted mutation: '+str(patch)[:100])
for patch in [dict(compress_type=zipfile.ZIP_STORED),dict(date_time=(2021,1,2,3,4,6)),dict(extra=b'\x01\x00\x00\x00'),dict(comment=b'changed'),dict(external_attr=1),dict(internal_attr=1),dict(create_system=0)]:
    reject(dict(after=package(edited,patch)))
for changed in [edited.replace('width="10"','width="11"',1),edited.replace('>B<','>C<'),edited.replace('id="1"','id="2"'),edited.replace('<p:header/>','<p:footer/>')]:
    reject(dict(after=package(changed)))
reject(dict(after=package(edited,other=b'changed')))
reject(dict(text='WRONG'))
reject(dict(before=package(xml,duplicate=True),after=package(edited,duplicate=True)))
reject(dict(before=request['before']+'!'))
print('prefix and ZIP controls passed')
`;
for(const flags of [[],['-O']])test(`prefix whole-tree and ZIP metadata controls ${flags.join(' ')||'normal'}`,()=>{
 const result=spawnSync('nice',['-n','19','python3',...flags,'-c',code],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/prefix and ZIP controls passed/);
});
