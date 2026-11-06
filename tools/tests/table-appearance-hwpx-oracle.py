"""Batch union + authored new-document ZIP oracle; independent stdlib readers only."""
import base64
import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import zipfile
from decimal import Decimal
import xml.etree.ElementTree as ET
spec = importlib.util.spec_from_file_location('single', Path(__file__).with_name('cell-border-hwpx-oracle.py'))
single = importlib.util.module_from_spec(spec)
spec.loader.exec_module(single)
need = single.require
H, P, C = single.HEAD, single.PARA, single.CORE

def batch(req):
    before, after = req['before'], req['after']
    old = single.archive(before)
    new = single.archive(after)
    need(list(old) == list(new), 'entry order/set changed')
    head = single.parse(old['Contents/header.xml'])
    newhead = single.parse(new['Contents/header.xml'])
    container = single.one([e for e in head['elements'] if e.tag == '{'+H+'}borderFills'], 'BF container')
    newcontainer = single.one([e for e in newhead['elements'] if e.tag == '{'+H+'}borderFills'], 'new BF container')
    oldfills = [e for e in container if e.tag == '{'+H+'}borderFill']
    newfills = [e for e in newcontainer if e.tag == '{'+H+'}borderFill']
    oldids = {int(e.attrib['id']) for e in oldfills}
    need(len(oldids) == len(oldfills), 'old duplicate resource')
    added = [e for e in newfills if int(e.attrib['id']) not in oldids]
    need(int(newcontainer.attrib['itemCnt']) == len(newfills), 'new resource count')
    sections, clones, keys, owners = {}, {}, {}, set()
    for edit in req['edits']:
        target, operations = edit['target'], edit['operations']
        owner = (target['section'], target['listNode'])
        need(owner not in owners, 'duplicate oracle owner'); owners.add(owner)
        o = single.original(before, target)
        name = o['sectionName']
        if name not in sections:
            original = single.parse(old[name]); current = single.parse(new[name])
            expected = copy.deepcopy(original['root'])
            sections[name] = (original, current, expected, [])
        original, current, expected, changes = sections[name]
        cell = o['cellIndex']
        ref = int(current['elements'][cell].attrib['borderFillIDRef'])
        need(ref not in oldids, 'expected new clone for changed intent')
        clone = single.one([e for e in added if int(e.attrib['id']) == ref], 'referenced unique new clone')
        expected_clone = copy.deepcopy(o['source']); expected_clone.set('id',str(ref)); expected_clone.tail = None
        changed_edges = set(); changed_background = False
        for op in operations:
            color = op['color']; need(type(color) is int and 0 <= color <= 0xffffff, 'RGB24')
            if op['kind'] == 'cell-background':
                changed_background = True
                brushes = [e for e in expected_clone if e.tag == '{'+C+'}fillBrush']
                if brushes: win = single.one(list(brushes[0]), 'winBrush')
                else: win = ET.SubElement(ET.SubElement(expected_clone,'{'+C+'}fillBrush'),'{'+C+'}winBrush')
                encoded = single.swap(color) if o['encoding'] == 'colorref24' else color
                win.set('faceColor','#%06x'%encoded)
            else:
                need(op['kind']=='cell-border', 'unknown op')
                need(op['style'] in ('NONE','SOLID','DOUBLE_SLIM') and 0 < op['edges'] <= 15,'border intent')
                need(op['width'] in (10,12,15,20,25,30,40,50,60,70,100,150,200,300,400,500),'border width')
                for i,n in enumerate(('leftBorder','rightBorder','topBorder','bottomBorder')):
                    if op['edges'] & (1<<i):
                        tag = '{'+H+'}'+n; changed_edges.add(tag)
                        edge = single.one([e for e in expected_clone if e.tag == tag], 'selected edge')
                        edge.set('type',op['style']); edge.set('width','%g mm'%(op['width']/100)); edge.set('color','#%06x'%color)
        for actual, expect in zip(clone.iter(),expected_clone.iter()):
            for key in ('color','faceColor'):
                changed = (key=='color' and expect.tag in changed_edges) or (key=='faceColor' and changed_background)
                if changed and key in expect.attrib:
                    need(single.hexcolor(actual.attrib.get(key)) == single.hexcolor(expect.attrib[key]), 'expected color mismatch')
                    expect.set(key,actual.attrib[key])
            if expect.tag in changed_edges:
                need(Decimal(actual.attrib['width'].removesuffix(' mm')) == Decimal(expect.attrib['width'].removesuffix(' mm')),'width mismatch')
                expect.set('width',actual.attrib['width'])
        need(single.tree(clone)==single.tree(expected_clone),'clone full opaque tree mismatch')
        identity_clone = copy.deepcopy(expected_clone); identity_clone.set('id','expected')
        semantic_key = (o['sourceRef'], single.tree(identity_clone))
        if semantic_key in keys: need(keys[semantic_key]==ref,'identical intents not deduplicated')
        else: keys[semantic_key]=ref
        if ref in clones: need(single.tree(clones[ref])==single.tree(expected_clone),'different patches aliased')
        else: clones[ref]=expected_clone
        [n for n in expected.iter() if isinstance(n.tag,str)][cell].set('borderFillIDRef',str(ref))
        changes.append(single.attr_change(original,cell,'borderFillIDRef',ref))
    need(len(added)==len(clones) and len(newfills)==len(oldfills)+len(clones),'unused/extra clone')
    allocated=[]; candidate=0
    while len(allocated)<len(clones):
        if candidate not in oldids: allocated.append(candidate)
        candidate+=1
    need(set(allocated)==set(clones),'new IDs must use free resource IDs')
    for oldfill in oldfills:
        match=single.one([e for e in newfills if e.attrib['id']==oldfill.attrib['id']],'old resource retained')
        need(single.raw_node(head,head['elements'].index(oldfill))==single.raw_node(newhead,newhead['elements'].index(match)),'old resource byte changed')
    expected_header=copy.deepcopy(head['root'])
    expected_container=single.one([e for e in expected_header.iter() if e.tag=='{'+H+'}borderFills'],'expected container')
    expected_container.set('itemCnt',str(len(newfills)))
    for added_fill in added: expected_container.append(clones[int(added_fill.attrib['id'])])
    need(single.tree(expected_header)==single.tree(newhead['root']),'full header tree changed')
    ci=head['elements'].index(container); insert=head['nodes'][ci]['closeStart']
    clonebytes=b''.join(single.raw_node(newhead,newhead['elements'].index(e)) for e in added)
    need(new['Contents/header.xml']==single.splice(head['raw'],[single.attr_change(head,ci,'itemCnt',len(newfills)),(insert,insert,clonebytes)]),'unrelated header bytes changed')
    for name,raw in old.items():
        if name=='Contents/header.xml': continue
        if name in sections:
            original,current,expected,changes=sections[name]
            need(single.tree(expected)==single.tree(current['root']),'full section tree mismatch')
            need(new[name]==single.splice(raw,changes),'only union of tc reference bytes allowed')
        else: need(new[name]==raw,'unrelated ZIP entry '+name)
    return {'owners':len(owners),'clones':len(clones),'originalResources':len(oldfills),'entries':len(old)}

