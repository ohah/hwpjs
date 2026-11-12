"""Narrow bounded file boundary for portable-five tools; never follows symlinks."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import secrets
import stat
import sys

SUFFIX = ('src', 'testing', 'fixtures', 'portable-five')
GENERATED = ('background.hwpx', 'chart.hwpx', 'chart.xml', 'chart-section.xml',
             'pixel.gif', 'runless.hwpx', 'runless-header.xml', 'runless-section.xml',
             'table-wire.hwp', 'table-wire-docinfo.bin', 'table-wire-section.bin')
CHECKED = ('background.hwpx', 'chart-section.xml', 'chart.hwpx', 'chart.xml',
           'pixel.gif', 'runless.hwpx', 'table-wire.hwp')
TEMP_ROOT = '/private/tmp' if sys.platform == 'darwin' else '/tmp'
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


def lexical(raw):
    """Validate before stat/open/resolve/mkdir, including case-insensitive filesystems."""
    value = os.fspath(raw)
    if not isinstance(value, str) or not value.startswith('/') or '\x00' in value or '\\' in value:
        raise ValueError('absolute POSIX path required')
    parts = value.split('/')[1:]
    folded = [p.casefold() for p in parts]
    protected = (('legacy', 'hwpers'), ('tests', 'hwpx', 'title-column-roundtrip.test.mjs'))
    if ('hwpers_test4_complex_table.hwp' in folded or
        any(tuple(folded[i:i+len(p)]) == p for p in protected for i in range(len(folded))) or
        any(p in ('reference', '.git', 'node_modules') for p in folded)):
        raise ValueError('protected or unrelated path rejected before IO')
    if any(p in ('', '.', '..') for p in parts):
        raise ValueError('non-canonical path components rejected before IO')
    return PurePosixPath(value)


def fixture_path(raw=None):
    path = lexical(raw if raw is not None else str(Path(__file__).absolute().parents[3].joinpath(*SUFFIX)))
    if path.parts[-4:] != SUFFIX:
        raise ValueError('input must end with src/testing/fixtures/portable-five')
    return path


def output_path(raw=None):
    path = lexical(raw if raw is not None else TEMP_ROOT + '/hwpjs-portable-five-' + secrets.token_hex(12))
    if not path.is_relative_to(PurePosixPath(TEMP_ROOT)) or path == PurePosixPath(TEMP_ROOT):
        raise ValueError('new output must be below the fixed OS temporary directory')
    return path


def open_dir(path):
    # Walk from the anchor with O_NOFOLLOW on every component, including parents.
    path = lexical(str(path))
    fd = os.open('/', DIR_FLAGS)
    try:
        for part in path.parts[1:]:
            child = os.open(part, DIR_FLAGS, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def expected():
    # Trusted tool dependency, never a caller-selected manifest or input list.
    data = json.loads(Path(__file__).with_name('expected-sha256.json').read_text())
    names = [row['path'] for row in data['generatedFiles']]
    if data['schema'] != 1 or set(names) != set(GENERATED) or len(names) != len(GENERATED):
        raise ValueError('invalid trusted generated manifest')
    if tuple(data['checkedRepositoryFiles']) != CHECKED:
        raise ValueError('invalid trusted checked-file list')
    for row in data['generatedFiles']:
        if not 0 < row['bytes'] <= 65536 or len(row['sha256']) != 64:
            raise ValueError('invalid trusted size/hash')
    return data


def exact_generated(files, manifest):
    if set(files) != set(GENERATED):
        raise ValueError('generator returned a different file set')
    for row in manifest['generatedFiles']:
        payload = files[row['path']]
        if len(payload) != row['bytes'] or hashlib.sha256(payload).hexdigest() != row['sha256']:
            raise ValueError('generated SHA/size mismatch: ' + row['path'])


def read_fixtures(path, manifest):
    path = fixture_path(str(path))
    rows = {row['path']: row for row in manifest['generatedFiles']}
    directory = open_dir(path)
    files = {}
    try:
        for name in CHECKED:
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
            try:
                st = os.fstat(fd)
                if not stat.S_ISREG(st.st_mode) or st.st_size != rows[name]['bytes']:
                    raise ValueError('input type/size mismatch: ' + name)
                chunks = []
                remaining = rows[name]['bytes'] + 1
                while remaining:
                    part = os.read(fd, remaining)
                    if not part:
                        break
                    chunks.append(part)
                    remaining -= len(part)
                payload = b''.join(chunks)
                if len(payload) != rows[name]['bytes']:
                    raise ValueError('input size changed: ' + name)
                if hashlib.sha256(payload).hexdigest() != rows[name]['sha256']:
                    raise ValueError('input exact SHA mismatch: ' + name)
                files[name] = payload
            finally:
                os.close(fd)
    finally:
        os.close(directory)
    return files


def create_output(path, files):
    path = output_path(str(path))
    parent = open_dir(path.parent)
    try:
        # No exist_ok, overwrite, force, recursive parent creation or deletion.
        os.mkdir(path.name, mode=0o700, dir_fd=parent)
        directory = os.open(path.name, DIR_FLAGS, dir_fd=parent)
    finally:
        os.close(parent)
    try:
        for component in SUFFIX:
            os.mkdir(component, mode=0o700, dir_fd=directory)
            child = os.open(component, DIR_FLAGS, dir_fd=directory)
            os.close(directory)
            directory = child
        for name in GENERATED:
            fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
            try:
                view = memoryview(files[name])
                while view:
                    written = os.write(fd, view)
                    if written == 0:
                        raise OSError('zero-byte write')
                    view = view[written:]
            finally:
                os.close(fd)
    finally:
        os.close(directory)
    return str(path.joinpath(*SUFFIX))
