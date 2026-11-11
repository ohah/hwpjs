"""Independent stdlib CFB + HWP5 record oracle. No product parser or node IDs."""
import base64,json,struct,sys,zlib

def require(value, reason):
    if not value: raise ValueError(reason)
def u16(b,p): return struct.unpack_from('<H',b,p)[0]
def u32(b,p): return struct.unpack_from('<I',b,p)[0]
END=0xfffffffe;FREE=0xffffffff
class Cfb:
    def __init__(self,b):
        require(b[:8]==bytes.fromhex('d0cf11e0a1b11ae1'),'CFB signature')
        self.b=b;self.ss=1<<u16(b,30);self.ms=1<<u16(b,32)
        require(self.ss in (512,4096) and self.ms==64 and len(b)<=64*1024*1024,'sector size/budget')
        def sector(i):
            require(i<(len(b)//self.ss)-1,'sector address');return b[(i+1)*self.ss:(i+2)*self.ss]
        self.sector=sector
        fatids=list(struct.unpack_from('<109I',b,76));n=u32(b,72);sid=u32(b,68);seen=set()
        for _ in range(n):
            require(sid not in seen,'DIFAT cycle');seen.add(sid);row=struct.unpack('<'+'I'*(self.ss//4),sector(sid));fatids.extend(row[:-1]);sid=row[-1]
        fatids=[i for i in fatids if i!=FREE];require(len(fatids)==u32(b,44),'FAT count')
        self.fat=[]
        for i in fatids:self.fat.extend(struct.unpack('<'+'I'*(self.ss//4),sector(i)))
        self.directory=self.chain(u32(b,48),self.fat,sector)
        self.rows=[self.directory[i:i+128] for i in range(0,len(self.directory),128)]
        root=self.rows[0];require(root[66]==5,'root directory')
        self.mini=self.chain(u32(root,116),self.fat,sector)[:struct.unpack_from('<Q',root,120)[0]]
        miniFat=self.chain(u32(b,60),self.fat,sector) if u32(b,64) else b''
        self.mfat=list(struct.unpack('<'+'I'*(len(miniFat)//4),miniFat));self.streams={};self.entries={};visited=set()
        def walk(i,parent):
            if i==FREE:return
            require(i<len(self.rows) and i not in visited,'directory cycle');visited.add(i);row=self.rows[i];size=u16(row,64);require(2<=size<=64 and size%2==0,'directory name')
            name=row[:size-2].decode('utf-16-le');walk(u32(row,68),parent);path=parent+name
            self.entries[path]=row
            if row[66]==1:walk(u32(row,76),path+'/')
            elif row[66]==2:
                length=struct.unpack_from('<Q',row,120)[0];start=u32(row,116)
                data=b'' if length==0 else self.chain(start,self.mfat,lambda j:self.mini[j*64:(j+1)*64]) if length<u32(b,56) else self.chain(start,self.fat,sector)
                require(len(data)>=length,'stream truncation');self.streams[path]=data[:length]
            else:raise ValueError('directory kind')
            walk(u32(row,72),parent)
        walk(u32(root,76),'')
    @staticmethod
    def chain(start,fat,sector):
        out=[];seen=set();i=start
        while i!=END:
            require(i<len(fat) and i not in seen,'chain cycle/address');seen.add(i);out.append(sector(i));i=fat[i]
        return b''.join(out)

def records(data):
    rows=[];p=0
    while p<len(data):
        start=p;h=u32(data,p);p+=4;size=h>>20
        if size==4095:size=u32(data,p);p+=4
        require(p+size<=len(data),'record truncation');rows.append((h&1023,(h>>10)&1023,start,p,size));p+=size
    return rows

def verify(request):
    before=Cfb(base64.b64decode(request['before']));after=Cfb(base64.b64decode(request['after']))
    require(before.streams.keys()==after.streams.keys(),'CFB inventory')
    require(before.entries.keys()==after.entries.keys(),'CFB storages')
    require(before.rows[0][80:116]==after.rows[0][80:116],'root directory metadata')
    for path,row in before.entries.items():
        require(row[66:68]==after.entries[path][66:68] and row[80:116]==after.entries[path][80:116],'directory metadata '+path)
    part=request.get('part','BodyText/Section0');a=before.streams[part];b=after.streams[part]
    compressed=u32(before.streams['FileHeader'],36)&1
    if compressed:a=zlib.decompress(a,-15);b=zlib.decompress(b,-15)
    expected=bytearray(a);rows=records(a);base=request['listHeaderBytes'];require(base in (6,8),'explicit list header schema')
    tables=[i for i,r in enumerate(rows) if r[0]==77];index=request.get('table',0);require(0<=index<len(tables),'table address');start=tables[index];level=rows[start][1]
    top,left,bottom,right=request['rectangle'];widths=request['widths'];require(len(widths)==right-left and all(type(v)==int and 0<v<=0x7fffffff for v in widths),'expected widths')
    selected=set();totals={}
    for tag,l,begin,p,size in rows[start+1:]:
        if l<level:break
        if tag!=72 or l!=level:continue
        require(size==base+26,'unrecognized source cell metadata')
        x,y,cs,rs=struct.unpack_from('<4H',a,p+base)
        if not(top<=y<bottom and left<=x<right):continue
        require(cs==rs==1 and (y,x) not in selected,'cell span/duplicate');selected.add((y,x));totals[y]=totals.get(y,0)+u32(a,p+base+8)
        struct.pack_into('<I',expected,p+base+8,widths[x-left])
    require(len(selected)==(bottom-top)*(right-left),'selected coverage');require(all(v==sum(widths) for v in totals.values()),'row width sum')
    require(bytes(expected)==b,'unexpected record or source payload change')
    for path,raw in before.streams.items():
        if path!=part:require(raw==after.streams[path],'other CFB stream '+path)
    return {'cells':len(selected),'otherStreams':len(before.streams)-1,'recordBytes':len(a)}
if __name__=='__main__':
    try:print(json.dumps(verify(json.load(sys.stdin))))
    except Exception as error:print(str(error),file=sys.stderr);sys.exit(1)
