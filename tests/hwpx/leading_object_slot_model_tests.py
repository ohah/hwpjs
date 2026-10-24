"""Optional read-only slot-model observation replay; no WASM execution or writes.

Independent synthetic coverage lives in leading_object_adversarial_tests.py.
"""
import copy
import hashlib
import importlib.util
import io
from pathlib import Path
import sys
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
spec = importlib.util.spec_from_file_location('leading_object_slots', ROOT / 'tools/hwpx_leading_object_slots.py')
model = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = model
spec.loader.exec_module(model)
from leading_object_saved_observations import load as load_observations, MISSING


def rewrite(data, edit, *, part='Contents/section0.xml', transform_xml=True):
    output = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as source, zipfile.ZipFile(output, 'w') as target:
        target.comment = source.comment
        for entry in source.infolist():
            raw = source.read(entry)
            if entry.filename == part:
                if transform_xml:
                    doc = model.parse_xml(raw)
                    try:
                        edit(doc)
                        raw = doc.toxml(encoding=doc.encoding or 'utf-8', standalone=doc.standalone)
                    finally:
                        doc.unlink()
                else:
                    raw = edit(raw)
            target.writestr(copy.copy(entry), raw)
    return output.getvalue()


def paragraph(doc):
    return model.elements(doc.documentElement)[0]


def body(doc):
    return [c for c in model.elements(paragraph(doc)) if model.qname(c, model.PARA, 'run')][-1]


def changed_target(data, text):
    return rewrite(data, lambda doc: model.elements(body(doc))[-1].appendChild(doc.createTextNode(text)))


class LeadingObjectSlotModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.marker = 'Slot한😀'
        cls.observations = load_observations(ROOT)
        cls.source_hashes = {}
        if cls.observations is None:
            return
        cls.records,cls.inputs,cls.after,cls.source_hashes = cls.observations
        cls.counts = {r['name']:r['count'] for r in cls.records}
        for name, data in cls.inputs.items():
            with model.open_zip(data) as package:
                doc = model.parse_xml(package.read('Contents/section0.xml'))
            try:
                if len(model.elements(body(doc))) - 1 != cls.counts[name]:
                    raise ValueError('Saved source count mismatch: ' + name)
            finally:
                doc.unlink()

    def setUp(self):
        if self.observations is None:
            self.skipTest(MISSING)

    @classmethod
    def tearDownClass(cls):
        for path, digest in cls.source_hashes.items():
            if hashlib.sha256(Path(path).read_bytes()).hexdigest() != digest:
                raise RuntimeError('Original changed: ' + path)

    def verify(self, name, after=None, **kwargs):
        return model.verify(self.inputs[name], self.after[name] if after is None else after, section=0, paragraph_index=0,
                            start_unit=kwargs.get('start_unit',self.counts[name]), text=kwargs.get('text',self.marker))

    def test_six_real_and_four_homomorphic_native_observations(self):
        self.assertEqual(len(self.records),10)
        self.assertGreaterEqual(len(set(hashlib.sha256(v).hexdigest() for v in self.inputs.values())),10)
        for row in self.records:
            with self.subTest(name=row['name']):
                count = self.counts[row['name']]
                self.assertEqual(row['beforeText'], '\ufffc'*count)
                self.assertEqual(row['afterText'], '\ufffc'*count+self.marker)
                self.assertTrue(self.verify(row['name'])['verified'])
        mixed = model.locate(self.inputs['homomorphic-mixed-tbl-line-rect'], section=0, paragraph_index=0, start_unit=3)
        self.assertEqual(mixed.object_kinds, ('tbl','line','rect'))

    def test_wrong_expected_text_and_count_rejected_on_every_native_output(self):
        for name in self.inputs:
            with self.subTest(name=name):
                with self.assertRaisesRegex(ValueError,'Complete XML mismatch'):
                    self.verify(name,text=self.marker+'WRONG')
                for count in (0,self.counts[name]+1,True,None,1.0):
                    with self.assertRaises(ValueError):
                        self.verify(name,start_unit=count)

    def test_namespaces_metadata_unknown_controls_and_multiple_owners_are_refused(self):
        source = self.inputs['shapeline']
        def rename(node, namespace, name, doc):
            node.setAttributeNS(model.XMLNS, 'xmlns:f', namespace)
            doc.renameNode(node, namespace, name)
        def foreign_metadata(doc):
            node = model.elements(model.elements(paragraph(doc))[0])[0]
            node.setAttributeNS(model.XMLNS, 'xmlns:f', 'urn:foreign')
            node.setAttributeNS('urn:foreign', 'f:metadata', 'x')
        mutations = [
            lambda d: rename(body(d), 'urn:foreign', 'f:run', d),
            lambda d: rename(model.elements(body(d))[0], 'urn:foreign', 'f:line', d),
            lambda d: rename(model.elements(body(d))[0], model.PARA, 'hp:switch', d),
            lambda d: rename(model.elements(body(d))[0], model.PARA, 'hp:ellipse', d),
            lambda d: body(d).insertBefore(d.createElementNS(model.PARA,'hp:t'),model.elements(body(d))[-1]),
            lambda d: model.elements(body(d))[-1].appendChild(d.createTextNode(' ')),
            lambda d: model.elements(body(d))[-1].appendChild(d.createElementNS(model.PARA,'hp:tab')),
            lambda d: model.elements(paragraph(d))[0].appendChild(d.createElementNS(model.PARA,'hp:t')),
            lambda d: model.elements(model.elements(paragraph(d))[0])[1].appendChild(d.createElementNS(model.PARA,'hp:pageNum')),
            lambda d: model.elements(model.elements(paragraph(d))[0])[0].appendChild(d.createElementNS(model.PARA,'hp:fieldBegin')),
            foreign_metadata,
            lambda d: paragraph(d).appendChild(d.createElementNS(model.PARA,'hp:run')),
            lambda d: body(d).appendChild(d.createElementNS(model.PARA,'hp:line')),
        ]
        for i,mutate in enumerate(mutations):
            with self.subTest(mutation=i):
                changed = rewrite(source,mutate)
                with self.assertRaises(ValueError):
                    model.locate(changed,section=0,paragraph_index=0,start_unit=2)

    def test_other_namespace_prefix_is_structural_not_sha_or_filename_acceptance(self):
        source = self.inputs['borderfill']
        def aliases(raw):
            return raw.replace(b'hp:',b'leading:').replace(b'xmlns:hp=',b'xmlns:leading=')
        renamed = rewrite(source,aliases,transform_xml=False)
        self.assertNotEqual(hashlib.sha256(source).digest(),hashlib.sha256(renamed).digest())
        slot = model.locate(renamed,section=0,paragraph_index=0,start_unit=1)
        self.assertEqual(slot.object_kinds,('tbl',))
        self.assertTrue(model.verify(renamed,changed_target(renamed,self.marker),section=0,paragraph_index=0,start_unit=1,text=self.marker)['verified'])

    def test_object_payload_and_metadata_change_cannot_hide_behind_same_visible_text(self):
        for name in self.inputs:
            def corrupt_object(doc):
                model.elements(body(doc))[0].setAttribute('hostile-payload-change','1')
            def corrupt_metadata(doc):
                paragraph(doc).setAttribute('styleIDRef','999')
            def corrupt_descendant(doc):
                extra = doc.createElementNS('urn:hostile', 'f:payload')
                extra.setAttributeNS(model.XMLNS, 'xmlns:f', 'urn:hostile')
                extra.appendChild(doc.createTextNode('changed opaque payload'))
                model.elements(body(doc))[0].appendChild(extra)
            for mutate in (corrupt_object,corrupt_metadata,corrupt_descendant):
                with self.subTest(name=name):
                    with self.assertRaisesRegex(ValueError,'Complete XML mismatch'):
                        self.verify(name,rewrite(self.after[name],mutate))

    def test_wrong_run_object_order_layout_cache_and_document_comment_changes_are_rejected(self):
        name = 'matrix'
        def wrong_run(doc):
            run = body(doc)
            model.elements(run)[-1].removeChild(model.elements(run)[-1].firstChild)
            paragraph(doc).appendChild(doc.createElementNS(model.PARA,'hp:run')).appendChild(doc.createElementNS(model.PARA,'hp:t')).appendChild(doc.createTextNode(self.marker))
        def swap(doc):
            run = body(doc); nodes=model.elements(run);run.insertBefore(nodes[1],nodes[0])
        def cache(doc):
            paragraph(doc).removeChild(model.elements(paragraph(doc))[-1])
        def comment(doc):
            doc.insertBefore(doc.createComment('extra top-level comment'),doc.documentElement)
        for mutate in (wrong_run,swap,cache,comment):
            with self.assertRaisesRegex(ValueError,'Complete XML mismatch'):
                self.verify(name,rewrite(self.after[name],mutate))

    def test_whole_zip_payload_inventory_comment_and_metadata_are_checked(self):
        name = 'borderfill'; after=self.after[name]
        with self.assertRaisesRegex(ValueError,'Non-target payload changed'):
            self.verify(name,rewrite(after,lambda raw:raw+b' ',part='Contents/header.xml',transform_xml=False))
        for mode in ('comment','order','extra','duplicate','entry-metadata'):
            output=io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(after)) as source,zipfile.ZipFile(output,'w') as target:
                target.comment=b'changed' if mode=='comment' else source.comment
                entries=source.infolist()
                if mode=='order':entries=list(reversed(entries))
                for i,old in enumerate(entries):
                    item=copy.copy(old)
                    if mode=='entry-metadata' and i==0:item.comment=b'changed'
                    target.writestr(item,source.read(old))
                if mode in ('extra','duplicate'):
                    target.writestr('new-part' if mode=='extra' else entries[0].filename,b'changed')
            with self.subTest(mode=mode),self.assertRaises(ValueError):
                self.verify(name,output.getvalue())

    def test_structural_bounds_do_not_turn_unknown_objects_into_zero_width(self):
        source=self.inputs['borderfill']
        for section,index,count in ((True,0,1),(0,True,1),(0,999,1),(0,0,1025),(1,0,1)):
            with self.assertRaises(ValueError):
                model.locate(source,section=section,paragraph_index=index,start_unit=count)
        with self.assertRaises(ValueError):
            model.parse_xml(b'<!DOCTYPE s [<!ENTITY e "bad">]><s/>')

    def test_actual_chart_switch_is_still_unsupported(self):
        path = ROOT / 'reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx'
        if not path.exists():
            self.skipTest('optional reference chart fixture is absent')
        source = path.read_bytes()
        digest = hashlib.sha256(source).hexdigest()
        with self.assertRaises(ValueError):
            model.locate(source, section=0, paragraph_index=0, start_unit=1)
        self.assertEqual(digest, hashlib.sha256(path.read_bytes()).hexdigest())


if __name__ == '__main__':
    unittest.main(verbosity=2)
