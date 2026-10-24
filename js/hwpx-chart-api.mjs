import { encodeChartPointBatch, readChartPointBatchLimits } from "./chart-point-batch.mjs";
import { decodeChartSeriesText } from "./hwpx-chart-series-text.mjs";

/** Chart ABI only; the editor injects lifetime, validation and shared memory. */
export function createHwpxChartApi({ wasm, memory, ready, uint, encodedText }) {
  function chartPointBytes(text, legacyNumeric = false) {
    const nativeLimit = typeof wasm.hwpx_edit_chart_point_max_bytes === "function";
    if (!nativeLimit && !legacyNumeric) throw new Error("HwpxChartEditAbiUnavailable");
    // Frozen legacy numeric-only ABI; current artifacts always own this limit.
    const maxBytes = nativeLimit ? wasm.hwpx_edit_chart_point_max_bytes() : 1024 * 1024;
    if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 0xffffffff) throw new Error("InvalidChartPointLimit");
    const bytes = encodedText(text);
    if (bytes.length > maxBytes) throw new Error("LimitExceeded");
    return bytes;
  }
  return {
    chartPoints(section, wrapper) {
      ready(); [section, wrapper].forEach(uint);
      if (typeof wasm.hwpx_edit_chart_points !== "function") throw new Error("HwpxChartEditAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_chart_points(section, wrapper)) throw memory.error();
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    chartNodes(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_chart_nodes !== "function") throw new Error("HwpxChartEditAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_chart_nodes(section)) throw memory.error();
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    chartSites(section) {
      ready(); uint(section);
      if (typeof wasm.hwpx_edit_chart_sites !== "function") throw new Error("HwpxChartEditAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_chart_sites(section)) throw memory.error();
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    chartSeriesText(section, wrapper) {
      ready(); [section, wrapper].forEach(uint);
      if (typeof wasm.hwpx_edit_chart_series_text !== "function") throw new Error("HwpxChartSeriesTextAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_chart_series_text(section, wrapper)) throw memory.error();
        return decodeChartSeriesText(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally { wasm.hwpx_edit_output_free(); }
    },
    setChartSeriesText(section, wrapper, ordinal, text) {
      ready(); [section, wrapper, ordinal].forEach(uint);
      if (typeof wasm.hwpx_edit_set_chart_series_text !== "function" || typeof wasm.hwpx_edit_chart_series_text_max_bytes !== "function") throw new Error("HwpxChartSeriesTextAbiUnavailable");
      const maxBytes = wasm.hwpx_edit_chart_series_text_max_bytes();
      if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 0xffffffff) throw new Error("InvalidChartSeriesTextLimit");
      const bytes = encodedText(text);
      if (bytes.length > maxBytes) throw new Error("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_chart_series_text(section, wrapper, ordinal, ptr, size)) throw memory.error();
      });
    },
    setChartNumericPoint(section, wrapper, point, value) {
      ready(); [section, wrapper, point].forEach(uint);
      if (typeof wasm.hwpx_edit_set_chart_numeric_point !== "function") throw new Error("HwpxChartEditAbiUnavailable");
      const bytes = chartPointBytes(value, true);
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_chart_numeric_point(section, wrapper, point, ptr, size)) throw memory.error();
      });
    },
    setChartPoint(section, wrapper, point, value) {
      ready(); [section, wrapper, point].forEach(uint);
      if (typeof wasm.hwpx_edit_set_chart_point !== "function" || typeof wasm.hwpx_edit_chart_point_max_bytes !== "function") throw new Error("HwpxChartEditAbiUnavailable");
      const bytes = chartPointBytes(value);
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_chart_point(section, wrapper, point, ptr, size)) throw memory.error();
      });
    },
    setChartPoints(section, wrapper, edits) {
      ready(); [section, wrapper].forEach(uint);
      const bytes = encodeChartPointBatch(edits, readChartPointBatchLimits(wasm), chartPointBytes);
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_chart_points(section, wrapper, ptr, size)) throw memory.error();
      });
    },
    chartPointBatchLimits() { ready(); return readChartPointBatchLimits(wasm); },
  };
}
