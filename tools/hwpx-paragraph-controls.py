"""Independent fixture topology inventory, not native edit eligibility."""
import collections
import json
import subprocess
import zipfile
import xml.etree.ElementTree as ET

HP = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
paths = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
counts = collections.Counter()
examples = {}
for path in paths:
    if "/fixtures/" not in path or not path.endswith(".hwpx") or path.endswith("/password-12345.hwpx"):
        continue
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.startswith("Contents/section") or not name.endswith(".xml"):
                continue
            root = ET.fromstring(archive.read(name))
            for ordinal, paragraph in enumerate(root.iter(HP + "p"), 1):
                kinds = set()
                for child in paragraph:
                    if child.tag != HP + "run":
                        if child.tag != HP + "linesegarray":
                            kinds.add("paragraph:" + child.tag)
                        continue
                    for content in child:
                        if content.tag == HP + "t":
                            for inline in content:
                                kinds.add("inline:" + inline.tag)
                        elif content.tag == HP + "ctrl":
                            for control in content:
                                kinds.add("ctrl:" + control.tag)
                        elif content.tag != HP + "secPr":
                            kinds.add("run:" + content.tag)
                for kind in sorted(kinds):
                    counts[kind] += 1
                    examples.setdefault(kind, {"path": path, "section": name, "rawParagraphOrdinal": ordinal})
print(json.dumps({"paragraphOccurrences": dict(sorted(counts.items())), "examples": examples}, ensure_ascii=False, indent=2))
