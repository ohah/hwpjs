"""Independent diagnostics tests, not a native parser or edit policy oracle."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('scope', ROOT / 'tools/hwpx-unmatched-field-scope.py')
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)


class ScopeTests(unittest.TestCase):
    def inspect(self, body):
        return scope.inspect_section('<s xmlns:p="' + scope.PARA[1:-1] + '">' + body + '</s>')

    def test_nested_owner_is_nearest_not_section_or_outer_list(self):
        row = self.inspect('<p:subList><p:p/><p:subList><p:p><p:fieldBegin id="1"/></p:p></p:subList><p:p/></p:subList><p:p/>')['unmatched'][0]
        self.assertEqual(row['owner'], 'subList')
        self.assertEqual(row['paragraph'], 2)
        self.assertEqual(row['owner_paragraphs'], [2])

    def test_explicit_cross_paragraph_end_is_not_unmatched(self):
        report = self.inspect('<p:p><p:fieldBegin id="1"/></p:p><p:p><p:fieldEnd beginIDRef="1"/></p:p>')
        self.assertEqual(report['unmatched'], [])
        self.assertEqual(report['link_issues'], [])

    def test_numeric_ids_match_despite_leading_zeroes(self):
        report = self.inspect('<p:fieldBegin id="0001"/><p:fieldEnd beginIDRef="1"/>')
        self.assertEqual(report['unmatched'], [])
        self.assertEqual(report['link_issues'], [])
        report = self.inspect('<p:fieldBegin id="0001"/><p:fieldBegin id="1"/><p:fieldEnd beginIDRef="01"/>')
        self.assertEqual(report['link_issues'], ['ambiguous_or_missing_begin'])

    def test_numeric_lexical_boundaries_preserve_raw_ids(self):
        for raw, expected in [(' +0001 ', 1), ('-000', 0), ('4294967295', 4294967295), ('0' * 5000, 0)]:
            self.assertEqual(scope.numeric_id(raw), expected)
        for raw in ['', '+', '-1', '4294967296', '1_0', '１', '\u00a01', '1.0', '--0']:
            with self.assertRaises(ValueError):
                scope.numeric_id(raw)
        self.assertEqual(self.inspect('<p:fieldBegin id="0001"/>')['unmatched'][0]['id'], '0001')

    def test_ambiguous_forward_and_missing_ids_are_not_repaired(self):
        for body, issue in [
            ('<p:fieldBegin id="1"/><p:fieldBegin id="1"/><p:fieldEnd beginIDRef="1"/>', 'ambiguous_or_missing_begin'),
            ('<p:fieldEnd beginIDRef="1"/><p:fieldBegin id="1"/>', 'forward_reference'),
            ('<p:fieldBegin/><p:fieldEnd/>', 'ambiguous_or_missing_begin'),
        ]:
            report = self.inspect(body)
            self.assertIn(issue, report['link_issues'])
            self.assertTrue(report['unmatched'])

    def test_wrong_namespace_does_not_create_a_field(self):
        self.assertEqual(self.inspect('<p:p><fieldBegin id="1"/></p:p>')['begins'], 0)

    def test_section_owned_orphan_and_duplicate_end_remain_diagnostics(self):
        report = self.inspect('<p:p><p:fieldBegin id="1"/></p:p>')
        self.assertEqual(report['unmatched'][0]['owner'], 'section')
        self.assertEqual(report['unmatched'][0]['owner_paragraphs'], [])
        report = self.inspect('<p:fieldBegin id="1"/><p:fieldEnd beginIDRef="1"/><p:fieldEnd beginIDRef="1"/>')
        self.assertEqual(report['link_issues'], ['duplicate_end'])

    def test_actual_orphans_are_list_owned(self):
        for name, expected in [('80168', 1), ('86712', 4)]:
            path = ROOT / f'reference/rhwp/samples/issue1891/{name}_regulatory_analysis.hwpx'
            if not path.exists():
                self.skipTest('optional reference fixture is absent')
            report = scope.inspect_file(path)['sections'][0]
            self.assertEqual(len(report['unmatched']), expected)
            self.assertEqual(report['link_issues'], [])
            self.assertTrue(all(row['owner'] == 'subList' for row in report['unmatched']))


if __name__ == '__main__':
    unittest.main()
