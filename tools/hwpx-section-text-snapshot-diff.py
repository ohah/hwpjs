#!/usr/bin/env python3
"""Independent XML text comparison for one tracked local HWPX fixture."""

import hashlib
import pathlib
import subprocess
import zipfile
import xml.etree.ElementTree as ET


ROOT = pathlib.Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "reference/rhwp/samples/issue2527_empty_linesegs.hwpx"
TEXT = "{http://www.hancom.co.kr/hwpml/2011/paragraph}t"


def main():
    with zipfile.ZipFile(FIXTURE) as archive:
        section = ET.fromstring(archive.read("Contents/section0.xml"))
    expected = "".join("".join(node.itertext()) for node in section.iter(TEXT)).encode("utf-8")
    result = subprocess.run(
        ["zig", "test", "src/hwpx_section_text_snapshot_survey.zig", "-O", "ReleaseFast", "--test-filter", "HWPX section text snapshot raw content"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    assert result.stdout == expected, (len(result.stdout), len(expected))
    print(f"HWPX text bytes {len(expected)} sha256 {hashlib.sha256(expected).hexdigest()}")


if __name__ == "__main__":
    main()
