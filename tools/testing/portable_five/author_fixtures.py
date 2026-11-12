"""Deterministic authored fixtures: pure construction, exclusive output, read-only check."""
import sys
sys.dont_write_bytecode = True
import argparse
import hashlib
import io
import json
import struct
import zipfile
from xml.etree.ElementTree import ParseError
from cfb_author import write_streams
import paths

H='http://www.hancom.co.kr/hwpml/2011/head';P='http://www.hancom.co.kr/hwpml/2011/paragraph';S='http://www.hancom.co.kr/hwpml/2011/section';C='http://www.hancom.co.kr/hwpml/2011/core';CH='http://schemas.openxmlformats.org/drawingml/2006/chart'

def build():
    files = {}
    def xml(text):return text.encode('utf8')
    def package(name,header,section,extras={}):
        items=[('header','Contents/header.xml','application/xml'),('section','Contents/section0.xml','application/xml')]+[({'BinData/pixel.gif':'image17','Chart/chart1.xml':'chart17'}.get(k,k),k,'image/gif' if k.endswith('.gif') else 'application/xml') for k in extras]
        manifest=''.join(f'<o:item id="{i}" href="{p}" media-type="{m}" isEmbeded="1"/>' for i,p,m in items)
        hpf=f'<o:package xmlns:o="http://www.idpf.org/2007/opf/"><o:manifest>{manifest}</o:manifest><o:spine><o:itemref idref="header"/><o:itemref idref="section"/></o:spine></o:package>'
        entries={'mimetype':b'application/hwp+zip','META-INF/container.xml':xml('<c:container xmlns:c="urn:oasis:names:tc:opendocument:xmlns:container"><c:rootfiles><c:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></c:rootfiles></c:container>'),'Contents/content.hpf':xml(hpf),'Contents/header.xml':xml(header),'Contents/section0.xml':xml(section),**extras}
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer,'w',compression=zipfile.ZIP_STORED) as z:
            for path,data in entries.items():
                zi=zipfile.ZipInfo(path,(1980,1,1,0,0,0));zi.external_attr=0;z.writestr(zi,data)
        files[name] = buffer.getvalue()
        for path,data in [('chart.xml',extras.get('Chart/chart1.xml')),('chart-section.xml',xml(section))] if name=='chart.hwpx' else []:
            if data is not None:files[path] = data

    chart=f'<c:chartSpace xmlns:c="{CH}"><c:chart><c:plotArea><c:stockChart/></c:plotArea><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>'
    # Chosen values, authored here: not copied observed dimensions or fallbacks.
    chart_section=f'<s:sec xmlns:s="{S}" xmlns:p="{P}"><p:p id="101"><p:run><p:switch><p:case><p:chart chartIDRef="Chart/chart1.xml"><p:sz width="12345" height="23456" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE"/><p:pos treatAsChar="false" vertOffset="-17" horzOffset="29" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT"/></p:chart></p:case><p:default><p:ole binaryItemIDRef="preview"><p:sz width="999" height="888"/><p:pos treatAsChar="true"/></p:ole></p:default></p:switch></p:run></p:p></s:sec>'
    header=f'<h:head xmlns:h="{H}" secCnt="1" version="1.5"/>'
    package('chart.hwpx',header,chart_section,{'Chart/chart1.xml':xml(chart)})
    # GIF87a: 1x1, two-color global table, LZW codes clear4,pixel0,end5.
    gif=b'GIF87a'+struct.pack('<HHBBB',1,1,0x80,0,0)+b'\0\0\0\xff\xff\xff'+b','+struct.pack('<4HB',0,0,1,1,0)+bytes([2,2,0x44,0x01,0,0x3b])
    files['pixel.gif'] = gif
    gif_header=f'<h:head xmlns:h="{H}" xmlns:c="{C}" secCnt="1" version="1.5"><h:refList><h:borderFills itemCnt="1"><h:borderFill id="17"><c:fillBrush><c:imgBrush><c:img binaryItemIDRef="image17"/></c:imgBrush></c:fillBrush></h:borderFill></h:borderFills></h:refList></h:head>'
    gif_section=f'<s:sec xmlns:s="{S}" xmlns:p="{P}"><p:p><p:run><p:tbl><p:tr><p:tc borderFillIDRef="17"><p:subList><p:p/></p:subList></p:tc><p:tc><p:subList><p:p/></p:subList></p:tc></p:tr></p:tbl></p:run></p:p></s:sec>'
    package('background.hwpx',gif_header,gif_section,{'BinData/pixel.gif':gif})
    # Sparse explicit style/shape IDs expose accidental implicit numeric-zero fallback.
    run_header=f'<h:head xmlns:h="{H}" secCnt="1" version="1.5"><h:refList><h:charProperties itemCnt="1"><h:charPr id="43" height="1000"/></h:charProperties><h:styles itemCnt="1"><h:style id="17" charPrIDRef="43"/></h:styles></h:refList></h:head>'
    run_section=f'<s:sec xmlns:s="{S}" xmlns:p="{P}"><p:p id="101" styleIDRef="17"><p:run charPrIDRef="43"><p:t>before</p:t></p:run></p:p><p:p id="102" styleIDRef="17"><p:linesegarray/></p:p><p:p id="103" styleIDRef="17"><p:run charPrIDRef="43"><p:t>after</p:t></p:run></p:p></s:sec>'
    package('runless.hwpx',run_header,run_section)
    files['runless-header.xml'] = xml(run_header); files['runless-section.xml'] = xml(run_section)

    def frame(tag,level,b):return struct.pack('<I',tag|(level<<10)|(len(b)<<20))+b
    def put(b,at,fmt,n):struct.pack_into('<'+fmt,b,at,n)
    def text(s):return s.encode('utf-16-le')
    def paragraph(s,id,last,mask=0):
        h=bytearray(22);put(h,0,'I',(0x80000000 if last else 0)|(len(s)//2));put(h,4,'I',mask);put(h,12,'H',1);put(h,18,'I',id)
        return frame(66,0,h)+frame(67,1,s)+frame(68,1,bytes(8))
    # Table wire fixture: 5.0.1.7, seven font groups, one explicit 10pt char shape,
    # paragraph/style/tab0, no border declaration (optional one-based border0).
    head=bytearray(256);head[:17]=b'HWP Document File';put(head,32,'I',0x05000107)
    props=bytearray(26);put(props,0,'H',1)
    for i in range(1,7):put(props,2*i,'H',1)
    mapping=bytearray(60)
    for i in range(1,8):put(mapping,4*i,'I',1)
    for i in (9,10,13,14):put(mapping,4*i,'I',1)
    info=frame(16,0,props)+frame(17,0,mapping)
    face=b'\0'+struct.pack('<H',12)+text('PortableFace')
    for i in range(7):info+=frame(19,1,face)
    char=bytearray(68);char[14:21]=bytes([100])*7;char[28:35]=bytes([100])*7;put(char,42,'I',1000);put(char,60,'I',0xffffffff)
    para=bytearray(46);put(para,0,'I',(1<<2)|(1<<7));put(para,24,'I',160)
    style=struct.pack('<H',8)+text('Portable')+struct.pack('<H',8)+text('Portable')+struct.pack('<BBHHH',0,0,1042,0,0)
    # Style Table47 tail is 8 bytes after the two string fields (12 bytes total prefix/tail).
    info+=frame(21,1,char)+frame(22,1,bytes(8))+frame(25,1,para)+frame(26,1,style)
    token=lambda control:struct.pack('<HI',2,control)+bytes(8)+struct.pack('<H',2)
    section=paragraph(token(0x73656364)+text('\r'),101,False,1<<2)
    secd=bytearray(30);put(secd,0,'I',0x73656364);put(secd,20,'H',1)
    section+=frame(71,1,secd)+frame(73,2,struct.pack('<10I',60000,80000,7200,7200,7200,7200,3600,3600,0,0))
    section+=paragraph(text('Target😀\r'),102,True)
    cfb=write_streams({'FileHeader':bytes(head),'DocInfo':info,'BodyText/Section0':section})
    files['table-wire.hwp'] = cfb; files['table-wire-docinfo.bin'] = info; files['table-wire-section.bin'] = section
    return files


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='read-only exact-SHA check of the seven repository fixtures')
    parser.add_argument('--fixtures', help='check-only absolute directory ending src/testing/fixtures/portable-five')
    parser.add_argument('--output', help='exclusive new output directory under the fixed OS temp directory')
    args = parser.parse_args(argv)
    if args.check and args.output or args.fixtures and not args.check:
        parser.error('--output is generation-only; --fixtures requires --check')
    try:
        # Reject caller paths before any input IO or output creation.
        destination = paths.fixture_path(args.fixtures) if args.check else paths.output_path(args.output)
        manifest = paths.expected()
        files = build()
        paths.exact_generated(files, manifest)
        from oracle import verify
        verify({name: files[name] for name in paths.CHECKED})
        if args.check:
            current = paths.read_fixtures(destination, manifest)
            for name in paths.CHECKED:
                if current[name] != files[name] or hashlib.sha256(current[name]).hexdigest() != next(r['sha256'] for r in manifest['generatedFiles'] if r['path'] == name):
                    raise ValueError('input exact SHA mismatch: ' + name)
            verify(current)
            result = {'mode': 'check', 'filesChecked': len(paths.CHECKED), 'generatedSHAsChecked': len(paths.GENERATED), 'writes': 0}
        else:
            fixture = paths.create_output(destination, files)
            result = {'mode': 'generated', 'output': str(destination), 'fixtures': fixture, 'generatedFiles': len(files), 'exclusiveNewDirectory': True}
        print(json.dumps(result, sort_keys=True))
        return 0
    except (ValueError, OSError, KeyError, AssertionError, struct.error, ParseError, zipfile.BadZipFile) as err:
        print(str(err), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
