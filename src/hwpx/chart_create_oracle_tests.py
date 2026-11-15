"""Oracle self-checks with independently authored XML; no Native evidence."""
import copy
import unittest
from chart_create_output_oracle import check, check_admission

XML = b'''<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:bubbleChart><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>S</c:v></c:tx><c:xVal><c:numLit><c:ptCount val="1"/><c:pt idx="0"><c:v>-3.0</c:v></c:pt></c:numLit></c:xVal><c:yVal><c:numLit><c:ptCount val="1"/><c:pt idx="0"><c:v>-0</c:v></c:pt></c:numLit></c:yVal><c:bubbleSize><c:numLit><c:ptCount val="1"/><c:pt idx="0"><c:v>2.5</c:v></c:pt></c:numLit></c:bubbleSize></c:ser><c:bubble3D val="0"/><c:bubbleScale val="100"/><c:showNegBubbles val="0"/><c:sizeRepresents val="area"/><c:axId val="1"/><c:axId val="2"/></c:bubbleChart><c:valAx><c:axId val="1"/><c:axPos val="b"/><c:crossAx val="2"/></c:valAx><c:valAx><c:axId val="2"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx></c:plotArea></c:chart></c:chartSpace>'''
EXPECTED = {"chart": {"kind": "bubbleChart"}, "data": {"categories": [], "series": [{"name": "S", "values": ["-0"], "x_values": ["-3.0"], "bubble_sizes": ["2.5"]}]}}


class OutputOracle(unittest.TestCase):
    def test_positive(self):
        self.assertEqual(check(XML, EXPECTED), {"kind": "bubbleChart", "series": 1, "axes": 2})

    def test_exact_decimal_policy_boundaries(self):
        for raw in ["-1e-5000", "-5e-324"]:
            expected = copy.deepcopy(EXPECTED)
            expected["data"]["series"][0]["bubble_sizes"] = [raw]
            with self.assertRaises(ValueError):
                check_admission(expected)
        for raw in ["-0", "-0e-5000", "1e-5000"]:
            expected = copy.deepcopy(EXPECTED)
            expected["data"]["series"][0]["bubble_sizes"] = [raw]
            check_admission(expected)
        stock = {"chart": {"kind": "stockChart", "stock_layout": "highLowClose"},
                 "data": {"categories": ["D"], "series": [
                     {"name": "H", "stock_role": "high", "values": ["1"]},
                     {"name": "L", "stock_role": "low", "values": ["1.0000000000000001"]},
                     {"name": "C", "stock_role": "close", "values": ["1"]}]}}
        with self.assertRaises(ValueError):
            check_admission(stock)
        stock["data"]["series"][0]["values"] = ["1.0000000000000002"]
        stock["data"]["series"][2]["values"] = ["1.0000000000000001"]
        check_admission(stock)

    def test_missing_explicit_generation_settings(self):
        for setting in [b'<c:bubble3D val="0"/>', b'<c:bubbleScale val="100"/>', b'<c:sizeRepresents val="area"/>']:
            with self.subTest(setting=setting), self.assertRaises(ValueError):
                check(XML.replace(setting, b""), EXPECTED)

    def test_wrong_expectations(self):
        for field, value in [("name", "other"), ("values", ["0"]), ("x_values", ["-3"]), ("bubble_sizes", ["9"] )]:
            expected = copy.deepcopy(EXPECTED)
            expected["data"]["series"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                check(XML, expected)
        expected = copy.deepcopy(EXPECTED)
        expected["chart"]["kind"] = "scatterChart"
        with self.assertRaises(ValueError):
            check(XML, expected)

    def test_wrong_output(self):
        for old, new in [(b"bubbleSize", b"cat"), (b'idx="0"', b'idx="1"'), (b'crossAx val="2"', b'crossAx val="1"'), (b"valAx", b"catAx"), (b'ptCount val="1"', b'ptCount val="2"')]:
            with self.subTest(mutation=old), self.assertRaises(ValueError):
                check(XML.replace(old, new), EXPECTED)


if __name__ == "__main__":
    unittest.main()
