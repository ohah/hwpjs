# Third-party notices

프로젝트 라이선스: [MIT](LICENSE). 아래는 외부 코드·데이터·문서의 고지입니다.

## 한글 문서 파일 공개 명세

본 제품은 한글과컴퓨터의 글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.

## rhwp distribution key derivation

`src/hwp5/distribution/key.zig` adapts the MSVC-LCG/XOR key derivation in
`reference/rhwp/src/parser/crypto.rs`, Copyright (c) 2025-2026 Edward Kim.
Upstream: https://github.com/edwardkim/rhwp
License: [MIT](licenses/rhwp-MIT.txt). AES uses Zig's standard library; incomplete
cipher blocks are rejected rather than padded. Envelope, resource limits and
observed checksum-block validation are separate HWPJS implementations.

## Zig DEFLATE decoder

`src/compression/flate/Decompress.zig` and `token.zig` are adapted from Zig 0.16.0
(`lib/std/compress/flate/`), Copyright (c) Zig contributors.
License: [MIT](licenses/Zig-MIT.txt). The local decoder uses `@import("std")` and
fixes `tossBitsShort` to subtract consumed bits from available bits, preventing
truncated dynamic blocks from reading beyond EOF or trapping while aligning.
The token tables and self-contained upstream tests are retained; tests requiring
testdata absent from the installed Zig distribution are omitted. Project tests
generate independent zlib fixtures and malformed streams. `raw_deflate.zig` is the sole
DEFLATE entrypoint; it adds output limits, ownership, and trailing-data rejection.
The local fixed/dynamic match paths also enforce an optional maximum distance.
`zlib.zig` reuses that entrypoint with the RFC1950 declared window and validates
the header and Adler32 checksum; preset dictionaries are explicitly unsupported.

## Unicode character database

`src/cfb/simple_uppercase.zig` derives the BMP simple uppercase mappings from
[UnicodeData.txt, Unicode 17.0.0](https://www.unicode.org/Public/17.0.0/ucd/UnicodeData.txt),
field 12. Generator: `tools/generate-simple-uppercase.mjs`.
Copyright © 1991-2026 Unicode, Inc. License: [Unicode License V3](licenses/Unicode-3.0.txt).
Surrogate units are unchanged, as required by MS-CFB §2.6.4.

## Public registry-derived identifier data

`src/text/bcp47/data/source.json` records the pinned [IANA Language Subtag
Registry](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry)
and [Language Tag Extensions Registry](https://www.iana.org/assignments/language-tag-extensions-registry/language-tag-extensions-registry)
URLs, source dates and hashes. `tools/language-registry.mjs` generates reduced
identifier tables from that snapshot. IANA and IETF's [protocol-registry licensing
statement](https://www.iana.org/help/licensing-terms) applies CC0 1.0 to rights
they hold in the protocol registries; it does not warrant third-party rights or
cover linked RFC text.

`src/text/iso639/alpha2.txt` contains two-letter language identifiers projected
from the [Library of Congress ISO 639-2 code list](https://www.loc.gov/standards/iso639-2/php/code_list.php).
`src/text/iso639/source.json` records the capture date and limits; the ISO
standard's full text is not bundled.

`src/image/icc/registry/source.json` contains extracted identifier values and
source hashes from the International Color Consortium's [CMM](https://registry.color.org/cmm-signatures/cmm-signatures.csv),
[manufacturer](https://registry.color.org/manufacturer-signatures/manufacturer-signatures.csv)
and [device](https://registry.color.org/device-signatures/device-signatures.csv)
signature registries. `tools/icc-registry/generate.mjs` derives the lookup table;
the original CSV files and contact fields are not bundled.

The LoC and ICC links above establish provenance, **not** a license grant. Their
applicable redistribution terms for these extracted tables have not been
confirmed here. Neither the project's MIT license nor IANA's CC0 statement is
asserted to license the LoC or ICC source material; confirm the relevant rights
before relying on this notice for redistribution clearance.

## SheetJS CFB

`legacy/cfb.js` identifies itself as SheetJS CFB 1.2.0, Copyright (C) 2013-present SheetJS.
Upstream: https://github.com/SheetJS/js-cfb
License: [Apache License 2.0](licenses/SheetJS-Apache-2.0.txt).

The legacy file is the differential-test reference. `src/cfb/find.zig` adapts its `find` behavior (case conversion, root-relative paths, NUL/control-character normalization), rewritten for this project's memory/error interfaces. `js/cfb-find.mjs` only marshals calls to that Zig implementation; it no longer contains a separate fallback search algorithm. The binary reader was implemented against the documented CFB layout and checked against the legacy behavior; it does not embed the legacy JavaScript parser in the runtime WASM module.

`src/cfb/uppercase.zig` is generated from the executing Node engine's Unicode uppercase behavior by `tools/generate-uppercase.mjs`. The generator records the Unicode version in its output.

`js/blob-cursor.mjs` adapts SheetJS `ReadShift`, `WriteShift`, `CheckField` and `prep_blob` for the copied JS output. `src/cfb/streams.zig` reproduces the `read_directory` content-presence branch, including empty storage and unused entries. These adaptations retain the Apache-2.0 attribution above; they do not import or execute the legacy parser in the product.
