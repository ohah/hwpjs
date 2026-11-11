"""Synthetic source fixtures from an independently authored Native base; no fixture discovery."""
import copy,io,pathlib,struct,sys,zipfile,xml.etree.ElementTree as E
from source_grid_cfb import Cfb,records,write_streams,u16,u32,require
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
def frame(tag,level,payload):
    require(len(payload)<4095,'controlled record budget');return struct.pack('<I',tag|(level<<10)|(len(payload)<<20))+payload
def h5(raw,mode):
    streams=Cfb(raw).streams.copy();data=streams['BodyText/Section0'];require(u32(streams['FileHeader'],36)&1==0,'controlled uncompressed source');rs=records(data);ti=next(i for i,r in enumerate(rs) if r[0]==77);ci=ti-1;require(rs[ci][0]==71,'table control');level=rs[ci][1];end=next((i for i in range(ti+1,len(rs))if rs[i][1]<level),len(rs));groups=[]
    for i in range(ti+1,end):
        if rs[i][0]==72 and rs[i][1]==level+1:
            stop=next((j for j in range(i+1,end)if rs[j][0]==72 and rs[j][1]==level+1),end);groups.append((i,stop))
    def raw_records(a,b):return data[rs[a][2] if a<len(rs) else len(data):rs[b][2] if b<len(rs) else len(data)]
    def payload(i):r=rs[i];return data[r[3]:r[3]+r[4]]
    if mode=='protected-nested':
        result=h5(raw,'nested');ss=Cfb(result).streams.copy();dd=bytearray(ss['BodyText/Section0']);rr=records(dd);cell=next(r for r in rr if r[0]==72);struct.pack_into('<I',dd,cell[3]+4,u32(dd,cell[3]+4)|(1<<17));ss['BodyText/Section0']=bytes(dd);return write_streams(ss)
    if mode in ('vertical','horizontal','ambiguous'):
        first=bytearray(payload(groups[0][0]));base=8;remove=[1]if mode=='horizontal'else[3] if mode=='vertical'else list(range(1,9))
        if mode=='ambiguous':struct.pack_into('<4H2I',first,base,0,0,3,3,18000,9000)
        elif mode=='vertical':struct.pack_into('<H',first,base+6,2);struct.pack_into('<I',first,base+12,6000)
        else:struct.pack_into('<H',first,base+4,2);struct.pack_into('<I',first,base+8,12000)
        # Keep all merged source paragraphs; only the last remains list-terminal.
        paras=[]
        for g in [0]+remove:
            a,b=groups[g];pieces=[]
            for j in range(a+1,b):
                value=bytearray(payload(j))
                if rs[j][0]==66:struct.pack_into('<I',value,0,u32(value,0)&0x7fffffff)
                pieces.append((rs[j][0],rs[j][1],value))
            paras.extend(pieces)
        last=max(i for i,r in enumerate(paras)if r[0]==66);struct.pack_into('<I',paras[last][2],0,u32(paras[last][2],0)|0x80000000);struct.pack_into('<H',first,0,len(remove)+1)
        kept=[i for i in range(9)if i not in remove];table=bytearray(payload(ti));counts=[sum(1 for i in kept if i//3==row)for row in range(3)]
        for row,count in enumerate(counts):struct.pack_into('<H',table,18+row*2,count)
        chunks=[raw_records(0,ti),frame(77,rs[ti][1],table)]
        for g in kept:
            if g==0:chunks.append(frame(72,rs[groups[g][0]][1],first)+b''.join(frame(*r)for r in paras))
            else:chunks.append(raw_records(*groups[g]))
        chunks.append(raw_records(end,len(rs)));streams['BodyText/Section0']=b''.join(chunks)
    elif mode=='nested':
        # Original three-by-three table becomes a leaf nested source table.
        common=bytearray(payload(ci));struct.pack_into('<I',common,16,24000);struct.pack_into('<I',common,20,18000)
        table=bytearray(payload(ti));struct.pack_into('<2H',table,4,1,1);table=table[:18]+struct.pack('<H',1)+table[24:]
        cell=bytearray(payload(groups[0][0]));struct.pack_into('<4H2I',cell,8,0,0,1,1,24000,18000)
        host_index=groups[0][0]+1;host=bytearray(payload(host_index));struct.pack_into('<I',host,18,900)
        root_text=next(payload(i)for i in range(ci)if rs[i][0]==67);control=root_text[-18:-2];require(u16(control,0)==11,'table inline control');text=control+'PARENT_TAIL\r'.encode('utf-16-le');struct.pack_into('<I',host,0,0x80000000|len(text)//2);struct.pack_into('<I',host,4,u32(payload(0),4))
        nested=[]
        for i in range(ci,end):
            value=bytearray(payload(i))
            if rs[i][0]==66:struct.pack_into('<I',value,18,u32(value,18)+1000)
            if i==ci:struct.pack_into('<I',value,36,u32(value,36)+1000)
            nested.append(frame(rs[i][0],rs[i][1]+2,value))
        runs=next(payload(i)for i in range(host_index+1,groups[0][1])if rs[i][0]==68)
        streams['BodyText/Section0']=raw_records(0,ci)+frame(71,level,common)+frame(77,level+1,table)+frame(72,level+1,cell)+frame(66,level+1,host)+frame(67,level+2,text)+frame(68,level+2,runs)+b''.join(nested)+raw_records(end,len(rs))
    else:raise ValueError(mode)
    return write_streams(streams)
def hx(raw,mode):
    z=zipfile.ZipFile(io.BytesIO(raw));section=E.fromstring(z.read('Contents/section0.xml'));table=section.find('.//'+P+'tbl');rows=table.findall(P+'tr');cells=[tc for row in rows for tc in row.findall(P+'tc')]
    if mode=='protected-nested':
        result=hx(raw,'nested');zz=zipfile.ZipFile(io.BytesIO(result));rr=E.fromstring(zz.read('Contents/section0.xml'));rr.find('.//'+P+'tc').set('protect','1');out=io.BytesIO()
        with zipfile.ZipFile(out,'w')as saved:
            for entry in zz.infolist():saved.writestr(entry,E.tostring(rr,encoding='utf-8')if entry.filename=='Contents/section0.xml'else zz.read(entry.filename))
        return out.getvalue()
    if mode in ('vertical','horizontal','ambiguous'):
        first=cells[0];remove=[1]if mode=='horizontal'else[3]if mode=='vertical'else list(range(1,9));span=first.find(P+'cellSpan');size=first.find(P+'cellSz')
        if mode=='ambiguous':span.set('rowSpan','3');span.set('colSpan','3');size.set('width','18000');size.set('height','9000')
        elif mode=='vertical':span.set('rowSpan','2');size.set('height','6000')
        else:span.set('colSpan','2');size.set('width','12000')
        sub=first.find(P+'subList')
        for i in remove:
            for p in cells[i].find(P+'subList').findall(P+'p'):sub.append(copy.deepcopy(p))
            rows[i//3].remove(cells[i])
    elif mode=='nested':
        inner=copy.deepcopy(table)
        for p in inner.findall('.//'+P+'p'):p.set('id',str(int(p.get('id'))+1000))
        if inner.get('id')is not None:inner.set('id',str(int(inner.get('id'))+1000))
        table.set('rowCnt','1');table.set('colCnt','1');table.find(P+'sz').set('width','24000');table.find(P+'sz').set('height','18000')
        for row in rows[1:]:table.remove(row)
        for c in cells[1:3]:rows[0].remove(c)
        first=cells[0];first.find(P+'cellSz').set('width','24000');first.find(P+'cellSz').set('height','18000');paragraph=first.find(P+'subList').find(P+'p');run=paragraph.find(P+'run')
        for element in list(run):run.remove(element)
        run.append(inner);E.SubElement(run,P+'t').text='PARENT_TAIL'
    else:raise ValueError(mode)
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w')as saved:
        for entry in z.infolist():saved.writestr(entry,E.tostring(section,encoding='utf-8')if entry.filename=='Contents/section0.xml'else z.read(entry.filename))
    return out.getvalue()
if __name__=='__main__':
    source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);mode=sys.argv[3];raw=source.read_bytes();out.write_bytes(hx(raw,mode)if source.suffix=='.hwpx'else h5(raw,mode))
