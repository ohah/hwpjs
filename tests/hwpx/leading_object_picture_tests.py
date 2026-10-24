# coding: utf-8
import base64, copy, importlib.util, io, sys, unittest, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tools'))
spec=importlib.util.spec_from_file_location('picture_oracle',ROOT/'tools/hwpx-leading-object-oracle.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
P='http://www.hancom.co.kr/hwpml/2011/paragraph';S='http://www.hancom.co.kr/hwpml/2011/section'
def package(xml):
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w') as z:
  for name,data in [('Contents/section0.xml',xml.encode()),('BinData/image.bin',b'opaque image')]:
   info=zipfile.ZipInfo(name,date_time=(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
 return out.getvalue()
def source(count=1,kind='pic',prefix='p'):
 objects=''.join('<{0}:{1} id="{2}"><{0}:sz width="12"/></{0}:{1}>'.format(prefix,kind,i) for i in range(count))
 return package('<s:sec xmlns:s="'+S+'" xmlns:'+prefix+'="'+P+'"><'+prefix+':p><'+prefix+':run charPrIDRef="0">'+objects+'<'+prefix+':t/></'+prefix+':run></'+prefix+':p></s:sec>')
def edit(before,text='marker',prefix='p',mutate=False,binchange=False):
 out=io.BytesIO()
 with zipfile.ZipFile(io.BytesIO(before)) as old,zipfile.ZipFile(out,'w') as new:
  for info in old.infolist():
   data=old.read(info)
   if info.filename=='Contents/section0.xml':
    data=data.replace(('<'+prefix+':t/>').encode(),('<'+prefix+':t>'+text+'</'+prefix+':t>').encode())
    if mutate:data=data.replace(b'width="12"',b'width="13"')
   elif binchange:data=b'changed image'
   new.writestr(copy.copy(info),data)
 return out.getvalue()
def request(before,after=None,count=1,text='marker',action='verify'):
 r={'before':base64.b64encode(before).decode(),'section':0,'sectionIndex':0,'startUnit':count,'action':action,'text':text}
 if after is not None:r['after']=base64.b64encode(after).decode()
 return r
class PictureSlots(unittest.TestCase):
 def test_one_and_multiple_picture_source_slots(self):
  for count in [1,2,3]:
   before=source(count);r=oracle.handle(request(before,edit(before),count=count));self.assertEqual(r['state'],'verified');self.assertEqual(r['slot']['object_kinds'],('pic',)*count)
 def test_prefix_alias_does_not_change_ownership(self):
  before=source(prefix='other');self.assertEqual(oracle.handle(request(before,edit(before,prefix='other')))['state'],'verified')
 def test_selection_never_reads_after_or_text(self):
  before=source();r=request(before,action='select');r.update(after='not base64',text=None);self.assertEqual(oracle.handle(r)['state'],'supported')
 def test_wrong_text_count_and_unknown_kind_refused(self):
  before=source();self.assertEqual(oracle.handle(request(before,edit(before),text='wrong'))['state'],'mismatch')
  self.assertEqual(oracle.handle(request(before,edit(before),count=0))['error'],'InvalidStartUnit')
  self.assertEqual(oracle.handle(request(source(kind='ellipse'),action='select'))['state'],'unsupported')
 def test_picture_payload_and_binary_changes_refused(self):
  before=source()
  for after in [edit(before,mutate=True),edit(before,binchange=True)]:self.assertEqual(oracle.handle(request(before,after))['state'],'mismatch')
 def test_foreign_namespace_and_switch_remain_unsupported(self):
  before=source();
  with zipfile.ZipFile(io.BytesIO(before)) as z:xml=z.read('Contents/section0.xml').decode()
  for changed in [xml.replace('<p:pic id=', '<p:pic xmlns:p="urn:foreign" id='),xml.replace('<p:sz width="12"/>','<p:switch/>')]:
   self.assertEqual(oracle.handle(request(package(changed),action='select'))['state'],'unsupported')
if __name__=='__main__':unittest.main()
