"""Independent ZIP/XML check; annotation subtrees are never label text."""
import base64,io,json,sys,zipfile,xml.etree.ElementTree as E
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
def require(value,message):
 if not value:raise ValueError(message)
def signature(e):
 return (e.tag,sorted(e.attrib.items()),e.text,e.tail,[signature(c) for c in e])
def inventory(before):
 result=[]
 with zipfile.ZipFile(io.BytesIO(base64.b64decode(before))) as source:
  for name in source.namelist():
   if not name.startswith('Contents/section') or not name.endswith('.xml'):continue
   tree=E.fromstring(source.read(name));indices={node:index for index,node in enumerate(tree.iter())}
   for paragraph,owner in enumerate(tree.iter(P+'p'),1):
    direct=[node for run in owner.findall(P+'run') for node in run]
    for ctrl in direct:
     if ctrl.tag!=P+'ctrl':continue
     for begin in ctrl:
      if begin.tag==P+'fieldBegin' and begin.get('type')=='MEMO' and begin.get('editable')=='1':
       result.append({'part':name,'paragraph':paragraph,'beginId':begin.get('id'),'beginElement':indices[begin]})
 return result
def verify(d):
 part='Contents/section%d.xml'%d['section']
 with zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before']))) as a,zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after']))) as b:
  require(a.namelist()==b.namelist() and len(set(a.namelist()))==len(a.namelist()) and a.comment==b.comment,'ZIP inventory')
  require(a.testzip() is None and b.testzip() is None,'ZIP integrity')
  require(part in a.namelist(),'missing target section')
  for name in a.namelist():
   for key in ('compress_type','date_time','extra','comment','external_attr','internal_attr','create_system'):
    require(getattr(a.getinfo(name),key)==getattr(b.getinfo(name),key),'ZIP metadata')
   if name!=part:
    require(a.read(name)==b.read(name),'non-target ZIP payload');continue
   parse=lambda raw:E.fromstring(raw,parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True,insert_pis=True)))
   expected,actual=parse(a.read(name)),parse(b.read(name))
   paragraphs=list(expected.iter(P+'p'))
   require(type(d['paragraph']) is int and 1<=d['paragraph']<=len(paragraphs),'paragraph index')
   paragraph=paragraphs[d['paragraph']-1]
   direct=[node for run in paragraph.findall(P+'run') for node in run]
   begins=[e for ctrl in direct if ctrl.tag==P+'ctrl' for e in ctrl if e.tag==P+'fieldBegin' and e.get('id')==d['beginId']]
   require(len(begins)==1,'selected field')
   begin=begins[0]
   require(begin.get('type')=='MEMO' and begin.get('editable')=='1','editable MEMO')
   require(len(begin.findall(P+'subList'))==1 and len(begin.findall(P+'parameters'))==1,'annotation ownership')
   elements=list(expected.iter());low=max(elements.index(e) for e in begin.iter())
   ends=[e for e in expected.iter(P+'fieldEnd') if e.get('beginIDRef')==d['beginId']]
   require(len(ends)==1 and elements.index(ends[0])>low,'field link')
   high=elements.index(ends[0])
   texts=[e for e in direct if e.tag==P+'t' and low<elements.index(e)<high]
   require(texts and len(texts[0])==0,'plain first label site')
   texts[0].text=d['text']+(texts[0].text or '')
   begin.set('dirty','1')
   require(signature(expected)==signature(actual),'complete XML mismatch')
def self_test():
 def archive(xml,header=b'keep'):
  out=io.BytesIO()
  with zipfile.ZipFile(out,'w') as z:
   for name,data in [('Contents/section0.xml',xml),('Contents/header.xml',header)]:
    z.writestr(zipfile.ZipInfo(name,(1980,1,1,0,0,0)),data)
  return base64.b64encode(out.getvalue()).decode()
 source=b"<r xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='8' type='MEMO' editable='1' dirty='0'><p:parameters><p:stringParam name='Author'>owner</p:stringParam></p:parameters><p:subList><p:p><p:run><p:t>note</p:t></p:run></p:p></p:subList></p:fieldBegin></p:ctrl><p:t>marked</p:t><p:ctrl><p:fieldEnd beginIDRef='8'/></p:ctrl></p:run></p:p></r>"
 changed=source.replace(b"dirty='0'",b"dirty='1'").replace(b'>marked<',b'>Xmarked<')
 request={'before':archive(source),'after':archive(changed),'section':0,'paragraph':1,'beginId':'8','text':'X'}
 verify(request)
 for xml,header in [(changed.replace(b'>note<',b'>lost<'),b'keep'),(changed.replace(b'>owner<',b'>other<'),b'keep'),(changed,b'lost'),(source,b'keep')]:
  try:verify({**request,'after':archive(xml,header)})
  except ValueError:continue
  raise ValueError('oracle accepted a mutation')
if __name__=='__main__':
 self_test()
 if sys.argv[1:]==['--self-test']:print('MEMO oracle self-test verified')
 else:
  data=json.load(sys.stdin)
  if data.get('mode')=='inventory':print(json.dumps(inventory(data['before'])))
  else:
   require(data.get('mode') in (None,'prefix'),'unknown MEMO oracle mode')
   verify(data);print('MEMO full XML/ZIP verified')
