"""Numeric oracle envelope SSOT; source identity and arithmetic belong to each fixture."""
from contextlib import contextmanager
import io
import xml.etree.ElementTree as E
import zipfile


def require(value, message):
    if not value:
        raise ValueError(message)


def parse(raw):
    require(b"<!DOCTYPE" not in raw and b"<!ENTITY" not in raw, "Unsupported declaration")
    return E.fromstring(raw, parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True, insert_pis=True)))


@contextmanager
def expectation(before, after, part):
    """Yield separate mutable expected and actual trees after exact package checks."""
    with zipfile.ZipFile(io.BytesIO(before)) as old, zipfile.ZipFile(io.BytesIO(after)) as new:
        require(old.namelist() == new.namelist() and len(set(old.namelist())) == len(old.namelist()) and old.comment == new.comment, "ZIP inventory")
        require(old.testzip() is None and new.testzip() is None, "ZIP integrity")
        for entry in old.infolist():
            saved = new.getinfo(entry.filename)
            for key in ("compress_type", "date_time", "extra", "comment", "external_attr", "internal_attr", "create_system"):
                require(getattr(entry, key) == getattr(saved, key), "ZIP metadata")
            if entry.filename != part:
                require(old.read(entry) == new.read(entry.filename), "Non-target payload")
        yield parse(old.read(part)), parse(new.read(part))
