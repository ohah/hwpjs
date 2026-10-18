"""Generate explicit negative controls without touching source fixture files."""
import base64,io,json,re,sys,zipfile,xml.etree.ElementTree as E
d=json.load(sys.stdin);P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
source=base64.b64decode(d['before']);out=io.BytesIO();part='Contents/section2.xml'
with zipfile.ZipFile(io.BytesIO(source)) as z,zipfile.ZipFile(out,'w') as target:
 target.comment=z.comment
 for info in z.infolist():
  raw=z.read(info.filename)
  if info.filename==part:
   text=raw.decode('utf-8');root=E.fromstring(raw)
   chosen=[e for e in root.iter(P+'fieldBegin') if e.get('id')=='2135782115']
   if len(chosen)!=1 or chosen[0].get('type')!='MEMO':raise ValueError('scope')
   match=re.search(r'<([\w]+:)fieldBegin\b[^>]*\bid="2135782115"[^>]*>',text)
   if not match:raise ValueError('raw scope')
   prefix=match.group(1);close='</'+prefix+'fieldBegin>'
   end=text.index(close,match.end())+len(close);fragment=text[match.start():end]
   mode=d['mode']
   if mode=='readonly':fragment=fragment.replace('editable="1"','editable="0"',1)
   elif mode=='missing-editable':fragment=fragment.replace(' editable="1"','',1)
   elif mode=='unknown-attribute':fragment=fragment[:match.end()-match.start()-1]+' probe="1"'+fragment[match.end()-match.start()-1:]
   elif mode=='unknown-child':fragment=fragment[:-len(close)]+'<'+prefix+'probe/>'+close
   elif mode=='missing-parameters':fragment=re.sub(r'<'+prefix+r'parameters\b.*?</'+prefix+r'parameters>','',fragment,count=1,flags=re.S)
   elif mode=='duplicate-sublist':
    sub=re.search(r'<'+prefix+r'subList\b.*?</'+prefix+r'subList>',fragment,re.S)
    if not sub:raise ValueError('sublist')
    fragment=fragment[:sub.end()]+sub.group()+fragment[sub.end():]
   elif mode=='unclosed':
    tail=text[end:];tail,count=re.subn(r'<'+prefix+r'fieldEnd\b[^>]*\bbeginIDRef="2135782115"[^>]*/>','',tail,count=1)
    if count!=1:raise ValueError('end scope')
    text=text[:end]+tail
   elif mode=='nested-bookmark':
    if any(e.get('id')=='4294967000' for e in root.iter(P+'fieldBegin')):raise ValueError('fresh ID')
    ctrl='</'+prefix+'ctrl>';at=text.index(ctrl,end)+len(ctrl)
    nested='<'+prefix+'ctrl><'+prefix+'fieldBegin id="4294967000" type="BOOKMARK" editable="1"/></'+prefix+'ctrl><'+prefix+'t>B</'+prefix+'t><'+prefix+'ctrl><'+prefix+'fieldEnd beginIDRef="4294967000"/></'+prefix+'ctrl>'
    text=text[:at]+nested+text[at:]
   else:raise ValueError('mode')
   if mode not in ('unclosed','nested-bookmark') and fragment==text[match.start():end]:raise ValueError('mutation ignored')
   raw=(text[:match.start()]+fragment+text[end:]).encode('utf-8');E.fromstring(raw)
  target.writestr(info,raw)
print(base64.b64encode(out.getvalue()).decode())
