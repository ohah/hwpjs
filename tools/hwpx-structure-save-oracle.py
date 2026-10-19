"""Independent XML/ZIP comparison for the native structural save survey."""
import copy
import io
import pathlib
import struct
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

P = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"


def parse(data):
    return ET.fromstring(data, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True)))


def normalize_empty_sites(root):
    # Removing continuation metadata may expose an empty run input site.
    # Only attribute-free, content-free t nodes are equivalent here.
    for element in root.iter():
        for child in list(element):
            if child.tag == P + "t" and not child.attrib and not list(child) and not child.text and not child.tail:
                element.remove(child)


def owned_nodes(paragraph):
    yield paragraph
    for child in paragraph:
        if child.tag != P + "p":
            yield from owned_nodes(child)


def compare_xml(before, after, paragraph_index, generated_id):
    expected = parse(before)
    actual = parse(after)
    paragraphs = list(expected.iter(P + "p"))
    original = paragraphs[paragraph_index]
    parent = next(node for node in expected.iter() if original in list(node))
    right = copy.deepcopy(original)
    original_tail = original.tail
    original.tail = None
    right.tail = original_tail
    right.set("id", str(generated_id))
    for flag in ("pageBreak", "columnBreak"):
        if right.get(flag) in ("1", "true"):
            right.set(flag, "0")
    for node in owned_nodes(original):
        if node.tag == P + "t":
            node.text = None
            for child in node:
                child.tail = None
    for paragraph, continuation in ((original, False), (right, True)):
        for node in list(owned_nodes(paragraph)):
            for child in list(node):
                if child.tag == P + "linesegarray" or (continuation and child.tag in (P + "secPr", P + "ctrl")):
                    node.remove(child)
    parent.insert(list(parent).index(original) + 1, right)
    normalize_empty_sites(expected)
    normalize_empty_sites(actual)
    if ET.tostring(expected) != ET.tostring(actual):
        raise ValueError("Full XML differs from independently derived start split")


def main():
    self_test()
    process = subprocess.run(["zig", "test", "src/hwpx_structure_save_survey.zig", "-O", "ReleaseSafe", "--test-filter", "independent oracle output"], capture_output=True)
    if process.returncode:
        raise RuntimeError(process.stderr.decode())
    data = process.stdout
    cursor = 0
    seen = set()
    count = 0
    while cursor < len(data):
        name_size, size, entry_index, paragraph_index, generated_id, section = struct.unpack_from("<6I", data, cursor)
        cursor += 24
        name = data[cursor:cursor + name_size].decode()
        cursor += name_size
        output = data[cursor:cursor + size]
        cursor += size
        if len(output) != size or (name, section) in seen:
            raise ValueError("Truncated or duplicate record")
        seen.add((name, section))
        path = pathlib.Path("legacy/rust/crates/hwp-core/tests/fixtures") / (name + ".hwpx")
        with zipfile.ZipFile(path) as before, zipfile.ZipFile(io.BytesIO(output)) as after:
            if before.namelist() != after.namelist() or after.testzip() is not None:
                raise ValueError("ZIP order or integrity mismatch")
            for index, entry in enumerate(before.infolist()):
                old = before.read(entry.filename)
                new = after.read(entry.filename)
                if index == entry_index:
                    compare_xml(old, new, paragraph_index, generated_id)
                elif old != new:
                    raise ValueError("Non-target entry changed: " + entry.filename)
                current = after.getinfo(entry.filename)
                for field in ("compress_type", "date_time", "extra", "comment", "external_attr", "internal_attr", "create_system"):
                    if getattr(entry, field) != getattr(current, field):
                        raise ValueError(f"ZIP metadata changed: {entry.filename}/{field}")
            if before.comment != after.comment:
                raise ValueError("Archive comment changed")
        count += 1
    if cursor != len(data) or {name for name, _ in seen} != {"charshape", "table", "table-bug"}:
        raise ValueError("Incomplete fixture coverage")
    print(f"Independent structure save: {count} sections, full XML and non-target ZIP entries verified")


def self_test():
    prefix = b"<s xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>"
    before = prefix + b"<p:p id='1'><p:run charPrIDRef='3'><p:t>A</p:t></p:run></p:p><p:p id='9'/></s>"
    valid = prefix + b"<p:p id='1'><p:run charPrIDRef='3'><p:t/></p:run></p:p><p:p id='2'><p:run charPrIDRef='3'><p:t>A</p:t></p:run></p:p><p:p id='9'/></s>"
    compare_xml(before, valid, 0, 2)
    for mutant in (before, valid.replace(b">A<", b">B<"), valid.replace(b"id='2'", b"id='4'"), valid.replace(b"charPrIDRef='3'", b"charPrIDRef='8'"), valid.replace(b"id='9'", b"id='10'")):
        try:
            compare_xml(before, mutant, 0, 2)
        except ValueError:
            continue
        raise ValueError("Oracle accepted a corrupted structural save")

    nested = b"<p:ctrl><p:header><p:subList><p:p id='8'><p:run><p:t>HEAD</p:t></p:run><p:linesegarray><p:lineseg textpos='7'/></p:linesegarray></p:p></p:subList></p:header></p:ctrl>"
    opening = b"<p:p id='1'><p:run charPrIDRef='3'>"
    before = prefix + opening + b"<p:t>A</p:t>" + nested + b"</p:run><p:linesegarray/></p:p></s>"
    valid = prefix + opening + b"<p:t/>" + nested + b"</p:run></p:p><p:p id='2'><p:run charPrIDRef='3'><p:t>A</p:t></p:run></p:p></s>"
    compare_xml(before, valid, 0, 2)
    for mutant in (valid.replace(b"HEAD", b"LOST"), valid.replace(b"<p:lineseg textpos='7'/>", b""), valid.replace(b"id='8'", b"id='9'")):
        try:
            compare_xml(before, mutant, 0, 2)
        except ValueError:
            continue
        raise ValueError("Oracle accepted corrupted nested paragraph ownership")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
        print("Structural oracle: plain/nested splits and eight corruption cases verified")
    else:
        main()
