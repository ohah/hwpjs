"""Wrapper contracts: seven synthetic, two optional capture, one optional reference."""
import base64
import copy
import importlib.util
import io
import json
from pathlib import Path
import struct
import subprocess
import sys
import unittest
from unittest import mock
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
spec = importlib.util.spec_from_file_location('leading_object_oracle',ROOT/'tools/hwpx-leading-object-oracle.py')
oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
model=oracle.model
from leading_object_saved_observations import load as load_observations, MISSING
P=model.PARA


def blob(data):
    return base64.b64encode(data).decode('ascii')


def package(xml,extra=b'unchanged'):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as z:
        z.writestr('Contents/section0.xml',xml)
        z.writestr('other',extra)
    return out.getvalue()


def rewrite(data,mutate):
    out=io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as src,zipfile.ZipFile(out,'w') as dst:
        dst.comment=src.comment
        for entry in src.infolist():
            raw=src.read(entry)
            if entry.filename=='Contents/section0.xml':
                doc=model.parse_xml(raw)
                try:
                    mutate(doc);raw=doc.toxml(encoding=doc.encoding or 'utf-8',standalone=doc.standalone)
                finally:doc.unlink()
            dst.writestr(copy.copy(entry),raw)
    return out.getvalue()


def payload(data,**kwargs):
    return {'before':blob(data),'section':0,'sectionIndex':0,'startUnit':1,'action':'select',**kwargs}


def insert(data,direct_index,text):
    def change(doc):
        p=model.elements(doc.documentElement)[direct_index]
        run=model.elements(p)[0]
        model.elements(run)[-1].appendChild(doc.createTextNode(text))
    return rewrite(data,change)


class WrapperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.marker='Slot한😀'
        # Same XML id on all four rows. Selected order is direct0, nested, direct1,
        # direct2. Native-global/selected index is NOT a direct paragraph index.
        cls.interleaved=package(f'''<?xml version="1.0" encoding="utf-8"?>
<s:sec xmlns:s="{model.SECTION}" xmlns:p="{P}">
<p:p id="same"><p:run charPrIDRef="1"><p:tbl><p:tr><p:tc><p:subList><p:p id="same"><p:run charPrIDRef="1"><p:line/><p:t/></p:run></p:p></p:subList></p:tc></p:tr></p:tbl><p:t/></p:run></p:p>
<p:p id="same"><p:run charPrIDRef="1"><p:rect/><p:t/></p:run></p:p>
<p:p id="same"><p:run charPrIDRef="1"><p:line/><p:t/></p:run></p:p>
</s:sec>'''.encode())

    def test_selected_identity_maps_direct_rows_and_refuses_nested_rows(self):
        p=payload(self.interleaved,sectionIndex=2)
        selected=oracle.handle(p)
        self.assertEqual(selected['state'],'supported')
        self.assertEqual(selected['directIndex'],1)
        self.assertEqual(selected['slot']['object_kinds'],('rect',))
        self.assertEqual(oracle.handle({**p,'sectionIndex':3})['directIndex'],2)
        nested=oracle.handle({**p,'sectionIndex':1,'after':'invalid-base64','action':'verify'})
        self.assertEqual(nested['state'],'unsupported')
        self.assertEqual(nested['reason'],'NestedParagraph')
        verified=oracle.handle({**p,'action':'verify','after':blob(insert(self.interleaved,1,'M')),'text':'M'})
        self.assertEqual(verified['state'],'verified')
        # A naive directIndex=sectionIndex implementation would select direct2.
        wrong=oracle.handle({**p,'action':'verify','after':blob(insert(self.interleaved,2,'M')),'text':'M'})
        self.assertEqual(wrong['state'],'mismatch')
        self.assertEqual(wrong['detail'],'Complete XML mismatch')

    def test_plain_or_unmodeled_source_is_unsupported_not_invalid_input(self):
        for obj in ('p:pic','p:switch','f:line'):
            source=package(f'<s:sec xmlns:s="{model.SECTION}" xmlns:p="{P}" xmlns:f="urn:foreign"><p:p><p:run charPrIDRef="1"><{obj}/><p:t/></p:run></p:p></s:sec>'.encode())
            result=oracle.handle(payload(source,after='BAD'))
            self.assertEqual(result['state'],'unsupported')
            self.assertEqual(result['reason'],'UnsupportedSelectionGrammar' if obj=='p:switch' else 'UnsupportedSlotGrammar')
        plain=package(f'<s:sec xmlns:s="{model.SECTION}" xmlns:p="{P}"><p:p><p:run charPrIDRef="1"><p:t>plain</p:t></p:run></p:p></s:sec>'.encode())
        self.assertEqual(oracle.handle(payload(plain,startUnit=0))['state'],'unsupported')

    def test_bad_coordinates_missing_part_and_invalid_base64_are_errors(self):
        p=payload(self.interleaved)
        for key in ('section','sectionIndex','startUnit'):
            for val in (True,None,-1,1.0,0x100000000):
                result=oracle.handle({**p,key:val})
                self.assertEqual(result['state'],'error')
                self.assertEqual(result['error'],'InvalidCoordinate')
        self.assertEqual(oracle.handle({**p,'sectionIndex':99})['error'],'InvalidSectionIndex')
        self.assertEqual(oracle.handle({**p,'section':1})['error'],'InvalidSectionCoordinate')
        for at in (0,2):
            self.assertEqual(oracle.handle({**p,'startUnit':at})['error'],'InvalidStartUnit')
        for value in ('!',42,None,'ZE=='):
            self.assertEqual(oracle.handle({**p,'before':value})['error'],'InvalidBase64')

    def test_corrupt_zip_and_xml_are_errors_even_when_source_grammar_would_be_unsupported(self):
        for data in (b'not a ZIP',self.interleaved[:20]):
            self.assertEqual(oracle.handle(payload(data))['error'],'InvalidZIP')
        bad=bytearray(self.interleaved)
        # Alter stored non-target payload while leaving its central CRC unchanged.
        with zipfile.ZipFile(io.BytesIO(bad)) as z:
            entry=z.getinfo('other')
            name,extra=struct.unpack_from('<HH',bad,entry.header_offset+26)
            bad[entry.header_offset+30+name+extra]^=1
        self.assertEqual(oracle.handle(payload(bytes(bad)))['error'],'InvalidZIP')
        compressed=io.BytesIO()
        with zipfile.ZipFile(compressed,'w',compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr('Contents/section0.xml',b'<s/>')
        bad=bytearray(compressed.getvalue())
        with zipfile.ZipFile(io.BytesIO(bad)) as z:
            entry=z.infolist()[0]
            name,extra=struct.unpack_from('<HH',bad,entry.header_offset+26)
            bad[entry.header_offset+30+name+extra]=0xff
        self.assertEqual(oracle.handle(payload(bytes(bad)))['error'],'InvalidZIP')
        self.assertEqual(oracle.handle(payload(package(b'<broken>')))['error'],'InvalidXML')
        p=payload(self.interleaved,sectionIndex=2,action='verify',text='M')
        self.assertEqual(oracle.handle({**p,'after':blob(b'bad ZIP')})['error'],'InvalidZIP')
        self.assertEqual(oracle.handle({**p,'after':blob(package(b'<broken>'))})['error'],'InvalidXML')

    def test_verify_missing_fields_invalid_text_and_allocation_failure_are_errors(self):
        p=payload(self.interleaved,sectionIndex=2,action='verify')
        self.assertEqual(oracle.handle(p)['error'],'InvalidPayload')
        p['after']=blob(insert(self.interleaved,1,'M'))
        for text in (None,False,'','\ud800'):
            self.assertEqual(oracle.handle({**p,'text':text})['error'],'InvalidExpectedText')
        self.assertEqual(oracle.handle({**p,'after':'bad base64','text':'M'})['error'],'InvalidBase64')
        with mock.patch.object(model,'select_slot',side_effect=MemoryError):
            self.assertEqual(oracle.handle({**p,'text':'M'})['error'],'OutOfMemory')

    def test_zip_metadata_and_non_target_payload_changes_are_mismatch(self):
        after=insert(self.interleaved,1,'M')
        p=payload(self.interleaved,sectionIndex=2,action='verify',text='M')
        for mode in ('comment','entry','payload','order'):
            out=io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(after)) as src,zipfile.ZipFile(out,'w') as dst:
                dst.comment=b'changed' if mode=='comment' else src.comment
                entries=src.infolist()
                if mode=='order':entries=list(reversed(entries))
                for old in entries:
                    info=copy.copy(old)
                    if mode=='entry':info.comment=b'changed'
                    raw=src.read(old)
                    if mode=='payload' and info.filename=='other':raw=b'changed'
                    dst.writestr(info,raw)
            result=oracle.handle({**p,'after':blob(out.getvalue())})
            self.assertEqual(result['state'],'mismatch',result)
            self.assertEqual(result['error'],'LeadingObjectMismatch')

    def test_cli_normal_and_optimized_have_stable_states_and_exit_codes(self):
        ok=payload(self.interleaved,sectionIndex=2,action='verify',text='M',after=blob(insert(self.interleaved,1,'M')))
        nested={**ok,'sectionIndex':1,'after':'not base64'}
        cases=[(ok,'verified',0),({**ok,'action':'select','after':'not base64'},'supported',0),
               ({**ok,'text':'WRONG'},'mismatch',1),(nested,'unsupported',0),
               ({**ok,'sectionIndex':999},'error',2),({**ok,'before':'!'},'error',2)]
        for flags in ([],['-O']):
            for p,state,code in cases:
                result=subprocess.run([sys.executable,'-B',*flags,str(ROOT/'tools/hwpx-leading-object-oracle.py')],input=json.dumps(p),text=True,capture_output=True,timeout=10)
                self.assertEqual(result.returncode,code,result.stderr)
                self.assertEqual(json.loads(result.stdout)['state'],state)
            bad=subprocess.run([sys.executable,'-B',*flags,str(ROOT/'tools/hwpx-leading-object-oracle.py')],input='{',text=True,capture_output=True,timeout=10)
            self.assertEqual(bad.returncode,2)
            self.assertEqual(json.loads(bad.stdout)['error'],'InvalidJSON')


class SavedObservationWrapperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.observations=load_observations(ROOT)
        if cls.observations is not None:
            cls.records,cls.sources,cls.outputs,cls.source_hashes=cls.observations
        cls.marker='Slot한😀'

    def setUp(self):
        if self.observations is None:
            self.skipTest(MISSING)

    def test_select_six_actual_and_four_homomorphic_sources_without_after_dependency(self):
        self.assertEqual(len(self.records),10)
        for row in self.records:
            with self.subTest(name=row['name']):
                p=payload(self.sources[row['name']],startUnit=row['count'])
                expected=oracle.handle(p)
                self.assertEqual(expected['state'],'supported')
                self.assertEqual(expected['directIndex'],0)
                self.assertEqual(expected['slot']['start_unit'],row['count'])
                for after in ('invalid-base64',None,{'never':'inspect'},42):
                    self.assertEqual(oracle.handle({**p,'after':after,'text':{'ignored':True}}),expected)

    def test_verify_recorded_outputs_and_wrong_expected_string(self):
        for row in self.records:
            p=payload(self.sources[row['name']],startUnit=row['count'],after=blob(self.outputs[row['name']]),action='verify',text=self.marker)
            with self.subTest(name=row['name']):
                self.assertEqual(oracle.handle(p)['state'],'verified')
                wrong=oracle.handle({**p,'text':self.marker+'WRONG'})
                self.assertEqual(wrong['state'],'mismatch')
                self.assertEqual(wrong['error'],'LeadingObjectMismatch')

class OptionalReferenceWrapperTests(unittest.TestCase):
    def test_actual_chart_source_stays_unsupported(self):
        path=ROOT/'reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx'
        if not path.exists():
            self.skipTest('optional reference chart fixture is absent')
        source=path.read_bytes()
        result=oracle.handle(payload(source))
        self.assertEqual(result['state'],'unsupported')


if __name__=='__main__':
    unittest.main(verbosity=2)
