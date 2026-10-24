"""Independent bounded source-only model for a direct leading-object slot.

No source hashes, filenames, product/oracle imports, layout-width conversions,
branch selection, or object-payload interpretation decide acceptance.
paragraph_index addresses direct section paragraphs, NOT flattened nested ones.
"""
from dataclasses import asdict, dataclass
import hashlib
from xml.parsers import expat

import hwpx_zip_integrity
from xml.dom import Node, minidom

PARA = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
SECTION = 'http://www.hancom.co.kr/hwpml/2011/section'
XMLNS = 'http://www.w3.org/2000/xmlns/'
OBJECTS = frozenset(('tbl', 'line', 'rect'))
MAX_INPUT = 64 * 1024 * 1024
MAX_EXPANDED = 128 * 1024 * 1024
MAX_XML = 16 * 1024 * 1024
MAX_OBJECTS = 1024
MAX_XML_DEPTH = 128
MAX_XML_NODES = 1_000_000

# Observed, explicit no-text metadata grammar. Values are preserved, not used
# to infer widths. New metadata node/attribute types require a separate review.
META = {
 'secPr': ('grid startNum visibility lineNumberShape pagePr footNotePr endNotePr pageBorderFill pageBorderFill pageBorderFill', 'id textDirection spaceColumns tabStop outlineShapeIDRef memoShapeIDRef textVerticalWidthHead masterPageCnt'),
 'grid': ('', 'lineGrid charGrid wonggojiFormat'),
 'startNum': ('', 'pageStartsOn page pic tbl equation'),
 'visibility': ('', 'hideFirstHeader hideFirstFooter hideFirstMasterPage border fill hideFirstPageNum hideFirstEmptyLine showLineNumber'),
 'lineNumberShape': ('', 'restartType countBy distance startNumber'),
 'pagePr': ('margin', 'landscape width height gutterType'),
 'margin': ('', 'left right top bottom header footer gutter'),
 'footNotePr': ('autoNumFormat noteLine noteSpacing numbering placement', ''),
 'endNotePr': ('autoNumFormat noteLine noteSpacing numbering placement', ''),
 'autoNumFormat': ('', 'type userChar prefixChar suffixChar supscript'),
 'noteLine': ('', 'length type width color'),
 'noteSpacing': ('', 'betweenNotes belowLine aboveLine'),
 'numbering': ('', 'type newNum'),
 'placement': ('', 'place beneathText'),
 'pageBorderFill': ('offset', 'type borderFillIDRef textBorder headerInside footerInside fillArea'),
 'offset': ('', 'left right top bottom'),
 'ctrl': ('colPr', ''),
 'colPr': ('', 'id type layout colCount sameSz sameGap'),
}


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def qname(node, uri, local):
    return node.nodeType == Node.ELEMENT_NODE and node.namespaceURI == uri and node.localName == local


def elements(node):
    result = []
    for child in node.childNodes:
        if child.nodeType == Node.ELEMENT_NODE:
            result.append(child)
        else:
            require(child.nodeType == Node.TEXT_NODE and not child.data.strip(), 'Unmodeled mixed content')
    return result


def attrs(node, allowed, required=()):
    actual = set()
    for item in node.attributes.values():
        if item.namespaceURI == XMLNS:
            continue
        require(item.namespaceURI is None and item.name in allowed, 'Unknown or namespaced attribute')
        actual.add(item.name)
    require(set(required) <= actual, 'Missing required attribute')


def metadata(node):
    require(node.namespaceURI == PARA and node.localName in META, 'Unknown metadata element/namespace')
    children, attributes = META[node.localName]
    attrs(node, set(attributes.split()))
    nodes = elements(node)
    require([n.localName if n.namespaceURI == PARA else None for n in nodes] == children.split(), 'Unknown metadata structure/order')
    if node.localName == 'colPr':
        require(all(node.getAttribute(k) == v for k,v in {'type':'NEWSPAPER','layout':'LEFT','colCount':'1','sameSz':'1','sameGap':'0'}.items()), 'Unobserved column metadata profile')
    for child in nodes:
        metadata(child)


