"""Title/BOOKMARK target selection; reuse strict whole XML/ZIP comparison."""
import base64
import importlib.util
import io
import json
from pathlib import Path
import sys
import zipfile

spec = importlib.util.spec_from_file_location('field_oracle', Path(__file__).with_name('hwpx-field-edit-oracle.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

def verify(data):
    if data.get('section') != 0 or data.get('paragraph') != 1 or not isinstance(data.get('beginId'), str):
        raise ValueError('Explicit observed target required')
    before, after = [base64.b64decode(data[key], validate=True) for key in ('before', 'after')]
    with zipfile.ZipFile(io.BytesIO(before)) as old, zipfile.ZipFile(io.BytesIO(after)) as new:
        if any(old.read(name) != new.read(name) for name in old.namelist() if name.startswith('Contents/section') and name != 'Contents/section0.xml'):
            raise ValueError('Non-target section')
    def fragments(tree):
        nodes = list(tree.iter())
        paragraphs = list(tree.iter(base.P + 'p'))
        paragraph = paragraphs[0]
        parents = {child: owner for owner in tree.iter() for child in owner}
        begins = [node for node in tree.iter(base.P + 'fieldBegin') if node.get('id') == data['beginId']]
        ends = [node for node in tree.iter(base.P + 'fieldEnd') if node.get('beginIDRef') == data['beginId']]
        if len(begins) != 1 or len(ends) != 1 or begins[0].get('type') != 'BOOKMARK':
            raise ValueError('Unique BOOKMARK pair required')
        begin = begins[0]
        start, end = max(nodes.index(node) for node in begin.iter()) + 1, nodes.index(ends[0])
        titles = list(paragraph.iter(base.P + 'titleMark'))
        if len(titles) != 1 or len(titles[0]) or (titles[0].text or '').strip() or nodes.index(titles[0]) >= nodes.index(begin):
            raise ValueError('Observed leading title metadata required')
        texts = [node for node in nodes[start:end] if node.tag == base.P + 't']
        if start >= end or len(texts) != 1 or len(texts[0]):
            raise ValueError('Observed direct field text required')
        owner = parents[texts[0]]
        while owner.tag != base.P + 'p':
            owner = parents[owner]
        if owner is not paragraph:
            raise ValueError('Field paragraph mismatch')
        return [(begin, 1, texts[0])]
    original = base.fragments
    base.fragments = fragments
    try:
        base.compare(before, after, data['text'], data['beginId'], 1)
    finally:
        base.fragments = original

if __name__ == '__main__':
    base.self_test()
    verify(json.load(sys.stdin))
    print('Title and BOOKMARK full XML/ZIP verified')
