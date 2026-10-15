"""Chart-specific independent XML/ZIP expectation for four numeric inputs."""
import base64
import decimal
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET


def require(condition, message):
    if not condition:
        raise ValueError(message)


request = json.load(sys.stdin)
before = zipfile.ZipFile(io.BytesIO(base64.b64decode(request['before'], validate=True)))
after = zipfile.ZipFile(io.BytesIO(base64.b64decode(request['after'], validate=True)))
require(before.namelist() == after.namelist(), 'ZIP inventory/order mismatch')
part = 'Contents/section0.xml'
for old, new in zip(before.infolist(), after.infolist()):
    if old.filename != part:
        require(before.read(old) == after.read(new), 'non-target ZIP payload mismatch')
p = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
expected = ET.fromstring(before.read(part))
paragraphs = list(expected.iter(p + 'p'))
for index, text in zip(range(19, 23), ['11.2', '24.7', '16.3', '15.3']):
    leaves = list(paragraphs[index].iter(p + 't'))
    require(len(leaves) == 1 and leaves[0].text == text, 'unexpected source numeric cell')
    leaves[0].text = '250000'
fields = [node for node in expected.iter(p + 'fieldBegin') if node.get('type') == 'FORMULA']
require(len(fields) == 13, 'source formula inventory mismatch')
field = fields[0]
params = {node.get('name'): node for node in field.find(p + 'parameters')}
require(params['Formula'].text == '=SUM(B?:E?)' and params['ResultFormat'].text == '%g,', 'unexpected source formula')
require(params['LastResult'].text == '67.5', 'unexpected source result')
rendered = format(decimal.Decimal('250000') * 4, ',f')
field.set('dirty', '1')
params['LastResult'].text = rendered
params['Command'].text = '=SUM(B?:E?)??%g,;;' + rendered
labels = list(paragraphs[23].iter(p + 't'))
require(len(labels) == 2 and labels[0].text == '67.5' and labels[1].text is None, 'unexpected source display')
labels[0].text = rendered
actual = ET.fromstring(after.read(part))
require(ET.tostring(expected) == ET.tostring(actual), 'complete XML mismatch')
for old, new in zip(before.infolist(), after.infolist()):
    for name in ('compress_type', 'flag_bits', 'date_time', 'external_attr', 'internal_attr', 'extra', 'comment', 'create_system', 'create_version', 'extract_version'):
        require(getattr(old, name) == getattr(new, name), 'ZIP metadata mismatch: ' + name)
print(json.dumps({'wholeXmlZip': True, 'result': rendered}))
