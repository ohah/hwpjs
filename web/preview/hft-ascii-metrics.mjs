// Adapted from RHWP font_metrics_overlays.rs, revision
// e8800c8def63449808a4092798442652ed460552. Measured/interpolated ASCII
// overlays, not font outlines or a complete native shaping implementation.
//
// MIT License
// Copyright (c) 2025-2026 Edward Kim
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

const entry = widths => Object.freeze({ em: 1024, first: 0x20, widths: Object.freeze(widths) });
export const HFT_ASCII_METRICS = Object.freeze({
  "한양신명조": entry([518,333,401,465,614,939,833,241,404,386,535,579,237,588,246,404,509,509,509,509,509,509,509,509,509,509,281,298,746,588,754,526,939,816,719,711,763,693,667,763,798,342,465,807,658,983,798,763,640,772,719,667,790,790,798,1061,772,790,614,368,404,360,439,509,395,518,570,500,553,491,360,605,570,281,325,570,281,877,579,526,544,561,412,500,360,579,596,860,605,588,483,430,290,430,509]),
  "한양중고딕": entry([
    518,254,371,544,544,886,658,223,298,290,377,526,254,526,254,272,509,509,509,
    509,509,509,509,509,509,509,254,254,596,535,596,535,1026,649,640,719,711,667,
    605,772,702,254,483,649,553,825,711,763,649,772,711,649,596,702,649,921,632,
    632,596,263,290,263,456,509,263,544,535,491,544,544,263,544,544,202,202,483,
    202,825,544,553,544,544,316,491,263,544,491,711,483,474,500,316,246,316,509,
  ]),
});
