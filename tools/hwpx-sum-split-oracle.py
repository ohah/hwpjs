"""Independent chart SUM arithmetic layered on the whole XML split oracle.

Only plain scalar cells and the observed SUM/AVG range formulas are accepted.
This is not a general formula engine or an external Hancom layout oracle.
"""
import base64
import decimal
import io
import json
from pathlib import Path
import re
import runpy
import sys
import zipfile
import xml.etree.ElementTree as ET

P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
reference = runpy.run_path(str(Path(__file__).with_name('hwpx-formula-fixture-oracle.py')))['reference']
split = runpy.run_path(str(Path(__file__).with_name('hwpx-resplit-save-oracle.py')))['verify']


def scalar(cell, first_only):
    paragraphs = cell.find(P + 'subList').findall(P + 'p')
    if not paragraphs or (not first_only and len(paragraphs) != 1):
        raise ValueError('unsupported scalar paragraph topology')
    for paragraph in paragraphs:
        for node in paragraph.iter():
            if isinstance(node.tag, str) and node.tag not in {P + name for name in ('p', 'run', 't', 'linesegarray', 'lineseg')}:
                raise ValueError('unsupported scalar control')
    text = ''.join(node.text or '' for node in paragraphs[0].iter(P + 't')).strip(' \t\r\n')
    if not re.fullmatch(r'[+-]?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?', text):
        if first_only:
            return None
        raise ValueError('invalid strict numeric scalar')
    return decimal.Decimal(text.replace(',', ''))


def calculations(root):
    result = {}
    for table in root.iter(P + 'tbl'):
        cells = {}
        for row in table.findall(P + 'tr'):
            for cell in row.findall(P + 'tc'):
                address = cell.find(P + 'cellAddr')
                key = int(address.get('colAddr')), int(address.get('rowAddr'))
                if key in cells:
                    raise ValueError('duplicate cell address')
                cells[key] = cell
        for key, cell in cells.items():
            for field in cell.iter(P + 'fieldBegin'):
                if field.get('type') != 'FORMULA':
                    continue
                identifier = field.get('id')
                if identifier is None or identifier in result:
                    raise ValueError('ambiguous formula ID')
                params = {node.get('name'): node for node in field.find(P + 'parameters')}
                formula = params['Formula'].text
                match = re.fullmatch(r'=(SUM|AVG)\(([^():]+):([^():]+)\)', formula)
                if match is None:
                    raise ValueError('unsupported range formula')
                first, last = reference(match[2], key), reference(match[3], key)
                if first[0] > last[0] or first[1] > last[1]:
                    raise ValueError('reversed range')
                values = []
                for y in range(first[1], last[1] + 1):
                    for x in range(first[0], last[0] + 1):
                        value = scalar(cells[x, y], match[1] == 'SUM')
                        if value is not None:
                            values.append(value)
                value = sum(values, decimal.Decimal(0))
                if match[1] == 'AVG':
                    if not values:
                        raise ValueError('empty average')
                    value /= len(values)
                result[identifier] = value
    return result


def verify(data):
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before']))) as archive:
        old = ET.fromstring(archive.read(data['part']))
    previous = calculations(old)

    def refresh(expected):
        current = calculations(expected)
        if current.keys() != previous.keys():
            raise ValueError('formula inventory changed')
        nodes = list(expected.iter())
        for field in expected.iter(P + 'fieldBegin'):
            identifier = field.get('id')
            if field.get('type') != 'FORMULA' or current[identifier] == previous[identifier]:
                continue
            params = {node.get('name'): node for node in field.find(P + 'parameters')}
            format_spec = params['ResultFormat'].text
            if format_spec not in ('%g', '%g,'):
                raise ValueError('unsupported changed result format')
            rendered = format(current[identifier].normalize(), '.6g')
            if format_spec == '%g,':
                value = current[identifier]
                rounded = value.normalize() if value == value.to_integral_value() else decimal.Decimal(rendered)
                rendered = format(rounded, ',f')
            field.set('dirty', '1')
            params['LastResult'].text = rendered
            params['Command'].text = params['Command'].text.rsplit(',;;', 1)[0] + ',;;' + rendered
            ends = [node for node in nodes if node.tag == P + 'fieldEnd' and node.get('beginIDRef') == identifier]
            if len(ends) != 1 or nodes.index(ends[0]) <= nodes.index(field):
                raise ValueError('ambiguous result end')
            texts = [node for node in nodes[nodes.index(field) + 1:nodes.index(ends[0])] if node.tag == P + 't']
            if not texts:
                raise ValueError('missing result text')
            texts[0].text = rendered
            for node in texts[1:]:
                node.text = None

    split(data, expected_transform=refresh)


if __name__ == '__main__':
    verify(json.load(sys.stdin))
