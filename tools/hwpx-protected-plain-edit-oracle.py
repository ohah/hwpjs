"""Independent full ZIP/XML expectation for the observed decrypted fixture edit."""
import base64
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as E

P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
PART = 'Contents/section0.xml'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def parse(data):
    return E.fromstring(data, parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True, insert_pis=True)))


def target(root):
    paragraphs = list(root.iter(P + 'p'))
    require(len(paragraphs) == 418, 'Source paragraph inventory')
    paragraph = paragraphs[1]
    texts = paragraph.findall(P + 'run/' + P + 't')
    require(len(texts) == 1 and len(texts[0]) == 1 and texts[0][0].tag == P + 'fwSpace', 'Source retained-space text identity')
    return texts[0]


def verify(data):
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before']))) as source, zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after']))) as saved:
        require(source.namelist() == saved.namelist() and source.comment == saved.comment, 'ZIP inventory')
        require(source.testzip() is None and saved.testzip() is None, 'ZIP CRC')
        for entry in source.infolist():
            after = saved.getinfo(entry.filename)
            for key in ('compress_type', 'date_time', 'extra', 'comment', 'external_attr', 'internal_attr', 'create_system'):
                require(getattr(entry, key) == getattr(after, key), 'ZIP metadata: ' + entry.filename)
            if entry.filename != PART:
                require(source.read(entry.filename) == saved.read(entry.filename), 'Non-target payload: ' + entry.filename)
        expected, actual = parse(source.read(PART)), parse(saved.read(PART))
        text = target(expected)
        require(text.text == '\u1112\u119e\u11ab\uae00', 'Source text identity')
        text.text = '검증😀' + (text.text or '')
        require(E.tostring(expected) == E.tostring(actual), 'Complete XML mismatch')


if __name__ == '__main__':
    data = json.load(sys.stdin)
    verify(data)
    if data.get('selfTest'):
        for kind in ('text', 'attribute', 'control', 'other_payload'):
            buffer = io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after']))) as source, zipfile.ZipFile(buffer, 'w') as saved:
                saved.comment = source.comment
                for entry in source.infolist():
                    payload = source.read(entry.filename)
                    if entry.filename == PART and kind != 'other_payload':
                        root = parse(payload)
                        node = target(root)
                        if kind == 'text':
                            node.text = '잘못된 입력'
                        elif kind == 'control':
                            node[0].set('unexpected', '1')
                        else:
                            node.set('unexpected', '1')
                        payload = E.tostring(root)
                    if entry.filename == 'Contents/header.xml' and kind == 'other_payload':
                        payload += b'changed'
                    saved.writestr(entry, payload)
            try:
                verify({**data, 'after': base64.b64encode(buffer.getvalue()).decode()})
            except ValueError as error:
                require(str(error).startswith(('Complete XML mismatch', 'Non-target payload:')), 'Unexpected negative-control failure')
            else:
                raise ValueError('Oracle accepted mutation: ' + kind)
        print('Four independent document mutations rejected')
    print('Independent decrypted-fixture full XML and ZIP verified')