def parse_xml(data):
    require(len(data) <= MAX_XML, 'XML size limit')
    text = data.decode('utf-8-sig', errors='strict')
    require('\x00' not in text and '<!DOCTYPE' not in text and '<!ENTITY' not in text, 'Unsupported XML declarations')
    # Enforce depth/node budgets while streaming, before minidom allocates a
    # recursive DOM. A rejected 1500-deep input never reaches DOM unlink().
    parser = expat.ParserCreate()
    depth, count = 0, 1
    in_text = False

    def visit(node_depth):
        nonlocal count
        count += 1
        require(node_depth <= MAX_XML_DEPTH and count <= MAX_XML_NODES, 'XML structure limit')

    def begin(name, attributes):
        nonlocal depth, in_text
        in_text = False
        depth += 1
        visit(depth)

    def end(name):
        nonlocal depth, in_text
        in_text = False
        depth -= 1

    def leaf(*unused):
        nonlocal in_text
        in_text = False
        visit(depth + 1)

    def character(data):
        nonlocal in_text
        # Expat may split one DOM text node across entity/chunk callbacks.
        if not in_text:
            visit(depth + 1)
        in_text = True

    def text_boundary():
        nonlocal in_text
        in_text = False

    def declaration(*unused):
        raise ValueError('Unsupported XML declarations')

    parser.StartElementHandler = begin
    parser.EndElementHandler = end
    parser.CharacterDataHandler = character
    parser.StartCdataSectionHandler = text_boundary
    parser.EndCdataSectionHandler = text_boundary
    parser.CommentHandler = leaf
    parser.ProcessingInstructionHandler = leaf
    parser.StartDoctypeDeclHandler = declaration
    parser.EntityDeclHandler = declaration
    try:
        parser.Parse(data, True)
        return minidom.parseString(data)
    except LookupError as error:
        raise ValueError('Unsupported XML encoding: ' + str(error)) from error


def open_zip(data):
    return hwpx_zip_integrity.open_zip(data, max_input=MAX_INPUT, max_expanded=MAX_EXPANDED)


@dataclass(frozen=True)
class Slot:
    part: str
    paragraph_index: int
    object_run: int
    text_child: int
    object_kinds: tuple
    start_unit: int
    metadata_present: bool
    coordinate_scope: str = 'direct-section-paragraph'
    text_offset: int = 0


def select_slot(document, section, paragraph_index, start_unit):
    require(type(section) is int and 0 <= section <= 0xffffffff, 'Invalid section')
    require(type(paragraph_index) is int and paragraph_index >= 0, 'Invalid direct paragraph index')
    require(type(start_unit) is int and 1 <= start_unit <= MAX_OBJECTS, 'Invalid leading slot coordinate')
    root = document.documentElement
    require(qname(root, SECTION, 'sec'), 'Invalid section namespace')
    paragraphs = elements(root)
    require(all(qname(p, PARA, 'p') for p in paragraphs), 'Non-paragraph section child')
    require(paragraph_index < len(paragraphs), 'Missing direct paragraph')
    paragraph = paragraphs[paragraph_index]
    attrs(paragraph, set('id paraPrIDRef styleIDRef pageBreak columnBreak merged'.split()))
    children = elements(paragraph)
    if children and qname(children[-1], PARA, 'linesegarray'):
        cache = children.pop()
        attrs(cache, set())
        for line in elements(cache):
            require(qname(line, PARA, 'lineseg'), 'Unmodeled layout cache child')
            attrs(line, set('textpos vertpos vertsize textheight baseline spacing horzpos horzsize flags'.split()))
            require(not elements(line), 'Unmodeled layout cache content')
    require(len(children) in (1, 2) and all(qname(c, PARA, 'run') for c in children), 'Unmodeled paragraph/run order')
    for run in children:
        attrs(run, {'charPrIDRef'}, {'charPrIDRef'})
    has_metadata = len(children) == 2
    if has_metadata:
        meta = elements(children[0])
        require(len(meta) == 2 and qname(meta[0], PARA, 'secPr') and qname(meta[1], PARA, 'ctrl'), 'Unmodeled metadata run')
        for node in meta:
            metadata(node)
    body = elements(children[-1])
    require(2 <= len(body) <= MAX_OBJECTS + 1, 'Missing/oversized leading object sequence')
    require(qname(body[-1], PARA, 't') and not body[-1].childNodes, 'Missing unique empty trailing text')
    attrs(body[-1], set())
    kinds = []
    for obj in body[:-1]:
        require(obj.namespaceURI == PARA and obj.localName in OBJECTS, 'Unsupported leading object/control namespace')
        require(all(a.namespaceURI in (None, XMLNS) for a in obj.attributes.values()), 'Namespaced object attribute')
        # Payload stays opaque and whole-tree checked. Never select chart branches.
        require(not obj.getElementsByTagNameNS(PARA, 'switch'), 'Unproven switch branch')
        kinds.append(obj.localName)
    require(start_unit == len(kinds), 'Leading object count mismatch')
    return Slot(f'Contents/section{section}.xml', paragraph_index, len(children)-1, len(kinds), tuple(kinds), start_unit, has_metadata), body[-1]


