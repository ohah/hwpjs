# Third-party notices

## SheetJS CFB

`legacy/cfb.js` identifies itself as SheetJS CFB 1.2.0, Copyright (C) 2013-present SheetJS.
Upstream: https://github.com/SheetJS/js-cfb
License: [Apache License 2.0](licenses/SheetJS-Apache-2.0.txt).

The legacy file is the differential-test reference. `src/cfb/find.zig` adapts its `find` behavior (case conversion, root-relative paths, NUL/control-character normalization), rewritten for this project's memory/error interfaces. `js/cfb-find.mjs` only marshals calls to that Zig implementation; it no longer contains a separate fallback search algorithm. The binary reader was implemented against the documented CFB layout and checked against the legacy behavior; it does not embed the legacy JavaScript parser in the runtime WASM module.

`src/cfb/uppercase.zig` is generated from the executing Node engine's Unicode uppercase behavior by `tools/generate-uppercase.mjs`. The generator records the Unicode version in its output.

`js/blob-cursor.mjs` adapts SheetJS `ReadShift`, `WriteShift`, `CheckField` and `prep_blob` for the copied JS output. `src/cfb/streams.zig` reproduces the `read_directory` content-presence branch, including empty storage and unused entries. These adaptations retain the Apache-2.0 attribution above; they do not import or execute the legacy parser in the product.
