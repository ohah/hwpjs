"""Independent full-source RGB range oracle for constructor-authored scale cases."""
import copy,importlib.util,json,pathlib,re,struct,sys,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
def require(v,m):
    if not v:raise ValueError(m)
def rgb_payload(payload,color):
    b=bytearray(payload);value=int(color[1:],16);struct.pack_into('<I',b,52,((value>>16)&255)|(value&0xff00)|((value&255)<<16));return bytes(b)
def h5(plan):
    spec=importlib.util.spec_from_file_location('independent_cfb',Path(__file__).with_name('character-cfb-reader.py'));c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
    a,b=c.Compound(plan['before']),c.Compound(plan['after']);require(a.metadata==b.metadata,'CFB metadata');require(a.streams.keys()==b.streams.keys(),'CFB streams')
    for p in a.streams:
        if p not in ['/DocInfo','/BodyText/Section0']:require(a.streams[p]==b.streams[p],'unrelated stream')
    ar,br=a.records('/DocInfo'),b.records('/DocInfo');old=[r['payload']for r in ar if r['tag']==21];new=[r['payload']for r in br if r['tag']==21];require(new[:len(old)]==old,'original shapes');require(all(p in [rgb_payload(o,plan['color'])for o in old]for p in new[len(old):]),'unexpected new shape bytes')
    am=bytearray(next(r['payload']for r in ar if r['tag']==17));bm=next(r['payload']for r in br if r['tag']==17);struct.pack_into('<I',am,36,len(new));require(bytes(am)==bm,'DocInfo mapping count');require([r['raw']for r in ar if r['tag']not in [17,21]]==[r['raw']for r in br if r['tag']not in [17,21]],'other DocInfo records')
    def paragraphs(cfb):
        records=cfb.records('/BodyText/Section0');heads=[i for i,r in enumerate(records)if r['tag']==66];out=[]
        for i,start in enumerate(heads):
            rows=records[start:heads[i+1]if i+1<len(heads)else len(records)];text=next(r['payload']for r in rows if r['tag']==67);run=next(r['payload']for r in rows if r['tag']==68);pairs=[struct.unpack_from('<II',run,i)for i in range(0,len(run),8)];ids=[next(identity for at,identity in reversed(pairs)if at<=unit)for unit in range(len(text)//2)];out.append((rows,ids))
        return out
    ap,bp=paragraphs(a),paragraphs(b);require(len(ap)==len(bp)==plan['n']+1,'paragraph count')
    for p,((ar,ai),(br,bi))in enumerate(zip(ap,bp)):
        require(len(ai)==len(bi),'text length');ah=bytearray(ar[0]['payload']);bh=br[0]['payload'];ah[12:14]=bh[12:14];ah[16:18]=bh[16:18];require(bytes(ah)==bh,'paragraph metadata')
        require([r['raw']for r in ar[1:]if r['tag']not in [68,69]]==[r['raw']for r in br[1:]if r['tag']not in [68,69]],'text/control records')
        for unit,(x,y)in enumerate(zip(ai,bi)):
            expected=rgb_payload(old[x],plan['color'])if p>0 and unit<3 else old[x];require(new[y]==expected,'unit RGB and other style bytes')
    return {'verified':True,'format':'hwp5','paragraphs':len(ap),'coloredParagraphs':plan['n']}
H='{http://www.hancom.co.kr/hwpml/2011/head}';P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
def xml(n):return ET.tostring(n)
def hx(plan):
    a,b=zipfile.ZipFile(plan['before']),zipfile.ZipFile(plan['after']);require(a.namelist()==b.namelist(),'ZIP entries')
    for x,y in zip(a.infolist(),b.infolist()):
        for k in ['date_time','compress_type','comment','extra','internal_attr','external_attr','create_system','create_version','extract_version','flag_bits']:require(getattr(x,k)==getattr(y,k),'ZIP metadata')
        if x.filename not in ['Contents/header.xml','Contents/section0.xml']:require(a.read(x)==b.read(y),'unrelated ZIP member')
    ah,bh=ET.fromstring(a.read('Contents/header.xml')),ET.fromstring(b.read('Contents/header.xml'));ac=ah.find('./'+H+'refList/'+H+'charProperties');bc=bh.find('./'+H+'refList/'+H+'charProperties');old,new=list(ac),list(bc);require([xml(x)for x in new[:len(old)]]==[xml(x)for x in old],'original XML resources');require(int(bc.get('itemCnt'))==len(new),'XML shape count')
    oldmap={r.get('id'):r for r in old};newmap={r.get('id'):r for r in new}
    for row in new[len(old):]:
        matches=False
        for source in old:
            expected=copy.deepcopy(source);expected.set('id',row.get('id'));expected.set('textColor',plan['color']);matches=matches or xml(expected)==xml(row)
        require(matches,'new shape color-only payload')
    ac.clear();bc.clear();require(xml(ah)==xml(bh),'other header metadata')
    ase,bse=ET.fromstring(a.read('Contents/section0.xml')),ET.fromstring(b.read('Contents/section0.xml'));ap=list(ase.iter(P+'p'));bp=list(bse.iter(P+'p'));require(len(ap)==len(bp)==plan['n']+1,'XML paragraph count')
    def scalars(p,lookup):
        rows=[]
        for run in p.findall(P+'run'):
            text=''.join(t.text or ''for t in run.findall(P+'t'));shape=copy.deepcopy(lookup[run.get('charPrIDRef')]);shape.attrib.pop('id',None);data=text.encode('utf-16le');rows.extend((u,shape)for u in struct.unpack('<%dH'%(len(data)//2),data))
        return rows
    for p,(old,new)in enumerate(zip(ap,bp)):
        require(old.attrib==new.attrib,'paragraph attributes');left,right=scalars(old,oldmap),scalars(new,newmap);require(len(left)==len(right),'XML text length')
        for unit,((aunit,ashape),(bunit,bshape))in enumerate(zip(left,right)):
            require(aunit==bunit,'XML text bytes');expected=copy.deepcopy(ashape)
            if p>0 and unit<3:expected.set('textColor',plan['color'])
            require(xml(expected)==xml(bshape),'XML unit styles')
        if p==0:require(xml(old)==xml(new),'unselected HEAD paragraph')
        else:
            for para in [old,new]:
                for child in list(para):
                    if child.tag in [P+'run',P+'linesegarray']:para.remove(child)
            require(xml(old)==xml(new),'paragraph nonrun metadata')
        old.clear();new.clear()
    require(xml(ase)==xml(bse),'other section structure')
    return {'verified':True,'format':'hwpx','paragraphs':len(ap),'coloredParagraphs':plan['n']}
if __name__=='__main__':
    plan=json.loads(Path(sys.argv[1]).read_text());print(json.dumps(h5(plan)if plan['format']=='hwp5'else hx(plan)))
