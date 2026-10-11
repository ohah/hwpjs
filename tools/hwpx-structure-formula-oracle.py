"""Chart regression oracle: first numeric cell after saved structural edits."""
import base64
import io
import json
from pathlib import Path
import runpy
import sys
import zipfile
import xml.etree.ElementTree as ET

P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'


def signature(node):
    return (node.tag, sorted(node.attrib.items()), node.text or '',
            node.tail or '', [signature(child) for child in node])


def difference(expected, actual, path='section'):
    for label, left, right in [('tag', expected.tag, actual.tag), ('attributes', expected.attrib, actual.attrib),
                               ('text', expected.text or '', actual.text or ''), ('tail', expected.tail or '', actual.tail or '')]:
        if left != right:
            return f'{path} {label}: expected {left!r}, actual {right!r}'
    if len(expected) != len(actual):
        return f'{path} child count: {len(expected)} != {len(actual)}'
    for index, (left, right) in enumerate(zip(expected, actual)):
        found = difference(left, right, f'{path}/{index}:{left.tag.rsplit("}", 1)[-1]}')
        if found:
            return found
    return None


def verify(data):
    before = zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before'])))
    after = zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after'])))
    if before.namelist() != after.namelist() or before.comment != after.comment or after.testzip() is not None:
        raise ValueError('ZIP inventory/CRC')
    for name in before.namelist():
        if name != 'Contents/section0.xml':
            if before.read(name) != after.read(name):
                raise ValueError('non-target payload ' + name)
            continue
        expected = ET.fromstring(before.read(name))
        actual = ET.fromstring(after.read(name))
        original_value = data.get('originalValue', '11.2')
        if not isinstance(original_value, str):
            raise ValueError('numeric original value')
        numeric = [node for node in expected.iter(P + 't') if node.text == original_value]
        if len(numeric) != 1:
            raise ValueError('numeric fixture ambiguity')
        replacement = data.get('value', '100')
        if not isinstance(replacement, str):
            raise ValueError('numeric replacement')
        numeric[0].text = replacement
        fields = [node for node in expected.iter(P + 'fieldBegin') if node.get('type') == 'FORMULA']
        if len(fields) != 13:
            raise ValueError('field count')
        field = fields[0]
        params = {node.get('name'): node for node in field.find(P + 'parameters')}
        # Evaluate actual edited cells using the independent Decimal/range oracle,
        # not the product result or the source's cached LastResult.
        derived = io.BytesIO()
        with zipfile.ZipFile(derived, 'w') as archive:
            archive.writestr('Contents/section0.xml', ET.tostring(expected))
        results = runpy.run_path(str(Path(__file__).with_name('hwpx-formula-cell-oracle.py')))['results']
        calculated = list(results(io.BytesIO(derived.getvalue())))
        if calculated[0][0] != field.get('id'):
            raise ValueError('formula fixture order')
        result = str(calculated[0][2])
        if replacement == '100' and result != '156.3':
            raise ValueError('independent arithmetic')
        if params['ResultFormat'].text == '%g,':
            result = format(calculated[0][2], ',')
        elif params['ResultFormat'].text != '%g':
            raise ValueError('unsupported result format')
        params['LastResult'].text = result
        params['Command'].text = params['Command'].text.rsplit(',;;', 1)[0] + ',;;' + result
        field.set('dirty', '1')
        # Only the explicitly linked field owns its result text. Exterior
        # prefix/suffix text in the same paragraph is not a result cache.
        nodes = list(expected.iter())
        ends = [node for node in nodes if node.tag == P + 'fieldEnd' and node.get('beginIDRef') == field.get('id')]
        if len(ends) != 1:
            raise ValueError('formula end ambiguity')
        begin_index, end_index = nodes.index(field), nodes.index(ends[0])
        if end_index <= begin_index:
            raise ValueError('formula marker order')
        texts = [node for node in nodes[begin_index + 1:end_index] if node.tag == P + 't']
        if not texts:
            raise ValueError('missing result text')
        texts[0].text = result
        for text in texts[1:]:
            text.text = None
        if signature(expected) != signature(actual):
            raise ValueError('complete XML mismatch: ' + difference(expected, actual))


if __name__ == '__main__':
    verify(json.load(sys.stdin))
