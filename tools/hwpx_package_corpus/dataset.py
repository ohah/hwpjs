"""Exclusive new output and descriptor-bound, no-symlink verification."""

import os
from pathlib import Path
import stat

from .manifest import CorpusError, check_bytes, relative_path


DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


def open_directory(path):
    # Walk every absolute component with O_NOFOLLOW, including the output parent.
    # /private/tmp is suitable on macOS; a symlink spelling such as /tmp is not.
    path = Path(os.path.abspath(path))
    fd = os.open(path.anchor, DIR_FLAGS)
    try:
        for component in path.parts[1:]:
            next_fd = os.open(component, DIR_FLAGS, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def write_new(root_fd, entry, raw):
    parts = relative_path(entry["path"])
    fd = os.dup(root_fd)
    try:
        for part in parts[:-1]:
            try:
                os.mkdir(part, 0o755, dir_fd=fd)
            except FileExistsError:
                pass
            next_fd = os.open(part, DIR_FLAGS, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        target = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=fd)
        with os.fdopen(target, "wb") as output:
            output.write(raw)
            output.flush()
            os.fchmod(output.fileno(), int(entry["mode"], 8) & 0o777)
            os.fsync(output.fileno())
    finally:
        os.close(fd)


def verify_fd(root_fd, entries):
    expected = {e["path"]: e for e in entries}
    directories = set()
    for path in expected:
        parts = path.split("/")
        directories.update("/".join(parts[:i]) for i in range(1, len(parts)))
    seen = set()

    def visit(fd, prefix):
        with os.scandir(fd) as children:
            for child in children:
                path = prefix + child.name
                info = child.stat(follow_symlinks=False)
                if stat.S_ISDIR(info.st_mode):
                    if path not in directories:
                        raise CorpusError("extra directory: " + path)
                    nested = os.open(child.name, DIR_FLAGS, dir_fd=fd)
                    try:
                        visit(nested, path + "/")
                    finally:
                        os.close(nested)
                elif stat.S_ISREG(info.st_mode) and path in expected:
                    entry = expected[path]
                    raw_fd = os.open(child.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
                    with os.fdopen(raw_fd, "rb") as source:
                        opened = os.fstat(source.fileno())
                        if (not stat.S_ISREG(opened.st_mode) or stat.S_IMODE(opened.st_mode) != (int(entry["mode"], 8) & 0o777)
                                or opened.st_size != entry["bytes"]):
                            raise CorpusError("dataset mode/size mismatch: " + path)
                        raw = source.read(entry["bytes"] + 1)
                        check_bytes(entry, raw)
                        after = os.fstat(source.fileno())
                        if (opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns, opened.st_ctime_ns) != (
                                after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                            raise CorpusError("dataset changed during verification: " + path)
                    seen.add(path)
                else:
                    raise CorpusError("extra/nonregular/symlink entry: " + path)
    visit(root_fd, "")
    if seen != set(expected):
        raise CorpusError("missing dataset entries: " + str(len(set(expected) - seen)))
    return {"files": len(seen), "bytes": sum(e["bytes"] for e in entries)}


def verify_dataset(path, entries):
    fd = open_directory(path)
    try:
        return verify_fd(fd, entries)
    finally:
        os.close(fd)


def restore_dataset(path, entries, sources):
    # Missing origins are diagnosed before making any destination. Each read is
    # checked again; no file contents from implementation trees are inspected.
    for entry in entries:
        sources[entry["origin"]].verify_entry(entry)
    absolute = Path(os.path.abspath(path))
    parent_fd = open_directory(absolute.parent)
    try:
        os.mkdir(absolute.name, 0o700, dir_fd=parent_fd)  # EEXIST is a hard failure.
        fd = os.open(absolute.name, DIR_FLAGS, dir_fd=parent_fd)
        try:
            for entry in entries:
                write_new(fd, entry, sources[entry["origin"]].read_entry(entry))
            result = verify_fd(fd, entries)
            # Do not report a renamed/replaced destination as published success.
            current = os.stat(absolute.name, dir_fd=parent_fd, follow_symlinks=False)
            opened = os.fstat(fd)
            if (current.st_dev, current.st_ino) != (opened.st_dev, opened.st_ino):
                raise CorpusError("destination replaced during restoration")
            return result
        finally:
            os.close(fd)
    finally:
        os.close(parent_fd)
