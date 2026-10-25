# Third-party notices

`tests/fixtures/curves/hancom-curves.hwpx` is an unchanged fixture from
airmang/python-hwpx revision `7ca45822076b9feb7cf3a7cfb2c924d121162b4b`.
Copyright 2025-2026 airmang (Dr. Wily), Apache-2.0.
Its license and provenance are preserved in `tests/fixtures/curves/LICENSE`
and `tests/fixtures/curves/README.md`. No upstream Python implementation is bundled.

The neutral-punctuation language inheritance policy in
`web/preview/font-language-context.mjs` follows RHWP's MIT-licensed composer
at revision `e8800c8def63449808a4092798442652ed460552`.
The paragraph-local cursor implementation is independent; it is not a claim
that every HWP character classification or native shaping rule is reproduced.

The two normal-face ASCII width overlays in
`web/preview/hft-ascii-metrics.mjs` are adapted from RHWP's
`src/renderer/font_metrics_overlays.rs` at revision
`e8800c8def63449808a4092798442652ed460552` under the MIT license below.
They contain measured/interpolated metrics, not font outline files, and do not
establish complete native font or shaping equivalence.
The regular Hangul advance profiles in `web/preview/hft-hangul-metrics.mjs`
also follow the same revision's `FONT_276_HANGUL` and its HanyangSinMyeongJo/
HumanMyeongJo overlay references. These profiles contain no font outlines.

The legacy password key derivation in `src/hwp5/password_legacy_key.zig` and
`tools/hwp5-legacy-password-probe.mjs` is adapted from RHWP's
`rhwp-password-crypto`, revision `e8800c8def63449808a4092798442652ed460552`.
No external DES implementation or GPL/LGPL dependency was adopted.

The optional sizing policy in `web/preview/arrow-reference-dimensions.mjs`
is adapted from the MIT-licensed RHWP `src/renderer/web_canvas.rs`
`calc_arrow_dims` implementation at revision
`e8800c8def63449808a4092798442652ed460552`. It is not
a claim of exact Hangul rendering compatibility. The RHWP license follows.

MIT License

Copyright (c) 2025-2026 Edward Kim

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The display policy in `web/preview/cell-picture-effective-alignment.mjs` follows the recorded cell-anchor alignment observations in RHWP `tests/issue_2071_cell_anchor_picture_valign.rs` at the revision above (MIT). Original picture fields and font/image assets are not copied or rewritten.
