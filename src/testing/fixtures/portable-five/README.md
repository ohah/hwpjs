# Authored portable contract inputs

These inputs are constructed independently of any observed document. They are
not a redistribution or normalization of the reference corpus. The regular-repository
`tools/testing/portable_five/author_fixtures.py` owns deterministic construction;
`tools/testing/portable_five/expected-sha256.json` pins the exact output bytes.
The independent oracle and path/IO contract are documented in
`tools/testing/portable_five/README.md`.

```sh
python3 -B tools/testing/portable_five/author_fixtures.py --check
python3 -B tools/testing/portable_five/oracle.py
```

`--check` only reads the seven named repository inputs and regenerates in memory.
Generation without `--check` always uses an exclusive new OS temporary output;
it never overwrites these fixtures. No ignored verification packet is needed.

* `chart.hwpx`: explicit `gap` and a section-owned chart of 12345 x 23456,
  ABSOLUTE bases, offsets -17/29, PARA/COLUMN/TOP/LEFT; the OLE fallback is
  deliberately a different 999 x 888. These are test declarations, not defaults.
* `background.hwpx` and `pixel.gif`: border17 owns image17, which owns an authored
  35-byte GIF87a 1x1 black pixel with a two-color table. GIF LZW codes are clear4,
  pixel0, end5. SHA256 is
  `cd251e1117213163d1cda55ad6f7ec3e6046042739c67efe0c939f6bded51efe`.
* `runless.hwpx`: three paragraphs; the middle paragraph has no run, and explicit
  style17 refers to declared charPr43 at height1000. Neighbors are before/after.
* `table-wire.hwp`: authored uncompressed HWP5 5.0.1.7 CFB with FileHeader,
  DocInfo and BodyText/Section0. Seven separate font groups request PortableFace;
  char0/para0/style0 are explicit, and optional-one-based border0 means absent.
  Source paragraph1 contains Target + U+1F600 + CR, independently 9 UTF16 units.
  The style payload has two Portable strings, type/next0, language1042, para0,
  char0. This tests the current Native model, not official application rendering.

HWP5 framing/field authorities are the current typed record/header/resource
codecs and the standards-authored `src/new_document/hwp5.zig`. HWPX identities,
units and owner relationships follow the current typed header/style/chart/
manifest contracts. XML-only parser fixtures deliberately omit unrelated
features; there is no producer/version/complete-document interoperability claim.

`portable_five_contract_probe.zig` selects tests named `portable five`. Existing
observed-document cases remain unchanged and registered in their original
modules. Their fixed inputs and replay evidence belong to Main's separate
`REFERENCE-DOCUMENT-INPUTS-r3.json` and `FIXTURE-REPLAY-with-reference-inputs-r3.json`.
Portable success is not a substitute for those real-document checks or a claim
that the whole root suite is fixture-independent.

Native Session is opaque. Container/byte assertions open original and saved bytes
with `text_source.Source.open`; these Python tools never inspect Native internals.
