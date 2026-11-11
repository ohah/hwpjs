"""Test-only in-place flags mutation in an uncompressed synthetic CFB.
Uses independent stdlib framing; no product serializer or reference implementation.
"""
from pathlib import Path
import importlib.util,json,struct,sys
root=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('independent_cfb',root/'tests/hwp5/paragraph-bullet-definition-oracle.py');cfb=importlib.util.module_from_spec(spec);spec.loader.exec_module(cfb)
def require(ok,message):
    if not ok:raise ValueError(message)
def safe(value):
    p=Path(value);require(p.is_absolute() and '..' not in p.parts and not any(x in str(p).lower() for x in ['title-column-roundtrip','hwpers_test4_complex_table','legacy/hwpers']),'Unsafe path');return p
source=safe(sys.argv[1]);target=safe(sys.argv[2]);require(not target.exists(),'Output exists');c=cfb.Compound(source)
require(cfb.U(c.streams['/FileHeader'],36)&1==0,'Uncompressed synthetic input required')
path='/BodyText/Section1';rows=[r for r in c.records(path)if r['tag']==73];require(len(rows)==1,'Unique PAGE_DEF required');r=rows[0]
entries=[e for e in c.entries if e and e['type']==2 and e['name']=='Section1'];require(len(entries)==1,'Unique synthetic section entry required');entry=entries[0]
logical=r['offset']+len(r['raw'])-len(r['payload'])+36
value=(cfb.U(r['payload'],36)&~7)|6;encoded=struct.pack('<I',value);data=bytearray(c.data)
def step(first,n,fat):
    seen=set();value=first
    for _ in range(n):
        require(value not in seen and 0<=value<len(fat),'Invalid chain');seen.add(value);value=fat[value]
    require(0<=value<len(fat),'Missing sector');return value
for i,b in enumerate(encoded):
    offset=logical+i
    if entry['size']<cfb.U(c.data,56):
        mini=step(entry['start'],offset//c.ms,c.mfat);offset=mini*c.ms+offset%c.ms;sector=step(c.entries[0]['start'],offset//c.ss,c.fat)
    else:sector=step(entry['start'],offset//c.ss,c.fat)
    physical=(sector+1)*c.ss+offset%c.ss;require(physical<len(data),'Outside CFB');data[physical]=b
target.write_bytes(data);changed=cfb.Compound(target)
require(c.metadata==changed.metadata,'Metadata changed');require(c.streams.keys()==changed.streams.keys(),'Inventory changed')
for name,old in c.streams.items():
    if name!=path:require(old==changed.streams[name],'Non-target stream changed')
    else:
        expected=bytearray(old);expected[logical:logical+4]=encoded;require(bytes(expected)==changed.streams[name],'Unrelated section byte changed')
print(json.dumps({'authored':True,'changedPart':path,'reservedBinding':3,'metadataAndOtherStreams':'exact'}))
