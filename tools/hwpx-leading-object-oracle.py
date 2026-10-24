"""JSON adapter for the independent leading-object slot model.

select never inspects after/text. sectionIndex uses selected_default order;
identity mapping, not XML IDs/equality, binds it to a direct section paragraph.
CLI exits: supported/unsupported/verified=0, mismatch=1, invalid input=2.
"""
import base64
import binascii
from dataclasses import asdict
import json
import sys
import zipfile
import zlib
import xml.etree.ElementTree as ET
from xml.parsers.expat import ExpatError

import hwpx_leading_object_slots as model
from hwpx_text_snapshot_order import selected_paragraphs

KIND = 'leading-object-slot'
P = '{' + model.PARA + '}'


class InputError(ValueError):
    def __init__(self, code, detail):
        super().__init__(detail)
        self.code = code


def invalid(code, detail):
    raise InputError(code, detail)


def decode_blob(value, field):
    if not isinstance(value, str) or len(value) > 4 * ((model.MAX_INPUT + 2) // 3):
        invalid('InvalidBase64', field + ': invalid type/size')
    try:
        data = base64.b64decode(value, validate=True)
        if base64.b64encode(data).decode('ascii') != value:
            invalid('InvalidBase64', field + ': noncanonical encoding')
        return data
    except (ValueError, binascii.Error) as error:
        if isinstance(error, InputError):
            raise
        invalid('InvalidBase64', field + ': ' + str(error))


def checked_zip(data, field):
    try:
        # Model entry point validates every raw compressed member, including
        # bytes ZipExtFile would hide past its declared uncompressed size.
        return model.open_zip(data)
    except (ValueError, UnicodeError, zipfile.BadZipFile, RuntimeError, NotImplementedError, EOFError, OSError, zlib.error) as error:
        invalid('InvalidZIP', field + ': ' + str(error))


def checked_xml(data, field):
    document = None
    try:
        document = model.parse_xml(data)
        return ET.fromstring(data, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True)))
    except (ValueError, UnicodeError, LookupError, ExpatError, ET.ParseError) as error:
        invalid('InvalidXML', field + ': ' + str(error))
    finally:
        if document is not None:
            document.unlink()


def unsupported(reason, detail):
    return {'state': 'unsupported', 'kind': KIND, 'reason': reason, 'detail': detail}


def source_selection(payload, before):
    section, index = payload['section'], payload['sectionIndex']
    part = f'Contents/section{section}.xml'
    with checked_zip(before, 'before') as package:
        if part not in package.namelist():
            invalid('InvalidSectionCoordinate', 'Missing section part: ' + part)
        if package.getinfo(part).file_size > model.MAX_XML:
            invalid('InvalidXML', 'before: XML size limit')
        raw = package.read(part)
    root = checked_xml(raw, 'before')
    try:
        selected = selected_paragraphs(root, 'selected_default')
    except AssertionError as error:
        return unsupported('UnsupportedSelectionGrammar', str(error))
    if index >= len(selected):
        invalid('InvalidSectionIndex', 'sectionIndex exceeds selected_default paragraphs')
    chosen = selected[index]
    # Never use XML id or structural equality: nested rows may have identical IDs.
    direct = [child for child in root if child.tag == P + 'p']
    direct_index = next((at for at, child in enumerate(direct) if child is chosen), None)
    if direct_index is None:
        return unsupported('NestedParagraph', 'Selected source paragraph is not a direct section child')
    document = model.parse_xml(raw)
    try:
        # Supply a SOURCE-derived candidate count solely to validate model grammar.
        # The model remains the sole acceptance gate for ordering/types/ownership.
        dom_paragraphs = [c for c in model.elements(document.documentElement) if model.qname(c, model.PARA, 'p')]
        candidate = sum(1 for run in model.elements(dom_paragraphs[direct_index]) if model.qname(run, model.PARA, 'run')
                        for child in model.elements(run) if child.namespaceURI == model.PARA and child.localName in model.OBJECTS)
        try:
            slot, _ = model.select_slot(document, section, direct_index, max(1, min(model.MAX_OBJECTS, candidate)))
        except ValueError as error:
            return unsupported('UnsupportedSlotGrammar', str(error))
    except ValueError as error:
        return unsupported('UnsupportedSlotGrammar', str(error))
    finally:
        document.unlink()
    if payload['startUnit'] != slot.start_unit:
        invalid('InvalidStartUnit', 'startUnit must equal the source leading object count')
    return {'state': 'supported', 'kind': KIND, 'section': section, 'sectionIndex': index,
            'directIndex': direct_index, 'slot': asdict(slot)}


def process(payload):
    if not isinstance(payload, dict) or set(payload) - {'before','after','section','sectionIndex','startUnit','text','action'}:
        invalid('InvalidPayload', 'Expected insertion oracle payload')
    if not {'before','section','sectionIndex','startUnit','action'} <= set(payload):
        invalid('InvalidPayload', 'Missing source coordinate/action')
    if payload['action'] not in ('select','verify'):
        invalid('InvalidAction', 'Expected select or verify')
    for key in ('section','sectionIndex','startUnit'):
        if type(payload[key]) is not int or not 0 <= payload[key] <= 0xffffffff:
            invalid('InvalidCoordinate', key + ': expected nonnegative u32')
    before = decode_blob(payload['before'], 'before')
    selected = source_selection(payload, before)
    if selected['state'] != 'supported' or payload['action'] == 'select':
        return selected  # after/text are deliberately never read here.
    if 'after' not in payload:
        invalid('InvalidPayload', 'verify requires after')
    if not isinstance(payload.get('text'), str) or not payload['text']:
        invalid('InvalidExpectedText', 'verify requires nonempty text')
    try:
        payload['text'].encode('utf-8', errors='strict')
    except UnicodeError as error:
        invalid('InvalidExpectedText', str(error))
    after = decode_blob(payload['after'], 'after')
    with checked_zip(after, 'after') as package:
        part = selected['slot']['part']
        if part in package.namelist():
            checked_xml(package.read(part), 'after')
    try:
        result = model.verify(before, after, section=payload['section'], paragraph_index=selected['directIndex'],
                              start_unit=payload['startUnit'], text=payload['text'])
    except ValueError as error:
        # Only output comparison failures become mismatches, never unsupported.
        if str(error) in ('ZIP inventory/order changed','ZIP comment changed','Complete XML mismatch','Non-target payload changed') or str(error).startswith('ZIP metadata changed: '):
            return {**selected, 'state': 'mismatch', 'verified': False, 'error': 'LeadingObjectMismatch', 'detail': str(error)}
        invalid('OracleVerificationError', str(error))
    return {**selected, 'state': 'verified', 'verified': True, 'verification': result}


def handle(payload):
    try:
        return process(payload)
    except InputError as error:
        return {'state': 'error', 'kind': KIND, 'error': error.code, 'detail': str(error)}
    except MemoryError:
        return {'state': 'error', 'kind': KIND, 'error': 'OutOfMemory', 'detail': 'Allocation failed'}


def main():
    try:
        payload = json.load(sys.stdin)
    except (ValueError, UnicodeError) as error:
        result = {'state':'error','kind':KIND,'error':'InvalidJSON','detail':str(error)}
    else:
        result = handle(payload)
    print(json.dumps(result, ensure_ascii=False))
    return 2 if result['state'] == 'error' else 1 if result['state'] == 'mismatch' else 0


if __name__ == '__main__':
    sys.exit(main())
