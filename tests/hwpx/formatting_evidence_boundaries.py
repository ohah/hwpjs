from pathlib import Path
import argparse,copy,io,json,sys,zipfile,struct,zlib,importlib.util
spec=importlib.util.spec_from_file_location('formatting_evidence_oracle',Path(__file__).resolve().parents[2]/'tools/formatting-evidence/hwpx_oracle.py')
o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)

def run_checks(directory,include_callsite=False):
    root=Path(directory);d=root/'hwpx-reset-paragraph';before_bytes=(d/'source').read_bytes();edited=(d/'edited').read_bytes();command=json.loads((d/'metadata.json').read_text())['command'];results=[]
    with zipfile.ZipFile(io.BytesIO(before_bytes)) as z:
     section=o.parse(z.read('Contents/section0.xml'));header=o.parse(z.read('Contents/header.xml'))
    paragraph=list(section.iter(o.HP+'p'))[command['paragraph']];resources=o.inventory(o.container(header,'paraProperties'),'paraPr');old=resources[int(paragraph.get('paraPrIDRef'))];new=resources[2]
    def test(name,fn):
     try:fn();results.append({'name':name,'pass':True})
     except Exception as error:results.append({'name':name,'pass':False,'error':repr(error)})
    def expect(value,message):o.require(value,message)
    def deny(mutator):
     value=copy.deepcopy(section);mutator(value);expect(not o.preserve_inactive_grid_snap_reset(value,command,old,new),'proof accepted unsafe grid')
    def grid(s):return next(s.iter(o.HP+'secPr')).find(o.HP+'grid')
    def definition(s):return next(s.iter(o.HP+'secPr'))
    test('inactive explicit grid and snap-only proof',lambda:expect(o.preserve_inactive_grid_snap_reset(section,command,old,new),'inactive proof rejected'))
    test('missing grid denied',lambda:deny(lambda s:definition(s).remove(grid(s))))
    test('missing lineGrid attribute denied',lambda:deny(lambda s:grid(s).attrib.pop('lineGrid')))
    test('unknown grid attribute denied',lambda:deny(lambda s:grid(s).set('lineGrid','unknown')))
    test('active line grid denied',lambda:deny(lambda s:grid(s).set('lineGrid','1')))
    test('active char grid denied',lambda:deny(lambda s:grid(s).set('charGrid','1')))
    test('active manuscript grid denied',lambda:deny(lambda s:grid(s).set('wonggojiFormat','1')))
    test('duplicate grid denied',lambda:deny(lambda s:definition(s).append(copy.deepcopy(grid(s)))))
    test('unknown grid extension denied',lambda:deny(lambda s:grid(s).set('newOption','0')))
    test('unknown section direction denied',lambda:deny(lambda s:definition(s).set('textDirection','UNKNOWN')))
    def other_bit():
     changed=copy.deepcopy(new);changed.set('condense',str(int(changed.get('condense'))^1));expect(not o.preserve_inactive_grid_snap_reset(section,command,old,changed),'other geometry bit accepted')
    test('other geometry single bit denied',other_bit)
    def wrong_scope():
     wrong=copy.deepcopy(command);wrong['patch']['reset']['scope']='all';expect(not o.preserve_inactive_grid_snap_reset(section,wrong,old,new),'wrong reset scope accepted')
    test('other reset scope denied',wrong_scope)
    # Independent ZIP record rewrite. Untouched local records and compressed members stay exact.
    def rewrite_zip(data,name,replacement):
     end=data.rfind(b'PK\x05\x06');expect(end>=0,'EOCD missing');count=struct.unpack_from('<H',data,end+10)[0];central=struct.unpack_from('<I',data,end+16)[0];rows=[];at=central
     for i in range(count):
      expect(data[at:at+4]==b'PK\x01\x02','central signature');n,e,c=struct.unpack_from('<HHH',data,at+28);length=46+n+e+c;raw=bytearray(data[at:at+length]);filename=data[at+46:at+46+n].decode('utf8');offset=struct.unpack_from('<I',raw,42)[0];rows.append({'name':filename,'raw':raw,'offset':offset});at+=length
     chunks=[];position=0;ordered=sorted(rows,key=lambda r:r['offset'])
     for i,row in enumerate(ordered):
      start=row['offset'];stop=ordered[i+1]['offset'] if i+1<len(ordered) else central;raw=data[start:stop];expect(raw[:4]==b'PK\x03\x04','local signature');new_offset=position
      if row['name']==name:
       flags,method=struct.unpack_from('<HH',raw,6);n,e=struct.unpack_from('<HH',raw,26);head=bytearray(raw[:30+n+e]);compress=zlib.compressobj(wbits=-15);packed=compress.compress(replacement)+compress.flush() if method==8 else replacement;expect(method in (0,8),'unsupported compression');crc=zlib.crc32(replacement)&0xffffffff;old_size=struct.unpack_from('<I',row['raw'],20)[0];tail=raw[len(head)+old_size:]
       if flags&8:
        signed=tail[:4]==b'PK\x07\x08';descriptor=(b'PK\x07\x08' if signed else b'')+struct.pack('<III',crc,len(packed),len(replacement));tail=descriptor+tail[16 if signed else 12:]
       else:struct.pack_into('<III',head,14,crc,len(packed),len(replacement))
       struct.pack_into('<III',row['raw'],16,crc,len(packed),len(replacement));raw=bytes(head)+packed+tail
      struct.pack_into('<I',row['raw'],42,new_offset);chunks.append(raw);position+=len(raw)
     central_out=b''.join(bytes(row['raw']) for row in rows);end_out=bytearray(data[end:]);struct.pack_into('<II',end_out,12,len(central_out),position);return b''.join(chunks)+central_out+bytes(end_out)
    def tamper(kind):
     with zipfile.ZipFile(io.BytesIO(edited)) as z:part=o.parse(z.read('Contents/section0.xml'))
     paragraphs=list(part.iter(o.HP+'p'))
     if kind=='cache':
      line=paragraphs[command['paragraph']].find(o.HP+'linesegarray').find(o.HP+'lineseg');line.set('vertpos',str(int(line.get('vertpos'))^1))
     else:
      other=paragraphs[1 if command['paragraph']==0 else 0];current=other.get('paraPrIDRef');identity=next(str(key) for key in resources if str(key)!=current);other.set('paraPrIDRef',identity)
     changed=rewrite_zip(edited,'Contents/section0.xml',o.ET.tostring(part))
     with zipfile.ZipFile(io.BytesIO(edited)) as original,zipfile.ZipFile(io.BytesIO(changed)) as altered:
      expect(original.namelist()==altered.namelist(),'mutation changes member list')
      for name in original.namelist():
       for field in o.METADATA:expect(getattr(original.getinfo(name),field)==getattr(altered.getinfo(name),field),'mutation changes ZIP metadata')
       if name!='Contents/section0.xml':expect(o.compressed_member(edited,original.getinfo(name))==o.compressed_member(changed,altered.getinfo(name)),'mutation changes unrelated compressed bytes')
     rejected=False
     try:o.verify(before_bytes,changed,command)
     except ValueError as error:rejected=str(error)=='XML differs Contents/section0.xml'
     expect(rejected,'saved XML tampering not rejected at section comparison')
    test('target cache-only tampering rejected',lambda:tamper('cache'))
    test('non-target paragraph reference tampering rejected',lambda:tamper('other'))
    def expected_case(grid_value,remove=False):
     changed=copy.deepcopy(section);definition_node=next(changed.iter(o.HP+'secPr'));grid_node=definition_node.find(o.HP+'grid')
     if remove:definition_node.remove(grid_node)
     else:grid_node.set('lineGrid',grid_value)
     source=rewrite_zip(before_bytes,'Contents/section0.xml',o.ET.tostring(changed))
     with zipfile.ZipFile(io.BytesIO(source)) as archive:planned=o.expected(archive,command)
     owner=list(planned['Contents/section0.xml'].iter(o.HP+'p'))[command['paragraph']]
     expect(len(owner.findall(o.HP+'linesegarray'))==0,'unsafe source callsite retained cache')
    if include_callsite:test('active grid expected callsite still deletes cache',lambda:expected_case('1'))
    if include_callsite:test('missing grid expected callsite still deletes cache',lambda:expected_case('0',True))
    def wrong_section(value,missing=False):
     changed=copy.deepcopy(command)
     if missing:changed.pop('section',None)
     else:changed['section']=value
     rejected=False
     try:o.verify(before_bytes,edited,changed)
     except ValueError as error:rejected=str(error)=='invalid source XML section'
     expect(rejected,'invalid section accepted')
    for value in [1,-1,'wrong',True,'0',None]:test('invalid section rejected '+repr(value),lambda v=value:wrong_section(v))
    test('missing section rejected',lambda:wrong_section(None,True))
    return {'tests':results,'pass':sum(r['pass'] for r in results),'fail':sum(not r['pass'] for r in results)}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--evidence-dir',type=Path,required=True);parser.add_argument('--callsite',action='store_true');args=parser.parse_args()
    result=run_checks(args.evidence_dir,args.callsite);print(json.dumps(result,ensure_ascii=False,sort_keys=True));sys.exit(1 if result['fail'] else 0)
