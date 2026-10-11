"""Independent expectation for the observed external-BinData SUM input edit."""
import base64
from decimal import Decimal
import io
import json
from pathlib import Path
import runpy
import sys
import zipfile
import xml.etree.ElementTree as E

P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'


def require(value, message):
    if not value:
        raise ValueError(message)


def verify(data):
    description_edit = data.get('mode') == 'description'
    require(data.get('mode') in (None, 'description'), 'Unknown edit mode')
    part = 'Contents/section0.xml'
    parse = lambda value: E.fromstring(value, parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True, insert_pis=True)))
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before']))) as before, zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after']))) as after:
        require(before.namelist() == after.namelist() and before.comment == after.comment, 'ZIP inventory')
        require(before.testzip() is None and after.testzip() is None, 'ZIP CRC')
        for entry in before.infolist():
            saved = after.getinfo(entry.filename)
            for key in ('compress_type', 'date_time', 'extra', 'comment', 'external_attr', 'internal_attr', 'create_system'):
                require(getattr(entry, key) == getattr(saved, key), 'ZIP metadata: ' + entry.filename)
            if entry.filename != part:
                require(before.read(entry.filename) == after.read(entry.filename), 'Non-target payload: ' + entry.filename)
        expected, actual = parse(before.read(part)), parse(after.read(part))
        parents = {child: parent for parent in expected.iter() for child in parent}
        def owner_table(node):
            cursor = parents[node]
            while cursor.tag != P + 'tbl':
                cursor = parents[cursor]
            return cursor
        candidates = []
        for table in expected.iter(P + 'tbl'):
            fields = list(table.iter(P + 'fieldBegin'))
            formulas = [field for field in fields if field.get('type') == 'FORMULA' and owner_table(field) is table]
            if len(formulas) == 5 and all(field.find(P + 'parameters/' + P + "stringParam[@name='Formula']").text == '=SUM(?3:?7)' for field in formulas):
                candidates.append((table, formulas))
        require(len(candidates) == 1, 'Source table identity')
        table, fields = candidates[0]
        cells = []
        for row in table.findall(P + 'tr'):
            for cell in row.findall(P + 'tc'):
                addr, span = cell.find(P + 'cellAddr'), cell.find(P + 'cellSpan')
                cells.append((int(addr.get('colAddr')), int(addr.get('rowAddr')), int(span.get('colSpan')), int(span.get('rowSpan')), cell))

        def selected(column, row):
            found = [cell for c, r, w, h, cell in cells if c <= column < c + w and r <= row < r + h]
            require(len(found) == 1, 'Independent cell occupancy')
            return found[0]

        def texts(cell):
            return cell.findall(P + 'subList/' + P + 'p/' + P + 'run/' + P + 't')

        numeric = texts(selected(2, 2))
        require(len(numeric) == 1 and numeric[0].text == '67.83', 'Source numeric identity')
        if not description_edit:
            numeric[0].text = '70'
        for column, field in zip(range(2, 7), fields):
            total = Decimal(0)
            for row in range(2, 7):
                content = ''.join(node.text or '' for node in texts(selected(column, row)))
                if row in (4, 5):
                    require(content in ('공용면적에 포함', '환자 이용공간이 아니므로 제외함'), 'Source text policy')
                    continue
                total += Decimal(content)
            params = {node.get('name'): node for node in field.find(P + 'parameters')}
            result = format(total, 'f').rstrip('0').rstrip('.') if '.' in format(total, 'f') else format(total, 'f')
            require(params['ResultFormat'].text == '%g,', 'Source result format')
            if column != 2 or description_edit:
                require(Decimal(params['LastResult'].text) == total, 'Unchanged independent SUM')
                continue
            require(total == Decimal('127.76'), 'Independent edited SUM')
            params['LastResult'].text = result
            params['Command'].text = '=SUM(?3:?7)??%g,;;' + result
            field.set('dirty', '1')
            nodes = list(expected.iter())
            ends = [node for node in nodes if node.tag == P + 'fieldEnd' and node.get('beginIDRef') == field.get('id')]
            require(len(ends) == 1, 'Source field end')
            owned = [node for node in nodes[nodes.index(field) + 1:nodes.index(ends[0])] if node.tag == P + 't']
            require(len(owned) == 1 and owned[0].text == '125.59', 'Source result text')
            owned[0].text = result
        if description_edit:
            paragraphs = list(expected.iter(P + 'p'))
            ordinal = data['paragraph']
            require(type(ordinal) is int and 1 <= ordinal <= len(paragraphs), 'Description paragraph identity')
            nodes = paragraphs[ordinal - 1].findall(P + 'run/' + P + 't')
            require(len(nodes) == 1 and nodes[0].text == '공용면적에 포함' and len(nodes[0]) == 0, 'Source description identity')
            permitted = {node for column in range(2, 7) for row in (4, 5) for node in texts(selected(column, row))}
            require(nodes[0] in permitted, 'Description SUM ownership')
            require(data['text'] == '긴 설명' * 100, 'Description replacement identity')
            nodes[0].text = data['text']
        difference = runpy.run_path(str(Path(__file__).with_name('hwpx-structure-formula-oracle.py')))['difference']
        found = difference(expected, actual)
        require(found is None, 'Complete XML differs: ' + str(found))


if __name__ == '__main__':
    data = json.load(sys.stdin)
    verify(data)
    if data.get('selfTest'):
        for kind in ('result', 'command', 'dirty', 'description', 'other_payload'):
            buffer = io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after']))) as source, zipfile.ZipFile(buffer, 'w') as saved:
                saved.comment = source.comment
                for entry in source.infolist():
                    payload = source.read(entry.filename)
                    if entry.filename == 'Contents/section0.xml' and kind != 'other_payload':
                        root = E.fromstring(payload, parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True, insert_pis=True)))
                        display = '125.59' if data.get('mode') == 'description' else '127.76'
                        field = next(node for node in root.iter(P + 'fieldBegin') if node.get('type') == 'FORMULA' and node.find(P + 'parameters/' + P + "stringParam[@name='LastResult']").text == display)
                        if kind == 'dirty':
                            field.set('dirty', '0' if field.get('dirty') == '1' else '1')
                        elif kind == 'command':
                            field.find(P + 'parameters/' + P + "stringParam[@name='Command']").text = '=SUM(?3:?6)??%g,;;127.76'
                        else:
                            wanted = display if kind == 'result' else data['text'] if data.get('mode') == 'description' else '공용면적에 포함'
                            node = next(node for node in root.iter(P + 't') if node.text == wanted)
                            node.text = '128.76' if kind == 'result' else '변경된 설명'
                        payload = E.tostring(root)
                    if entry.filename == 'Contents/header.xml' and kind == 'other_payload':
                        payload += b'changed'
                    saved.writestr(entry, payload)
            try:
                verify({**data, 'after': base64.b64encode(buffer.getvalue()).decode()})
            except ValueError as error:
                require(str(error).startswith(('Complete XML differs:', 'Non-target payload:')), 'Unexpected negative-control failure')
            else:
                raise ValueError('Oracle accepted mutation: ' + kind)
        print('Five independent saved-document mutations rejected')
    print('Independent text SUM complete XML and ZIP verified')
