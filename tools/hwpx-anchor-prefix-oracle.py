"""Independent whole-section/other-part check for a direct-run prefix edit."""
import base64
import io
import json
from pathlib import Path
import runpy
import sys
import zipfile
import xml.etree.ElementTree as ET
selected_paragraphs = runpy.run_path(str(Path(__file__).with_name('hwpx_text_snapshot_order.py')))['selected_paragraphs']


def signature(element):
    return (element.tag, sorted(element.attrib.items()), element.text,
            element.tail, [signature(child) for child in element])


def verify(data):
    before = zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before'])))
    after = zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after'])))
    if before.namelist() != after.namelist() or before.comment != after.comment:
        raise ValueError('ZIP inventory')
    if before.testzip() is not None or after.testzip() is not None:
        raise ValueError('ZIP CRC')
    part = 'Contents/section%d.xml' % data['section']
    if type(data['section']) is not int or data['section'] < 0:
        raise ValueError('section index')
    if type(data['paragraph']) is not int or data['paragraph'] < 1:
        raise ValueError('paragraph index')
    paragraph_index = data['paragraph'] - 1
    scope = data.get('paragraphScope', 'section')
    if scope not in ('section', 'document'):
        raise ValueError('paragraph scope')
    if scope == 'document':
        for section in range(data['section']):
            previous = 'Contents/section%d.xml' % section
            if before.namelist().count(previous) != 1:
                raise ValueError('document paragraph section inventory')
            paragraph_index -= len(selected_paragraphs(ET.fromstring(before.read(previous))))
    if before.namelist().count(part) != 1 or after.namelist().count(part) != 1:
        raise ValueError('target section inventory')
    namespace = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
    for name in before.namelist():
        if name != part:
            if before.read(name) != after.read(name):
                raise ValueError('non-target payload ' + name)
            continue
        parser = lambda: ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True))
        expected = ET.fromstring(before.read(name), parser=parser())
        actual = ET.fromstring(after.read(name), parser=parser())
        paragraphs = selected_paragraphs(expected)
        if paragraph_index < 0 or paragraph_index >= len(paragraphs):
            raise ValueError('paragraph index')
        paragraph = paragraphs[paragraph_index]
        if data.get('mode') == 'after_leading_line_break':
            runs = paragraph.findall(namespace + 'run')
            if not runs or not len(runs[0]) or runs[0][0].tag != namespace + 't':
                raise ValueError('missing leading text')
            text = runs[0][0]
            if len(text) != 1 or text[0].tag != namespace + 'lineBreak' or len(text[0]) or text[0].text is not None or text.text:
                raise ValueError('ambiguous leading line break')
            text[0].tail = data['text'] + (text[0].tail or '')
        elif data.get('mode') == 'metadata_run':
            runs = paragraph.findall(namespace + 'run')
            if not runs:
                raise ValueError('missing metadata run')
            settings = tuple(namespace + name for name in ('colPr', 'bookmark', 'pageNum', 'pageHiding', 'newNum', 'header', 'footer'))
            for run in runs:
                if not len(run):
                    raise ValueError('existing empty run affinity')
                for node in run:
                    if node.tag == namespace + 'secPr':
                        continue
                    if node.tag != namespace + 'ctrl' or not len(node) or any(child.tag not in settings for child in node):
                        raise ValueError('uncovered metadata content')
            text = ET.Element(namespace + 't')
            text.text = data['text']
            text.tail = runs[0].text
            runs[0].text = None
            runs[0].insert(0, text)
        elif data.get('mode') == 'after_run_markpen':
            runs = paragraph.findall(namespace + 'run')
            if not runs or len(runs[0]) < 2:
                raise ValueError('missing marker and anchor')
            marker, anchor = runs[0][0], runs[0][1]
            if marker.tag != namespace + 'markpenBegin' or len(marker) or marker.text:
                raise ValueError('invalid leading markpen')
            if anchor.tag not in tuple(namespace + name for name in ('tbl', 'pic', 'container')):
                raise ValueError('uncovered marked anchor')
            text = ET.Element(namespace + 't')
            text.text = data['text']
            runs[0].insert(1, text)
        elif data.get('mode', 'direct_text') == 'anchored':
            candidates = [(run, index, node) for run in paragraph.findall(namespace + 'run')
                          for index, node in enumerate(list(run) or [None])
                          if node is None or (isinstance(node.tag, str) and node.tag != namespace + 'secPr' and not
                          (node.tag == namespace + 'bookmark' and not len(node) and not (node.text or '').strip()) and not
                          (node.tag == namespace + 'ctrl' and len(node) and not (node.text or '').strip() and
                           all(not (child.tail or '').strip() for child in node) and
                           all(child.tag in (namespace + 'colPr', namespace + 'header', namespace + 'footer') or
                               (child.tag in (namespace + 'newNum', namespace + 'pageNum', namespace + 'bookmark', namespace + 'pageHiding') and not len(child) and not (child.text or '').strip())
                               for child in node)))]
            if not candidates:
                raise ValueError('missing direct content')
            run, index, node = candidates[0]
            if node is None:
                if run.text:
                    raise ValueError('ambiguous empty run')
                text = ET.SubElement(run, namespace + 't')
                text.text = data['text']
            elif node.tag == namespace + 't':
                node.text = data['text'] + (node.text or '')
            else:
                text = ET.Element(namespace + 't')
                text.text = data['text']
                run.insert(index, text)
        elif data.get('mode', 'direct_text') in ('direct_text', 'plain_text'):
            if data.get('mode') == 'plain_text':
                text = None
                for run in paragraph.findall(namespace + 'run'):
                    if len(run) == 0:
                        if run.text:
                            raise ValueError('ambiguous empty run')
                        text = ET.SubElement(run, namespace + 't')
                        break
                    texts = run.findall(namespace + 't')
                    if texts:
                        text = texts[0]
                        break
                if text is None:
                    raise ValueError('missing plain text source owner')
            else:
                texts = [t for run in paragraph.findall(namespace + 'run')
                         for t in run.findall(namespace + 't')]
                if not texts:
                    raise ValueError('missing direct text')
                text = texts[0]
            text.text = data['text'] + (text.text or '')
        else:
            raise ValueError('unknown prefix mode')
        if signature(expected) != signature(actual):
            raise ValueError('complete XML mismatch')


if __name__ == '__main__':
    verify(json.load(sys.stdin))
