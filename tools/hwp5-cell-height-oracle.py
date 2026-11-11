"""Independent CFB height oracle; source row/column addresses and full payload comparison."""
import base64,importlib.util,json,pathlib,struct,sys,zlib
spec=importlib.util.spec_from_file_location('cfb',pathlib.Path(__file__).with_name('hwp5-cell-width-oracle.py'));o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)
def verify(request):
    before=o.Cfb(base64.b64decode(request['before']));after=o.Cfb(base64.b64decode(request['after']))
    o.require(before.streams.keys()==after.streams.keys() and before.entries.keys()==after.entries.keys(),'CFB inventory')
    o.require(before.rows[0][80:116]==after.rows[0][80:116],'root metadata')
    for path,row in before.entries.items():o.require(row[66:68]==after.entries[path][66:68] and row[80:116]==after.entries[path][80:116],'directory metadata')
    part=request.get('part','BodyText/Section0');a=before.streams[part];b=after.streams[part]
    if o.u32(before.streams['FileHeader'],36)&1:a=zlib.decompress(a,-15);b=zlib.decompress(b,-15)
    expected=bytearray(a);rows=o.records(a);base=request['listHeaderBytes'];o.require(base in (6,8),'explicit schema')
    tables=[i for i,r in enumerate(rows) if r[0]==77];start=tables[request.get('table',0)];level=rows[start][1]
    top,left,bottom,right=request['rectangle'];heights=request['heights'];o.require(len(heights)==bottom-top and all(type(v)==int and 0<v<=0x7fffffff for v in heights),'height arguments');selected=set();totals={}
    for tag,l,begin,p,size in rows[start+1:]:
        if l<level:break
        if tag!=72 or l!=level:continue
        o.require(size==base+26,'source metadata');x,y,cs,rs=struct.unpack_from('<4H',a,p+base)
        if not(top<=y<bottom and left<=x<right):continue
        o.require(cs==rs==1 and (y,x) not in selected,'cell span/duplicate');selected.add((y,x));totals[x]=totals.get(x,0)+o.u32(a,p+base+12);struct.pack_into('<I',expected,p+base+12,heights[y-top])
    o.require(len(selected)==(bottom-top)*(right-left),'coverage');o.require(all(v==sum(heights) for v in totals.values()),'height sum');o.require(bytes(expected)==b,'unexpected record/payload change')
    for name,raw in before.streams.items():
        if name!=part:o.require(raw==after.streams[name],'other CFB stream '+name)
    return {'cells':len(selected),'otherStreams':len(before.streams)-1}
if __name__=='__main__':
    try:print(json.dumps(verify(json.load(sys.stdin))))
    except Exception as error:print(str(error),file=sys.stderr);sys.exit(1)
