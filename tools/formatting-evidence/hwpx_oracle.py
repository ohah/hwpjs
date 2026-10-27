"""w3 전용 독립 XML/ZIP 기대 변환. 제품 serializer와 Native snapshot을 import하지 않습니다."""
import copy
import io
import zipfile
import xml.etree.ElementTree as ET
import xml.parsers.expat as EXPAT
import struct

HH='{http://www.hancom.co.kr/hwpml/2011/head}'
HP='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
HC='{http://www.hancom.co.kr/hwpml/2011/core}'
METADATA=('date_time','compress_type','comment','extra','internal_attr','external_attr','create_system','create_version','extract_version','flag_bits')


def require(value,message):
    if not value:raise ValueError(message)


def parse(value):
    return ET.fromstring(value,parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True,insert_pis=True)))


def container(header,name):
    value=header.find('./'+HH+'refList/'+HH+name)
    require(value is not None,'missing '+name)
    return value


def inventory(parent,tag):
    values={}
    for node in parent:
        if node.tag!=HH+tag:continue
        identity=int(node.get('id'))
        require(identity not in values,'duplicate '+tag)
        values[identity]=node
    require(int(parent.get('itemCnt'))==len(values),'resource count mismatch '+tag)
    return values


def unused(values):
    identity=0
    while identity in values:identity+=1
    return identity


def rgb(value,swapped=False):
    require(type(value)is int and 0<=value<=0xffffff,'invalid RGB')
    if swapped:value=((value>>16)&255)|(value&0xff00)|((value&255)<<16)
    return f'#{value:06x}'


def legacy_profile(source):
    if 'version.xml'not in source.namelist():return False
    row=parse(source.read('version.xml')).attrib
    expected={'major':'5','minor':'1','micro':'0','buildNumber':'1','os':'1','xmlVersion':'1.2','tagetApplication':'WORDPROCESSOR','application':'Hancom Office Hangul','appVersion':'10, 0, 0, 5060 WIN32LEWindows_8'}
    return all(row.get(k)==v for k,v in expected.items()) and 'patch'not in row and 'revision'not in row


def background(old,request,swapped):
    if old is not None:
        require(not old.attrib,'unsupported brush attributes')
        require(len(old)<=1,'unsupported brush combination')
        require(all(node.tag in (HC+'winBrush',HC+'gradation')for node in old),'unsupported brush child')
    alpha=None
    if old is not None and len(old):
        node=old[0]
        alpha=node.get('alpha')
        if node.tag==HC+'gradation':require(node.get('type')=='LINEAR','unsupported radial/image')
    kind=request['kind']
    if kind=='none':return None
    brush=ET.Element(HC+'fillBrush')
    if kind=='solid':
        require({'kind','color'}<=set(request)<= {'kind','color','hatchColor'},'solid keys')
        child=ET.SubElement(brush,HC+'winBrush',{'faceColor':rgb(request['color'],swapped)})
        if 'hatchColor'in request:child.set('hatchColor',rgb(request['hatchColor'],swapped))
        elif old is not None and len(old)and old[0].tag==HC+'winBrush'and old[0].get('hatchColor')is not None:child.set('hatchColor',old[0].get('hatchColor'))
    elif kind=='hatch':
        require(set(request)=={'kind','faceColor','hatchColor','style'},'hatch keys')
        child=ET.SubElement(brush,HC+'winBrush',{'faceColor':rgb(request['faceColor'],swapped),'hatchColor':rgb(request['hatchColor'],swapped),'hatchStyle':request['style']})
    else:
        require(kind=='linear'and len(request['colors'])==2,'linear only two explicit colors')
        attrs={'type':'LINEAR',**{name:str(request[name])for name in ['angle','centerX','centerY','step','stepCenter']},'colorNum':'2'}
        child=ET.SubElement(brush,HC+'gradation',attrs)
        for color in request['colors']:ET.SubElement(child,HC+'color',{'value':rgb(color,swapped)})
    if alpha is not None:
        # 새 Native writer가 원문 alpha를 보존합니다. 이 oracle은 값·XML 전체를 비교합니다.
        attrs={'alpha':alpha,**child.attrib};child.attrib.clear();child.attrib.update(attrs)
    return brush


def fill_clone(header,source_id,request,swapped):
    parent=container(header,'borderFills');values=inventory(parent,'borderFill')
    require(source_id in values,'missing source border fill')
    identity=unused(values);added=copy.deepcopy(values[source_id]);added.set('id',str(identity))
    for edge,patch in request.get('border',{}).items():
        require(edge in ('left','right','top','bottom'),'unknown edge')
        node=added.find(HH+edge+'Border');require(node is not None,'missing border edge')
        for key,value in patch.items():
            require(key in ('style','widthHundredthMm','color'),'unknown edge field')
            if key=='style':node.set('type',value)
            elif key=='color':node.set('color',rgb(value))
            else:node.set('width',f'{value//100}.{value%100:02d} mm')
    if 'background'in request:
        old=added.find(HC+'fillBrush');new=background(old,request['background'],swapped)
        index=list(added).index(old)if old is not None else len(added)
        if old is not None:added.remove(old)
        if new is not None:added.insert(index,new)
    parent.append(added);parent.set('itemCnt',str(len(values)+1))
    return identity


