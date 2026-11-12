"""Independent ZIP/XML/CFB/GIF oracle; fixed named, bounded, read-only inputs."""
import sys
sys.dont_write_bytecode = True
import argparse
import hashlib
import io
import json
import struct
import zipfile
import xml.etree.ElementTree as E
from cfb_read import CFB, records, u16, u32
import paths

NS={'h':'http://www.hancom.co.kr/hwpml/2011/head','p':'http://www.hancom.co.kr/hwpml/2011/paragraph','s':'http://www.hancom.co.kr/hwpml/2011/section','c':'http://www.hancom.co.kr/hwpml/2011/core','chart':'http://schemas.openxmlformats.org/drawingml/2006/chart','o':'http://www.idpf.org/2007/opf/'}
def need(v,msg):
    if not v:raise ValueError(msg)
def entries(name, files):
    with zipfile.ZipFile(io.BytesIO(files[name])) as z:
        infos = z.infolist()
        need(len(infos) <= 16 and sum(i.file_size for i in infos) <= 262144, 'ZIP budget')
        need(all(i.compress_type == zipfile.ZIP_STORED and i.file_size == i.compress_size and i.file_size <= 65536 for i in infos), 'authored stored ZIP sizes')
        need(z.testzip() is None,'ZIP CRC');need(len(z.namelist())==len(set(z.namelist())),'duplicate ZIP names')
        return {n:z.read(n) for n in z.namelist()}
def package(es):
    need(es['mimetype']==b'application/hwp+zip','mimetype')
    hpf=E.fromstring(es['Contents/content.hpf']);items=hpf.findall('o:manifest/o:item',NS);ids=[i.attrib['id'] for i in items]
    need(len(ids)==len(set(ids)),'manifest duplicate ID')
    need(all(i.attrib['href'] in es for i in items),'missing manifest target')
    need(all(i.attrib['idref'] in ids for i in hpf.findall('o:spine/o:itemref',NS)),'spine reference')
    for n,b in es.items():
        if n.endswith(('.xml','.hpf')):E.fromstring(b)
    need(E.fromstring(es['Contents/header.xml']).attrib['secCnt']=='1','section declaration')
def gap(es):
    chart=E.fromstring(es['Chart/chart1.xml']);parts=chart.findall('chart:chart/chart:dispBlanksAs',NS)
    need(len(parts)==1 and parts[0].attrib=={'val':'gap'},'explicit gap in chart owner')
def geometry(es):
    sec=E.fromstring(es['Contents/section0.xml']);wrappers=sec.findall('p:p/p:run/p:switch',NS);need(len(wrappers)==1,'wrapper count')
    ch=wrappers[0].find('p:case/p:chart',NS);ole=wrappers[0].find('p:default/p:ole',NS)
    need(ch.find('p:sz',NS).attrib=={'width':'12345','height':'23456','widthRelTo':'ABSOLUTE','heightRelTo':'ABSOLUTE'},'chart geometry')
    need(ch.find('p:pos',NS).attrib=={'treatAsChar':'false','vertOffset':'-17','horzOffset':'29','vertRelTo':'PARA','horzRelTo':'COLUMN','vertAlign':'TOP','horzAlign':'LEFT'},'chart position')
    need(ole.find('p:sz',NS).attrib=={'width':'999','height':'888'},'distinct fallback')
def gif_bytes(b):
    need(b[:6]==b'GIF87a' and len(b)==35,'authored GIF framing')
    need(struct.unpack_from('<HH',b,6)==(1,1),'GIF logical size')
    need(b[10:13]==bytes([0x80,0,0]) and b[13:19]==bytes([0,0,0,255,255,255]),'GIF two colors')
    need(b[19]==0x2c and struct.unpack_from('<4H',b,20)==(0,0,1,1),'GIF image descriptor')
    need(b[28]==0 and b[29:31]==bytes([2,2]) and b[-2:]==bytes([0,0x3b]),'GIF LZW framing')
    bits=int.from_bytes(b[31:33],'little');need([(bits>>(i*3))&7 for i in range(3)]==[4,0,5],'GIF clear/pixel/end codes')
    need(hashlib.sha256(b).hexdigest()=='cd251e1117213163d1cda55ad6f7ec3e6046042739c67efe0c939f6bded51efe','GIF authored SHA')
def background(es):
    header=E.fromstring(es['Contents/header.xml']);section=E.fromstring(es['Contents/section0.xml']);hpf=E.fromstring(es['Contents/content.hpf'])
    cell=section.find('.//p:tc',NS);need(cell.attrib['borderFillIDRef']=='17','cell border owner')
    border=header.find('h:refList/h:borderFills/h:borderFill',NS);need(border.attrib['id']=='17','border declaration')
    image=border.find('c:fillBrush/c:imgBrush/c:img',NS);need(image.attrib['binaryItemIDRef']=='image17','image reference')
    matches=[i for i in hpf.findall('o:manifest/o:item',NS) if i.attrib['id']=='image17'];need(len(matches)==1,'image unique target');item=matches[0]
    need(item.attrib['media-type']=='image/gif' and item.attrib['href']=='BinData/pixel.gif','GIF manifest identity')
    gif_bytes(es[item.attrib['href']])
