"""Independent ZIP/Expat pagePr oracle; imports no product parser or renderer."""
import json, pathlib, re, sys, zipfile, tempfile
HP='http://www.hancom.co.kr/hwpml/2011/paragraph|'
HS='http://www.hancom.co.kr/hwpml/2011/section|sec'
PAGE=('landscape','width','height','gutterType')
MARGIN=('header','footer','gutter','left','right','top','bottom')
def require(value, message):
    if not value: raise ValueError(message)
def path(value):
    p=pathlib.Path(value)
    require(p.is_absolute() and '..' not in p.parts and not re.search(r'title-column-roundtrip|hwpers_test4_complex_table|legacy/hwpers',str(p)), 'Unsafe path')
    return p
def end_tag(data,index):
    quote=None
    for i in range(index,len(data)):
        b=data[i]
        if quote is not None:
            if b==quote: quote=None
        elif b in (34,39):quote=b
        elif b==62:return i+1
    raise ValueError('Unclosed tag')
def nodes(data):
    from xml.parsers import expat
    parser=expat.ParserCreate(namespace_separator='|');result=[];stack=[]
    def start(name,attrs):
        begin=parser.CurrentByteIndex;finish=end_tag(data,begin)
        node={'name':name,'attrs':attrs,'start':begin,'tagEnd':finish,'empty':data[finish-2:finish]==b'/>','parent':stack[-1] if stack else None}
        result.append(node);stack.append(len(result)-1)
    def end(_name):
        node=result[stack.pop()]
        node['closeStart']=node['tagEnd'] if node['empty'] else parser.CurrentByteIndex
        node['end']=node['tagEnd'] if node['empty'] else end_tag(data,parser.CurrentByteIndex)
    def forbidden(*_):raise ValueError('DTD forbidden')
    parser.StartElementHandler=start;parser.EndElementHandler=end;parser.StartDoctypeDeclHandler=forbidden;parser.Parse(data,True)
    return result

def selected(data):
    ns=nodes(data);pages=[i for i,n in enumerate(ns) if n['name']==HP+'pagePr'];sec=[i for i,n in enumerate(ns) if n['name']==HP+'secPr']
    require(len(pages)==len(sec)==1,'Ambiguous or absent page owner')
    i=pages[0];p=ns[i];owner=ns[p['parent']];run=ns[owner['parent']];para=ns[run['parent']];root=ns[para['parent']]
    require(owner['name']==HP+'secPr' and run['name']==HP+'run' and para['name']==HP+'p' and root['name']==HS and root['parent'] is None,'Conditional owner')
    margins=[n for n in ns if n['name']==HP+'margin' and n['parent']==i]
    require(len(margins)<=1,'Duplicate margin')
    require(not any(n['name']==HP+'margin' and p['start']<n['start']<p['end'] and n['parent']!=i for n in ns),'Conditional margin')
    return p,margins[0] if margins else None

def uint(v):
    require(isinstance(v,str) and re.fullmatch(r'\+?[0-9]+',v.strip()) is not None,'Bad unsigned lexical value')
    n=int(v);require(0<=n<=0xffffffff,'Unsigned overflow');return n

def observed(data):
    p,m=selected(data);a=p['attrs']
    require(a.get('landscape') in ['WIDELY','NARROWLY'],'Missing or bad orientation')
    require(a.get('gutterType') in ['LEFT_ONLY','LEFT_RIGHT','TOP_BOTTOM'],'Missing or bad binding')
    require(m is not None,'Missing written margin')
    return {'orientation':{'WIDELY':'widely','NARROWLY':'narrowly'}[a['landscape']], 'width':uint(a.get('width')), 'height':uint(a.get('height')), 'gutter_type':{'LEFT_ONLY':'left_only','LEFT_RIGHT':'left_right','TOP_BOTTOM':'top_bottom'}[a['gutterType']], 'margin':{k:uint(m['attrs'].get(k)) for k in MARGIN}}
ATTR=re.compile(rb'\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*([\'"])(.*?)\2',re.S)
def known_cache(data, ns, index, children):
    c=ns[index]
    require(c['parent'] is not None and ns[c['parent']]['name']==HP+'p' and not c['attrs'],'Opaque line cache owner/attributes')
    cursor=c['tagEnd']
    for i in children.get(index,[]):
        n=ns[i]
        require(n['name']==HP+'lineseg' and set(n['attrs'])<=set(['textpos','vertpos','vertsize','textheight','baseline','spacing','horzpos','horzsize','flags']),'Opaque line cache payload')
        require(not children.get(i),'Opaque nested line cache')
        require(not data[cursor:n['start']].strip(),'Opaque cache text')
        require(n['empty'] or not data[n['tagEnd']:n['closeStart']].strip(),'Opaque cache line text')
        cursor=n['end']
    require(c['empty'] or not data[cursor:c['closeStart']].strip(),'Opaque cache trailing text')
