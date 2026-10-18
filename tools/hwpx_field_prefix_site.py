"""Independent source-only selection of a field's leading object boundary."""
import xml.etree.ElementTree as ET

P = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"


def leading_object_site(tree, begin, text):
    parents = {child: parent for parent in tree.iter() for child in parent}
    paragraph = parents.get(text)
    while paragraph is not None and paragraph.tag != P + "p":
        paragraph = parents.get(paragraph)
    if paragraph is None:
        return text
    runs = paragraph.findall(P + "run")
    selected = None
    for run in runs:
        if len(run) == 0:
            return text
        for child in run:
            if child.tag in (P + "tbl", P + "pic", P + "container", P + "ellipse", P + "line"):
                selected = (run, child)
                break
            # Only known zero-width source metadata may precede offset zero.
            # Text (including an empty site), notes and unknown controls stop us.
            if not isinstance(child.tag, str) or child.tag == P + "secPr":
                continue
            if child.tag == P + "ctrl" and all(node.tag in (P + "fieldBegin", P + "fieldEnd", P + "colPr") for node in child):
                continue
            return text
        if selected is not None:
            break
    if selected is None:
        return text
    run, anchor = selected
    elements = list(tree.iter())
    ends = [node for node in elements if node.tag == P + "fieldEnd"
            and node.get("beginIDRef") == begin.get("id")]
    if len(ends) != 1 or not (elements.index(begin) < elements.index(anchor)
                              < elements.index(ends[0])):
        raise ValueError("Leading object is outside selected field")
    # Display offset zero precedes the protected object's one-unit boundary;
    # the first existing text after the object is not that position.
    inserted = ET.Element(P + "t")
    run.insert(list(run).index(anchor), inserted)
    return inserted
