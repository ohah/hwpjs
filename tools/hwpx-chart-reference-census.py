"""Signature-based read-only chart association census, not an editor gate."""
import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile
import olefile

P = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
O = "{http://www.idpf.org/2007/opf/}"
CFB = bytes.fromhex("d0cf11e0a1b11ae1")
C = "{http://schemas.openxmlformats.org/drawingml/2006/chart}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


def text_counts(xml):
    root = ET.fromstring(xml)
    parents = {child: parent for parent in root.iter() for child in parent}
    counts = Counter()
    for text in root.iter(C + "tx"):
        owner = parents.get(text)
        if owner is not None and owner.tag == C + "ser":
            counts["direct_series_values"] += len(text.findall(C + "v"))
        for rich in text.findall(C + "rich"):
            counts["rich_text_values"] += sum(1 for _ in rich.iter(A + "t"))
    return {key: value for key, value in counts.items() if value}


def point_counts(xml):
    root = ET.fromstring(xml)
    parents = {child: parent for parent in root.iter() for child in parent}
    kinds = {C + "numCache": "numeric_cache", C + "numLit": "numeric_literal", C + "strCache": "string_cache", C + "strLit": "string_literal", C + "multiLvlStrCache": "multilevel_cache"}
    counts = Counter()
    for value in root.iter(C + "v"):
        point = parents.get(value)
        if point is None or point.tag != C + "pt":
            continue
        container = parents.get(point)
        if container is not None and container.tag == C + "lvl":
            container = parents.get(container)
        if container is not None and container.tag in kinds:
            counts[kinds[container.tag]] += 1
    return dict(counts)


def association(archive, manifest, parents, chart):
    row = {"chart": chart.get("chartIDRef")}
    case = parents.get(chart)
    wrapper = parents.get(case)
    if case is None or case.tag != P + "case" or wrapper is None or wrapper.tag != P + "switch":
        return {**row, "status": "unpaired_chart"}
    cases, defaults = wrapper.findall(P + "case"), wrapper.findall(P + "default")
    if len(cases) != 1 or len(defaults) != 1:
        return {**row, "status": "ambiguous_wrapper", "cases": len(cases), "defaults": len(defaults)}
    fallback = defaults[0].find(P + "ole")
    if fallback is None:
        return {**row, "status": "missing_fallback"}
    row["ole"] = manifest.get(fallback.get("binaryItemIDRef"))
    original = archive.read(row["chart"])
    row["pointCounts"] = point_counts(original)
    row["nonPointTextCounts"] = text_counts(original)
    payload = archive.read(row["ole"])
    if payload.startswith(CFB):
        row["envelope"] = "raw"
    elif len(payload) >= 12 and payload[4:12] == CFB and int.from_bytes(payload[:4], "little") == len(payload) - 4:
        payload = payload[4:]
        row["envelope"] = "size_prefix"
    else:
        return {**row, "status": "unsupported_ole_envelope"}
    with olefile.OleFileIO(io.BytesIO(payload)) as compound:
        nested = compound.openstream("OOXMLChartContents").read()
    row["chartSha256"] = hashlib.sha256(original).hexdigest()
    row["nestedSha256"] = hashlib.sha256(nested).hexdigest()
    row["status"] = "byte_aligned" if original == nested else "different_serialization"
    return row


def inspect(path, source):
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        if archive.read("mimetype") != b"application/hwp+zip":
            raise ValueError("UnexpectedPackageMime")
        manifest = {}
        package = ET.fromstring(archive.read("Contents/content.hpf"))
        for item in package.iter(O + "item"):
            if item.get("id") in manifest:
                raise ValueError("DuplicateManifestId")
            manifest[item.get("id")] = item.get("href")
        spine = package.find(O + "spine")
        sections = [] if spine is None else [manifest.get(item.get("idref")) for item in spine.findall(O + "itemref")]
        sections = [part for part in sections if part is not None and part.startswith("Contents/section") and part.endswith(".xml")]
        rows = []
        for part in archive.namelist():
            if not part.startswith("Contents/section") or not part.endswith(".xml"):
                continue
            root = ET.fromstring(archive.read(part))
            parents = {child: parent for parent in root.iter() for child in parent}
            indices = {node: index for index, node in enumerate(root.iter())}
            for ordinal, chart in enumerate(root.iter(P + "chart")):
                try:
                    row = association(archive, manifest, parents, chart)
                except Exception as error:
                    row = {"chart": chart.get("chartIDRef"), "status": "association_error", "error": type(error).__name__ + ": " + str(error)}
                case = parents.get(chart)
                wrapper = parents.get(case)
                rows.append({"part": part, "section": sections.index(part) if part in sections else None, "wrapper": indices.get(wrapper), "chartOrdinal": ordinal, **row})
        return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    if not args.root.is_dir():
        raise ValueError("MissingReferenceRoot")
    paths = sorted(path for path in args.root.rglob("*") if path.is_file() and path.suffix.lower() in (".hwp", ".hwpx"))
    if not paths:
        raise ValueError("EmptyReferenceInventory")
    counts, pair_counts, non_point_text = Counter(), Counter(), Counter()
    for path in paths:
        source = path.read_bytes()
        if not source.startswith(b"PK\x03\x04"):
            counts["non_zip_signature"] += 1
            continue
        counts["zip_signature"] += 1
        before = hashlib.sha256(source).hexdigest()
        try:
            rows = inspect(path, source)
            counts["chart_files" if rows else "no_chart_files"] += 1
            for row in rows:
                pair_counts[row["status"]] += 1
                non_point_text.update(row.get("nonPointTextCounts", {}))
            if rows:
                print(json.dumps({"path": str(path), "inputSha256": before, "associations": rows}, ensure_ascii=False))
        except Exception as error:
            counts["inspection_refused"] += 1
            print(json.dumps({"path": str(path), "inputSha256": before, "status": "inspection_refused", "error": type(error).__name__ + ": " + str(error)}, ensure_ascii=False))
        if hashlib.sha256(path.read_bytes()).hexdigest() != before:
            raise ValueError("InputChanged: " + str(path))
    print(json.dumps({"kind": "summary", "inventory": len(paths), "counts": counts, "associations": pair_counts, "nonPointTextCounts": non_point_text, "scope": "ZIP signature and chart association plus non-point text census; not native parsing/editing or all opaque chart parts"}))


if __name__ == "__main__":
    main()
