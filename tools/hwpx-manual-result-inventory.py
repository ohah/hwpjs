"""Independent source formula / section-local paragraph identity, no edits."""
import io
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as E

P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'

with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:
    names = archive.namelist()
    if len(names) != len(set(names)):
        raise ValueError('Duplicate ZIP entry')
    rows = []
    for name in names:
        match = re.fullmatch(r'Contents/section(0|[1-9][0-9]*)\.xml', name)
        if not match:
            continue
        raw = archive.read(name)
        if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:
            raise ValueError('Unsupported declaration')
        root = E.fromstring(raw)
        parents = {child: parent for parent in root.iter() for child in parent}
        paragraphs = {node: index for index, node in enumerate(root.iter(P + 'p'), 1)}
        fields = [node for node in root.iter(P + 'fieldBegin') if node.get('type') == 'FORMULA']
        for ordinal, field in enumerate(fields):
            owner = field
            while owner not in paragraphs and owner in parents:
                owner = parents[owner]
            rows.append({'section': int(match[1]), 'ordinal': ordinal, 'localParagraph': paragraphs.get(owner)})
    print(json.dumps(rows))
