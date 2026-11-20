"""Validate the trusted manifest before granting any Git blob read authority."""

import hashlib
import json
import re
from collections import Counter


MANIFEST_SHA256 = "0007eb070b08e21a212449c0ab31edf912854832fa016a2383b54074580cb006"
COHORT = "historical-e880-72b7-484"


class CorpusError(ValueError):
    """A missing input or a violated corpus boundary; never a skipped success."""


def relative_path(value):
    if not isinstance(value, str) or not value or "\\" in value:
        raise CorpusError("invalid relative path")
    parts = value.split("/")
    if any(p in ("", ".", "..") or ":" in p or any(ord(c) < 32 for c in p) for p in parts):
        raise CorpusError("unsafe path: " + repr(value))
    return parts


def protected(parts):
    joined = "/".join(parts)
    return ("legacy/hwpers/" in joined + "/"
            or parts[-1] in ("hwpers_test4_complex_table.hwp", "title-column-roundtrip.test.mjs"))


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise CorpusError("duplicate JSON key: " + key)
        result[key] = value
    return result


def load_manifest(path, expected_sha256=MANIFEST_SHA256, expected_counts=None):
    # The checked-in JSON remains the only entry list. This digest is a trust
    # pin, not another list or a license to read arbitrary repository objects.
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_sha256:
        raise CorpusError("manifest SHA256 mismatch")
    try:
        value = json.loads(raw, object_pairs_hook=no_duplicate_keys)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise CorpusError("invalid manifest JSON") from exc
    if not isinstance(value, dict) or set(value) != {"schema", "cohort", "referenceCount", "ownCount", "entries"}:
        raise CorpusError("invalid manifest fields")
    if type(value["schema"]) is not int or value["schema"] != 1 or value["cohort"] != COHORT:
        raise CorpusError("unsupported manifest schema/cohort")
    counts = {"own": 45, "reference": 439} if expected_counts is None else expected_counts
    if (type(value["ownCount"]) is not int or type(value["referenceCount"]) is not int
            or value["ownCount"] != counts["own"] or value["referenceCount"] != counts["reference"]):
        raise CorpusError("manifest count mismatch")
    entries = value["entries"]
    if not isinstance(entries, list) or len(entries) != sum(counts.values()):
        raise CorpusError("manifest entry count mismatch")
    paths, sources, directories = set(), set(), set()
    for e in entries:
        fields = {"path", "origin", "originCommit", "sourcePath", "mode", "bytes", "gitBlobSHA1", "sha256"}
        if not isinstance(e, dict) or set(e) != fields:
            raise CorpusError("invalid entry fields")
        origin = e["origin"]
        if not isinstance(origin, str) or origin not in counts:
            raise CorpusError("unknown origin")
        path = relative_path(e["path"])
        source = relative_path(e["sourcePath"])
        if (path != [origin] + source or protected(path)
                or not source[-1].endswith(".hwpx")):
            raise CorpusError("raw path namespace/protection violation")
        prefix = ["legacy", "rust", "crates", "hwp-core", "tests", "fixtures"] if origin == "own" else ["samples"]
        if source[:len(prefix)] != prefix or len(source) <= len(prefix):
            raise CorpusError("raw source outside permitted namespace")
        for key, length in (("originCommit", 40), ("gitBlobSHA1", 40), ("sha256", 64)):
            if not isinstance(e[key], str) or re.fullmatch("[0-9a-f]{%d}" % length, e[key]) is None:
                raise CorpusError("invalid digest: " + key)
        if e["mode"] not in ("100644", "100755") or type(e["bytes"]) is not int or e["bytes"] <= 0:
            raise CorpusError("invalid mode/size")
        identity = (origin, e["originCommit"], e["sourcePath"])
        if e["path"] in paths or identity in sources:
            raise CorpusError("duplicate path/origin")
        paths.add(e["path"])
        sources.add(identity)
        directories.update("/".join(path[:i]) for i in range(1, len(path)))
    if paths & directories or Counter(e["origin"] for e in entries) != counts:
        raise CorpusError("file/directory collision or origin count mismatch")
    return entries


def check_bytes(entry, raw):
    if len(raw) != entry["bytes"]:
        raise CorpusError("raw size mismatch: " + entry["path"])
    if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
        raise CorpusError("raw SHA256 mismatch: " + entry["path"])
    header = b"blob " + str(len(raw)).encode("ascii") + b"\0"
    if hashlib.sha1(header + raw).hexdigest() != entry["gitBlobSHA1"]:
        raise CorpusError("raw Git blob SHA1 mismatch: " + entry["path"])
