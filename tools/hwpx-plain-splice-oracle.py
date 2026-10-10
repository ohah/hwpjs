"""plain text 문단의 run 보존 UTF-16 교체와 전체 XML/ZIP 독립 검사."""
import base64
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'


def parse(data):
    return ET.fromstring(data, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True)))


def verify(data):
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before'], validate=True))) as before, zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after'], validate=True))) as after:
        if before.namelist() != after.namelist() or before.comment != after.comment or before.testzip() is not None or after.testzip() is not None:
            raise ValueError('ZIP inventory/comment/CRC mismatch')
        if len(set(before.namelist())) != len(before.namelist()):
            raise ValueError('Duplicate ZIP entry')
        part = data['part']
        expected = parse(before.read(part))
        paragraphs = list(expected.iter(P + 'p'))
        index, start, end = data['index'], data['start'], data['end']
        if any(type(value) is not int for value in (index, start, end)) or not 0 <= index < len(paragraphs) or not 0 <= start <= end:
            raise ValueError('Invalid splice range')
        paragraph = paragraphs[index]
        runs = paragraph.findall(P + 'run')
        texts = [child for run in runs for child in run if child.tag == P + 't']
        if not texts or any(len(leaf) for leaf in texts) or any(child.tag != P + 't' for run in runs for child in run):
            raise ValueError('Oracle supports plain text leaves only')
        if any(child.tag not in (P + 'run', P + 'linesegarray') for child in paragraph):
            raise ValueError('Unsupported paragraph child')
        raw_texts = [(leaf.text or '').encode('utf-16-le') for leaf in texts]
        complete = b''.join(raw_texts)
        if end * 2 > len(complete):
            raise ValueError('Splice exceeds text')
        # Decode both range boundaries independently, including semantic no-ops.
        complete[:start * 2].decode('utf-16-le')
        complete[end * 2:].decode('utf-16-le')
        inserted = data['text'].encode('utf-16-le')
        # Equal replacement must retain each original run's source styling.
        if complete[start * 2:end * 2] != inserted:
            cursor = 0
            placed = False
            for leaf, raw in zip(texts, raw_texts):
                stop = cursor + len(raw) // 2
                at = not placed and cursor <= start <= stop
                low, high = max(start, cursor), min(end, stop)
                if at or high > low:
                    local_start = start - cursor if at else low - cursor
                    removed = max(0, high - low)
                    leaf.text = (raw[:local_start * 2].decode('utf-16-le') +
                                 (data['text'] if at else '') +
                                 raw[(local_start + removed) * 2:].decode('utf-16-le'))
                    placed = placed or at
                cursor = stop
            if not placed:
                raise ValueError('Missing insertion site')
        if ET.tostring(expected) != ET.tostring(parse(after.read(part))):
            raise ValueError('Whole XML mismatch')
        for entry in before.infolist():
            if entry.filename != part and before.read(entry) != after.read(entry.filename):
                raise ValueError('Non-target payload changed')
            current = after.getinfo(entry.filename)
            for field in ('compress_type', 'date_time', 'extra', 'comment', 'external_attr', 'internal_attr', 'create_system'):
                if getattr(entry, field) != getattr(current, field):
                    raise ValueError('ZIP metadata changed')


def self_test():
    def archive(xml, other=b'keep', comment=b'', compression=zipfile.ZIP_STORED):
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w', compression=compression) as package:
            package.writestr('Contents/section0.xml', xml)
            package.writestr('other', other)
            package.comment = comment
        return base64.b64encode(output.getvalue()).decode('ascii')

    prefix = '<s xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph"><p:p id="1"><p:run charPrIDRef="3"><p:t>'
    suffix = '</p:t></p:run><p:run charPrIDRef="4"><p:t>B😀</p:t></p:run></p:p></s>'
    original = prefix + 'A' + suffix
    changed = prefix + 'A한😀' + suffix
    request = dict(before=archive(original), after=archive(changed), part='Contents/section0.xml', index=0, start=1, end=1, text='한😀')
    verify(request)
    cross = prefix + 'A교체' + suffix.replace('B😀', '')
    verify({**request, 'after': archive(cross), 'start': 1, 'end': 4, 'text': '교체'})
    verify({**request, 'after': archive(original), 'start': 0, 'end': 4, 'text': 'AB😀'})
    broken = [
        archive(original),
        archive(changed.replace('charPrIDRef="4"', 'charPrIDRef="9"')),
        archive(changed.replace('B😀', 'C😀')),
        archive(changed, other=b'corrupt'),
        archive(changed, comment=b'corrupt'),
        archive(changed, compression=zipfile.ZIP_DEFLATED),
        archive(prefix + 'A' + suffix.replace('B😀', '한😀B😀')),
    ]
    rejected = 0
    for output in broken:
        try:
            verify({**request, 'after': output})
        except ValueError:
            rejected += 1
        else:
            raise ValueError('Oracle accepted corrupted output')
    for fields in [{'index': True}, {'start': -1}, {'start': 2, 'end': 3}, {'start': 3, 'end': 3}]:
        try:
            verify({**request, **fields})
        except (ValueError, UnicodeError):
            rejected += 1
        else:
            raise ValueError('Oracle accepted unsupported or invalid range')
    for fields in [
        dict(after=archive(cross.replace('charPrIDRef="4"', 'charPrIDRef="9"')), start=1, end=4, text='교체'),
        dict(after=archive(prefix + 'AB😀' + suffix.replace('B😀', '')), start=0, end=4, text='AB😀'),
    ]:
        try:
            verify({**request, **fields})
        except ValueError:
            rejected += 1
        else:
            raise ValueError('Oracle accepted changed run ownership')
    print(f'Plain splice oracle: valid boundary insertion and {rejected} counterexamples verified')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    elif sys.argv[1:]:
        raise ValueError('Unknown oracle option')
    else:
        verify(json.load(sys.stdin))
