"""Own controlled-fixture expectations; stdlib CFB/XML, no product parser."""
import json,sys,re,struct,zipfile,copy,xml.etree.ElementTree as ET
from pathlib import Path
from xml.sax.saxutils import escape
from importlib.util import spec_from_file_location,module_from_spec
spec=spec_from_file_location('cfb',Path(__file__).with_name('form-cfb-reader.py'));cfb=module_from_spec(spec);spec.loader.exec_module(cfb)
def check(x,m):
 if not x:raise ValueError(m)
def units(s):return len(s.encode('utf-16le'))//2
def patch_form(raw,plan,index):
 s=raw[14:].decode('utf-16le');name='F'+str(index)
 if name in plan.get('states',{}):
  value={'UNCHECKED':'0','CHECKED':'1','INDETERMINATE':'2'}[plan['states'][name]];s,n=re.subn(r'Value:int:[012] ',lambda m:'Value:int:'+value+' ',s,count=1);check(n==1,'state source')
 if name in plan.get('texts',{}):
  value=plan['texts'][name];m=re.search(r'Text:wstring:(\d+):',s);check(m,'text source');start=units(s[:m.end()])*2;data=s.encode('utf-16le');suffix=data[start+int(m[1])*2:].decode('utf-16le');s=s[:m.start()]+'Text:wstring:'+str(units(value))+':'+value+suffix;key='EditSet'if name=='F4'else'ComboBoxSet';m=re.search(key+r':set:(\d+):',s);check(m,'text group');s=s[:m.start()]+key+':set:'+str(units(s[m.end():]))+':'+s[m.end():]
 out=bytearray(raw[:14]);struct.pack_into('<I',out,8,units(s));struct.pack_into('<H',out,12,units(s));return bytes(out)+s.encode('utf-16le')
def h5_extract(path):
 c=cfb.Compound(path);rs=c.records('/BodyText/Section0');starts=[i for i,r in enumerate(rs)if r['tag']==71 and r['payload'][:4]==b' lbt'];check(len(starts)==1,'one table');start=starts[0];end=next((i for i in range(start+1,len(rs))if rs[i]['level']<=rs[start]['level']),len(rs));own=rs[start:end];definition=next(r for r in own if r['tag']==77);rows,cols=struct.unpack_from('<HH',definition['payload'],4);positions=[i for i,r in enumerate(own)if r['tag']==72 and r['level']==rs[start]['level']+1];cells=[]
 for n,i in enumerate(positions):
  r=own[i];block=own[i+1:positions[n+1]if n+1<len(positions)else len(own)];payload=r['payload'];col,row,cs,rsn=struct.unpack_from('<HHHH',payload,8);texts=[x['payload'].decode('utf-16le').removesuffix('\r')for x in block if x['tag']==67];cells.append({'row':row,'column':col,'rowSpan':rsn,'columnSpan':cs,'width':struct.unpack_from('<I',payload,16)[0],'height':struct.unpack_from('<I',payload,20)[0],'text':'\n'.join(texts)})
 outside=rs[:start]+rs[end:];return c,outside,rows,cols,cells
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
def hx_extract(data):
 root=ET.fromstring(data);tables=list(root.iter(P+'tbl'));check(len(tables)==1,'one table');t=tables[0];cells=[]
 for tc in t.iter(P+'tc'):
  a=tc.find(P+'cellAddr');sp=tc.find(P+'cellSpan');sz=tc.find(P+'cellSz');sub=tc.find(P+'subList');cells.append({'row':int(a.get('rowAddr')),'column':int(a.get('colAddr')),'rowSpan':int(sp.get('rowSpan')),'columnSpan':int(sp.get('colSpan')),'width':int(sz.get('width')),'height':int(sz.get('height')),'text':'\n'.join(''.join(x.text or ''for x in p.iter(P+'t'))for p in sub.findall(P+'p'))})
 return root,t,int(t.get('rowCnt')),int(t.get('colCnt')),cells

def expect_table(rows,cols,cells,plan):
 check((rows,cols)==(plan['rows'],2),'dimensions');expected=plan['matrix'];check(len(cells)==rows*cols,'cell count');seen=set()
 for c in cells:
  key=(c['row'],c['column']);check(key not in seen,'unique address');seen.add(key);check(c['rowSpan']==c['columnSpan']==1,'plain span');check(c['width']==6000 and c['height']==2000,'source cell size');check(c['text']==expected[c['row']][c['column']],'cell literal text')
def run(plan):
 if plan['format']=='hwp5':
  a,ar,_,_,_=h5_extract(plan['before']);b,br,rows,cols,cells=h5_extract(plan['after']);check(a.metadata==b.metadata,'CFB metadata');check(a.streams.keys()==b.streams.keys(),'CFB members')
  for k in a.streams:
   if k!='/BodyText/Section0':check(a.streams[k]==b.streams[k],'unrelated stream '+k)
  check(len(ar)==len(br),'outside record count');index=0
  for x,y in zip(ar,br):
   check((x['tag'],x['level'])==(y['tag'],y['level']),'outside record identity')
   if x['tag']==91:check(patch_form(x['payload'],plan,index)==y['payload'],'exact form payload F'+str(index));index+=1
   else:check(x['raw']==y['raw'],'unrelated outside record')
  check(index==6,'six forms')
 else:
  with zipfile.ZipFile(plan['before'])as a,zipfile.ZipFile(plan['after'])as b:
   check(a.namelist()==b.namelist(),'ZIP members')
   for x,y in zip(a.infolist(),b.infolist()):
    for k in ['date_time','compress_type','comment','extra','internal_attr','external_attr','create_system','create_version','extract_version','flag_bits']:check(getattr(x,k)==getattr(y,k),'ZIP metadata')
    if x.filename!='Contents/section0.xml':check(a.read(x)==b.read(y),'unrelated ZIP member')
   before=a.read('Contents/section0.xml');after=b.read('Contents/section0.xml');_,_,rows,cols,cells=hx_extract(after)
   for name,state in plan.get('states',{}).items():
    before,n=re.subn(rb'(<hp:(?:checkBtn|radioBtn)\b[^>]*\bname="'+name.encode()+rb'"[^>]*\bvalue=")[^"]*(")',lambda m:m[1]+state.encode()+m[2],before);check(n==1,'one state span')
   for name,text in plan.get('texts',{}).items():
    before,n=re.subn(rb'(<hp:(?:edit|comboBox)\b[^>]*\bname="'+name.encode()+rb'"[^>]*>[\s\S]*?<hp:text\b[^>]*>)[\s\S]*?(</hp:text>)',lambda m:m[1]+escape(text).replace('\r','&#13;').encode()+m[2],before);check(n==1,'one text span')
   pattern=rb'<hp:tbl\b[\s\S]*?</hp:tbl>';x,n=re.subn(pattern,b'<OWN-TABLE/>',before);y,m=re.subn(pattern,b'<OWN-TABLE/>',after);check(n==m==1 and x==y,'exact XML outside table/form patches')
 expect_table(rows,cols,cells,plan);return {'verified':True,'format':plan['format'],'rows':rows,'cells':len(cells)}
if __name__=='__main__':print(json.dumps(run(json.loads(Path(sys.argv[1]).read_text()))))
