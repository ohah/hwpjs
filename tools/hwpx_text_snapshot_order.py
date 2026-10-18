"""Independent ElementTree event-order oracle shared by section and master-page surveys."""

PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
SWITCH = PARA + "switch"
CASE = PARA + "case"
DEFAULT = PARA + "default"
RUN = PARA + "run"
CHART = "http://www.hancom.co.kr/hwpml/2016/ooxmlchart"
INLINE = {
    PARA + name: index
    for index, name in enumerate(("tab", "fwSpace", "nbSpace", "lineBreak", "titleMark", "markpenBegin", "markpenEnd", "hypen"))
}


def require(condition, detail):
    if not condition:
        raise AssertionError(detail)


def ordered_children(node, parent, in_text, mode):
    children = list(node)
    if mode != "raw" and not in_text and node.tag == SWITCH:
        children = [child for child in children if isinstance(child.tag, str)]
        require(parent == RUN, ("unmodeled switch parent", parent))
        require(len(children) == 2 and children[0].tag == CASE and children[1].tag == DEFAULT, "unmodeled switch children")
        require(children[0].get(PARA + "required-namespace") == CHART, "unmodeled switch requirement")
        return [children[0] if mode == "selected_chart" else children[1]]
    return children


def selected_paragraphs(root, mode="selected_default"):
    """Return source nodes in the observed selected event order, without rewriting XML."""
    require(mode in ("raw", "selected_default", "selected_chart"), "unmodeled paragraph selection")
    result = []

    def visit(node, in_text=False, parent=None):
        if not in_text and node.tag == PARA + "p":
            result.append(node)
        owns_text = in_text or node.tag == PARA + "t"
        for child in ordered_children(node, parent, in_text, mode):
            visit(child, owns_text, node.tag)

    visit(root)
    return result


def update_ordered(root, result, payload, counts, mode):
    """Append hp:t bytes and canonical boundary events for one XML subtree.

    counts is [parts, paragraphs, runs, hp:t, empty hp:t, UTF-8 bytes].
    The caller owns part selection and may call once per section or subList.
    """

    def content(value):
        if value is not None:
            encoded = value.encode("utf-8")
            payload.extend(encoded)
            counts[5] += len(encoded)
            for byte in encoded:
                result.update(bytes((9, byte)))

    def visit(node, in_text=False, parent=None):
        if in_text:
            kind = INLINE.get(node.tag, 8)
            result.update(bytes((7, kind)))
        elif node.tag == PARA + "p":
            counts[1] += 1
            result.update(b"\x01")
        elif node.tag == RUN:
            counts[2] += 1
            result.update(b"\x03")
        elif node.tag == PARA + "t":
            counts[3] += 1
            result.update(b"\x05")
        owns_text = in_text or node.tag == PARA + "t"
        before_text = len(payload)
        if owns_text:
            content(node.text)
        for child in ordered_children(node, parent, in_text, mode):
            visit(child, owns_text, node.tag)
            if owns_text:
                content(child.tail)
        if in_text:
            result.update(bytes((8, kind)))
        elif node.tag == PARA + "p":
            result.update(b"\x02")
        elif node.tag == RUN:
            result.update(b"\x04")
        elif node.tag == PARA + "t":
            counts[4] += len(payload) == before_text
            result.update(b"\x06")

    visit(root)
