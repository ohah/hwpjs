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


# Controlled fixture author only: canonical CFB v3, fresh allocation, owned streams.
def write_streams(streams):
    ss=512;sectors=[];fat=[]
    def allocate(data):
        start=len(sectors);n=(len(data)+511)//512
        for i in range(n):sectors.append(data[i*512:(i+1)*512].ljust(512,b'\0'));fat.append(start+i+1 if i+1<n else END)
        return start if n else END
    names=['Root Entry'];kinds=[5];children={0:[]};parents={};paths={}
    for path in streams:
        parent=0
        parts=path.split('/')
        for at,name in enumerate(parts):
            full='/'.join(parts[:at+1])
            if full not in paths:
                i=len(names);paths[full]=i;names.append(name);kinds.append(2 if at+1==len(parts) else 1);parents[i]=parent;children.setdefault(parent,[]).append(i);children.setdefault(i,[])
            parent=paths[full]
    mini=bytearray();mfat=[];locations={}
    for path,data in streams.items():
        if len(data)<4096:
            start=len(mfat);n=(len(data)+63)//64
            mini.extend(data.ljust(n*64,b'\0'))
            for i in range(n):mfat.append(start+i+1 if i+1<n else END)
            locations[paths[path]]=(start if n else END,len(data))
        else:locations[paths[path]]=(allocate(data),len(data))
    mini_start=allocate(mini);mf=struct.pack('<'+'I'*len(mfat),*mfat).ljust(((len(mfat)+127)//128)*512,b'\xff');mf_start=allocate(mf)
    rows=[bytearray(128) for _ in names]
    def tree(ids,depth=0,maxdepth=None):
        if not ids:return FREE
        if maxdepth is None:maxdepth=len(ids).bit_length()-1
        m=len(ids)//2;i=ids[m];rows[i][67]=0 if depth==maxdepth and depth>0 else 1
        struct.pack_into('<I',rows[i],68,tree(ids[:m],depth+1,maxdepth));struct.pack_into('<I',rows[i],72,tree(ids[m+1:],depth+1,maxdepth));return i
    for i,name in enumerate(names):
        raw=(name+'\0').encode('utf-16-le');require(len(raw)<=64,'fixture name');rows[i][:len(raw)]=raw;struct.pack_into('<H',rows[i],64,len(raw));rows[i][66]=kinds[i];rows[i][67]=1
        for at in (68,72,76):struct.pack_into('<I',rows[i],at,FREE)
    for i in range(len(names)):struct.pack_into('<I',rows[i],76,tree(sorted(children[i],key=lambda k:(len(names[k]),names[k].upper()))))
    locations[0]=(mini_start,len(mini))
    for i,row in enumerate(rows):
        start,size=locations.get(i,(0 if kinds[i]==1 else END,0));struct.pack_into('<I',row,116,start);struct.pack_into('<Q',row,120,size)
    while len(rows)%4:rows.append(bytearray(bytes(68)+bytes([255])*12+bytes(48)))
    directory=allocate(b''.join(rows));nf=1
    while (len(sectors)+nf+127)//128!=nf:nf=(len(sectors)+nf+127)//128
    require(nf<=109,'fixture FAT budget');fat_ids=list(range(len(sectors),len(sectors)+nf));fat.extend([0xfffffffd]*nf);fat.extend([FREE]*(nf*128-len(fat)));rawfat=struct.pack('<'+'I'*len(fat),*fat)
    sectors.extend(rawfat[i*512:(i+1)*512] for i in range(nf));header=bytearray(512);header[:8]=bytes.fromhex('d0cf11e0a1b11ae1');struct.pack_into('<6H',header,24,0x3e,3,0xfffe,9,6,0)
    struct.pack_into('<9I',header,40,0,nf,directory,0,4096,mf_start,len(mf)//512,END,0);struct.pack_into('<109I',header,76,*(fat_ids+[FREE]*(109-nf)))
    result=bytes(header)+b''.join(sectors);require(Cfb(result).streams==streams,'fixture CFB roundtrip');return result
