"""Independent ZIP/XML comparison for one explicit bullet resource edit."""
import copy
import json
import sys
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

H = '{http://www.hancom.co.kr/hwpml/2011/head}'
P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def same(left, right, message):
    require(ET.tostring(left) == ET.tostring(right), message)


def children(owner, tag):
    return [node for node in owner if node.tag == tag]


def one(owner, tag):
    nodes = children(owner, tag)
    require(len(nodes) == 1, 'Ambiguous or missing ' + tag)
    return nodes[0]


def parsed(data):
    return ET.fromstring(data, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True)))


def indexed(group):
    tag = H + ('bullet' if group.tag == H + 'bullets' else 'paraPr')
    nodes = children(group, tag)
    result = {node.get('id'): node for node in nodes}
    require(None not in result and len(nodes) == len(result), 'Ambiguous resource IDs')
    require(int(group.get('itemCnt')) == len(nodes), 'Resource count mismatch')
    return result


def attributes(definition):
    return {
        'align': definition['alignment'],
        'useInstWidth': '1' if definition['useInstanceWidth'] else '0',
        'autoIndent': '1' if definition['autoIndent'] else '0',
        'widthAdjust': str(definition['widthAdjust']),
        'textOffsetType': definition['textOffsetType'],
        'textOffset': str(definition['textOffset']),
        'charPrIDRef': str(definition['charShapeId']),
    }


def verify(plan):
    with ZipFile(plan['before']) as old_zip, ZipFile(plan['after']) as new_zip:
        old_names, new_names = old_zip.namelist(), new_zip.namelist()
        require(len(set(old_names)) == len(old_names), 'Duplicate input ZIP member')
        require(len(set(new_names)) == len(new_names), 'Duplicate output ZIP member')
        require(old_names == new_names, 'ZIP inventory changed')
        old = parsed(old_zip.read('Contents/header.xml'))
        new = parsed(new_zip.read('Contents/header.xml'))
        old_refs, new_refs = one(old, H + 'refList'), one(new, H + 'refList')
        old_groups = children(old_refs, H + 'bullets')
        require(len(old_groups) <= 1, 'Ambiguous input bullets')
        old_group = old_groups[0] if old_groups else None
        new_group = one(new_refs, H + 'bullets')
        old_rows = indexed(old_group) if old_group is not None else {}
        new_rows = indexed(new_group)
        identity = str(plan['id'])
        require(identity in new_rows, 'Missing edited definition')
        selected = new_rows[identity]
        definition = plan['definition']
        require(selected.get('char') == chr(definition['marker']), 'Wrong marker')
        para_head = one(selected, H + 'paraHead')
        for name, value in attributes(definition).items():
            require(para_head.get(name) == value, 'Wrong definition attribute: ' + name)
        if plan['mode'] == 'create':
            require(identity not in old_rows, 'Create reused an existing ID')
            require(list(new_rows) == [*old_rows, identity], 'Create changed resource order')
            require(selected.attrib == {'id': identity, 'char': chr(definition['marker']), 'useImage': '0'}, 'Unexpected new bullet attributes')
            require(len(list(selected)) == 1, 'Unexpected new bullet children')
            expected_attributes = dict(attributes(definition), level='0', numFormat='DIGIT', checkable='0')
            require(para_head.attrib == expected_attributes, 'Unexpected new paraHead attributes')
            require(len(list(para_head)) == 0 and not (para_head.text or ''), 'Unexpected paraHead content')
            new_group.remove(selected)
            if old_group is None:
                require(new_group.attrib == {'itemCnt': '1'}, 'Unexpected new group attributes')
                require(list(new_refs).index(new_group) + 1 == list(new_refs).index(one(new_refs, H + 'paraProperties')), 'Wrong resource group placement')
                new_refs.remove(new_group)
            else:
                new_group.set('itemCnt', old_group.get('itemCnt'))
        else:
            require(plan['mode'] == 'update' and identity in old_rows, 'Unknown update ID')
            require(list(new_rows) == list(old_rows), 'Update changed IDs or order')
            original = old_rows[identity]
            selected.set('char', original.get('char'))
            original_head = one(original, H + 'paraHead')
            for name in attributes(definition):
                if name in original_head.attrib:
                    para_head.set(name, original_head.get(name))
                else:
                    para_head.attrib.pop(name, None)
        old_properties = one(old_refs, H + 'paraProperties')
        new_properties = one(new_refs, H + 'paraProperties')
        before_properties, after_properties = indexed(old_properties), indexed(new_properties)
        added = set(after_properties) - set(before_properties)
        require(len(added) <= (1 if plan['apply'] else 0), 'Unexpected paragraph resources')
        for identity_before in before_properties:
            require(identity_before in after_properties, 'Paragraph resource removed')
            same(before_properties[identity_before], after_properties[identity_before], 'Existing paragraph resource changed')
        active_part = plan.get('part', 'Contents/section0.xml')
        for name in old_names:
            if name == 'Contents/header.xml':
                continue
            if not plan['apply'] or name != active_part:
                require(old_zip.read(name) == new_zip.read(name), 'Non-target payload changed: ' + name)
                continue
            before, after = parsed(old_zip.read(name)), parsed(new_zip.read(name))
            before_rows, after_rows = children(before, P + 'p'), children(after, P + 'p')
            require(len(before_rows) == len(after_rows), 'Root paragraph count changed')
            ordinal = plan['paragraph']
            original_row, changed_row = before_rows[ordinal], after_rows[ordinal]
            old_id, new_id = original_row.get('paraPrIDRef'), changed_row.get('paraPrIDRef')
            expected = copy.deepcopy(before_properties[old_id])
            expected.set('id', new_id)
            heading = one(expected, H + 'heading')
            heading.attrib.update(type='BULLET', idRef=identity, level='0')
            same(expected, after_properties[new_id], 'Unexpected applied paragraph shape')
            require(not added or added == {new_id}, 'Unused cloned paragraph resource')
            changed_row.set('paraPrIDRef', old_id)
            all_before, all_after = list(before.iter(P + 'p')), list(after.iter(P + 'p'))
            require(len(all_before) == len(all_after), 'Nested paragraphs changed')
            for left, right in zip(all_before, all_after):
                original_caches, saved_caches = children(left, P + 'linesegarray'), children(right, P + 'linesegarray')
                require(len(saved_caches) <= len(original_caches), 'Unexpected added line cache')
                for a, b in zip(original_caches, saved_caches):
                    same(a, b, 'Line cache changed instead of being removed')
                for node in original_caches:
                    left.remove(node)
                for node in saved_caches:
                    right.remove(node)
            same(before, after, 'Unexpected section content change')
        for identity_added in added:
            new_properties.remove(after_properties[identity_added])
        new_properties.set('itemCnt', old_properties.get('itemCnt'))
        same(old, new, 'Unexpected header changes')
        return {'verified': True, 'id': plan['id'], 'mode': plan['mode'], 'paragraphResourcesAdded': len(added)}


if __name__ == '__main__':
    print(json.dumps(verify(json.loads(Path(sys.argv[1]).read_text()))))
