"""Explicit paragraph-local nested prefix oracle; no marker repair or filtering."""
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


def parse(data):
    return E.fromstring(data, parser=E.XMLParser(
        target=E.TreeBuilder(insert_comments=True, insert_pis=True)))


def verify(data):
    require(type(data['paragraph']) is int and data['paragraph'] >= 1, 'paragraph index')
    require(isinstance(data['beginId'], str) and data['beginId'], 'explicit begin ID')
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before']))) as before, \
            zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after']))) as after:
        require(before.namelist() == after.namelist() and before.comment == after.comment, 'ZIP inventory')
        require(len(set(before.namelist())) == len(before.namelist()), 'duplicate ZIP entry')
        require(before.testzip() is None and after.testzip() is None, 'CRC')
        require(before.namelist().count('Contents/section0.xml') == 1, 'section inventory')
        for name in before.namelist():
            if name != 'Contents/section0.xml':
                require(before.read(name) == after.read(name), 'non-target payload')
                continue
            expected, actual = parse(before.read(name)), parse(after.read(name))
            paragraphs = list(expected.iter(P + 'p'))
            require(data['paragraph'] <= len(paragraphs), 'paragraph index')
            paragraph = paragraphs[data['paragraph'] - 1]
            stack, seen, edited = [], set(), False
            for element in paragraph.iter():
                if element.tag == P + 'fieldBegin':
                    identity = element.get('id')
                    require(identity and identity not in seen, 'duplicate begin')
                    require(element.get('type') in ('CLICK_HERE', 'HYPERLINK'), 'unsupported field')
                    seen.add(identity)
                    stack.append(element)
                elif element.tag == P + 'fieldEnd':
                    require(stack and stack[-1].get('id') == element.get('beginIDRef'), 'non-nested field end')
                    stack.pop()
                elif element.tag == P + 't' and not edited and any(begin.get('id') == data['beginId'] for begin in stack):
                    require(stack[-1].get('id') == data['beginId'], 'descendant-owned prefix')
                    require(not len(element), 'inline prefix requires separate oracle')
                    element.text = data['text'] + (element.text or '')
                    for begin in stack:
                        begin.set('dirty', '1')
                    edited = True
            require(not stack and edited, 'missing target or end')
            require(signature(expected) == signature(actual), 'complete XML mismatch')


def self_test():
    def pack(xml, payload=b'keep'):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as archive:
            archive.writestr('Contents/section0.xml', xml)
            archive.writestr('other.bin', payload)
        return base64.b64encode(stream.getvalue()).decode()

    before_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldBegin id='2' type='CLICK_HERE'/></p:ctrl><p:t>B</p:t><p:ctrl><p:fieldEnd beginIDRef='2'/></p:ctrl><p:t>C</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>"
    after_xml = before_xml.replace("type='CLICK_HERE'/>", "type='CLICK_HERE' dirty='1'/>").replace('<p:t>B</p:t>', '<p:t>XB</p:t>')
    before = pack(before_xml)
    payload = {'before': before, 'after': pack(after_xml), 'paragraph': 1, 'beginId': '2', 'text': 'X'}
    verify(payload)
    cases = [
        {**payload, 'text': 'wrong'},
        {**payload, 'beginId': '1'},
        {**payload, 'after': pack(after_xml, b'changed')},
        {**payload, 'after': pack(after_xml.replace("id='1' type='CLICK_HERE' dirty='1'", "id='1' type='CLICK_HERE'"))},
        {**payload, 'after': pack(after_xml.replace("id='2' type='CLICK_HERE' dirty='1'", "id='2' type='CLICK_HERE'"))},
        {**payload, 'after': pack(after_xml.replace("beginIDRef='2'", "beginIDRef='9'"))},
        {**payload, 'after': pack(after_xml.replace('<p:t>C</p:t>', '<p:t>changed</p:t>'))},
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
