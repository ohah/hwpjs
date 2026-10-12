"""Independent whole ZIP/XML check for insertion before a retained pageNum."""
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
            expected = parse(before.read(name))
            actual = parse(after.read(name))
            paragraphs = list(expected.iter(P + 'p'))
            require(len(paragraphs) >= 5, 'paragraph inventory')
            paragraph = paragraphs[4]
            runs = paragraph.findall(P + 'run')
            require(len(runs) == 1 and len(runs[0]) == 1, 'run ownership')
            run = runs[0]
            control = run[0]
            require(control.tag == P + 'ctrl' and len(control) == 1 and control[0].tag == P + 'pageNum', 'page number ownership')
            text = E.Element(P + 't')
            text.text = data['text']
            run.insert(0, text)
            require(signature(expected) == signature(actual), 'complete XML mismatch')


def self_test():
    def pack(xml, payload=b'unchanged', duplicate=False):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as archive:
            archive.writestr('Contents/section0.xml', xml)
            archive.writestr('other.bin', payload)
            if duplicate:
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore')
                    archive.writestr('other.bin', payload)
        return base64.b64encode(stream.getvalue()).decode()

    head = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" + '<p:p/>' * 4
    run = '<p:p><p:run><p:ctrl><p:pageNum/></p:ctrl></p:run></p:p></s:sec>'
    before_xml = head + run
    after_xml = before_xml.replace('<p:run>', '<p:run><p:t>X</p:t>')
    before, after = pack(before_xml), pack(after_xml)
    verify({'before': before, 'after': after, 'text': 'X'})
    cases = [
        {'before': before, 'after': after, 'text': 'wrong'},
        {'before': before, 'after': pack(after_xml, b'changed'), 'text': 'X'},
        {'before': before, 'after': pack(after_xml.replace('<p:pageNum/>', "<p:pageNum pos='TOP_CENTER'/>")), 'text': 'X'},
        {'before': before, 'after': pack(after_xml.replace('<p:ctrl><p:pageNum/></p:ctrl>', '')), 'text': 'X'},
        {'before': before, 'after': pack(after_xml.replace('<p:t>X</p:t>', '<p:t>X</p:t><p:t/>')), 'text': 'X'},
        {'before': pack(before_xml, duplicate=True), 'after': pack(after_xml, duplicate=True), 'text': 'X'},
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
