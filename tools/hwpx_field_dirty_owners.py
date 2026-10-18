"""Determine nested field dirty owners from the original section order."""
P = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"


def mark_dirty_owners(tree, selected):
    elements = list(tree.iter())
    spans = []
    for index, node in enumerate(elements):
        if node.tag != P + "fieldBegin":
            continue
        ends = [end for end, other in enumerate(elements)
                if other.tag == P + "fieldEnd"
                and other.get("beginIDRef") == node.get("id")]
        if len(ends) != 1 or ends[0] <= index:
            if node is selected:
                raise ValueError("Ambiguous field dirty owner")
            continue
        spans.append((index, ends[0], node))
    start, end, _ = next(span for span in spans if span[2] is selected)
    for left, right, node in spans:
        if left < start < right < end or start < left < end < right:
            raise ValueError("Crossing field dirty owners")
        if left <= start and right >= end:
            # The caller's explicit fragment oracle validates the selected
            # field kind (including observed BOOKMARK metadata). Only inferred
            # ancestor permissions belong to this shared helper.
            if node is not selected and node.get("type") not in ("CLICK_HERE", "HYPERLINK", "BOOKMARK"):
                raise ValueError("Unsupported field dirty owner")
            node.set("dirty", "1")
