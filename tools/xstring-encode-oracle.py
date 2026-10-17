"""Independent content encoder oracle with explicit optimized-mode checks."""
import argparse
import json
import re
import subprocess

pattern = re.compile(r"_x[0-9a-fA-F]{4}_")


def encode(source):
    output = []
    for index, character in enumerate(source):
        scalar = ord(character)
        valid = scalar in (9, 10, 13) or 0x20 <= scalar <= 0xd7ff or 0xe000 <= scalar <= 0xfffd or 0x10000 <= scalar <= 0x10ffff
        if pattern.match(source, index):
            output.append("_x005F_")
        elif scalar == 13 or not valid:
            output.append(f"_x{scalar:04X}_")
        else:
            output.append(character)
    return "".join(output)


def verify(row):
    if encode(row["source"]) != row["encoded"]:
        raise ValueError("Xstring encoded value mismatch")
    decoded = pattern.sub(lambda match: chr(int(match.group()[2:6], 16)), row["encoded"])
    if decoded != row["source"]:
        raise ValueError("Independent Xstring roundtrip mismatch")


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--zig", required=True)
    options = args.parse_args()
    result = subprocess.run([options.zig, "test", "src/xstring_encode_corpus_test.zig", "-O", "ReleaseSafe", "--test-filter", "Xstring encoder independent corpus emission"], capture_output=True, timeout=300)
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace")[-4000:])
    marker = b"XSTRING_ENCODE_JSON:"
    rows = [json.loads(line.split(marker, 1)[1]) for line in result.stderr.splitlines() if marker in line]
    if len(rows) != 15:
        raise ValueError("Unexpected corpus inventory")
    controls = 0
    for row in rows:
        verify(row)
        try:
            verify({**row, "encoded": row["encoded"] + "wrong"})
        except ValueError as error:
            if str(error) != "Xstring encoded value mismatch":
                raise
            controls += 1
        else:
            raise ValueError("Negative control accepted")
    if len(rows[-1]["source"]) != 0x110000 - 0x800:
        raise ValueError("Incomplete Unicode scalar inventory")
    print(json.dumps({"cases": len(rows), "allUnicodeScalars": len(rows[-1]["source"]), "negativeControls": controls}))


if __name__ == "__main__":
    main()
