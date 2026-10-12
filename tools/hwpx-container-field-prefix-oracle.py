"""Whole XML/ZIP prefix check for one closed field retaining opaque objects."""
import base64
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as E

P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'


def require(value, reason):
    if not value:
        raise ValueError(reason)


def signature(element):
    return (element.tag, sorted(element.attrib.items()), element.text,
            element.tail, [signature(child) for child in element])


def verify(data):
    require(type(data['section']) is int and data['section'] >= 0, 'section index')
    require(type(data['paragraph']) is int and data['paragraph'] >= 1, 'paragraph index')
    require(isinstance(data['beginId'], str) and data['beginId'], 'explicit field ID')
    part = 'Contents/section%d.xml' % data['section']
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before']))) as before, \
            zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after']))) as after:
        require(before.namelist() == after.namelist() and before.comment == after.comment, 'ZIP inventory')
        require(len(set(before.namelist())) == len(before.namelist()), 'duplicate ZIP entry')
        require(before.testzip() is None and after.testzip() is None, 'CRC')
        require(before.namelist().count(part) == 1, 'target section')
        for name in before.namelist():
            one, two = before.getinfo(name), after.getinfo(name)
            for key in ('compress_type', 'date_time', 'extra', 'comment', 'external_attr', 'internal_attr', 'create_system'):
                require(getattr(one, key) == getattr(two, key), 'ZIP metadata')
            if name != part:
                require(before.read(name) == after.read(name), 'non-target payload')
                continue
            parse = lambda raw: E.fromstring(raw, parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True, insert_pis=True)))
            expected, actual = parse(before.read(name)), parse(after.read(name))
            elements = list(expected.iter())
            begins = list(expected.iter(P + 'fieldBegin'))
            ends = list(expected.iter(P + 'fieldEnd'))
            require(len(begins) == 1 and len(ends) == 1, 'single closed field scope')
            begin, end = begins[0], ends[0]
            require(begin.get('id') == data['beginId'] and end.get('beginIDRef') == data['beginId'], 'field link')
            low, high = elements.index(begin), elements.index(end)
            require(low < high and begin.get('type') in ('CLICK_HERE', 'HYPERLINK'), 'field kind or direction')
            paragraphs = list(expected.iter(P + 'p'))
            require(data['paragraph'] <= len(paragraphs), 'paragraph index')
            paragraph = paragraphs[data['paragraph'] - 1]
            candidates = []
            for run in paragraph.findall(P + 'run'):
                for index, child in enumerate(run):
                    if not low < elements.index(child) < high:
                        continue
                    if child.tag == P + 'secPr':
                        continue
                    if child.tag == P + 'ctrl' and len(child) and all(c.tag in {P + k for k in ('fieldBegin', 'fieldEnd', 'colPr', 'pageNum', 'newNum', 'pageHiding', 'header', 'footer', 'bookmark', 'indexmark')} for c in child):
                        continue
                    candidates.append((run, index, child))
            require(candidates, 'missing owned prefix content')
            run, index, child = candidates[0]
            if child.tag == P + 't':
                require(not len(child), 'inline prefix needs its own oracle')
                child.text = data['text'] + (child.text or '')
            else:
                require(child.tag in {P + k for k in ('tbl', 'pic', 'equation', 'container', 'ole', 'rect', 'line', 'ellipse', 'arc', 'polygon', 'curve', 'connectLine', 'ctrl')}, 'unknown object')
                if child.tag == P + 'ctrl':
                    require(len(child) == 1 and child[0].tag in {P + k for k in ('footNote', 'endNote', 'autoNum')}, 'unknown control anchor')
                text = E.Element(P + 't')
                text.text = data['text']
                run.insert(index, text)
            begin.set('dirty', '1')
            require(signature(expected) == signature(actual), 'complete XML mismatch')


def self_test():
    def pack(xml, other=b'keep'):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as archive:
            archive.writestr('Contents/section0.xml', xml)
            archive.writestr('other.bin', other)
        return base64.b64encode(stream.getvalue()).decode()

    source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE'/></p:ctrl><p:tbl rowCnt='1'><p:p><p:run><p:t>CELL</p:t></p:run></p:p></p:tbl><p:t>Z</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>"
    saved = source.replace("type='CLICK_HERE'/>", "type='CLICK_HERE' dirty='1'/>").replace("<p:tbl rowCnt='1'>", "<p:t>X</p:t><p:tbl rowCnt='1'>")
    payload = {'before': pack(source), 'after': pack(saved), 'section': 0, 'paragraph': 1, 'beginId': '1', 'text': 'X'}
    verify(payload)
    cases = [
        {**payload, 'text': 'wrong'},
        {**payload, 'beginId': '2'},
        {**payload, 'after': pack(saved, b'changed')},
        {**payload, 'after': pack(saved.replace("rowCnt='1'", "rowCnt='2'"))},
        {**payload, 'after': pack(saved.replace('CELL', 'changed'))},
        {**payload, 'after': pack(saved.replace("<p:fieldEnd beginIDRef='1'/>", ''))},
        {**payload, 'after': pack(saved.replace(" dirty='1'", ''))},
        {**payload, 'after': pack(saved.replace('<p:t>X</p:t>', '').replace('<p:ctrl>', '<p:t>X</p:t><p:ctrl>', 1))},
    ]
    for data in cases:
        try:
            verify(data)
        except ValueError:
            continue
        raise ValueError('negative control accepted')
    print(json.dumps({'positive': 1, 'negative': len(cases)}))


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    else:
        require(not sys.argv[1:], 'unknown arguments')
        verify(json.load(sys.stdin))
