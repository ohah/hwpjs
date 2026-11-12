"""Small owned CFB-v3 fixture writer. No inputs, filesystem or product parser."""
import struct
END=0xfffffffe; FREE=0xffffffff
def require(value, reason):
    if not value: raise ValueError(reason)
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
    return bytes(header)+b''.join(sectors)
