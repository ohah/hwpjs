"""Authored interval-equation fixtures; no product geometry/planner imports."""
import copy,io,pathlib,struct,sys,zipfile,xml.etree.ElementTree as E
from source_grid_cfb import Cfb,records,write_streams,u16,u32,require
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
MATRICES={'interval-columns':[['A','A','C'],['D','E','E'],['G','G','I']], 'interval-rows':[['A','B','C'],['A','E','C'],['G','E','I']]}
def tiles(matrix):
 groups={}
 for r,row in enumerate(matrix):
  for c,key in enumerate(row):groups.setdefault(key,[]).append((r,c))
 return [(key,positions)for key,positions in groups.items()]
def dimensions(positions,key,mode):
 rows=[r for r,c in positions];cols=[c for r,c in positions];rs=max(rows)-min(rows)+1;cs=max(cols)-min(cols)+1;w=6000*cs;h=3000*rs
 if mode=='interval-conflict' and key=='G':w+=1
 if mode=='interval-nonpositive':w={'A':6000,'C':12000,'D':6000,'E':12000,'G':6000,'I':12000}[key]
 return min(rows),min(cols),rs,cs,w,h
def h5(raw,mode,matrix):
 streams=Cfb(raw).streams.copy();data=streams['BodyText/Section0'];require(u32(streams['FileHeader'],36)&1==0,'controlled uncompressed input');rs=records(data);ti=next(i for i,r in enumerate(rs)if r[0]==77);level=rs[ti-1][1];end=next((i for i in range(ti+1,len(rs))if rs[i][1]<level),len(rs));groups=[]
 for i in range(ti+1,end):
  if rs[i][0]==72 and rs[i][1]==level+1:groups.append((i,next((j for j in range(i+1,end)if rs[j][0]==72 and rs[j][1]==level+1),end)))
 require(len(groups)==9,'base nine cells')
 def payload(i):v=rs[i];return data[v[3]:v[3]+v[4]]
 def frame(tag,level,value):require(len(value)<4095,'controlled framing');return struct.pack('<I',tag|(level<<10)|(len(value)<<20))+value
 table=bytearray(payload(ti));ts=tiles(matrix)
 for row in range(3):struct.pack_into('<H',table,18+row*2,sum(1 for key,positions in ts if min(r for r,c in positions)==row))
 chunks=[data[:rs[ti][2]],frame(77,rs[ti][1],table)]
 for key,positions in ts:
  anchor=ord(key)-65;first=bytearray(payload(groups[anchor][0]));row,col,rspan,cspan,w,h=dimensions(positions,key,mode);struct.pack_into('<4H2I',first,8,col,row,cspan,rspan,w,h);struct.pack_into('<H',first,0,len(positions));paras=[]
  for r,c in positions:
   begin,stop=groups[r*3+c]
   for i in range(begin+1,stop):
    value=bytearray(payload(i))
    if rs[i][0]==66:struct.pack_into('<I',value,0,u32(value,0)&0x7fffffff)
    paras.append((rs[i][0],rs[i][1],value))
  last=max(i for i,v in enumerate(paras)if v[0]==66);struct.pack_into('<I',paras[last][2],0,u32(paras[last][2],0)|0x80000000);chunks.append(frame(72,rs[groups[anchor][0]][1],first));chunks.extend(frame(*v)for v in paras)
 chunks.append(data[rs[end][2]if end<len(rs)else len(data):]);streams['BodyText/Section0']=b''.join(chunks);return write_streams(streams)
def hx(raw,mode,matrix):
 z=zipfile.ZipFile(io.BytesIO(raw));root=E.fromstring(z.read('Contents/section0.xml'));table=root.find('.//'+P+'tbl');rows=table.findall(P+'tr');cells=[c for row in rows for c in row.findall(P+'tc')];require(len(cells)==9,'base nine cells')
 for row in rows:
  for c in list(row):row.remove(c)
 for key,positions in tiles(matrix):
  cell=copy.deepcopy(cells[ord(key)-65]);r,c,rs,cs,w,h=dimensions(positions,key,mode);span=cell.find(P+'cellSpan');span.set('rowSpan',str(rs));span.set('colSpan',str(cs));size=cell.find(P+'cellSz');size.set('width',str(w));size.set('height',str(h));sub=cell.find(P+'subList')
  for p in list(sub):sub.remove(p)
  for rr,cc in positions:
   for p in cells[rr*3+cc].find(P+'subList'):sub.append(copy.deepcopy(p))
  rows[r].append(cell)
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w')as saved:
  for item in z.infolist():saved.writestr(item,E.tostring(root,encoding='utf-8')if item.filename=='Contents/section0.xml'else z.read(item.filename))
 return out.getvalue()
if __name__=='__main__':
 source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);mode=sys.argv[3];matrix=MATRICES.get(mode,MATRICES['interval-columns']);raw=source.read_bytes();out.write_bytes(hx(raw,mode,matrix)if source.suffix=='.hwpx'else h5(raw,mode,matrix))
