"""Optional, read-only captured observations for public Python replay tests.

A missing default capture is optional. An explicitly supplied missing path or a
partial/corrupt capture is a test failure. No Native/WASM process is launched.
"""
import hashlib
import json
import os
from pathlib import Path

NAMES = frozenset(('borderfill', 'shapeline', 'matrix', 'table-caption', 'table', 'table2',
                   'homomorphic-line-one-no-metadata', 'homomorphic-rect-two-new-id',
                   'homomorphic-table-two-reordered', 'homomorphic-mixed-tbl-line-rect'))
MISSING = 'optional saved leading-object observations are absent; Python replay skipped (no WASM required)'


def load(root):
    explicit = os.environ.get('HWPJS_LEADING_OBJECT_SAVED_EVIDENCE')
    directory = Path(explicit) if explicit else root / 'zig-out/verification/hwpx-leading-object-slot-model'
    if not directory.exists() and not explicit:
        return None
    manifest = directory / 'native-evidence.json'
    raw = manifest.read_bytes()  # Explicit missing paths and partial captures must fail.
    records = json.loads(raw)
    if not isinstance(records, list) or len(records) != len(NAMES):
        raise ValueError('Saved observation inventory mismatch')
    names = [record['name'] for record in records]
    if set(names) != NAMES or len(set(names)) != len(names):
        raise ValueError('Saved observation identity mismatch')
    inputs, outputs = {}, {}
    hashes = {str(manifest): hashlib.sha256(raw).hexdigest()}
    for record in records:
        name = record['name']
        if type(record['count']) is not int or not 1 <= record['count'] <= 1024:
            raise ValueError('Invalid saved source count: ' + name)
        for suffix, destination in (('before', inputs), ('after', outputs)):
            path = directory / (name + '.' + suffix + '.hwpx')
            destination[name] = path.read_bytes()
            hashes[str(path)] = hashlib.sha256(destination[name]).hexdigest()
        if record['sourceSHA'] != hashlib.sha256(inputs[name]).hexdigest():
            raise ValueError('Saved source digest mismatch: ' + name)
    return records, inputs, outputs, hashes
