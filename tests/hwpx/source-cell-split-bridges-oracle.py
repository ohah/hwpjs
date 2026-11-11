"""Independent ZIP/XML oracle for constructor-authored table split bridge cases.
Only Python standard library; no product parser or layout/coordinate helper.
"""
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile
import json
import sys
from xml.etree import ElementTree as ET
P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'


def require(ok, message):
    if not ok:
        raise ValueError(message)


def same(a, b, message):
    require(ET.tostring(a) == ET.tostring(b), message)


def parsed(data):
    return ET.fromstring(data, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True)))


def one(parent, tag):
    rows = [n for n in parent if n.tag == P + tag]
    require(len(rows) == 1, 'Missing/ambiguous ' + tag)
    return rows[0]


def cells(table):
    result = {}
    for row in table.findall(P + 'tr'):
        for cell in row:
            require(cell.tag == P + 'tc', 'Unknown row child')
            addr = one(cell, 'cellAddr')
            key = (int(addr.get('rowAddr')), int(addr.get('colAddr')))
            require(key not in result, 'Duplicate cell address')
            result[key] = cell
    return result


def verify(plan):
    part = plan.get('part', 'Contents/section0.xml')
    with ZipFile(plan['before']) as before, ZipFile(plan['after']) as after:
        require(before.namelist() == after.namelist(), 'ZIP inventory differs')
        require(len(set(before.namelist())) == len(before.namelist()), 'Duplicate ZIP member')
        for name in before.namelist():
            if name != part:
                require(before.read(name) == after.read(name), 'Non-target payload differs: ' + name)
        old, new = parsed(before.read(part)), parsed(after.read(part))
        old_tables, new_tables = list(old.iter(P + 'tbl')), list(new.iter(P + 'tbl'))
        require(len(old_tables) == len(new_tables), 'Table count differs')
        ordinal = plan.get('tableOrdinal', 0)
        bt, at = old_tables[ordinal], new_tables[ordinal]
        require(at.get('rowCnt') == str(plan['gridRows']) and at.get('colCnt') == str(plan['gridColumns']), 'Wrong grid')
        require(all(row.attrib == {} for row in at.findall(P + 'tr')), 'Unexpected output row attributes')
        old_cells, new_cells = cells(bt), cells(at)
        require(len(new_cells) == len(plan['cells']), 'Wrong physical cell count')
        before_ids = [node.get('id') for node in old.iter(P + 'p')]
        all_ids = [node.get('id') for node in new.iter(P + 'p')]
        require(None not in all_ids and len(all_ids) == len(set(all_ids)), 'Duplicate/missing paragraph IDs')
        require(set(before_ids).issubset(all_ids), 'Source paragraph ID lost')
        seen = set()
        for expected in plan['cells']:
            key = (expected['row'], expected['column'])
            require(key not in seen and key in new_cells, 'Missing/duplicate expected cell')
            seen.add(key)
            cell = new_cells[key]
            original = old_cells[tuple(expected['source'])]
            require(cell.attrib == original.attrib, 'Cell attributes differ')
            span, size = one(cell, 'cellSpan'), one(cell, 'cellSz')
            require([int(span.get(k)) for k in ['rowSpan', 'colSpan']] == expected['span'], 'Wrong span')
            require([int(size.get(k)) for k in ['width', 'height']] == expected['size'], 'Wrong size')
            source_list, actual_list = one(original, 'subList'), one(cell, 'subList')
            require(source_list.attrib == actual_list.attrib, 'SubList attributes differ')
            if expected.get('blank'):
                require(len(actual_list) == 1 and actual_list[0].tag == P + 'p', 'Wrong blank paragraph count')
                actual_p, template = actual_list[0], source_list[0]
                identity = actual_p.get('id')
                require(identity not in before_ids, 'Blank reused source paragraph ID')
                empty = deepcopy(template)
                empty.set('id', identity)
                for child in list(empty):
                    empty.remove(child)
                run = ET.SubElement(empty, P + 'run', dict(template[0].attrib))
                ET.SubElement(run, P + 't')
                same(empty, actual_p, 'Blank text/style differs')
            else:
                sources = expected.get('paragraphSources', [expected['source']])
                paragraphs = [p for source in sources for p in one(old_cells[tuple(source)], 'subList')]
                require(len(actual_list) == len(paragraphs), 'Wrong source paragraph count')
                for a, b in zip(paragraphs, actual_list):
                    same(a, b, 'Source paragraph bytes/style differ')
            # Every other cell element/attribute must be preserved exactly.
            normalized = deepcopy(cell)
            for tag in ['cellAddr', 'cellSpan', 'cellSz', 'subList']:
                current = one(normalized, tag)
                index = list(normalized).index(current)
                normalized.remove(current)
                normalized.insert(index, deepcopy(one(original, tag)))
            same(original, normalized, 'Non-target cell child differs')
        # Restore table rows and grid in the output; compare whole section. This
        # also checks the other same-size tables, owner paragraph and caches.
        at.set('rowCnt', bt.get('rowCnt'))
        at.set('colCnt', bt.get('colCnt'))
        for row in list(at.findall(P + 'tr')):
            at.remove(row)
        for row in bt.findall(P + 'tr'):
            at.append(deepcopy(row))
        same(old, new, 'Outside split geometry/content differs')
    return {'verified': True, 'physicalCells': len(new_cells), 'nonTargetPayloads': 'exact'}


if __name__ == '__main__':
    print(json.dumps(verify(json.loads(Path(sys.argv[1]).read_text())), ensure_ascii=False))
