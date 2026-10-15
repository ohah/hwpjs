"""Independent observed-copay edit expectation; no native output as oracle."""
import base64
from decimal import Decimal
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET


def require(value, message):
    if not value:
        raise ValueError(message)


request = json.load(sys.stdin)
before, after = [zipfile.ZipFile(io.BytesIO(base64.b64decode(request[key], validate=True))) for key in ('before', 'after')]
require(before.namelist() == after.namelist(), 'ZIP inventory mismatch')
part = 'Contents/section0.xml'
for entry in before.namelist():
    if entry != part:
        require(before.read(entry) == after.read(entry), 'non-target payload mismatch')
p = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
expected = ET.fromstring(before.read(part))
paragraphs = list(expected.iter(p + 'p'))
numeric = list(paragraphs[88].iter(p + 't'))
require(len(numeric) == 1 and numeric[0].text == '30.1', 'source numeric mismatch')
numeric[0].text = '40.1'
table = list(expected.iter(p + 'tbl'))[4]
values = []
for cell in table.iter(p + 'tc'):
    address = cell.find(p + 'cellAddr')
    if address is not None and address.get('colAddr') == '3' and int(address.get('rowAddr')) > 2:
        paragraph = next(cell.iter(p + 'p'))
        leaves = list(paragraph.iter(p + 't'))
        require(len(leaves) == 1, 'unexpected numeric topology')
        values.append(Decimal(leaves[0].text))
require(len(values) == 8, 'BELOW cell inventory mismatch')
rendered = str(sum(values))
require(rendered == '194.9', 'independent sum mismatch')
fields = [field for field in expected.iter(p + 'fieldBegin') if field.get('type') == 'FORMULA']
require(len(fields) == 5 and fields[0].get('id') == '1295981349', 'formula inventory mismatch')
field = fields[0]
params = {node.get('name'): node for node in field.iter(p + 'stringParam')}
require(params['Formula'].text == '=SUM(BELOW)' and params['LastResult'].text == '184.9', 'source formula mismatch')
field.set('dirty', '1')
params['Command'].text = '=SUM(BELOW)??%g,;;' + rendered
params['LastResult'].text = rendered
labels = list(paragraphs[82].iter(p + 't'))
require([node.text for node in labels] == ['100', '.0'], 'source result and suffix mismatch')
labels[0].text = rendered
require(ET.tostring(expected) == ET.tostring(ET.fromstring(after.read(part))), 'complete XML mismatch')
for old, new in zip(before.infolist(), after.infolist()):
    for name in ('compress_type', 'flag_bits', 'date_time', 'external_attr', 'internal_attr', 'extra', 'comment', 'create_system', 'create_version', 'extract_version'):
        require(getattr(old, name) == getattr(new, name), 'ZIP metadata mismatch: ' + name)
print(json.dumps({'wholeXmlZip': True, 'belowCells': len(values), 'result': rendered}))
