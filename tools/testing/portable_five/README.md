# Portable-five fixture ownership and reproduction

This directory owns the deterministic author and independent oracle for
`src/testing/fixtures/portable-five`. Python 3.10+ and the standard library are
sufficient on POSIX macOS/Linux. There are no package installs, Native builds, environment-selected
inputs, network requests, reference documents, or product-parser imports.

From a regular repository checkout:

```sh
python3 -B tools/testing/portable_five/author_fixtures.py --check
python3 -B tools/testing/portable_five/oracle.py
python3 -B tools/testing/portable_five/test_portable_five.py
```

`--check` constructs all eleven payloads **in memory** and requires their exact
sizes/SHA256 to match `expected-sha256.json`. It then reads only the seven
repository fixtures listed there and checks exact bytes/SHA256 plus the
independent oracle. CLI entrypoints disable Python bytecode writes even without `-B`. The check
creates no files or temporary directory and never repairs
an input. README and unrelated files are not checked or enumerated as fixtures.
The four diagnostic XML/record payloads are regenerated too, but are not required
in the repository fixture directory. No Native test success is implied.

Without `--check`, the author creates a unique, exclusive new directory below
`/private/tmp` on macOS (`/tmp` elsewhere), with the eleven payloads under
`src/testing/fixtures/portable-five`. The output directory/path is printed as
JSON. It never writes into the repository fixture directory. An explicit
`--output /absolute/new/temp-directory` has the same exclusive-new requirement;
its parent must already exist. There is no overwrite or force option, recursive
parent creation, merge or automatic deletion. On a write failure a partial owned
new output may remain; no success JSON is printed and inputs are unchanged.

To check a generated output, use the exact `fixtures` path printed by generation:

```sh
python3 -B tools/testing/portable_five/author_fixtures.py
python3 -B tools/testing/portable_five/author_fixtures.py --check --fixtures /absolute/generated/src/testing/fixtures/portable-five
```

Input overrides must be absolute, canonical POSIX paths ending exactly
`src/testing/fixtures/portable-five`. Output overrides must be below the fixed OS
temporary directory. Both reject dot/parent/empty components, NUL, backslash,
protected fixture/test/legacy paths (case-insensitively), reference, `.git` and
`node_modules` before filesystem IO. No supplied path is resolved first.
Directory components and input files are opened relative to file descriptors
with `O_NOFOLLOW`; symlink parents and leaves are refused. Input file reads are
regular-file-only and bounded to pinned lengths; all inputs must match SHA256
before parsing. ZIP oracle entry/count/size budgets also apply. Only the fixed
named files are read; no recursive scans or caller-selected manifests are used.

`cfb_author.py` writes the small authored CFB. `cfb_read.py` is an independently
implemented, memory-only CFB reader. `oracle.py` checks XML ownership, sparse
style references, fixed GIF codes/pixel/digest, record/resource counts, UTF16 and
CFB stream structure. These are test tools, not a replacement parser or writer
for arbitrary documents. `test_portable_five.py` exercises reproduction, exact
SHA drift, malformed/protected paths before IO, symlinks, exclusive output,
write failures and independent corruption counterexamples.

Observed real-document tests stay in their existing modules and retain their
fixed-input sidecar responsibility. Native Session is opaque: byte/container
assertions must open the original/saved bytes with `text_source.Source.open`,
not access Session storage fields. Main owns that test-only correction; this
tooling does not modify any Native test or claim its execution.