def shadow(added,request):
    node=added.find(HH+'shadow')
    if node is None:
        require(set(request)=={'kind','offsetX','offsetY','color'},'shadow creation requires all fields')
        node=ET.Element(HH+'shadow');order={HH+x for x in ['emboss','engrave','supscript','subscript']}
        added.insert(next((i for i,x in enumerate(added)if x.tag in order),len(added)),node)
    for key,value in request.items():
        require(key in ('kind','offsetX','offsetY','color'),'unknown shadow key')
        if key=='kind':node.set('type',{'none':'NONE','drop':'DROP','continuous':'CONTINUOUS'}[value])
        elif key=='color':node.set('color',rgb(value))
        else:node.set(key,str(value))


def preserve_inactive_grid_snap_reset(section,command,before,after):
    reset=command.get('patch',{}).get('reset',{})
    if reset.get('scope')!='paragraph' or reset.get('basis')!='paragraph-style':return False
    if {before.get('snapToGrid'),after.get('snapToGrid')}!={'0','1'}:return False
    left=copy.deepcopy(before);right=copy.deepcopy(after)
    for node in (left,right):
        node.attrib.pop('id',None);node.attrib.pop('snapToGrid',None)
    if canonical(left)!=canonical(right):return False
    definitions=list(section.iter(HP+'secPr'))
    if len(definitions)!=1 or definitions[0].get('textDirection')!='HORIZONTAL':return False
    grids=definitions[0].findall(HP+'grid')
    return len(grids)==1 and grids[0].attrib=={'lineGrid':'0','charGrid':'0','wonggojiFormat':'0'} and len(grids[0])==0


