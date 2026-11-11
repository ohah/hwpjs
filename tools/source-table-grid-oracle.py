"""Independent fixed-fixture CFB/XML oracle driven by external, literal tile matrices."""
import base64,copy,importlib.util,io,json,pathlib,struct,sys,zipfile,xml.etree.ElementTree as E,xml.parsers.expat as expat
spec=importlib.util.spec_from_file_location('cfb',pathlib.Path(__file__).parents[1]/'tests/helpers/source_grid_cfb.py');o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
def expected_cells(matrix):
    cols=len(matrix[0]);o.require(cols>0 and all(len(row)==cols for row in matrix),'matrix shape');keys={}
    for r,row in enumerate(matrix):
        for c,key in enumerate(row):keys.setdefault(key,[]).append((r,c))
    out=[]
    for key,positions in keys.items():
        top=min(r for r,c in positions);left=min(c for r,c in positions);bottom=max(r for r,c in positions)+1;right=max(c for r,c in positions)+1
        o.require(len(positions)==(bottom-top)*(right-left),'nonrectangular expected cell');fresh=key.startswith('+');label=key[1:]if fresh else key;o.require(len(label)==1 and 'A'<=label<='I','source label');index=ord(label)-65
        out.append({'source':(index//3,index%3),'at':(top,left),'span':(bottom-top,right-left),'size':(6000*(right-left),3000*(bottom-top)),'fresh':fresh})
    return sorted(out,key=lambda c:c['at'])
def xml_bounds(raw,ordinal):
    parser=expat.ParserCreate(namespace_separator='}');seen=0;depth=0;chosen=None;result=None
    def start(name,attrs):
        nonlocal seen,depth,chosen
        depth+=1
        if name=='http://www.hancom.co.kr/hwpml/2011/paragraph}tbl':
            if seen==ordinal:chosen=(depth,parser.CurrentByteIndex)
            seen+=1
    def end(name):
        nonlocal depth,result
        if chosen and chosen[0]==depth:result=(chosen[1],raw.index(b'>',parser.CurrentByteIndex)+1)
        depth-=1
    parser.StartElementHandler=start;parser.EndElementHandler=end;parser.Parse(raw,True);o.require(result is not None,'table bounds');return result

def hx(before,after,request,cells):
    a=zipfile.ZipFile(io.BytesIO(before));b=zipfile.ZipFile(io.BytesIO(after));o.require(a.namelist()==b.namelist(),'ZIP inventory');part='Contents/section0.xml';raw=a.read(part);changed=b.read(part);root=E.fromstring(raw);tables=root.findall('.//'+P+'tbl');target=tables[request['table']];oldrows=target.findall(P+'tr');source={}
    for row in oldrows:
        for cell in row.findall(P+'tc'):
            addr=cell.find(P+'cellAddr');source[int(addr.get('rowAddr')),int(addr.get('colAddr'))]=cell
    used={p.get('id')for p in root.findall('.//'+P+'p')};newroot=E.fromstring(changed);newtarget=newroot.findall('.//'+P+'tbl')[request['table']];newcells={}
    for row in newtarget.findall(P+'tr'):
        for cell in row.findall(P+'tc'):
            addr=cell.find(P+'cellAddr');key=(int(addr.get('rowAddr')),int(addr.get('colAddr')));o.require(key not in newcells,'duplicate output source address');newcells[key]=cell
    o.require(len(newcells)==len(cells),'physical cell count')
    row_count=len(request['matrix']);col_count=len(request['matrix'][0]);target.set('rowCnt',str(row_count));target.set('colCnt',str(col_count));size=target.find(P+'sz');size.set('width',str(6000*col_count));size.set('height',str(3000*row_count))
    for row in oldrows:target.remove(row)
    inserted=set()
    for r in range(row_count):
        template=copy.deepcopy(oldrows[request['rowTemplates'][r]])
        for node in list(template):template.remove(node)
        for plan in cells:
            if plan['at'][0]!=r:continue
            cell=copy.deepcopy(source[plan['source']]);addr=cell.find(P+'cellAddr');addr.set('rowAddr',str(r));addr.set('colAddr',str(plan['at'][1]));span=cell.find(P+'cellSpan');span.set('rowSpan',str(plan['span'][0]));span.set('colSpan',str(plan['span'][1]));size=cell.find(P+'cellSz');size.set('width',str(plan['size'][0]));size.set('height',str(plan['size'][1]))
            if plan['fresh']:
                sub=cell.find(P+'subList');paragraphs=sub.findall(P+'p');first=paragraphs[0];actual=newcells[plan['at']].find(P+'subList').findall(P+'p');o.require(len(actual)==1,'blank paragraph count');newid=actual[0].get('id');o.require(newid not in used and newid not in inserted and int(newid)>0,'fresh paragraph identity');inserted.add(newid);first.set('id',newid)
                for p in paragraphs[1:]:sub.remove(p)
                for text in first.findall('.//'+P+'t'):text.text=None
            template.append(cell)
        target.append(template)
    o.require(E.tostring(root)==E.tostring(newroot),'whole section XML')
    aa,az=xml_bounds(raw,request['table']);ba,bz=xml_bounds(changed,request['table']);o.require(raw[:aa]==changed[:ba] and raw[az:]==changed[bz:],'outside target XML bytes')
    for name in a.namelist():
        if name!=part:o.require(a.read(name)==b.read(name),'other ZIP part '+name)

def h5_table(raw,ordinal):
    rs=o.records(raw);tables=[i for i,r in enumerate(rs)if r[0]==77];ti=tables[ordinal];ci=ti-1;o.require(rs[ci][0]==71,'owned control');level=rs[ci][1];end=next((i for i in range(ti+1,len(rs))if rs[i][1]<level),len(rs));groups=[]
    for i in range(ti+1,end):
        if rs[i][0]==72 and rs[i][1]==level+1:
            last=next((j for j in range(i+1,end)if rs[j][0]==72 and rs[j][1]==level+1),end);groups.append((i,last))
    return rs,ti,ci,end,groups

def h5(before,after,request,cells):
    a=o.Cfb(before);b=o.Cfb(after);o.require(a.streams.keys()==b.streams.keys() and a.entries.keys()==b.entries.keys(),'CFB inventory');
    o.require(a.rows[0][80:116]==b.rows[0][80:116],'root metadata')
    for name,row in a.entries.items():o.require(row[66]==b.entries[name][66] and row[80:116]==b.entries[name][80:116],'directory metadata '+name)
    part='BodyText/Section0';raw=a.streams[part];changed=b.streams[part];o.require(o.u32(a.streams['FileHeader'],36)&1==0,'controlled uncompressed source')
    rs,ti,ci,end,groups=h5_table(raw,request['table']);new,nti,nci,nend,newgroups=h5_table(changed,request['table'])
    def payload(data,record):return data[record[3]:record[3]+record[4]]
    source={}
    for start,stop in groups:
        value=payload(raw,rs[start]);source[o.u16(value,10),o.u16(value,8)]=(start,stop)
    actual={}
    for start,stop in newgroups:
        value=payload(changed,new[start]);key=(o.u16(value,10),o.u16(value,8));o.require(key not in actual,'duplicate output cell');actual[key]=(start,stop)
    o.require(len(actual)==len(cells),'output cell count');used={o.u32(payload(raw,r),18)for r in rs if r[0]==66};fresh=set();expected=[]
    def frame(record,value):return struct.pack('<I',record[0]|(record[1]<<10)|(len(value)<<20))+value
    control=bytearray(payload(raw,rs[ci]));struct.pack_into('<2I',control,16,6000*len(request['matrix'][0]),3000*len(request['matrix']));expected.append(frame(rs[ci],control))
    table=bytearray(payload(raw,rs[ti]));rows=o.u16(table,4);rowcount=len(request['matrix']);struct.pack_into('<2H',table,4,rowcount,len(request['matrix'][0]));counts=[sum(1 for c in cells if c['at'][0]==r)for r in range(rowcount)];expected.append(frame(rs[ti],table[:18]+struct.pack('<'+'H'*rowcount,*counts)+table[18+rows*2:]))
    for plan in cells:
        start,stop=source[plan['source']];value=bytearray(payload(raw,rs[start]));r,c=plan['at'];rr,cc=plan['span'];width,height=plan['size'];struct.pack_into('<4H2I',value,8,c,r,cc,rr,width,height)
        if plan['fresh']:struct.pack_into('<H',value,0,1)
        expected.append(frame(rs[start],value))
        if not plan['fresh']:
            begin=rs[start+1][2];last=rs[stop][2]if stop<len(rs)else len(raw);expected.append(raw[begin:last])
        else:
            headers=[i for i in range(start+1,stop)if rs[i][0]==66];first=headers[0];last=headers[-1];header=bytearray(payload(raw,rs[first]));struct.pack_into('<I',header,0,(o.u32(payload(raw,rs[last]),0)&0x80000000)|1);struct.pack_into('<3H',header,12,1,0,0)
            ns,ne=actual[plan['at']];nh=[i for i in range(ns+1,ne)if new[i][0]==66];o.require(len(nh)==1,'blank paragraph count');newid=o.u32(payload(changed,new[nh[0]]),18);o.require(newid>0 and newid not in used and newid not in fresh,'fresh identity');fresh.add(newid);struct.pack_into('<I',header,18,newid);expected.append(frame(rs[first],header))
            # Only NEW one-unit empty paragraphs omit PARA_TEXT (implicit break).
            # Surviving source paragraphs above remain byte-exact, including CR-only TEXT.
            runs=next(rs[i]for i in range(first+1,stop)if rs[i][0]==68);expected.append(frame(runs,payload(raw,runs)[:8]))
    prefix=raw[:rs[ci][2]];suffix=raw[rs[end][2]:]if end<len(rs)else b'';o.require(prefix+b''.join(expected)+suffix==changed,'whole target records and surrounding bytes')
    for name,content in a.streams.items():
        if name!=part:o.require(content==b.streams[name],'other CFB stream '+name)

def verify(request):
    before=base64.b64decode(request['before']);after=base64.b64decode(request['after']);cells=expected_cells(request['matrix']);(h5 if request['format']=='hwp5'else hx)(before,after,request,cells);return {'cells':len(cells),'fresh':sum(c['fresh']for c in cells),'rows':len(request['matrix']),'columns':len(request['matrix'][0])}
if __name__=='__main__':
    try:print(json.dumps(verify(json.load(sys.stdin))))
    except Exception as error:print(str(error),file=sys.stderr);sys.exit(1)
