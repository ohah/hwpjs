"""Independent plain table-caption authoring; never repairs an input document."""
import copy,io,pathlib,struct,sys,zipfile,xml.etree.ElementTree as E
from source_grid_cfb import Cfb,records,write_streams,u16,u32,require
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
TEXTS=['\ud55c\uae00 \ucea1\uc158\U0001f600','\ubcf4\uc874 \ub450 \ubc88\uc9f8\U0001f600']
def frame(tag,level,value):require(len(value)<4095,'controlled framing');return struct.pack('<I',tag|(level<<10)|(len(value)<<20))+value
def h5(raw,side,mode):
 streams=Cfb(raw).streams.copy();require(u32(streams['FileHeader'],36)&1==0,'authored uncompressed base required');data=streams['BodyText/Section0'];rs=records(data);ti=next(i for i,r in enumerate(rs)if r[0]==77);level=rs[ti][1]
 def payload(i):r=rs[i];return data[r[3]:r[3]+r[4]]
 cell=next(i for i in range(ti+1,len(rs))if rs[i][0]==72);header=next(i for i in range(cell+1,len(rs))if rs[i][0]==66);runs=next(i for i in range(header+1,len(rs))if rs[i][0]==68)
 # Caption starts after the explicit observed8 list prefix; width is source scalar.
 caption=bytearray(struct.pack('<HHIIIhI',2,0,0,2 if side=='top'else 3,8504,850 if side=='top'else -850,18000))
 if mode=='unknown-extension':caption+=b'\0'
 if mode=='unknown-flags':struct.pack_into('<I',caption,8,u32(caption,8)|8)
 if mode=='list-extension':struct.pack_into('<I',caption,4,1<<20)
 pieces=[frame(72,level,caption)]
 for index,text in enumerate(TEXTS):
  value=bytearray(payload(header));encoded=(text+'\r').encode('utf-16-le');struct.pack_into('<I',value,0,(0x80000000 if index==len(TEXTS)-1 else 0)|len(encoded)//2);struct.pack_into('<I',value,4,0);struct.pack_into('<3H',value,12,1,0,1 if mode=='cache'and index==1 else 0);struct.pack_into('<I',value,18,900+index)
  if mode=='field'and index==1:struct.pack_into('<I',value,4,1<<3)
  pieces.extend([frame(66,level,value),frame(67,level+1,encoded),frame(68,level+1,payload(runs)[:8])])
  if mode=='cache'and index==1:pieces.append(frame(69,level+1,bytes(36)))
  if mode in ('field','nested')and index==1:pieces.append(frame(71,level+1,b'fake'+bytes(12)))
 rawcap=b''.join(pieces)
 if mode=='duplicate':rawcap+=rawcap
 common=rs[ti-1];changed=bytearray(data);struct.pack_into('<I',changed,common[3]+4,u32(changed,common[3]+4)|(1<<29));data=bytes(changed)
 if mode=='presence':
  changed=bytearray(data);struct.pack_into('<I',changed,common[3]+4,u32(changed,common[3]+4)&~(1<<29));data=bytes(changed)
 if mode=='presence-without-list':streams['BodyText/Section0']=data;return write_streams(streams)
 if mode=='wrong-owner':
  at=len(data);streams['BodyText/Section0']=data[:at]+rawcap+data[at:]
 else:streams['BodyText/Section0']=data[:rs[ti][2]]+rawcap+data[rs[ti][2]:]
 return write_streams(streams)
def hx(raw,side,order,mode):
 z=zipfile.ZipFile(io.BytesIO(raw));root=E.fromstring(z.read('Contents/section0.xml'));table=root.find('.//'+P+'tbl');cell=table.find(P+'tr').find(P+'tc');first=cell.find(P+'subList').find(P+'p');caption=E.Element(P+'caption',{'side':side.upper(),'fullSz':'false','width':'8504','gap':'850'if side=='top'else'-850','lastWidth':'18000'});sub=E.SubElement(caption,P+'subList',{'id':'','textDirection':'HORIZONTAL','lineWrap':'BREAK','vertAlign':'TOP','linkListIDRef':'0','linkListNextIDRef':'0','textWidth':'0','textHeight':'0','hasTextRef':'false','hasNumRef':'false'})
 for index,text in enumerate(TEXTS):
  p=copy.deepcopy(first);p.set('id',str(900+index));run=p.find(P+'run')
  for e in list(run):run.remove(e)
  E.SubElement(run,P+'t').text=text;sub.append(p)
  if index==1 and mode in ('field','nested'):E.SubElement(run,P+'ctrl'if mode=='field'else P+'tbl')
  if index==1 and mode=='cache':E.SubElement(E.SubElement(p,P+'linesegarray'),P+'lineseg',{'textpos':'0'})
 if mode=='unknown-extension':caption.set('future','keep')
 if mode=='unknown-flags':caption.set('side','FUTURE')
 if mode=='list-extension':sub.set('future','keep')
 if mode=='list-cache':sub.set('textHeight','1')
 if mode=='reference':sub.set('hasNumRef','true')
 if mode=='wrong-owner':
  for row in table.findall(P+'tr'):
   row.append(caption);break
 elif order=='before':table.insert(list(table).index(table.find(P+'tr')),caption)
 else:table.append(caption)
 if mode=='duplicate':table.append(copy.deepcopy(caption))
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w')as saved:
  for item in z.infolist():saved.writestr(item,E.tostring(root,encoding='utf-8')if item.filename=='Contents/section0.xml'else z.read(item.filename))
 return out.getvalue()

def tamper(raw,extension):
 if extension=='hwpx':
  z=zipfile.ZipFile(io.BytesIO(raw));xml=z.read('Contents/section0.xml');import re
  start=re.search(rb'<(?:[A-Za-z_][\w.-]*:)?caption\b',xml).start();end=xml.index(b'>',start);tag=xml[start:end]
  match=re.search(rb'side="([A-Z]+)"',tag);require(match is not None,'known caption side');changed=tag[:match.start()]+b"side='"+match.group(1)+b"'"+tag[match.end():];xml=xml[:start]+changed+xml[end:];out=io.BytesIO()
  with zipfile.ZipFile(out,'w')as saved:
   for item in z.infolist():saved.writestr(item,xml if item.filename=='Contents/section0.xml'else z.read(item.filename))
  return out.getvalue()
 c=Cfb(raw);streams=c.streams.copy();body=bytearray(streams['BodyText/Section0']);rs=records(body);table=next(i for i,r in enumerate(rs)if r[0]==77);caption=next(r for r in rs[:table]if r[0]==72);body[caption[3]+18]^=1;streams['BodyText/Section0']=bytes(body);return write_streams(streams)
if __name__=='__main__':
 if sys.argv[1]=='--tamper':
  sys.stdout.buffer.write(tamper(sys.stdin.buffer.read(),sys.argv[2]));sys.exit(0)
 if sys.argv[1]=='--describe':
  source=pathlib.Path(sys.argv[2]);raw=source.read_bytes()
  if source.suffix=='.hwpx':
   z=zipfile.ZipFile(io.BytesIO(raw));root=E.fromstring(z.read('Contents/section0.xml'));node=next(i for i,e in enumerate(root.iter())if e.tag==P+'tbl')
  else:
   import zlib
   c=Cfb(raw);body=c.streams['BodyText/Section0'];body=zlib.decompress(body,-15)if u32(c.streams['FileHeader'],36)&1 else body;node=next(i for i,r in enumerate(records(body))if r[0]==77)
  print(node);sys.exit(0)
 source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);side=sys.argv[3];order=sys.argv[4];mode=sys.argv[5]if len(sys.argv)>5 else'plain';raw=source.read_bytes();out.write_bytes(hx(raw,side,order,mode)if source.suffix=='.hwpx'else h5(raw,side,mode))
