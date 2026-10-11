"""Independent full XML/ZIP expectation for a single manual formula result."""
import base64
import io
import json
from pathlib import Path
import runpy
import sys
import zipfile
import xml.etree.ElementTree as E

P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'

def require(value, message):
    if not value:
        raise ValueError(message)

def selected(root, ordinal):
    fields = [node for node in root.iter(P + 'fieldBegin') if node.get('type') == 'FORMULA']
    require(type(ordinal) is int and 0 <= ordinal < len(fields), 'Formula ordinal')
    field = fields[ordinal]
    require(field.get('id') is not None, 'Source field ID')
    nodes = list(root.iter())
    ends = [node for node in nodes if node.tag == P + 'fieldEnd' and node.get('beginIDRef') == field.get('id')]
    require(len(ends) == 1, 'Source field pairing')
    start, end = nodes.index(field) + len(list(field.iter())), nodes.index(ends[0])
    require(start <= end, 'Source field order')
    texts = [node for node in nodes[start:end] if node.tag == P + 't']
    require(len(texts) == 1 and len(texts[0]) == 0, 'Observed direct result structure')
    return field, texts[0]

def verify(data):
    part = 'Contents/section0.xml'
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before'], validate=True))) as before, zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after'], validate=True))) as after:
        require(len(before.namelist()) == len(set(before.namelist())), 'Duplicate source ZIP entry')
        require(before.namelist() == after.namelist() and before.comment == after.comment, 'ZIP inventory')
        require(before.testzip() is None and after.testzip() is None, 'ZIP CRC')
        for entry in before.infolist():
            saved = after.getinfo(entry.filename)
            for key in ('compress_type', 'date_time', 'extra', 'comment', 'external_attr', 'internal_attr', 'create_system'):
                require(getattr(entry, key) == getattr(saved, key), 'ZIP metadata: ' + entry.filename)
            if entry.filename != part:
                require(before.read(entry.filename) == after.read(entry.filename), 'Non-target payload: ' + entry.filename)
        def parse(raw):
            require(b'<!DOCTYPE' not in raw and b'<!ENTITY' not in raw, 'Unsupported declaration')
            return E.fromstring(raw, parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True, insert_pis=True)))
        expected, actual = parse(before.read(part)), parse(after.read(part))
        _, text = selected(expected, data['ordinal'])
        require(isinstance(data['display'], str), 'Manual display type')
        text.text = data['display']
        difference = runpy.run_path(str(Path(__file__).with_name('hwpx-structure-formula-oracle.py')))['difference']
        found = difference(expected, actual)
        require(found is None, 'Complete XML differs: ' + str(found))

if __name__ == '__main__':
    data = json.load(sys.stdin)
    verify(data)
    if data.get('selfTest'):
        for kind in ('result', 'cache', 'dirty', 'other_text', 'other_payload'):
            buffer = io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after'], validate=True))) as source, zipfile.ZipFile(buffer, 'w') as saved:
                saved.comment = source.comment
                for entry in source.infolist():
                    payload = source.read(entry.filename)
                    if entry.filename == 'Contents/section0.xml' and kind != 'other_payload':
                        root = E.fromstring(payload, parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True, insert_pis=True)))
                        field, text = selected(root, data['ordinal'])
                        if kind == 'result':
                            text.text = data['display'] + '!'
                        elif kind == 'cache':
                            cache = field.find(P + 'parameters/' + P + "stringParam[@name='LastResult']")
                            cache.text = (cache.text or '') + '!'
                        elif kind == 'dirty':
                            field.set('dirty', '0' if field.get('dirty') == '1' else '1')
                        else:
                            other = next(node for node in root.iter(P + 't') if node is not text and node.text)
                            other.text += '!'
                        payload = E.tostring(root)
                    if entry.filename == 'Contents/header.xml' and kind == 'other_payload':
                        payload += b'changed'
                    saved.writestr(entry, payload)
            try:
                verify({**data, 'after': base64.b64encode(buffer.getvalue()).decode()})
            except ValueError as error:
                require(str(error).startswith(('Complete XML differs:', 'Non-target payload:')), 'Unexpected negative-control failure')
            else:
                raise ValueError('Oracle accepted mutation: ' + kind)
        print('Five manual-result mutations rejected')
    print('Manual result complete XML and ZIP verified')
