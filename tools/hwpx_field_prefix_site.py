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
    if not runs or not len(runs[0]):
        return text
    anchor = runs[0][0]
    if anchor.tag not in (P + "tbl", P + "pic", P + "container"):
        return text
    elements = list(tree.iter())
    ends = [node for node in elements if node.tag == P + "fieldEnd"
            and node.get("beginIDRef") == begin.get("id")]
    if len(ends) != 1 or not (elements.index(begin) < elements.index(anchor)
                              < elements.index(ends[0])):
        raise ValueError("Leading object is outside selected field")
    # Display offset zero precedes the protected object's one-unit boundary;
    # the first existing text after the object is not that position.
    inserted = ET.Element(P + "t")
    runs[0].insert(0, inserted)
    return inserted
