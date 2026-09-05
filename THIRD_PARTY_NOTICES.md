# Third-party notices

## Zig DEFLATE decoder

`src/compression/flate/Decompress.zig` and `token.zig` are adapted from Zig 0.16.0
(`lib/std/compress/flate/`), Copyright (c) Zig contributors.
License: [MIT](licenses/Zig-MIT.txt). The local decoder uses `@import("std")` and
fixes `tossBitsShort` to subtract consumed bits from available bits, preventing
truncated dynamic blocks from reading beyond EOF or trapping while aligning.
The token tables and self-contained upstream tests are retained; tests requiring
testdata absent from the installed Zig distribution are omitted. Project tests
generate independent zlib fixtures and malformed streams. `raw_deflate.zig` is the sole
product entrypoint; it adds output limits, ownership, and trailing-data rejection.

## Unicode character database

`src/cfb/simple_uppercase.zig` derives the BMP simple uppercase mappings from
[UnicodeData.txt, Unicode 17.0.0](https://www.unicode.org/Public/17.0.0/ucd/UnicodeData.txt),
field 12. Generator: `tools/generate-simple-uppercase.mjs`.
Copyright © 1991-2026 Unicode, Inc. License: [Unicode License V3](licenses/Unicode-3.0.txt).
Surrogate units are unchanged, as required by MS-CFB §2.6.4.

## SheetJS CFB

`legacy/cfb.js` identifies itself as SheetJS CFB 1.2.0, Copyright (C) 2013-present SheetJS.
Upstream: https://github.com/SheetJS/js-cfb
License: [Apache License 2.0](licenses/SheetJS-Apache-2.0.txt).

The legacy file is the differential-test reference. `src/cfb/find.zig` adapts its `find` behavior (case conversion, root-relative paths, NUL/control-character normalization), rewritten for this project's memory/error interfaces. `js/cfb-find.mjs` only marshals calls to that Zig implementation; it no longer contains a separate fallback search algorithm. The binary reader was implemented against the documented CFB layout and checked against the legacy behavior; it does not embed the legacy JavaScript parser in the runtime WASM module.

`src/cfb/uppercase.zig` is generated from the executing Node engine's Unicode uppercase behavior by `tools/generate-uppercase.mjs`. The generator records the Unicode version in its output.

`js/blob-cursor.mjs` adapts SheetJS `ReadShift`, `WriteShift`, `CheckField` and `prep_blob` for the copied JS output. `src/cfb/streams.zig` reproduces the `read_directory` content-presence branch, including empty storage and unused entries. These adaptations retain the Apache-2.0 attribution above; they do not import or execute the legacy parser in the product.
