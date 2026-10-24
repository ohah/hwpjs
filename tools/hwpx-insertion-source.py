"""Independent source-only prefix ownership, shared by routing and verification."""
import re
P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'

def zero_width_control(control):
    if control.tag != P + 'ctrl' or len(control) != 1 or (control.text or '').strip() or (control[0].tail or '').strip():
        return False
    child = control[0]
    if child.tag == P + 'colPr':
        return True
    if child.tag == P + 'pageNum':
        return not len(child) and not (child.text or '').strip()
    # A field marker is not its label. Admit only the observed hyperlink
    # parameter grammar; the complete marker remains byte/structure checked.
    if child.tag != P + 'fieldBegin' or child.get('type') != 'HYPERLINK' or (child.text or '').strip():
        return False
    for parameters in child:
        if parameters.tag != P + 'parameters' or (parameters.text or '').strip() or (parameters.tail or '').strip():
            return False
        for value in parameters:
            if value.tag not in (P + 'stringParam', P + 'integerParam', P + 'booleanParam') or len(value) or (value.tail or '').strip():
                return False
    return True


def owned_prefix(paragraph):
    """Return a witnessed typed text slot, never inspect the edited output.

    Only metadata may precede the slot. A title-only t is skipped only when
    an immediately adjacent, locally paired BOOKMARK owns the following text.
    Unknown controls/inline content remain outside this proof boundary.
    """
    for run in paragraph.findall(P + 'run'):
        if not len(run) or (run.text or '').strip():
            return None
        nodes = list(run)
        for index, child in enumerate(nodes):
            if child.tag == P + 'secPr' or zero_width_control(child):
                continue
            if child.tag != P + 't' or child.text:
                return None
            if len(child) == 2:
                begin, end = child
                if (begin.tag == P + 'markpenBegin' and end.tag == P + 'markpenEnd'
                    and set(begin.attrib) == {'color'} and re.fullmatch(r'#[0-9A-Fa-f]{6}', begin.get('color', ''))
                    and not len(begin) and not begin.text and begin.tail is not None
                    and not len(end) and not end.attrib and not end.text and not end.tail):
                    return ('markpen-owned-prefix', begin, 'tail')
            if len(child) != 1:
                return None
            title = child[0]
            if (title.tag != P + 'titleMark' or title.attrib != {'ignore': '1'}
                or len(title) or title.text or title.tail or index + 3 >= len(nodes)):
                return None
            begin_wrapper, text, end_wrapper = nodes[index + 1:index + 4]
            if (begin_wrapper.tag != P + 'ctrl' or len(begin_wrapper) != 1 or begin_wrapper.text
                or end_wrapper.tag != P + 'ctrl' or len(end_wrapper) != 1 or end_wrapper.text
                or text.tag != P + 't' or len(text) or text.text is None):
                return None
            begin, end = begin_wrapper[0], end_wrapper[0]
            if (begin.tag != P + 'fieldBegin' or begin.get('type') != 'BOOKMARK'
                or not re.fullmatch(r'[0-9]+', begin.get('id', '')) or not re.fullmatch(r'[0-9]+', begin.get('fieldid', ''))
                or end.tag != P + 'fieldEnd' or len(end) or end.text
                or end.get('beginIDRef') != begin.get('id') or end.get('fieldid') != begin.get('fieldid')
                or begin.text or begin.tail or end.tail
                or any((node.tail or '').strip() for node in (child, begin_wrapper, text, end_wrapper))):
                return None
            for parameters in begin:
                if parameters.tag != P + 'parameters' or (parameters.text or '').strip() or (parameters.tail or '').strip():
                    return None
                for value in parameters:
                    if value.tag not in (P + 'stringParam', P + 'integerParam', P + 'booleanParam') or len(value) or (value.tail or '').strip():
                        return None
            return ('bookmark-owned-prefix', text, 'text')
    return None