def new_document(req):
    raw=base64.b64decode(req['bytes'],validate=True)
    entries=single.archive(req['bytes'])
    expected_names=['mimetype','version.xml','META-INF/container.xml','Contents/content.hpf','Contents/header.xml','Contents/section0.xml','settings.xml']
    need(list(entries)==expected_names,'minimal authored ZIP entries/order')
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        need(z.comment==b'','no ZIP author/comment')
        for item in z.infolist():
            need(item.date_time==(1980,1,1,0,0,0),'fixed timestamp; no environment clock')
            need(not item.extra and not item.comment,'no author/extra metadata')
            need(item.compress_type==zipfile.ZIP_STORED,'authored stored entries')
    need(entries['mimetype']==b'application/hwp+zip','mimetype')
    head=single.parse(entries['Contents/header.xml'])['root']
    sec=single.parse(entries['Contents/section0.xml'])['root']
    opf=single.parse(entries['Contents/content.hpf'])['root']
    paragraphs=list(sec.iter('{'+P+'}p'))
    texts=[''.join(p.itertext()) for p in paragraphs]
    need(texts==req.get('expectedTexts',['']),'visible paragraph text/count')
    chars=list(head.iter('{'+H+'}charPr')); need(len(chars)==1 and chars[0].attrib['height']=='1100','11pt')
    page=single.one(list(sec.iter('{'+P+'}pagePr')),'one page policy')
    need(page.attrib['width']=='59528' and page.attrib['height']=='84189' and page.attrib['landscape']=='NARROWLY','A4 portrait')
    margins=single.one(list(page),'page margin'); need(all(margins.attrib[k]=='5669' for k in ('left','right','top','bottom')),'20mm margins')
    meta=single.one(list(opf.iter('{http://www.idpf.org/2007/opf/}metadata')),'metadata')
    need({n.tag for n in meta}=={'{http://purl.org/dc/elements/1.1/}identifier','{http://purl.org/dc/elements/1.1/}language'},'no default author/date/title')
    for root in (head,sec,opf):
        need(not any(n.tag.rsplit('}',1)[-1].lower() in ('author','creator','created','modified','date') for n in root.iter()),'no author/environment metadata')
    fonts=list(head.iter('{'+H+'}font')); need(len(fonts)==7 and all(n.attrib['face']=='함초롬바탕' for n in fonts),'authored font languages')
    need(head.attrib['secCnt']=='1','one section')
    return {'paragraphs':len(paragraphs),'fontHeight':1100,'page':[59528,84189],'author':None,'entries':len(entries),'texts':texts}
if __name__=='__main__':
    try:
        request=json.loads(sys.stdin.buffer.read(4*single.LIMIT))
        print(json.dumps(new_document(request) if request.get('mode')=='newDocument' else batch(request),ensure_ascii=False,sort_keys=True))
    except Exception as error:
        print(type(error).__name__+': '+str(error),file=sys.stderr);sys.exit(1)
