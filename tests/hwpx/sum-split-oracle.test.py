import decimal
from pathlib import Path
import runpy
import unittest
import xml.etree.ElementTree as ET

module = runpy.run_path(str(Path(__file__).resolve().parents[2] / 'tools/hwpx-sum-split-oracle.py'))
P = module['P']


class SumSplitOracleTests(unittest.TestCase):
    def cell(self, texts):
        cell = ET.Element(P + 'tc')
        body = ET.SubElement(cell, P + 'subList')
        for text in texts:
            paragraph = ET.SubElement(body, P + 'p')
            ET.SubElement(ET.SubElement(paragraph, P + 'run'), P + 't').text = text
        return cell

    def test_first_paragraph_never_concatenates_or_searches_later_numbers(self):
        for texts, expected in [(['1', '999'], decimal.Decimal(1)), (['', '11.2'], None), (['bad', '9'], None), (['11.', '2'], None), (['0', '9'], decimal.Decimal(0))]:
            self.assertEqual(module['scalar'](self.cell(texts), True), expected)
            with self.assertRaisesRegex(ValueError, 'paragraph topology'):
                module['scalar'](self.cell(texts), False)

    def test_ascii_numeric_grammar_and_controls(self):
        for text in ['12,34', '.5', '1.', '1e3', 'NaN', '１２']:
            self.assertIsNone(module['scalar'](self.cell([text]), True))
        self.assertEqual(module['scalar'](self.cell(['-1,234.50']), True), decimal.Decimal('-1234.50'))
        cell = self.cell(['1', '2'])
        ET.SubElement(list(cell.iter(P + 'run'))[1], P + 'ctrl')
        with self.assertRaisesRegex(ValueError, 'scalar control'):
            module['scalar'](cell, True)


if __name__ == '__main__':
    unittest.main()
