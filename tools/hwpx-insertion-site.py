"""Select an insertion oracle from source only, never from the edited output."""
import base64
import io
import json
from pathlib import Path
import runpy
import sys
import zipfile
import xml.etree.ElementTree as ET

P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
selected = runpy.run_path(str(Path(__file__).with_name('hwpx_text_snapshot_order.py')))['selected_paragraphs']


source = runpy.run_path(str(Path(__file__).with_name('hwpx-insertion-source.py')))
zero_width_control = source['zero_width_control']
owned_prefix = source['owned_prefix']

def classify(data):
    for key in ('section', 'sectionIndex', 'startUnit'):
        if type(data[key]) is not int or data[key] < 0:
            raise ValueError('Invalid insertion source coordinate')
    if data['startUnit'] != 0:
        return 'plain-splice'
    part = 'Contents/section%d.xml' % data['section']
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before'], validate=True))) as package:
        names = package.namelist()
        if len(names) != len(set(names)) or names.count(part) != 1:
            raise ValueError('Ambiguous insertion source inventory')
        parser = ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True))
        paragraphs = selected(ET.fromstring(package.read(part), parser=parser))
        if data['sectionIndex'] >= len(paragraphs):
            raise ValueError('Invalid insertion source paragraph')
        paragraph = paragraphs[data['sectionIndex']]
        slot = owned_prefix(paragraph)
        if slot is not None:
            return slot[0]
        for run in paragraph.findall(P + 'run'):
            if not len(run):
                return 'empty-run-prefix' if not run.text else 'plain-splice'
            for child in run:
                if child.tag == P + 'secPr':
                    continue
                if zero_width_control(child):
                    continue
                if child.tag == P + 't' and not child.text and any(node.tag in (P + 'markpenBegin', P + 'titleMark') for node in child):
                    return 'plain-splice'
                return 'direct-text-prefix' if child.tag == P + 't' else 'plain-splice'
    return 'plain-splice'


if __name__ == '__main__':
    print(json.dumps(classify(json.load(sys.stdin))))
