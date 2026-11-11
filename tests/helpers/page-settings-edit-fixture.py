"""Authored test variants of a self-created blank package; no external fixture."""
import argparse,pathlib,re,zipfile
p=argparse.ArgumentParser();p.add_argument('--input',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
page=b'''<hp:pagePr xmlns:x="urn:hwpjs:test:opaque" landscape='WIDELY' width='60000' height='90000' gutterType='LEFT_ONLY' x:width='444'><hp:margin header='1000' footer='1000' gutter='1000' left='5000' right='6000' top='4000' bottom='5000' x:retain='&amp;'/><x:opaque attr='unchanged'>retain</x:opaque></hp:pagePr>'''
with zipfile.ZipFile(a.input)as z:
    records=z.infolist();parts={i.filename:z.read(i)for i in records}
source=parts['Contents/section0.xml'];source=re.sub(rb'<hp:pagePr\b.*?</hp:pagePr>',lambda _:page,source,flags=re.S)
text='편집 용지 크기와 방향을 바꾸면 본문 줄과 쪽이 다시 배치됩니다. '
source=source.replace(b'<hp:t/>',('<hp:t>'+text*12+'</hp:t>').encode())
body=''.join(f'<hp:p id="{i+100}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t>{text*12}</hp:t></hp:run></hp:p>' for i in range(5))
source=source.replace(b'</hs:sec>',body.encode()+b'</hs:sec>')
def put(name,section,second=None):
    with zipfile.ZipFile(a.output/name,'w')as result:
        for item in records:
            data=section if item.filename=='Contents/section0.xml' else parts[item.filename]
            if second is not None and item.filename=='Contents/header.xml':data=data.replace(b'secCnt="1"',b'secCnt="2"')
            if second is not None and item.filename=='Contents/content.hpf':
                data=data.replace(b'</opf:manifest>',b'<opf:item id="section1" href="Contents/section1.xml" media-type="application/xml"/></opf:manifest>').replace(b'</opf:spine>',b'<opf:itemref idref="section1"/></opf:spine>')
            result.writestr(item,data)
        if second is not None:result.writestr('Contents/section1.xml',second)
        result.writestr('opaque/page-settings.bin',b'\x00untargeted\xff\x80')
put('plain.hwpx',source)
second=re.sub(rb'\bid="([0-9]+)"',lambda m:b'id="'+str(int(m[1])+1000).encode()+b'"',source).replace(b"width='60000'",b"width='65000'")
put('two-sections.hwpx',source,second)
put('missing-attributes.hwpx',source.replace(page,b"<hp:pagePr xmlns:x='urn:hwpjs:test:opaque' x:retain='keep'/>",1))
put('duplicate.hwpx',source.replace(page,page+page,1))
put('conditional.hwpx',source.replace(page,b'<hp:switch><hp:case>'+page+b'</hp:case></hp:switch>',1))
put('missing-page.hwpx',source.replace(page,b'',1))
print('authored variants',6)

cache=b"<hp:linesegarray><hp:lineseg textpos='0' vertpos='0' vertsize='1200' textheight='1000' baseline='800' spacing='200' horzpos='0' horzsize='48000' flags='0'/></hp:linesegarray>"
put('cached.hwpx',source.replace(b'</hp:run>',b'</hp:run>'+cache,1))
put('opaque-cache.hwpx',source.replace(b'</hp:run>',b"</hp:run><hp:linesegarray xmlns:x='urn:keep' x:keep='retain'/>",1))
