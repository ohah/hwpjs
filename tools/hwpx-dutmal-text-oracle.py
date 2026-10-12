"""Independently verify dutmal leaf edits and owner layout-cache invalidation."""
import base64
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET


def require(value, message):
    if not value:
        raise ValueError(message)


def signature(node):
    return (node.tag, sorted(node.attrib.items()), node.text, node.tail,
            [signature(child) for child in node])


def parse(pack, name):
    return ET.fromstring(pack.read(name), parser=ET.XMLParser(
        target=ET.TreeBuilder(insert_comments=True, insert_pis=True)))


def verify(data):
    ns = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
    before, after = [zipfile.ZipFile(io.BytesIO(base64.b64decode(data[key])))
                     for key in ('before', 'after')]
    require(before.namelist() == after.namelist(), 'ZIP inventory')
    require(before.comment == after.comment, 'ZIP comment')
    require(before.testzip() is None and after.testzip() is None, 'ZIP CRC')
    part = 'Contents/section0.xml'
    require(before.namelist().count(part) == 1, 'section inventory')
    for name in before.namelist():
        if name != part:
            require(before.read(name) == after.read(name), 'other payload changed')
            continue
        expected, actual = parse(before, name), parse(after, name)
        controls = list(expected.iter(ns + 'dutmal'))
        require(len(controls) == 1, 'single fixture dutmal required')
        control = controls[0]
        for kind in ('mainText', 'subText'):
            if kind not in data:
                continue
            leaves = control.findall(ns + kind)
            require(len(leaves) == 1 and not len(leaves[0]), 'leaf shape')
            leaves[0].text = data[kind] or None
        parents = {child: parent for parent in expected.iter() for child in parent}
        owner = control
        while owner.tag != ns + 'p':
            require(owner in parents, 'paragraph owner')
            owner = parents[owner]
        for cache in owner.findall(ns + 'linesegarray'):
            owner.remove(cache)
        require(signature(expected) == signature(actual), 'complete XML mismatch')


if __name__ == '__main__':
    verify(json.load(sys.stdin))
