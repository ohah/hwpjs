"""Leading-object adversarial regression tests. Python only; entirely synthetic inputs.
The five former expected failures are ordinary required passes.
"""
import base64,copy,importlib.util,io,json,pathlib,struct,subprocess,sys,unittest,zipfile
from unittest import mock
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
spec=importlib.util.spec_from_file_location('review_adapter',ROOT/'tools/hwpx-leading-object-oracle.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle);model=oracle.model
P=model.PARA;S=model.SECTION

def b64(data):return base64.b64encode(data).decode()
def xml(body):return f'<?xml version="1.0" encoding="utf-8"?><s:sec xmlns:s="{S}" xmlns:p="{P}">{body}</s:sec>'.encode()
def row(content='<p:line/><p:t/>',style='1',id='same'):return f'<p:p id="{id}"><p:run charPrIDRef="{style}">{content}</p:run></p:p>'
def package(parts):
 if isinstance(parts,bytes):parts={'Contents/section0.xml':parts,'guard':b'unchanged'}
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w') as z:
  for n,b in parts.items():z.writestr(zipfile.ZipInfo(n,(2000,1,1,0,0,0)),b)
 return out.getvalue()
def request(data,**overrides):return dict({'before':b64(data),'section':0,'sectionIndex':0,'startUnit':1,'action':'select'},**overrides)
def rewrite(data,mutate,part='Contents/section0.xml'):
 out=io.BytesIO()
 with zipfile.ZipFile(io.BytesIO(data)) as before,zipfile.ZipFile(out,'w') as after:
  after.comment=before.comment
  for info in before.infolist():
   raw=before.read(info)
   if info.filename==part:
    d=model.parse_xml(raw)
    try:mutate(d);raw=d.toxml(encoding=d.encoding or 'utf-8',standalone=d.standalone)
    finally:d.unlink()
   after.writestr(copy.copy(info),raw)
 return out.getvalue()
def insert(data,direct_index,text='M',part='Contents/section0.xml',wrong_run=False):
 def mutate(d):
  p=model.elements(d.documentElement)[direct_index]
  if wrong_run:
   run=d.createElementNS(P,'p:run');run.setAttribute('charPrIDRef','999');p.appendChild(run);t=d.createElementNS(P,'p:t');run.appendChild(t)
  else:t=model.elements(model.elements(p)[-1])[-1]
  t.appendChild(d.createTextNode(text))
 return rewrite(data,mutate,part)
def verify(before,after,**kw):return oracle.handle(request(before,action='verify',after=b64(after),text='M',**kw))
def cli(payload):
 r=subprocess.run([sys.executable,'-B',*(['-O'] if sys.flags.optimize else []),str(ROOT/'tools/hwpx-leading-object-oracle.py')],input=json.dumps(payload),text=True,capture_output=True,timeout=10)
 return r

def with_codec(data,method):
 out=io.BytesIO()
 with zipfile.ZipFile(io.BytesIO(data)) as src,zipfile.ZipFile(out,'w') as dst:
  for info in src.infolist():
   raw=src.read(info);info=copy.copy(info);info.compress_type=method;dst.writestr(info,raw)
 return out.getvalue()

def hidden_tail(data):
 import zlib
 out=io.BytesIO()
 with zipfile.ZipFile(io.BytesIO(data)) as src,zipfile.ZipFile(out,'w') as dst:
  raw=src.read('Contents/section0.xml')
  for info in src.infolist():dst.writestr(copy.copy(info),src.read(info)+(b'UNDECLARED-TAIL' if info.filename=='Contents/section0.xml' else b''))
 bad=bytearray(out.getvalue());central=bad.index(b'PK\x01\x02')
 # Preserve compressed size, hide the decompressed tail in both size/CRC records.
 struct.pack_into('<I',bad,14,zlib.crc32(raw));struct.pack_into('<I',bad,22,len(raw))
 struct.pack_into('<I',bad,central+16,zlib.crc32(raw));struct.pack_into('<I',bad,central+24,len(raw))
 return bytes(bad)

class MappingAndGuardTests(unittest.TestCase):
 def setUp(self):self.basic=package(xml(row()))
 def test_nested_interleave_all_selected_coordinates_and_wrong_outputs(self):
  nested=row('<p:rect/><p:t/>')
  source=package(xml(row(f'<p:tbl><p:subList>{nested}<p:p id="same"><p:run charPrIDRef="1"><p:tbl><p:subList>{nested}</p:subList></p:tbl><p:t/></p:run></p:p></p:subList></p:tbl><p:t/>')+row('<p:rect/><p:t/>')+row()))
  # selected_default: direct0,nested1,nested2,nested3,direct1,direct2
  for index,direct in [(0,0),(4,1),(5,2)]:
   r=oracle.handle(request(source,sectionIndex=index));self.assertEqual((r['state'],r.get('directIndex')),('supported',direct))
   self.assertEqual(verify(source,insert(source,direct),sectionIndex=index)['state'],'verified')
   for wrong in range(3):
    if wrong!=direct:self.assertEqual(verify(source,insert(source,wrong),sectionIndex=index)['state'],'mismatch')
  for index in [1,2,3]:self.assertEqual(oracle.handle(request(source,sectionIndex=index))['reason'],'NestedParagraph')
 def test_selected_index_in_second_section_is_section_local(self):
  source=package({'Contents/section0.xml':xml(row()*4),'Contents/section1.xml':xml(row('<p:tbl><p:subList>'+row()+'</p:subList></p:tbl><p:t/>')+row('<p:rect/><p:t/>')),'guard':b'unchanged'})
  r=oracle.handle(request(source,section=1,sectionIndex=2));self.assertEqual((r['state'],r['directIndex']),('supported',1))
  self.assertEqual(verify(source,insert(source,1,part='Contents/section1.xml'),section=1,sectionIndex=2)['state'],'verified')
  self.assertEqual(verify(source,insert(source,1),section=1,sectionIndex=2)['state'],'mismatch')
 def test_identity_not_id_or_equal_content(self):
  source=package(xml(row()*5))
  for index in range(5):
   r=oracle.handle(request(source,sectionIndex=index));self.assertEqual(r['directIndex'],index)
   for target in range(5):self.assertEqual(verify(source,insert(source,target),sectionIndex=index)['state'],'verified' if index==target else 'mismatch')
 def test_no_after_or_text_dependency_during_select(self):
  expected=oracle.handle(request(self.basic))
  for v in [None,{},False,'bad-base64','M','WRONG']:
   self.assertEqual(oracle.handle(request(self.basic,after=v,text=v)),expected)
 def test_object_count_edges_and_mixed_object_widths(self):
  for count in [1,2,17,1024]:
   source=package(xml(row('<p:line/>'*count+'<p:t/>')))
   self.assertEqual(oracle.handle(request(source,startUnit=count))['state'],'supported')
   self.assertEqual(oracle.handle(request(source,startUnit=count+1))['error'],'InvalidStartUnit')
  source=package(xml(row('<p:line/>'*1025+'<p:t/>')));self.assertEqual(oracle.handle(request(source,startUnit=1025))['state'],'unsupported')
  mixed=package(xml(row('<p:tbl/><p:line/><p:rect/><p:t/>')));self.assertEqual(oracle.handle(request(mixed,startUnit=3))['slot']['object_kinds'],('tbl','line','rect'))
 def test_qname_attribute_and_unknown_object_guards(self):
  for fragment in ['<p:pic/><p:t/>','<p:line xmlns:p="urn:foreign"/><p:t/>','<x:line xmlns:x="urn:foreign"/><p:t/>','<p:line xmlns:f="urn:foreign" f:flag="1"/><p:t/>','<p:switch/><p:t/>']:
   r=oracle.handle(request(package(xml(row(fragment)))));self.assertNotIn(r['state'],('supported','verified'))
  other=package(xml(row()).replace(b'<p:',b'<q:').replace(b'</p:',b'</q:').replace(b'xmlns:p=',b'xmlns:q='));self.assertEqual(oracle.handle(request(other))['state'],'supported')
 def test_empty_leaf_exactness_and_run_affinity(self):
  for content in ['<p:t/><p:line/><p:t/>','<p:line/><p:t/><p:t/>','<p:line/><p:t> </p:t>','<p:line/><p:t><!--c--></p:t>','<p:line/><p:t><?pi x?></p:t>','<p:line/><p:t><p:tab/></p:t>']:
   self.assertEqual(oracle.handle(request(package(xml(row(content)))))['state'],'unsupported')
  self.assertEqual(verify(self.basic,insert(self.basic,0,wrong_run=True))['state'],'mismatch')
  extra_run=package(xml('<p:p><p:run charPrIDRef="7"/>'+'<p:run charPrIDRef="8"><p:line/><p:t/></p:run></p:p>'))
  self.assertEqual(oracle.handle(request(extra_run))['state'],'unsupported')
 def test_metadata_unknown_node_namespace_and_column_profiles(self):
  note='<p:autoNumFormat/><p:noteLine/><p:noteSpacing/><p:numbering/><p:placement/>'
  sec=('<p:secPr><p:grid/><p:startNum/><p:visibility/><p:lineNumberShape/>'
       '<p:pagePr><p:margin/></p:pagePr><p:footNotePr>'+note+'</p:footNotePr>'
       '<p:endNotePr>'+note+'</p:endNotePr>'+'<p:pageBorderFill><p:offset/></p:pageBorderFill>'*3+'</p:secPr>')
  col='<p:ctrl><p:colPr type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></p:ctrl>'
  source=package(xml('<p:p><p:run charPrIDRef="1">'+sec+col+'</p:run>'
                     '<p:run charPrIDRef="2"><p:line/><p:line/><p:t/></p:run></p:p>'))
  self.assertEqual(oracle.handle(request(source,startUnit=2))['state'],'supported')
  def alter(d,mode):
   if mode=='node':
    p=model.elements(d.documentElement)[0];run=model.elements(p)[0];run.appendChild(d.createElementNS(P,(run.prefix+':' if run.prefix else '')+'fieldBegin'))
   elif mode=='attribute':
    node=d.getElementsByTagNameNS(P,'secPr')[0];node.setAttributeNS(model.XMLNS,'xmlns:f','urn:foreign');node.setAttributeNS('urn:foreign','f:flag','1')
   else:d.getElementsByTagNameNS(P,'colPr')[0].setAttribute(mode,'999')
  for mode in ['node','attribute','colCount','sameSz','sameGap','type','layout']:
   changed=rewrite(source,lambda d:alter(d,mode));self.assertEqual(oracle.handle(request(changed,startUnit=2))['state'],'unsupported')
 def test_zip_inventory_paths_crc_and_claimed_expansion_bounds(self):
  for name in ['/guard','../guard','a/../guard','a\\guard']:
   bad=package({'Contents/section0.xml':xml(row()),name:b'x'});self.assertEqual(oracle.handle(request(bad))['error'],'InvalidZIP')
  bad=bytearray(self.basic)
  with zipfile.ZipFile(io.BytesIO(bad)) as z:
   e=z.getinfo('guard');n,x=struct.unpack_from('<HH',bad,e.header_offset+26);bad[e.header_offset+30+n+x]^=1
  self.assertEqual(oracle.handle(request(bytes(bad)))['error'],'InvalidZIP')
  out=io.BytesIO()
  with zipfile.ZipFile(out,'w') as z:
   for i in range(4097):z.writestr(f'e{i}',b'')
  self.assertEqual(oracle.handle(request(out.getvalue()))['error'],'InvalidZIP')
  bad=bytearray(self.basic);central=bad.index(b'PK\x01\x02');struct.pack_into('<I',bad,central+24,model.MAX_EXPANDED+1)
  self.assertEqual(oracle.handle(request(bytes(bad)))['error'],'InvalidZIP')
 def test_depth_boundary_and_declaration_guards(self):
  low=package(xml(row('<p:line>'+'<n>'*120+'</n>'*120+'</p:line><p:t/>')))
  self.assertEqual(oracle.handle(request(low))['state'],'supported')
  high=package(xml(row('<p:line>'+'<n>'*129+'</n>'*129+'</p:line><p:t/>')))
  self.assertEqual(oracle.handle(request(high))['error'],'InvalidXML')
  for raw in [b'<!DOCTYPE s><s/>',b'<!DOCTYPE s [<!ENTITY x "y">]><s/>',b'<s>\x00</s>',b'<broken>']:
   self.assertEqual(oracle.handle(request(package(raw)))['error'],'InvalidXML')
 def test_whole_tree_and_zip_mutations_not_hidden(self):
  actual=insert(self.basic,0)
  def obj(d):d.getElementsByTagNameNS(P,'line')[0].setAttribute('x','changed')
  def run(d):d.getElementsByTagNameNS(P,'run')[0].setAttribute('charPrIDRef','999')
  def comment(d):d.insertBefore(d.createComment('changed'),d.documentElement)
  for fn in [obj,run,comment]:self.assertEqual(verify(self.basic,rewrite(actual,fn))['state'],'mismatch')
  self.assertEqual(verify(self.basic,package({'Contents/section0.xml':xml(row('<p:line/><p:t>M</p:t>')),'guard':b'CHANGED'}))['state'],'mismatch')
 def test_input_limits_with_small_in_process_budget(self):
  old=(model.MAX_INPUT,model.MAX_EXPANDED,model.MAX_XML)
  try:
   model.MAX_INPUT=1;self.assertIn(oracle.handle(request(self.basic))['error'],('InvalidBase64','InvalidZIP'))
   model.MAX_INPUT=old[0];model.MAX_EXPANDED=1;self.assertEqual(oracle.handle(request(self.basic))['error'],'InvalidZIP')
   model.MAX_EXPANDED=old[1];model.MAX_XML=1;self.assertEqual(oracle.handle(request(self.basic))['error'],'InvalidXML')
  finally:model.MAX_INPUT,model.MAX_EXPANDED,model.MAX_XML=old

class FixedDefects(unittest.TestCase):
 def check_invalid(self,payload,code):
  self.assertEqual(oracle.handle(payload)['error'],code)
  result=cli(payload)
  self.assertEqual(result.returncode,2,result.stderr)
  self.assertEqual(json.loads(result.stdout)['error'],code)
  self.assertNotIn('Traceback',result.stderr)
 def test_output_raw_zip_member_nul_suffix_must_not_verify(self):
  before=package(xml(row()));after=insert(before,0)
  with zipfile.ZipFile(io.BytesIO(after)) as z:raw=z.read('Contents/section0.xml')
  bad=package({'Contents/section0.xmlZZ':raw,'guard':b'unchanged'}).replace(b'Contents/section0.xmlZZ',b'Contents/section0.xml\x00X')
  self.check_invalid(request(before,action='verify',after=b64(bad),text='M'),'InvalidZIP')
  self.check_invalid(request(bad),'InvalidZIP')
 def hidden_size(self,method):
  before=with_codec(package(xml(row())),method);after=insert(before,0)
  bad=hidden_tail(after)
  self.check_invalid(request(before,action='verify',after=b64(bad),text='M'),'InvalidZIP')
  self.check_invalid(request(bad),'InvalidZIP')
  with self.assertRaises(ValueError):model.open_zip(bad)
 def test_stored_payload_actual_size_tail_must_not_verify(self):self.hidden_size(zipfile.ZIP_STORED)
 def test_deflated_payload_actual_size_tail_must_not_verify(self):self.hidden_size(zipfile.ZIP_DEFLATED)
 def test_overdeep_xml_must_return_json_error_not_cleanup_recursion(self):
  data=package(xml(row('<p:line>'+'<n>'*1500+'</n>'*1500+'</p:line><p:t/>')))
  self.check_invalid(request(data),'InvalidXML')
  before=package(xml(row()))
  self.check_invalid(request(before,action='verify',after=b64(data),text='M'),'InvalidXML')
 def test_unknown_encoding_must_return_json_error_not_lookup_traceback(self):
  data=package(xml(row()).replace(b'encoding="utf-8"',b'encoding="NO-SUCH-ENCODING"'))
  self.check_invalid(request(data),'InvalidXML')
  before=package(xml(row()))
  self.check_invalid(request(before,action='verify',after=b64(data),text='M'),'InvalidXML')

class XMLBudgetTests(unittest.TestCase):
 def test_depth_boundary_and_pre_dom_rejection(self):
  for depth in (1,127,128):
   doc=model.parse_xml(('<r>'*depth+'</r>'*depth).encode());doc.unlink()
  with mock.patch.object(model.minidom,'parseString',side_effect=AssertionError('DOM must not be allocated')):
   for depth in (129,1500):
    with self.subTest(depth=depth),self.assertRaisesRegex(ValueError,'structure limit'):
     model.parse_xml(('<r>'*depth+'</r>'*depth).encode())
 def test_text_comment_pi_depth_and_node_budget(self):
  for leaf in ('text','<!--comment-->','<?pi text?>','<![CDATA[text]]>'):
   doc=model.parse_xml(('<r>'*127+leaf+'</r>'*127).encode());doc.unlink()
   with self.assertRaisesRegex(ValueError,'structure limit'):
    model.parse_xml(('<r>'*128+leaf+'</r>'*128).encode())
  with mock.patch.object(model,'MAX_XML_NODES',4):
   doc=model.parse_xml(b'<r>a&amp;b&#65;c</r>');doc.unlink()
   with self.assertRaisesRegex(ValueError,'structure limit'):model.parse_xml(b'<r>a<![CDATA[b]]>c</r>')
   with mock.patch.object(model.minidom,'parseString',side_effect=AssertionError('DOM must not be allocated')):
    with self.assertRaisesRegex(ValueError,'structure limit'):model.parse_xml(b'<r><a/><b/><c/></r>')

if __name__=='__main__':unittest.main(verbosity=2)