def locate(before, *, section, paragraph_index, start_unit):
    require(type(section) is int and 0 <= section <= 0xffffffff, 'Invalid section')
    with open_zip(before) as package:
        part = f'Contents/section{section}.xml'
        require(part in package.namelist(), 'Missing section part')
        require(package.getinfo(part).file_size <= MAX_XML, 'XML size limit')
        document = parse_xml(package.read(part))
    try:
        slot, _ = select_slot(document, section, paragraph_index, start_unit)
        return slot
    finally:
        document.unlink()


def signature(node):
    # Preserve document-level comments/PIs, all whitespace, attributes and order.
    # No control, opaque payload, cache, or non-target paragraph is skipped.
    if node.nodeType in (Node.DOCUMENT_NODE, Node.ELEMENT_NODE):
        attributes = tuple(sorted((a.namespaceURI or '', a.name, a.value) for a in node.attributes.values())) if node.nodeType == Node.ELEMENT_NODE else (node.version, node.encoding, node.standalone)
        return (node.nodeType, node.nodeName, attributes, tuple(signature(c) for c in node.childNodes))
    return (node.nodeType, node.nodeName, node.nodeValue)


def verify(before, after, *, section, paragraph_index, start_unit, text):
    require(isinstance(text, str) and bool(text), 'Invalid expected text')
    text.encode('utf-8', errors='strict')
    # Select from source BEFORE opening/inspecting after.
    slot = locate(before, section=section, paragraph_index=paragraph_index, start_unit=start_unit)
    with open_zip(before) as original, open_zip(after) as edited:
        require(original.namelist() == edited.namelist(), 'ZIP inventory/order changed')
        require(original.comment == edited.comment, 'ZIP comment changed')
        expected = parse_xml(original.read(slot.part))
        actual = None
        try:
            _, target = select_slot(expected, section, paragraph_index, start_unit)
            target.appendChild(expected.createTextNode(text))
            actual = parse_xml(edited.read(slot.part))
            require(signature(expected) == signature(actual), 'Complete XML mismatch')
            for name in original.namelist():
                if name != slot.part:
                    require(original.read(name) == edited.read(name), 'Non-target payload changed')
            for name in original.namelist():
                a, b = original.getinfo(name), edited.getinfo(name)
                for field in ('compress_type','date_time','extra','comment','external_attr','internal_attr','create_system','create_version','extract_version','flag_bits'):
                    require(getattr(a, field) == getattr(b, field), 'ZIP metadata changed: ' + field)
        finally:
            expected.unlink()
            if actual is not None:
                actual.unlink()
    return {'verified': True, 'slot': asdict(slot), 'source_sha256': hashlib.sha256(before).hexdigest(), 'scope': 'leading object slot only; opaque payload preserved, not interpreted'}
