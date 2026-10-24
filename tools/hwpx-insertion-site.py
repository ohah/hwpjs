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


def zero_width_control(control):
    if control.tag != P + 'ctrl' or len(control) != 1 or (control.text or '').strip() or (control[0].tail or '').strip():
        return False
    child = control[0]
    if child.tag == P + 'colPr':
        return True
    if child.tag == P + 'pageNum':
        return not len(child) and not (child.text or '').strip()
    # A field marker is not its label. Admit only the observed hyperlink
    # parameter grammar; the complete marker remains byte/structure checked.
    if child.tag != P + 'fieldBegin' or child.get('type') != 'HYPERLINK' or (child.text or '').strip():
        return False
    for parameters in child:
        if parameters.tag != P + 'parameters' or (parameters.text or '').strip() or (parameters.tail or '').strip():
            return False
        for value in parameters:
            if value.tag not in (P + 'stringParam', P + 'integerParam', P + 'booleanParam') or len(value) or (value.tail or '').strip():
                return False
    return True


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
        for run in paragraphs[data['sectionIndex']].findall(P + 'run'):
            if not len(run):
                return 'empty-run-prefix' if not run.text else 'plain-splice'
            for child in run:
                if child.tag == P + 'secPr':
                    continue
                if zero_width_control(child):
                    continue
                return 'direct-text-prefix' if child.tag == P + 't' else 'plain-splice'
    return 'plain-splice'


if __name__ == '__main__':
    print(json.dumps(classify(json.load(sys.stdin))))