def expected(source,command):
    require(type(command.get('section'))is int and command['section']==0,'invalid source XML section')
    header=parse(source.read('Contents/header.xml'));section=parse(source.read('Contents/section0.xml'))
    rows=list(section.iter(HP+'p'));ordinal=command['paragraph']
    require(type(ordinal)is int and 0<=ordinal<len(rows),'invalid source XML owner')
    paragraph=rows[ordinal];patch=command['patch'];swapped=legacy_profile(source)
    require(set(patch)<={'character','paragraph','reset'},'unknown patch owner')
    reset=patch.get('reset');character=patch.get('character',{});para=patch.get('paragraph',{})
    require(set(character)<={'border','background','shadow'}and set(para)<={'border','background','grid','borderConnect'},'unsupported expected field')
    changed=False;preserve_layout=False
    if reset is not None:
        require(not character and not para,'reset conflict')
        require(reset['basis']=='paragraph-style'and reset['scope']in ('character','paragraph','all'),'reset basis')
        styles=container(header,'styles');style_id=paragraph.get('styleIDRef')
        matches=[node for node in styles if node.tag==HH+'style'and node.get('id')==style_id]
        require(len(matches)==1 and matches[0].get('type')=='PARA','missing reset style')
        style=matches[0]
        if reset['scope']!='character':
            para_id=style.get('paraPrIDRef');require(para_id is not None,'missing style paragraph')
            require(int(para_id)in inventory(container(header,'paraProperties'),'paraPr'),'invalid style paragraph ref')
            resources=inventory(container(header,'paraProperties'),'paraPr')
            preserve_layout=preserve_inactive_grid_snap_reset(section,command,resources[int(paragraph.get('paraPrIDRef'))],resources[int(para_id)])
            changed=changed or paragraph.get('paraPrIDRef')!=para_id;paragraph.set('paraPrIDRef',para_id)
        char_id=style.get('charPrIDRef')if reset['scope']!='paragraph'else None
        if reset['scope']!='paragraph':require(char_id is not None,'missing style character')
    else:
        char_id=None
        # Native header serializer는 paragraph resources를 character보다 먼저 씁니다.
        if para:
            parent=container(header,'paraProperties');values=inventory(parent,'paraPr');old=int(paragraph.get('paraPrIDRef'))
            require(old in values,'missing paragraph resource');identity=unused(values);added=copy.deepcopy(values[old]);added.set('id',str(identity))
            if 'border'in para or 'background'in para:
                border=added.find(HH+'border');require(border is not None and border.get('borderFillIDRef')is not None,'missing paragraph border binding')
                border.set('borderFillIDRef',str(fill_clone(header,int(border.get('borderFillIDRef')),{k:v for k,v in para.items()if k in ('border','background')},swapped)))
            if 'grid'in para:added.set('snapToGrid','1'if para['grid']else'0')
            if 'borderConnect'in para:
                border=added.find(HH+'border');require(border is not None,'missing borderConnect owner');border.set('connect','1'if para['borderConnect']else'0')
            parent.append(added);parent.set('itemCnt',str(len(values)+1));paragraph.set('paraPrIDRef',str(identity));changed=True
    if character or char_id is not None:
        low,high=command['startUnit'],command['endUnit'];require(0<=low<high,'invalid range')
        parent=container(header,'charProperties');values=inventory(parent,'charPr');created={};cursor=0
        for run in list(paragraph.findall(HP+'run')):
            texts=[node for node in run if node.tag==HP+'t'];units=sum(len((node.text or '').encode('utf-16-le'))//2 for node in texts)
            left,right=max(cursor,low),min(cursor+units,high)
            if left<right:
                require(len(texts)==1 and len(run)==1,'fixture plain run required');old=int(run.get('charPrIDRef'));require(old in values,'invalid char source')
                if char_id is not None:identity=int(char_id);require(identity in values,'invalid reset char ref')
                else:
                    if old not in created:
                        identity=unused(values);added=copy.deepcopy(values[old]);added.set('id',str(identity))
                        if 'border'in character or 'background'in character:
                            require(added.get('borderFillIDRef')is not None,'missing character border binding')
                            added.set('borderFillIDRef',str(fill_clone(header,int(added.get('borderFillIDRef')),{k:v for k,v in character.items()if k in ('border','background')},swapped)))
                        if 'shadow'in character:shadow(added,character['shadow'])
                        parent.append(added);values[identity]=added;created[old]=identity
                    identity=created[old]
                encoded=(texts[0].text or '').encode('utf-16-le');at=list(paragraph).index(run);paragraph.remove(run)
                pieces=[p for p in [(0,left-cursor,old),(left-cursor,right-cursor,identity),(right-cursor,units,old)]if p[0]<p[1]]
                for i,(start,end,ref)in enumerate(pieces):
                    item=copy.deepcopy(run);item.set('charPrIDRef',str(ref));item[0].text=encoded[start*2:end*2].decode('utf-16-le');item.tail=run.tail if i==len(pieces)-1 else None;paragraph.insert(at+i,item)
                changed=changed or identity!=old
            cursor+=units
        require(high<=cursor,'range past owner');parent.set('itemCnt',str(len(values)))
    if changed and not preserve_layout:
        for node in list(paragraph.findall(HP+'linesegarray')):paragraph.remove(node)
    return {'Contents/header.xml':header,'Contents/section0.xml':section}


def canonical(node):
    value=copy.deepcopy(node)
    for child in value.iter():
        attrs=sorted(child.attrib.items());child.attrib.clear();child.attrib.update(attrs)
    return ET.tostring(value)


def raw_resources(data):
    parser=EXPAT.ParserCreate(namespace_separator='|');stack=[];result={};opened=[]
    names={'charPr':'charProperties','paraPr':'paraProperties','borderFill':'borderFills','style':'styles'}
    def start(name,attrs):
        namespace,_,local=name.rpartition('|')
        if namespace=='http://www.hancom.co.kr/hwpml/2011/head'and local in names and stack and stack[-1].endswith('|'+names[local]):
            key=(local,attrs.get('id'));require(key not in result and all(row[0]!=key for row in opened),'duplicate raw resource')
            opened.append((key,parser.CurrentByteIndex,len(stack)))
        stack.append(name)
    def end(name):
        if opened and opened[-1][2]==len(stack)-1:
            key,low,_=opened.pop();high=parser.CurrentByteIndex
            if data[high:high+2]==b'</':high=data.find(b'>',high)+1
            require(high>low,'raw resource boundary');result[key]=data[low:high]
        stack.pop()
    parser.StartElementHandler=start;parser.EndElementHandler=end;parser.Parse(data,True)
    return result


def compressed_member(data,info):
    offset=info.header_offset;require(data[offset:offset+4]==b'PK\x03\x04','invalid local ZIP header')
    name_length,extra_length=struct.unpack_from('<HH',data,offset+26)
    low=offset+30+name_length+extra_length
    return data[low:low+info.compress_size]


def verify(before,after,command):
    with zipfile.ZipFile(io.BytesIO(before))as source,zipfile.ZipFile(io.BytesIO(after))as saved:
        require(source.namelist()==saved.namelist(),'ZIP members differ')
        require(len(source.namelist())==len(set(source.namelist())),'duplicate ZIP member')
        require(source.comment==saved.comment,'ZIP comment differs')
        parts=expected(source,command)
        before_raw=raw_resources(source.read('Contents/header.xml'));after_raw=raw_resources(saved.read('Contents/header.xml'))
        for key,value in before_raw.items():require(after_raw.get(key)==value,'original resource bytes differ '+str(key))
        for name in source.namelist():
            for field in METADATA:require(getattr(source.getinfo(name),field)==getattr(saved.getinfo(name),field),'ZIP metadata differs '+name+':'+field)
            if name in parts:require(canonical(parts[name])==canonical(parse(saved.read(name))),'XML differs '+name)
            else:
                require(source.read(name)==saved.read(name),'untouched part differs '+name)
                require(compressed_member(before,source.getinfo(name))==compressed_member(after,saved.getinfo(name)),'untouched compressed member differs '+name)
        return {'xmlParts':2,'zipMembers':len(source.namelist()),'allMetadataExact':True,'unrelatedBytesExact':True}
