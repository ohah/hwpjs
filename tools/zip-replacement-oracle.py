"""Independent ZIP decoder comparison; no generated files are written."""
import io
import pathlib
import struct
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile


def main():
    edit_text = "--text-edit" in sys.argv[1:]
    test_name = "HWPX text editing corpus oracle output" if edit_text else "ZIP replacement corpus oracle output"
    process = subprocess.run(
        ["zig", "test", "src/zip_replacement_survey.zig", "-O", "ReleaseSafe",
         "--test-filter", test_name],
        capture_output=True,
    )
    if process.returncode:
        sys.stderr.buffer.write(process.stderr)
        process.check_returncode()
    data = process.stdout
    cursor = 0
    seen = set()
    total_entries = 0
    while cursor < len(data):
        name_size, size = struct.unpack_from("<II", data, cursor)
        cursor += 8
        name = data[cursor:cursor + name_size].decode("utf-8")
        cursor += name_size
        output = data[cursor:cursor + size]
        cursor += size
        if len(output) != size or name in seen:
            raise ValueError("Truncated or duplicate survey record")
        seen.add(name)
        path = pathlib.Path("legacy/rust/crates/hwp-core/tests/fixtures") / name
        with zipfile.ZipFile(path) as original, zipfile.ZipFile(io.BytesIO(output)) as result:
            if result.testzip() is not None or original.namelist() != result.namelist():
                raise ValueError(f"ZIP integrity/order mismatch: {name}")
            for entry in original.infolist():
                expected = original.read(entry.filename)
                if entry.filename == "Contents/section0.xml":
                    if edit_text:
                        compare_text_edit(expected, result.read(entry.filename))
                    else:
                        expected += "<!--ZIP replacement 한😀-->".encode()
                        ET.fromstring(result.read(entry.filename))
                if not (edit_text and entry.filename == "Contents/section0.xml") and result.read(entry.filename) != expected:
                    raise ValueError(f"Payload mismatch: {name}/{entry.filename}")
                current = result.getinfo(entry.filename)
                for field in ("compress_type", "date_time", "extra", "comment", "external_attr", "internal_attr", "create_system"):
                    if getattr(entry, field) != getattr(current, field):
                        raise ValueError(f"Metadata mismatch: {name}/{entry.filename}/{field}")
                total_entries += 1
            if original.comment != result.comment:
                raise ValueError(f"Archive comment mismatch: {name}")
    tracked = subprocess.run(
        ["git", "ls-files", "legacy/rust/crates/hwp-core/tests/fixtures/*.hwpx"],
        capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    expected_files = {pathlib.Path(path).name for path in tracked}
    expected_files.discard("password-12345.hwpx")
    if cursor != len(data) or seen != expected_files or len(seen) != 44:
        raise ValueError("Incomplete corpus")
    print(f"Independent {'text edit' if edit_text else 'ZIP replacement'}: {len(seen)} files, {total_entries} entries verified")


def compare_text_edit(before, after):
    parser = lambda: ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True))
    original = ET.fromstring(before, parser=parser())
    current = ET.fromstring(after, parser=parser())
    text_tag = "{http://www.hancom.co.kr/hwpml/2011/paragraph}t"
    found = False
    for element in original.iter(text_tag):
        if not list(element) and not element.text:
            element.text = "검증😀<&\r"
            found = True
            break
        if element.text:
            element.text = "검증😀<&\r" + element.text
            found = True
            break
        for child in element:
            if child.tail:
                child.tail = "검증😀<&\r" + child.tail
                found = True
                break
        if found:
            break
    if not found or ET.tostring(original) != ET.tostring(current):
        raise ValueError("Edited XML differs from independently derived text insertion")


def self_test():
    prefix = "<r xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>"
    before = (prefix + "<p:t a='1'>A<!--keep--></p:t><p:t>B</p:t></r>").encode()
    valid = (prefix + "<p:t a='1'>검증😀&lt;&amp;&#13;A<!--keep--></p:t><p:t>B</p:t></r>").encode()
    compare_text_edit(before, valid)
    mutations = [
        valid.replace(b"<!--keep-->", b"<!--changed-->"),
        valid.replace(b"a='1'", b"a='2'"),
        valid.replace(b"<p:t>B</p:t>", b"<p:t>C</p:t>"),
        valid.replace(b"&#13;", b"\n"),
        before,
    ]
    for changed in mutations:
        try:
            compare_text_edit(before, changed)
        except ValueError:
            continue
        raise ValueError("Oracle accepted a corrupted edit")
    empty = (prefix + "<p:t a='1'/></r>").encode()
    expanded = (prefix + "<p:t a='1'>검증😀&lt;&amp;&#13;</p:t></r>").encode()
    compare_text_edit(empty, expanded)
    print("Independent text edit oracle: valid/empty cases and five corruptions verified")


if __name__ == "__main__":
    if "--self-test" in sys.argv[1:]:
        self_test()
    else:
        main()
