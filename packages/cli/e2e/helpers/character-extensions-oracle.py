"""Independent stdlib CFB records / ZIP XML scalar-and-resource oracle. No product import."""
import copy, importlib.util, itertools, json, pathlib, re, struct, sys, zipfile, xml.etree.ElementTree as ET
LANGS=['hangul','latin','hanja','japanese','other','symbol','user']
H='{http://www.hancom.co.kr/hwpml/2011/head}'; P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
def require(v,m):
    if not v: raise ValueError(m)
def chosen(p): return {k:v for k,v in p.items() if v is not None}
def ranges(rs):
    heads=[i for i,r in enumerate(rs) if r['tag']==66]
    result=[]
    for index,start in enumerate(heads):
        end=heads[index+1] if index+1<len(heads) else len(rs)
        rows=rs[start:end]; texts=[r for r in rows if r['tag']==67]; runs=[r for r in rows if r['tag']==68]
        require(len(texts)==len(runs)==1,'plain paragraph record count')
        run=runs[0]['payload']; pairs=[struct.unpack_from('<II',run,i) for i in range(0,len(run),8)]
        require(pairs and pairs[0][0]==0,'initial character run')
        ids=[next(identity for at,identity in reversed(pairs) if at<=unit) for unit in range(len(texts[0]['payload'])//2)]
        result.append((rows,ids))
    return result
def h5(plan):
    path=pathlib.Path(__file__).with_name('character-cfb-reader.py');spec=importlib.util.spec_from_file_location('independent_cfb',path);c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
    a,b=c.Compound(plan['before']),c.Compound(plan['after']);props=chosen(plan['properties'])
    require(a.metadata==b.metadata,'CFB metadata');require(a.streams.keys()==b.streams.keys(),'CFB stream names')
    allowed={'/DocInfo','/BodyText/Section0'}
    for name in a.streams:
        if name not in allowed: require(a.streams[name]==b.streams[name],'unrelated stream '+name)
    old,new=a.records('/DocInfo'),b.records('/DocInfo');om=next(r['payload'] for r in old if r['tag']==17);nm=next(r['payload'] for r in new if r['tag']==17)
    oc=list(struct.unpack('<%di'%(len(om)//4),om));nc=list(struct.unpack('<%di'%(len(nm)//4),nm));os=[r['payload'] for r in old if r['tag']==21];ns=[r['payload'] for r in new if r['tag']==21]
    require(ns[:len(os)]==os,'original character resources');require(nc[9]==len(ns),'character count')
    of=[r['raw'] for r in old if r['tag']==19];nf=[r['raw'] for r in new if r['tag']==19]
    oldfaces=[r['payload'] for r in old if r['tag']==19];newfaces=[r['payload'] for r in new if r['tag']==19]
    font_id=None;pos=oldpos=0
    for lang in range(7):
        before=oldfaces[oldpos:oldpos+oc[1+lang]];after=newfaces[pos:pos+nc[1+lang]]
        require(after[:len(before)]==before,'original fonts')
        extra=after[len(before):]
        if props.get('fontName',{}).get('language')==LANGS[lang]:
            name=props['fontName']['name'];payload=b'\0'+struct.pack('<H',len(name.encode('utf-16le'))//2)+name.encode('utf-16le')
            require(all(x==payload for x in extra),'new font payload');require(len(extra)<=1,'font count')
            matches=[i for i,x in enumerate(after) if x[3:3+struct.unpack_from('<H',x,1)[0]*2].decode('utf-16le')==name]
            require(matches,'missing font name');font_id=matches[0]
        else: require(not extra,'unselected language fonts')
        pos+=len(after);oldpos+=len(before)
    require(pos==len(newfaces) and oldpos==len(oldfaces),'font mapping count')
    for i in range(len(oc)):
        if i!=9 and not (1<=i<=7 and props.get('fontName',{}).get('language')==LANGS[i-1]):require(oc[i]==nc[i],'unrelated count')
    require([r['raw'] for r in old if r['tag'] not in (17,19,21)]==[r['raw'] for r in new if r['tag'] not in (17,19,21)],'unrelated DocInfo records')
    def patched(payload,patch):
        data=bytearray(payload);flags=struct.unpack_from('<I',data,46)[0]
        if 'size'in patch:struct.pack_into('<I',data,42,patch['size'])
        for key,bit in [('bold',1),('italic',0)]:
            if key in patch:flags=(flags&~(1<<bit))|(int(patch[key])<<bit)
        if 'underline'in patch:flags=(flags&~12)|({'none':0,'bottom':1,'top':3}[patch['underline']]<<2)
        struct.pack_into('<I',data,46,flags)
        if 'textColor'in patch:
            v=int(patch['textColor'][1:],16);struct.pack_into('<I',data,52,((v>>16)&255)|(v&0xff00)|((v&255)<<16))
        if 'fontName'in patch:struct.pack_into('<H',data,LANGS.index(patch['fontName']['language'])*2,font_id)
        return bytes(data)
    possibilities=set()
    keys=list(props)
    for n in range(len(keys)+1):
        for subset in itertools.combinations(keys,n):
            for source in os:possibilities.add(patched(source,{k:props[k] for k in subset}))
    require(all(x in possibilities for x in ns[len(os):]),'unexpected appended character payload')
    oldbody=a.records('/BodyText/Section0');newbody=b.records('/BodyText/Section0');ap,bp=ranges(oldbody),ranges(newbody);require(len(ap)==len(bp),'paragraph count')
    for ordinal,((ar,ai),(br,bi)) in enumerate(zip(ap,bp)):
        require(len(ai)==len(bi),'text length')
        if ordinal!=plan['paragraph']:require([x['raw'] for x in ar]==[x['raw'] for x in br],'unselected paragraph records')
        else:
            ah=bytearray(ar[0]['payload']);bh=bytearray(br[0]['payload']);ah[12:14]=bh[12:14];ah[16:18]=bh[16:18]
            require(ah==bh,'paragraph metadata')
            require([x['raw'] for x in ar[1:] if x['tag'] not in (68,69)]==[x['raw'] for x in br[1:] if x['tag'] not in (68,69)],'text/control/nonlayout records')
        for unit,(x,y) in enumerate(zip(ai,bi)):
            expected=patched(os[x],props) if ordinal==plan['paragraph'] and plan['startUnit']<=unit<plan['endUnit'] else os[x]
            require(ns[y]==expected,'scalar character formatting')
    return {'verified':True,'format':'hwp5','paragraphs':len(ap),'newCharacterResources':len(ns)-len(os)}
def xmlbytes(node):return ET.tostring(node,encoding='utf-8')
def hx(plan):
    a,b=zipfile.ZipFile(plan['before']),zipfile.ZipFile(plan['after']);require(a.namelist()==b.namelist(),'ZIP names/order');props=chosen(plan['properties'])
    for x,y in zip(a.infolist(),b.infolist()):
        for k in ['date_time','compress_type','comment','extra','internal_attr','external_attr','create_system','create_version','extract_version','flag_bits']:require(getattr(x,k)==getattr(y,k),'ZIP metadata '+k)
        if x.filename not in ['Contents/header.xml','Contents/section0.xml']:require(a.read(x)==b.read(y),'unrelated ZIP entry')
    raw_old=a.read('Contents/header.xml');raw_new=b.read('Contents/header.xml')
    fragments=lambda raw:re.findall(rb'<hh:charPr\b[^>]*>.*?</hh:charPr>',raw,re.S)
    original_fragments=fragments(raw_old);require(original_fragments and fragments(raw_new)[:len(original_fragments)]==original_fragments,'original character source bytes')
    ah,bh=ET.fromstring(raw_old),ET.fromstring(raw_new);parents=lambda h:h.find('./'+H+'refList/'+H+'charProperties')
    ac,bc=parents(ah),parents(bh);old=list(ac);new=list(bc);require([xmlbytes(x) for x in new[:len(old)]]==[xmlbytes(x) for x in old],'original XML character resources');require(int(bc.get('itemCnt'))==len(new),'XML resource count')
    font_id=None
    if 'fontName'in props:
        f=props['fontName'];ag=ah.find('./'+H+'refList/'+H+'fontfaces/'+H+'fontface[@lang="'+f['language'].upper()+'"]');bg=bh.find('./'+H+'refList/'+H+'fontfaces/'+H+'fontface[@lang="'+f['language'].upper()+'"]')
        require(ag is not None and bg is not None,'font group');require([xmlbytes(x) for x in list(bg)[:len(ag)]]==[xmlbytes(x) for x in ag],'original XML fonts')
        require({k:v for k,v in ag.attrib.items() if k!='fontCnt'}=={k:v for k,v in bg.attrib.items() if k!='fontCnt'},'font group metadata')
        for row in list(bg)[len(ag):]:require(row.attrib=={'id':row.get('id'),'face':f['name'],'type':'TTF','isEmbedded':'0'} and len(row)==0,'new XML face payload')
        require(int(bg.get('fontCnt'))==len(bg),'font count');matches=[x for x in bg if x.get('face')==f['name']];require(matches,'font name');font_id=matches[0].get('id')
        ag.clear();bg.clear()
    def patched(source,patch,identity):
        node=copy.deepcopy(source);node.set('id',identity)
        if 'size'in patch:node.set('height',str(patch['size']))
        if 'textColor'in patch:node.set('textColor',patch['textColor'].lower())
        for key in ['bold','italic']:
            if key in patch:
                for row in list(node):
                    if row.tag==H+key:node.remove(row)
                if patch[key]:
                    row=ET.Element(H+key);order=['italic','bold','underline','strikeout','outline','shadow','emboss','engrave','supscript','subscript'];at=next((i for i,x in enumerate(node) if x.tag in [H+n for n in order[order.index(key)+1:]]),len(node));node.insert(at,row)
        if 'underline'in patch:
            row=node.find(H+'underline')
            if row is None:
                row=ET.Element(H+'underline',{'type':'NONE','shape':'SOLID','color':'#000000'});node.append(row)
            row.set('type',patch['underline'].upper())
        if 'fontName'in patch:
            node.find(H+'fontRef').set(patch['fontName']['language'],font_id)
        return node
    for row in new[len(old):]:
        require(any(xmlbytes(row)==xmlbytes(patched(source,{k:props[k] for k in subset},row.get('id'))) for n in range(len(props)+1) for subset in itertools.combinations(list(props),n) for source in old),'unexpected XML resource clone')
    ac.clear();bc.clear();require(xmlbytes(ah)==xmlbytes(bh),'unrelated header structure')
    lookupold={x.get('id'):x for x in old};lookupnew={x.get('id'):x for x in new}
    ase,bse=ET.fromstring(a.read('Contents/section0.xml')),ET.fromstring(b.read('Contents/section0.xml'));ap=list(ase.iter(P+'p'));bp=list(bse.iter(P+'p'));require(len(ap)==len(bp),'XML paragraph count')
    def scalar(p,lookup):
        out=[]
        for run in p.findall(P+'run'):
            identity=run.get('charPrIDRef');node=copy.deepcopy(lookup[identity]);node.attrib.pop('id',None)
            text=''.join(x.text or '' for x in run.findall(P+'t'));out.extend([(unit,copy.deepcopy(node)) for unit in struct.unpack('<%dH'%(len(text.encode('utf-16le'))//2),text.encode('utf-16le'))])
        return out
    for ordinal,(x,y) in enumerate(zip(ap,bp)):
        ai,bi=scalar(x,lookupold),scalar(y,lookupnew);require(len(ai)==len(bi),'XML text length')
        for unit,((at,acp),(bt,bcp)) in enumerate(zip(ai,bi)):
            require(at==bt,'XML text')
            if ordinal==plan['paragraph'] and plan['startUnit']<=unit<plan['endUnit']:
                acp=patched(acp,props,'0');acp.attrib.pop('id',None)
            require(xmlbytes(acp)==xmlbytes(bcp),'XML scalar properties')
        if ordinal!=plan['paragraph']:require(xmlbytes(x)==xmlbytes(y),'unselected XML paragraph')
        else:
            require(x.attrib==y.attrib,'XML paragraph attributes')
            for node in [x,y]:
                for row in list(node):
                    if row.tag in [P+'run',P+'linesegarray']:node.remove(row)
            require(xmlbytes(x)==xmlbytes(y),'XML paragraph metadata')
        x.clear();y.clear()
    require(xmlbytes(ase)==xmlbytes(bse),'non-paragraph section structure')
    return {'verified':True,'format':'hwpx','paragraphs':len(ap),'newCharacterResources':len(new)-len(old)}
def verify(plan):return h5(plan) if plan['format']=='hwp5' else hx(plan)
if __name__=='__main__':print(json.dumps(verify(json.loads(pathlib.Path(sys.argv[1]).read_text()))))
