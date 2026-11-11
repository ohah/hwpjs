"""Independent stdlib CFB/XML oracle; expectations authored by tests, never SDK reads."""
import copy,importlib.util,json,re,struct,sys,zipfile,xml.etree.ElementTree as ET
from xml.sax.saxutils import escape
from pathlib import Path
def require(v,m):
    if not v:raise ValueError(m)
def units(t):return len(t.encode('utf-16le'))//2
def h5(plan):
    spec=importlib.util.spec_from_file_location('form_cfb',Path(__file__).with_name('form-cfb-reader.py'));c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
    a,b=c.Compound(plan['before']),c.Compound(plan['after']);require(a.metadata==b.metadata,'CFB metadata');require(a.streams.keys()==b.streams.keys(),'CFB members')
    for key in a.streams:
        if key!='/BodyText/Section0':require(a.streams[key]==b.streams[key],'unrelated stream '+key)
    ar,br=a.records('/BodyText/Section0'),b.records('/BodyText/Section0');require(len(ar)==len(br),'record count');index=0
    for old,new in zip(ar,br):
        require((old['tag'],old['level'])==(new['tag'],new['level']),'record identity')
        if old['tag']!=91:require(old['raw']==new['raw'],'non-form record');continue
        raw=old['payload'];text=raw[14:].decode('utf-16le');name='F'+str(index);index+=1
        if name in plan.get('states',{}):
            state={'UNCHECKED':'0','CHECKED':'1','INDETERMINATE':'2'}[plan['states'][name]]
            text,n=re.subn(r'Value:int:[012] ',lambda m:'Value:int:'+state+' ',text,count=1);require(n==1,'choice fixture field')
        if name in plan.get('texts',{}):
            expected=plan['texts'][name];oldtext=re.search(r'Text:wstring:(\d+):',text);require(oldtext,'text fixture field');start=oldtext.end();oldlen=int(oldtext[1]);data=text.encode('utf-16le');prefix=text[:oldtext.start()];body=data[units(text[:start])*2:];suffix=body[oldlen*2:].decode('utf-16le');text=prefix+'Text:wstring:'+str(units(expected))+':'+expected+suffix
            key='EditSet' if name=='F4' else 'ComboBoxSet';m=re.search(key+r':set:(\d+):',text);require(m,'group fixture field');size=units(text[m.end():]);text=text[:m.start()]+key+':set:'+str(size)+':'+text[m.end():]
        payload=bytearray(raw[:14]);struct.pack_into('<I',payload,8,units(text));struct.pack_into('<H',payload,12,units(text));payload+=text.encode('utf-16le');require(bytes(payload)==new['payload'],'exact form property payload '+name)
    require(index==6,'form fixture count');return {'verified':True,'format':'hwp5','forms':index}
def hx(plan):
    with zipfile.ZipFile(plan['before'])as a,zipfile.ZipFile(plan['after'])as b:
        require(a.namelist()==b.namelist(),'ZIP members')
        for x,y in zip(a.infolist(),b.infolist()):
            for k in ['date_time','compress_type','comment','extra','internal_attr','external_attr','create_system','create_version','extract_version','flag_bits']:require(getattr(x,k)==getattr(y,k),'ZIP metadata')
            if x.filename!='Contents/section0.xml':require(a.read(x)==b.read(y),'unrelated member '+x.filename)
        expected_xml=a.read('Contents/section0.xml')
        for name,state in plan.get('states',{}).items():
            pattern=rb'(<hp:(?:checkBtn|radioBtn)\b[^>]*\bname="'+name.encode()+rb'"[^>]*\bvalue=")[^"]*(")'
            expected_xml,count=re.subn(pattern,lambda m:m[1]+state.encode()+m[2],expected_xml)
            require(count==1,'unique source XML state span')
        for name,text in plan.get('texts',{}).items():
            pattern=rb'(<hp:(?:edit|comboBox)\b[^>]*\bname="'+name.encode()+rb'"[^>]*>[\s\S]*?<hp:text\b[^>]*>)[\s\S]*?(</hp:text>)'
            expected_xml,count=re.subn(pattern,lambda m:m[1]+escape(text).replace('\r','&#13;').encode()+m[2],expected_xml)
            require(count==1,'unique source XML text span')
        require(expected_xml==b.read('Contents/section0.xml'),'exact source XML patch bytes')
        before=ET.fromstring(a.read('Contents/section0.xml'));after=ET.fromstring(b.read('Contents/section0.xml'));seen=set()
        for node in before.iter():
            name=node.get('name')
            if name in plan.get('states',{}):node.set('value',plan['states'][name]);seen.add(name)
            if name in plan.get('texts',{}):
                leaves=node.findall('{http://www.hancom.co.kr/hwpml/2011/paragraph}text');require(len(leaves)==1,'one form text child');leaves[0].text=plan['texts'][name]
        require(seen==set(plan.get('states',{})),'targeted XML form');require(ET.tostring(before)==ET.tostring(after),'exact XML state-only change')
    return {'verified':True,'format':'hwpx','changed':len(seen)}
if __name__=='__main__':
    plan=json.loads(Path(sys.argv[1]).read_text());print(json.dumps(h5(plan)if plan['format']=='hwp5'else hx(plan)))
