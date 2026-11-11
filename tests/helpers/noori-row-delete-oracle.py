import sys,json,zlib,struct,zipfile,io,xml.etree.ElementTree as E
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from source_grid_cfb import Cfb,records,u16,u32,require
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
def frame(t,l,b):return struct.pack('<I',t|(l<<10)|(len(b)<<20))+bytes(b)
def h5(before,after):
 a=Cfb(before);b=Cfb(after);require(a.streams.keys()==b.streams.keys(),'CFB inventory')
 for name in a.streams:
  if name!='BodyText/Section0':require(a.streams[name]==b.streams[name],'non-target stream')
 dec=lambda c:zlib.decompress(c.streams['BodyText/Section0'],-15)if u32(c.streams['FileHeader'],36)&1 else c.streams['BodyText/Section0'];raw=dec(a);rs=records(raw);ti=next(i for i,r in enumerate(rs)if r[0]==77);ci=ti-1;end=next(i for i in range(ti+1,len(rs))if rs[i][1]<rs[ci][1]);out=[];skip_until=0
 for i,(tag,l,start,p,n)in enumerate(rs):
  if i<skip_until:continue
  value=bytearray(raw[p:p+n])
  if tag==69:continue
  if i==ci:struct.pack_into('<I',value,20,4575)
  elif i==ti:struct.pack_into('<H',value,4,2);value=value[:18]+struct.pack('<2H',2,4)+value[24:]
  elif ti<i<end and tag==72 and l==rs[ti][1]:
   row=u16(value,10)
   if row==1:
    skip_until=next((j for j in range(i+1,end)if rs[j][0]==72 and rs[j][1]==l),end);continue
   if row>1:struct.pack_into('<H',value,10,row-1)
  if tag==66:struct.pack_into('<H',value,16,0)
  out.append(frame(tag,l,value))
 require(b''.join(out)==dec(b),'whole HWP5 source deletion, original IDs/fields preserved')
def hx(before,after):
 a=zipfile.ZipFile(io.BytesIO(before));b=zipfile.ZipFile(io.BytesIO(after));require(a.namelist()==b.namelist(),'ZIP inventory');part='Contents/section0.xml'
 for n in a.namelist():
  if n!=part:require(a.read(n)==b.read(n),'non-target ZIP part')
 root=E.fromstring(a.read(part));actual=E.fromstring(b.read(part))
 for parent in root.iter():
  for c in list(parent):
   if c.tag==P+'linesegarray':parent.remove(c)
 t=root.find('.//'+P+'tbl');t.set('rowCnt','2');t.find(P+'sz').set('height','4575');rows=t.findall(P+'tr');t.remove(rows[1])
 for c in rows[2].findall(P+'tc'):c.find(P+'cellAddr').set('rowAddr','1')
 require(E.tostring(root)==E.tostring(actual),'whole XML original-row deletion')
 from noori_row_xml_raw import verify
 verify(a.read(part),b.read(part),'delete')
if __name__=='__main__':
 ext,before,after=sys.argv[1:];(h5 if ext=='hwp'else hx)(Path(before).read_bytes(),Path(after).read_bytes());print(json.dumps({'format':ext,'independentOriginalMiddleRowDelete':True,'wholeSectionAndOtherParts':True}))
