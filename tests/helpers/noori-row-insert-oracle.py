"""Independent Noori first-header-table oracle; stdlib CFB/XML, no product planner."""
import sys,json,struct,zlib,zipfile,io,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from source_grid_cfb import Cfb,records,u16,u32,require
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
def frame(tag,level,b):
    require(len(b)<4095,'owned frame budget');return struct.pack('<I',tag|(level<<10)|(len(b)<<20))+bytes(b)
def clean(raw):
    out=[]
    for tag,level,start,p,n in records(raw):
        if tag==69:continue
        if tag==66 and u16(raw,p+16):
            b=bytearray(raw[p:p+n]);struct.pack_into('<H',b,16,0);out.append(frame(tag,level,b))
        else:out.append(raw[start:p+n])
    return b''.join(out)
def groups(raw):
    rs=records(raw);ti=next(i for i,r in enumerate(rs)if r[0]==77);ci=ti-1;require(rs[ci][0]==71,'table common owner')
    end=next((i for i in range(ti+1,len(rs))if rs[i][1]<rs[ci][1]),len(rs));starts=[i for i in range(ti+1,end)if rs[i][0]==72 and rs[i][1]==rs[ti][1]]
    return rs,ci,ti,end,[(start,starts[n+1]if n+1<len(starts)else end)for n,start in enumerate(starts)]
def h5(before,after,operation):
    a=Cfb(before);b=Cfb(after);require(a.streams.keys()==b.streams.keys(),'CFB inventory')
    decode=lambda c:zlib.decompress(c.streams['BodyText/Section0'],-15)if u32(c.streams['FileHeader'],36)&1 else c.streams['BodyText/Section0']
    original=decode(a);actual=decode(b)
    for name in a.streams:
        if name!='BodyText/Section0':require(a.streams[name]==b.streams[name],'other CFB stream '+name)
    if operation=='delete':require(actual==clean(original),'delete restores original records except known caches');return
    rs,ci,ti,end,gs=groups(original);ars,aci,ati,aend,ags=groups(actual)
    payload=lambda i:original[rs[i][3]:rs[i][3]+rs[i][4]]
    apayload=lambda i:actual[ars[i][3]:ars[i][3]+ars[i][4]]
    require(len(gs)==10 and len(ags)==12,'physical cells 10 -> 12')
    require((u16(payload(ti),4),u16(payload(ti),6))==(3,4),'original shape')
    fresh=[(i,j)for i,j in ags if u16(apayload(i),10)==1];require(len(fresh)==2,'merged inserted row has two physical cells')
    existing={u32(original,p+18)for tag,l,s,p,n in rs if tag==66};newids=[]
    for i,j in fresh:
        headers=[k for k in range(i+1,j)if ars[k][0]==66];require(len(headers)==1,'one blank paragraph per new cell');newids.append(u32(apayload(headers[0]),18))
    require(len(set(newids))==2 and not set(newids)&existing and 0 not in newids,'fresh ID collision avoidance')
    out=[original[:rs[ci][2]]]
    common=bytearray(payload(ci));struct.pack_into('<I',common,20,9018);out.append(frame(71,rs[ci][1],common))
    table=bytearray(payload(ti));struct.pack_into('<H',table,4,4);table=table[:18]+struct.pack('<4H',2,2,4,4)+table[24:];out.append(frame(77,rs[ti][1],table))
    def cell(i,j,newrow,freshid=None):
        value=bytearray(payload(i));struct.pack_into('<H',value,10,newrow)
        if freshid is None:return frame(72,rs[i][1],value)+original[rs[i+1][2]:(rs[j][2]if j<len(rs)else len(original))]
        struct.pack_into('<H',value,0,1);headers=[k for k in range(i+1,j)if rs[k][0]==66];require(headers,'source paragraph')
        h=bytearray(payload(headers[0]));struct.pack_into('<I',h,0,(u32(payload(headers[-1]),0)&0x80000000)|1);struct.pack_into('<3H',h,12,1,0,0);struct.pack_into('<I',h,18,freshid)
        run=next(k for k in range(headers[0]+1,j)if rs[k][0]==68);char=struct.pack('<II',0,u32(payload(run),4))
        return frame(72,rs[i][1],value)+frame(66,rs[headers[0]][1],h)+frame(68,rs[run][1],char)
    oldfirst=[g for g in gs if u16(payload(g[0]),10)==0];require(len(oldfirst)==2,'source merged row')
    for g in oldfirst:out.append(cell(*g,0))
    for g,fid in zip(oldfirst,newids):out.append(cell(*g,1,fid))
    for i,j in gs:
        oldrow=u16(payload(i),10)
        if oldrow:out.append(cell(i,j,oldrow+1))
    out.append(original[rs[end][2]:]if end<len(rs)else b'')
    require(actual==clean(b''.join(out)),'whole independent expected HWP5 section')
def remove_caches(root):
    for node in root.iter():
        for child in list(node):
            if child.tag==P+'linesegarray':node.remove(child)
def hx(before,after,operation):
    a=zipfile.ZipFile(io.BytesIO(before));b=zipfile.ZipFile(io.BytesIO(after));require(a.namelist()==b.namelist(),'ZIP inventory');part='Contents/section0.xml'
    for name in a.namelist():
        if name!=part:require(a.read(name)==b.read(name),'other ZIP part '+name)
    root=E(a.read(part));actual=E(b.read(part));remove_caches(root)
    if operation=='delete':require(ET.tostring(root)==ET.tostring(actual),'delete restores original XML except known caches');return
    table=root.find('.//'+P+'tbl');newtable=actual.find('.//'+P+'tbl');require(table.get('rowCnt')=='3'and table.get('colCnt')=='4','original first table shape');table.set('rowCnt','4');table.find(P+'sz').set('height','9018');rows=table.findall(P+'tr');first=copy.deepcopy(rows[0]);newrow=newtable.findall(P+'tr')[1];require(len(first)==len(newrow)==2,'merged row copies exactly two cells')
    oldids={p.get('id')for p in root.iter(P+'p')};fresh=[]
    for cell,observed in zip(first,newrow):
        cell.find(P+'cellAddr').set('rowAddr','1');sub=cell.find(P+'subList');ps=sub.findall(P+'p');require(ps,'template paragraph');paragraph=ps[0]
        for p in ps[1:]:sub.remove(p)
        fid=observed.find(P+'subList').find(P+'p').get('id');require(fid and fid!='0'and fid not in oldids and fid not in fresh,'fresh paragraph IDs');fresh.append(fid);paragraph.set('id',fid)
        for t in paragraph.iter(P+'t'):t.text=None
    for row in rows[1:]:
        for c in row.findall(P+'tc'):
            addr=c.find(P+'cellAddr');addr.set('rowAddr',str(int(addr.get('rowAddr'))+1))
    table.insert(list(table).index(rows[1]),first)
    require(ET.tostring(root)==ET.tostring(actual),'whole independent expected XML including original duplicate IDs')
    from noori_row_xml_raw import verify
    verify(a.read(part),b.read(part),'insert')
import xml.etree.ElementTree as ET
E=ET.fromstring
if __name__=='__main__':
    ext,before,after,operation=sys.argv[1:];b=Path(before).read_bytes();a=Path(after).read_bytes();(h5 if ext=='hwp'else hx)(b,a,operation);print(json.dumps(dict(independent=True,format=ext,operation=operation,wholeSection=True,otherParts=True,originalIdsPreserved=True)))
