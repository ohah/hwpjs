"""Same-size synthetic malformed-source mutation; never repairs source metadata."""
import base64,importlib.util,json,pathlib,struct,sys
spec=importlib.util.spec_from_file_location('independent',pathlib.Path(__file__).parents[2]/'tools/hwp5-cell-width-oracle.py');o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)
def mutate(request):
    raw=base64.b64decode(request['before']);c=o.Cfb(raw);part='BodyText/Section0';data=bytearray(c.streams[part]);o.require(o.u32(c.streams['FileHeader'],36)&1==0,'explicit uncompressed synthetic fixture')
    rows=o.records(data);cells=[r for r in rows if r[0]==72 and r[4]==34];table=next(r for r in rows if r[0]==77)
    field=request['field'];value=request['value']
    if field=='table-flags':struct.pack_into('<I',data,table[3],value)
    else:
        p=cells[request.get('cell',0)][3]
        if field=='attributes':struct.pack_into('<I',data,p+4,value)
        elif field=='unknown':struct.pack_into('<H',data,p+2,value)
        elif field=='row-span':struct.pack_into('<H',data,p+8+6,value)
        elif field=='top-margin':struct.pack_into('<h',data,p+8+20,value)
        elif field=='bottom-margin':struct.pack_into('<h',data,p+8+22,value)
        else:raise ValueError('field')
    row=c.entries[part];size=struct.unpack_from('<Q',row,120)[0];out=bytearray(raw)
    def chain_indices(start,fat):
        found=[]
        while start!=o.END:
            o.require(start<len(fat) and start not in found,'chain');found.append(start);start=fat[start]
        return found
    if size<4096:
        mini=chain_indices(o.u32(row,116),c.mfat);root=c.rows[0];sectors=chain_indices(o.u32(root,116),c.fat)
        offsets=[(sectors[(i*64)//c.ss]+1)*c.ss+(i*64)%c.ss for i in mini];stride=64
    else:offsets=[(i+1)*c.ss for i in chain_indices(o.u32(row,116),c.fat)];stride=c.ss
    for p in range(0,size,stride):
        chunk=data[p:p+stride];offset=offsets[p//stride];out[offset:offset+len(chunk)]=chunk
    return bytes(out)
if __name__=='__main__': print(base64.b64encode(mutate(json.load(sys.stdin))).decode())
