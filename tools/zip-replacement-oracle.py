"""Independent ZIP decoder comparison; no generated files are written."""
import io
import pathlib
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile


def main():
    process = subprocess.run(
        ["zig", "test", "src/zip_replacement_survey.zig", "-O", "ReleaseSafe",
         "--test-filter", "ZIP replacement corpus oracle output"],
        capture_output=True, check=True,
    )
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
                    expected += "<!--ZIP replacement 한😀-->".encode()
                    ET.fromstring(result.read(entry.filename))
                if result.read(entry.filename) != expected:
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
    print(f"Independent ZIP replacement: {len(seen)} files, {total_entries} entries verified")


if __name__ == "__main__":
    main()