def mask(data, original):
    p,m=selected(data);old_p,old_m=selected(original);edits=[]
    ns=nodes(data);children={}
    for i,n in enumerate(ns):children.setdefault(n['parent'],[]).append(i)
    for i,cache in enumerate(ns):
        if cache['name']==HP+'linesegarray':known_cache(data,ns,i,children);edits.append((cache['start'],cache['end'],b''))
    def tag(n,allowed):
        raw=data[n['start']:n['tagEnd']]
        raw=ATTR.sub(lambda match:b'' if match.group(1).decode() in allowed else match.group(0),raw)
        return re.sub(rb'\s+(/?>)$',rb'\1',raw)
    raw=tag(p,PAGE)
    if old_p['empty'] and not p['empty']:
        raw=raw[:-1]+b'/>'
        edits.append((p['closeStart'],p['end'],b''))
    edits.append((p['start'],p['tagEnd'],raw))
    if m:
        if old_m is None:edits.append((m['start'],m['end'],b''))
        else:edits.append((m['start'],m['tagEnd'],tag(m,MARGIN)))
    for begin,end,value in sorted(edits,reverse=True):data=data[:begin]+value+data[end:]
    return data

def verify(plan):
    before=path(plan['before']);after=path(plan['after']);targets=plan['parts'];expected=plan['values']
    require(isinstance(targets,list) and len(targets)==len(set(targets)) and len(targets)>0,'Invalid target parts')
    with zipfile.ZipFile(before)as a,zipfile.ZipFile(after)as b:
        require(a.namelist()==b.namelist() and len(a.namelist())==len(set(a.namelist())),'Package inventory changed')
        require(set(targets)<=set(a.namelist()),'Missing target part');target_set=set(targets)
        for name in a.namelist():
            first,last=a.getinfo(name),b.getinfo(name)
            require(all(getattr(first,k)==getattr(last,k) for k in ['compress_type','date_time','comment','extra','external_attr','flag_bits']),'ZIP metadata changed: '+name)
            old,new=a.read(name),b.read(name)
            if name not in target_set:require(old==new,'Non-target part changed: '+name);continue
            require(observed(new)==expected,'Wrong page values: '+name)
            require(not any(n['name']==HP+'linesegarray' for n in nodes(new)),'Stale page line cache: '+name)
            require(mask(new,old)==mask(old,old),'Unselected XML changed: '+name)
    return {'verified':True,'parts':targets,'storedAxes':{'width':expected['width'],'height':expected['height']},'unknownXmlAndNonTargetParts':'exact outside selected scalar fields/new margin/known derived line cache'}

def selftest():
    v={'orientation':'narrowly','width':60000,'height':90000,'gutter_type':'top_bottom','margin':dict(header=100,footer=200,gutter=300,left=1000,right=2000,top=3000,bottom=4000)}
    pre=b"<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:keep'><p:p><p:run><p:secPr>";post=b'</p:secPr></p:run></p:p></s:sec>'
    p=b"<p:pagePr landscape='WIDELY' width='60000' height='90000' gutterType='LEFT_ONLY' x:a='&amp;'><p:margin header='0' footer='0' gutter='0' left='1' right='2' top='3' bottom='4'/><x:keep>keep</x:keep></p:pagePr>"
    old=pre+p+post;new=old.replace(b"landscape='WIDELY'",b"landscape='NARROWLY'").replace(b"gutterType='LEFT_ONLY'",b"gutterType='TOP_BOTTOM'")
    for k,n in v['margin'].items():new=re.sub(rb'('+k.encode()+rb"=')[0-9]+(')",lambda m:m[1]+str(n).encode()+m[2],new)
    with tempfile.TemporaryDirectory()as tmp:
        root=pathlib.Path(tmp)
        def package(name,xml):
            p=root/name
            with zipfile.ZipFile(p,'w')as z:z.writestr('Contents/section0.xml',xml);z.writestr('opaque.bin',b'\x00keep\xff')
            return str(p)
        plan={'before':package('before.hwpx',old),'after':package('after.hwpx',new),'parts':['Contents/section0.xml'],'values':v};verify(plan)
        bad=[{**plan,'values':{**v,'width':90000}}, {**plan,'after':package('unknown.hwpx',new.replace(b'keep</x:keep>',b'changed</x:keep>'))}]
        cache=b"<p:linesegarray><p:lineseg textpos='0' vertpos='0' horzsize='1'/></p:linesegarray>"
        cached=old.replace(b'</p:p>',cache+b'</p:p>')
        cache_plan={**plan,'before':package('cache-before.hwpx',cached)}
        verify(cache_plan)
        bad.append({**cache_plan,'after':package('cache-stale.hwpx',new.replace(b'</p:p>',cache+b'</p:p>'))})
        opaque=cached.replace(b"textpos='0'",b"x:unknown='preserve' textpos='0'")
        bad.append({**plan,'before':package('cache-opaque.hwpx',opaque)})
        for item in bad:
            try:verify(item)
            except ValueError:pass
            else:raise ValueError('Oracle negative accepted')
    return {'selftest':True,'negativeCases':len(bad)}
if __name__=='__main__':
    try:
        if sys.argv[1:]==['--self-test']:result=selftest()
        else:
            require(len(sys.argv)==2,'Explicit plan required');result=verify(json.loads(path(sys.argv[1]).read_text()))
        print(json.dumps(result))
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
