"""Independent XML ownership diagnostics; never infer or repair field ends."""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

PARA = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'


def inspect_section(xml):
    root = ET.fromstring(xml)
    nodes = list(root.iter())
    parents = {child: parent for parent in nodes for child in parent}
    indices = {node: index for index, node in enumerate(nodes)}
    paragraphs = {node: index + 1 for index, node in enumerate(root.iter(PARA + 'p'))}
    begins = list(root.iter(PARA + 'fieldBegin'))
    ends = list(root.iter(PARA + 'fieldEnd'))
    ids = {}
    for begin in begins:
        ids.setdefault(begin.get('id'), []).append(begin)
    matched = set()
    issues = []
    for end in ends:
        reference = end.get('beginIDRef')
        candidates = ids.get(reference, []) if reference is not None else []
        if len(candidates) != 1:
            issues.append('ambiguous_or_missing_begin')
        elif indices[candidates[0]] >= indices[end]:
            issues.append('forward_reference')
        elif candidates[0] in matched:
            issues.append('duplicate_end')
        else:
            matched.add(candidates[0])
    unresolved = []
    for begin in begins:
        if begin in matched:
            continue
        ancestor = begin
        paragraph = None
        owner = None
        while ancestor in parents:
            ancestor = parents[ancestor]
            if paragraph is None:
                paragraph = paragraphs.get(ancestor)
            if ancestor.tag == PARA + 'subList':
                owner = ancestor
                break
        owner_nodes = set(owner.iter()) if owner is not None else set()
        unresolved.append({
            'id': begin.get('id'), 'type': begin.get('type'),
            'paragraph': paragraph, 'element': indices[begin],
            'owner': 'subList' if owner is not None else 'section',
            'owner_element': indices[owner] if owner is not None else 0,
            'owner_paragraphs': [number for node, number in paragraphs.items()
                                 if node in owner_nodes],
        })
    return {'begins': len(begins), 'ends': len(ends), 'link_issues': issues,
            'unmatched': unresolved, 'evidence': 'XML ancestry only; no semantic end or editing permission'}


def inspect_file(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError('duplicate ZIP entry')
        sections = sorted(name for name in names if re.fullmatch(r'Contents/section[0-9]+\.xml', name))
        if not sections:
            raise ValueError('missing section XML')
        return {'path': path, 'sections': [{'part': name, **inspect_section(archive.read(name))}
                                          for name in sections]}


if __name__ == '__main__':
    for path in sys.argv[1:]:
        print(json.dumps(inspect_file(path), ensure_ascii=False))
