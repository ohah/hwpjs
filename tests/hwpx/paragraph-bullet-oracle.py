"""Independent ZIP/XML oracle for an existing-declaration paragraph bullet edit."""
import copy
import json
from pathlib import Path
import sys
from xml.etree import ElementTree as ET
from zipfile import ZipFile

def require(condition, message='Invalid paragraph bullet save'):
    if not condition:
        raise AssertionError(message)
H = '{http://www.hancom.co.kr/hwpml/2011/head}'
P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'

def same(left, right):
    require(ET.tostring(left) == ET.tostring(right), 'Unexpected XML change')

def verify(plan):
    with ZipFile(plan['before']) as old_zip, ZipFile(plan['after']) as new_zip:
        require(old_zip.namelist() == new_zip.namelist(), 'Package inventory changed')
        old = ET.fromstring(old_zip.read('Contents/header.xml'))
        new = ET.fromstring(new_zip.read('Contents/header.xml'))
        old_group = old.find('.//' + H + 'paraProperties')
        new_group = new.find('.//' + H + 'paraProperties')
        originals = {node.attrib['id']: node for node in old_group}
        resources = {node.attrib['id']: node for node in new_group}
        require(len(resources) == len(list(new_group)), 'Duplicate paraPr ID')
        require(int(new_group.attrib['itemCnt']) == len(resources))
        for (identity, node) in originals.items():
            same(node, resources[identity])
        for (identity, node) in resources.items():
            if identity in originals:
                continue
            matched = False
            for template in originals.values():
                for variant in plan['variants']:
                    expected = copy.deepcopy(template)
                    expected.attrib['id'] = identity
                    heading = expected.find(H + 'heading')
                    if heading is None:
                        continue
                    heading.set('type', 'BULLET' if variant['bullet'] is not None else 'NONE')
                    heading.set('idRef', str(variant['bullet'] or 0))
                    heading.set('level', '0')
                    if 'alignment' in variant:
                        expected.find(H + 'align').set('horizontal', variant['alignment'])
                    matched |= ET.tostring(expected) == ET.tostring(node)
            require(matched, 'Unexpected cloned resource fields')
        restored = copy.deepcopy(new)
        restored_group = restored.find('.//' + H + 'paraProperties')
        for node in list(restored_group):
            if node.attrib['id'] not in originals:
                restored_group.remove(node)
        restored_group.attrib = old_group.attrib.copy()
        same(old, restored)
        checked = set()
        for name in old_zip.namelist():
            if name == 'Contents/header.xml':
                continue
            if name not in plan['sections']:
                require(old_zip.read(name) == new_zip.read(name), name)
                continue
            before = ET.fromstring(old_zip.read(name))
            after = ET.fromstring(new_zip.read(name))
            expected = copy.deepcopy(before)
            before_rows = list(expected.iter(P + 'p'))
            rows = list(after.iter(P + 'p'))
            require(len(before_rows) == len(rows))
            for (index, value) in plan['sections'][name].items():
                index = int(index)
                new_id = rows[index].attrib['paraPrIDRef']
                before_rows[index].set('paraPrIDRef', new_id)
                heading = resources[new_id].find(H + 'heading')
                require(heading.attrib['type'] == ('BULLET' if value['bullet'] is not None else 'NONE'))
                require(heading.attrib['idRef'] == str(value['bullet'] or 0))
                require(heading.attrib['level'] == '0')
                if 'alignment' in value:
                    require(resources[new_id].find(H + 'align').attrib['horizontal'] == value['alignment'])
                checked.add((name, index))
            same(expected, after)
        require(checked)
        print(json.dumps({'verified': len(checked), 'newParagraphResources': len(resources) - len(originals), 'bulletDefinitions': len(list(new.iter(H + 'bullet')))}))
if __name__ == '__main__':
    verify(json.loads(Path(sys.argv[1]).read_text()))