def runless(es):
    header=E.fromstring(es['Contents/header.xml']);section=E.fromstring(es['Contents/section0.xml']);ps=section.findall('p:p',NS)
    need(len(ps)==3,'authored paragraphs')
    need([p.attrib['id'] for p in ps]==['101','102','103'],'distinct authored p identities')
    need(ps[0].find('p:run/p:t',NS).text=='before' and ps[2].find('p:run/p:t',NS).text=='after','neighbors')
    need(ps[1].attrib['styleIDRef']=='17' and ps[1].find('p:run',NS) is None,'runless explicit style')
    style=header.find('h:refList/h:styles/h:style',NS);shape=header.find('h:refList/h:charProperties/h:charPr',NS)
    need(style.attrib=={'id':'17','charPrIDRef':'43'} and shape.attrib=={'id':'43','height':'1000'},'sparse style-to-shape ownership')
    # Independent UTF16 boundaries for the actual strings used by the Native test.
    b='본문😀<&'.encode('utf-16-le');need(len(b)//2==6,'UTF16 source units')
    need(u16(b,4)==0xd83d and u16(b,6)==0xde00,'surrogate split boundary3')
    need(len('더추가본문😀<&'.encode('utf-16-le'))//2==9,'styled reopened units')
def h5(payload):
    cf=CFB(payload);need(set(cf.paths)=={'/FileHeader','/DocInfo','/BodyText/Section0'},'owned streams only')
    head=cf.paths['/FileHeader'];need(head[:17]==b'HWP Document File' and u32(head,32)==0x05000107 and u32(head,36)==0,'H5 uncompressed version')
    info=records(cf.paths['/DocInfo']);body=records(cf.section());need([r['tag'] for r in info]==[16,17]+[19]*7+[21,22,25,26],'DocInfo resource records')
    need(u16(info[0]['payload'],0)==1,'H5 section count');mapping=info[1]['payload'];need([u32(mapping,i*4) for i in range(1,8)]==[1]*7,'seven font groups')
    need(u32(mapping,8*4)==0 and all(u32(mapping,i*4)==1 for i in (9,10,13,14)),'explicit no-border/counts')
    need(u32(info[9]['payload'],42)==1000,'char shape chosen height')
    style=info[-1]['payload'];n=u16(style,0);need(style[2:2+n*2].decode('utf-16-le')=='Portable','local style');pos=2+n*2;n=u16(style,pos);pos+=2+n*2
    need(len(style)-pos==8 and u16(style,pos+2)==1042 and u16(style,pos+4)==0 and u16(style,pos+6)==0,'style resource references')
    need([r['tag'] for r in body]==[66,67,68,71,73,66,67,68],'paragraph/control framing')
    hs=[r for r in body if r['tag']==66];texts=[r for r in body if r['tag']==67]
    need([u32(h['payload'],18) for h in hs]==[101,102],'H5 paragraph IDs')
    for h,txt in zip(hs,texts):need(u32(h['payload'],0)&0x7fffffff==len(txt['payload'])//2,'header text units')
    need(u32(hs[0]['payload'],0)&0x80000000==0 and u32(hs[1]['payload'],0)&0x80000000!=0,'last high bit retained')
    need(texts[1]['payload'].decode('utf-16-le')=='Target😀\r','target source text')
    return {'cfbBytes':len(cf.data),'paragraphs':len(hs),'borderDeclarations':0}


def verify(files):
    for name in ('chart.hwpx', 'background.hwpx', 'runless.hwpx'):
        package(entries(name, files))
    gap(entries('chart.hwpx', files))
    geometry(entries('chart.hwpx', files))
    background(entries('background.hwpx', files))
    gif_bytes(files['pixel.gif'])
    need(entries('background.hwpx', files)['BinData/pixel.gif'] == files['pixel.gif'], 'GIF literal equality')
    need(entries('chart.hwpx', files)['Chart/chart1.xml'] == files['chart.xml'], 'chart literal equality')
    need(entries('chart.hwpx', files)['Contents/section0.xml'] == files['chart-section.xml'], 'section literal equality')
    runless(entries('runless.hwpx', files))
    return h5(files['table-wire.hwp'])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixtures', help='absolute directory ending src/testing/fixtures/portable-five')
    args = parser.parse_args(argv)
    try:
        directory = paths.fixture_path(args.fixtures)
        manifest = paths.expected()
        result = verify(paths.read_fixtures(directory, manifest))
        print(json.dumps({'mode': 'independent-oracle', 'files': len(paths.CHECKED), 'writes': 0, **result}, sort_keys=True))
        return 0
    except (ValueError, OSError, KeyError, AssertionError, struct.error, E.ParseError, zipfile.BadZipFile) as err:
        print(str(err), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
