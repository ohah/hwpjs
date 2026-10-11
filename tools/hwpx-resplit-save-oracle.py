"""Independent whole XML/ZIP comparison of a plain saved paragraph split.

Validates new ID uniqueness, not the allocator's minimum-ID policy.
Supports plain runs/t and retained secPr/ctrl-colPr metadata only.
Other controls are rejected, never flattened.
"""
import base64
import copy
import io
import json
from pathlib import Path
import runpy
import sys
import zipfile
import xml.etree.ElementTree as ET

P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'


def parse(data):
    return ET.fromstring(data, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True)))


def signature(node):
    return (node.tag, sorted(node.attrib.items()), node.text or '', node.tail or '', [signature(child) for child in node])


def verify(data, *, expected_transform=None):
    before = zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before'])))
    after = zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after'])))
    if before.namelist() != after.namelist() or before.comment != after.comment or before.testzip() is not None or after.testzip() is not None:
        raise ValueError('ZIP inventory/CRC')
    part = data['part']
    expected, actual = parse(before.read(part)), parse(after.read(part))
    paragraphs, output = list(expected.iter(P + 'p')), list(actual.iter(P + 'p'))
    index, at, end = data['index'], data['at'], data.get('end', data['at'])
    if len(output) != len(paragraphs) + 1 or not 0 <= index < len(paragraphs) or not 0 <= at <= end:
        raise ValueError('split topology/range')
    left = paragraphs[index]
    parent = next(node for node in expected.iter() if left in list(node))
    right = copy.deepcopy(left)
    new_id = output[index + 1].get('id')
    used = {node.get('id') for name in before.namelist() if name.endswith('.xml') for node in parse(before.read(name)).iter(P + 'p')}
    if new_id is None or not new_id.isdigit() or int(new_id) <= 0 or new_id in used:
        raise ValueError('new paragraph ID')
    right.set('id', new_id)
    for flag in ('pageBreak', 'columnBreak'):
        if right.get(flag) in ('1', 'true'):
            right.set(flag, '0')
    left.tail, right.tail = None, left.tail
    for paragraph in (left, right):
        if any(child.tag not in (P + 'run', P + 'linesegarray') and isinstance(child.tag, str) for child in paragraph):
            raise ValueError('nonplain paragraph')
        for run in paragraph.findall(P + 'run'):
            # An originally empty styled run has no t element to copy. A split
            # materializes an empty text site on both sides, retaining the run.
            # Do this before removing continuation metadata: a metadata-only
            # source run is not an originally empty text run.
            if not list(run) and not (run.text or '').strip():
                ET.SubElement(run, P + 't')
            if any(child.tag not in (P + 't', P + 'secPr', P + 'ctrl') and isinstance(child.tag, str) for child in run):
                raise ValueError('nonplain run')
            for control in run.findall(P + 'ctrl'):
                if not list(control) or any(child.tag != P + 'colPr' for child in control):
                    raise ValueError('non-metadata control')
            if paragraph is right:
                for child in list(run):
                    if child.tag in (P + 'secPr', P + 'ctrl'):
                        run.remove(child)
        for lines in list(paragraph.findall(P + 'linesegarray')):
            paragraph.remove(lines)
    cursor = 0
    for one, two in zip(left.iter(P + 't'), right.iter(P + 't')):
        if list(one) or list(two):
            raise ValueError('inline control')
        raw = (one.text or '').encode('utf-16-le')
        units = len(raw) // 2
        low = min(at, cursor + units) - min(at, cursor)
        high = min(max(end, cursor), cursor + units) - cursor
        one.text = raw[:low * 2].decode('utf-16-le')
        two.text = raw[high * 2:].decode('utf-16-le')
        cursor += units
    if end > cursor:
        raise ValueError('text range')
    parent.insert(list(parent).index(left) + 1, right)
    if expected_transform is not None:
        expected_transform(expected)
    if signature(expected) != signature(actual):
        difference = runpy.run_path(str(Path(__file__).with_name('hwpx-structure-formula-oracle.py')))['difference']
        raise ValueError('complete XML mismatch: ' + str(difference(expected, actual)))
    for name in before.namelist():
        if name != part and before.read(name) != after.read(name):
            raise ValueError('non-target ZIP payload')


if __name__ == '__main__':
    verify(json.load(sys.stdin))
