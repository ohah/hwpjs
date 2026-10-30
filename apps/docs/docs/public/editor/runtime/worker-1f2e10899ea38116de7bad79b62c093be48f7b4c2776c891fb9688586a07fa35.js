// web/preview/atomic-formatting-command.mjs
function formattingCapabilities(editor) {
  if (!editor?.supportsAtomicFormatting?.())
    return { atomic: false, reason: "AtomicFormattingUnavailable" };
  return editor.atomicFormattingCapabilities();
}
function queryAtomicFormatting(editor, format, message) {
  const cap = formattingCapabilities(editor);
  if (cap.atomic !== true)
    throw Error(cap.reason);
  const selector = message.selector;
  if (!selector || selector.kind !== "original-paragraph" || !Number.isInteger(selector.section) || selector.section < 0 || selector.section > 4294967295 || !Number.isInteger(selector.paragraph) || selector.paragraph < 0 || selector.paragraph > 4294967295 - (format === "hwpx" ? 1 : 0))
    throw Error("InvalidFormattingSelector");
  return editor.queryFormatting({
    schemaVersion: 1,
    binding: cap.binding,
    selectors: [{ ...selector, paragraph: selector.paragraph + (format === "hwpx" ? 1 : 0) }],
    ...message.fields === undefined ? {} : { fields: message.fields }
  });
}

// web/preview/display-resource-cache.mjs
var HEADER_READS = new Set([
  "characterShapes",
  "characterUnderlines",
  "characterUnderlineStyles",
  "characterStrikes",
  "characterStrikeStyles",
  "characterTextColors",
  "characterShades",
  "characterEffects",
  "characterOutlines",
  "fontFaces",
  "fontFaceMetadata",
  "characterFontReferences",
  "characterFontMetrics",
  "paragraphShapeIds",
  "paragraphShapes",
  "tabDefinitions",
  "tableCreationResources"
]);
var READ_ONLY_REQUESTS = new Set([
  "picture-bytes",
  "table-background-bytes",
  "query-edit-range",
  "query-split-range"
]);
function createDisplayResourceCache() {
  let owner = null, facade = null, failed = false, textOnlyHistory = false, pendingHistoryRoot = null;
  const values = new Map;
  const invalidate = () => values.clear();
  return {
    invalidate() {
      invalidate();
      textOnlyHistory = false;
      pendingHistoryRoot = null;
    },
    beginRequest(message, { format, editor, historyEnabled }) {
      failed = false;
      pendingHistoryRoot = null;
      if (format !== "hwpx" || owner !== editor)
        textOnlyHistory = false;
      const textSplice = format === "hwpx" && editor && historyEnabled && message.kind === "splice";
      const textHistoryTravel = format === "hwpx" && owner === editor && editor && historyEnabled && textOnlyHistory && (message.kind === "undo" || message.kind === "redo");
      if (format === "hwpx" && editor && !historyEnabled && message.kind === "enable")
        pendingHistoryRoot = editor;
      else if (!textSplice && !textHistoryTravel && !READ_ONLY_REQUESTS.has(message.kind))
        textOnlyHistory = false;
      if (!textSplice && !textHistoryTravel && !READ_ONLY_REQUESTS.has(message.kind))
        invalidate();
    },
    finishRequest(error = false, metadata) {
      if (error || failed) {
        invalidate();
        textOnlyHistory = false;
      } else if (pendingHistoryRoot && owner === pendingHistoryRoot && Number.isInteger(metadata?.historyRevision) && metadata.historyRevision >= 0 && metadata.historyRevision < 4294967295 && Array.isArray(metadata.historyRevisions) && metadata.historyRevisions.length === 1 && metadata.historyRevisions[0] === metadata.historyRevision) {
        textOnlyHistory = true;
      }
      pendingHistoryRoot = null;
    },
    reset() {
      invalidate();
      owner = facade = null;
      pendingHistoryRoot = null;
      failed = textOnlyHistory = false;
    },
    view(editor) {
      if (owner !== editor) {
        invalidate();
        textOnlyHistory = false;
        if (pendingHistoryRoot !== editor)
          pendingHistoryRoot = null;
        owner = editor;
        facade = null;
      }
      if (!editor)
        return editor;
      if (!facade)
        facade = new Proxy(Object.create(null), {
          get(_, key) {
            const method = Reflect.get(editor, key, editor);
            if (typeof method !== "function")
              return method;
            if (!HEADER_READS.has(key))
              return method.bind(editor);
            return (...args) => {
              if (owner !== editor)
                throw new Error("StaleDisplayResourceOwner");
              if (args.length)
                return method.apply(editor, args);
              try {
                if (!values.has(key))
                  values.set(key, structuredClone(method.call(editor)));
                return structuredClone(values.get(key));
              } catch (error) {
                failed = true;
                invalidate();
                throw error;
              }
            };
          }
        });
      return facade;
    }
  };
}

// js/wasm-memory.mjs
function createMemory(wasm) {
  const decoder = new TextDecoder;
  const copy = (ptr, length) => length === 0 ? new Uint8Array(0) : new Uint8Array(wasm.memory.buffer, ptr >>> 0, length).slice();
  const withBytes = (bytes, fn, secret = false) => {
    const ptr = wasm.cfb_alloc(bytes.length) >>> 0;
    if (!ptr)
      throw new Error("OutOfMemory");
    try {
      new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
      return fn(ptr, bytes.length);
    } finally {
      if (secret)
        new Uint8Array(wasm.memory.buffer, ptr, Math.max(bytes.length, 1)).fill(0);
      wasm.cfb_free(ptr, bytes.length);
    }
  };
  return {
    copy,
    error: () => new Error(decoder.decode(copy(wasm.cfb_error_ptr(), wasm.cfb_error_len()))),
    withBytes,
    withSecretBytes: (bytes, fn) => withBytes(bytes, fn, true)
  };
}

// js/abi-schema.mjs
var ABI_VERSION = 6;
var EXPERIMENTAL_EDITOR_FUNCTIONS = Object.freeze([
  "hwp5_edit_open",
  "hwp5_edit_close",
  "hwp5_edit_section_count",
  "hwp5_edit_paragraph_count",
  "hwp5_edit_char_shape_count",
  "hwp5_edit_copy_text",
  "hwp5_edit_splice",
  "hwp5_edit_format",
  "hwp5_edit_save",
  "hwp5_edit_output_ptr",
  "hwp5_edit_output_len",
  "hwp5_edit_output_free",
  "hwp5_edit_reflow"
]);
var HWPX_DOCUMENT_PROVENANCE_FUNCTIONS = Object.freeze(["hwpx_edit_document_provenance"]);
var DOCUMENT = Object.freeze({
  header_bytes: 8,
  node_bytes: 56,
  parent: 0,
  kind: 4,
  name_len: 8,
  content_len: 12,
  state: 16,
  reserved: 20,
  created: 24,
  modified: 32,
  clsid: 40
});
var FIELD = Object.freeze({ name: 0, path: 1, content: 2, clsid: 3 });
var VALUE = Object.freeze({
  kind: 0,
  color: 1,
  left: 2,
  right: 3,
  child: 4,
  state: 5,
  created: 6,
  modified: 7,
  start: 8,
  size: 9,
  uses_fat: 10,
  has_content: 11
});
var REQUIRED_FUNCTIONS = Object.freeze([
  "hwpjs_abi_version",
  "cfb_alloc",
  "cfb_free",
  "cfb_open",
  "cfb_open_strict",
  "cfb_find_exact",
  "cfb_write",
  "cfb_document",
  "cfb_output_ptr",
  "cfb_output_len",
  "cfb_output_free",
  "cfb_close",
  "cfb_error_ptr",
  "cfb_error_len",
  "cfb_error_code_ptr",
  "cfb_error_code_len",
  "cfb_count",
  "cfb_find",
  "cfb_find_snapshot",
  "cfb_field_ptr",
  "cfb_field_len",
  "cfb_value",
  "cfb_sector_count",
  "cfb_raw_ptr",
  "cfb_raw_len",
  "hwp5_text_read",
  "hwp5_text_ptr",
  "hwp5_text_len",
  "hwp5_text_free"
]);

// js/abi.mjs
function validateAbi(wasm) {
  if (typeof wasm.hwpjs_abi_version !== "function")
    throw new Error("Missing HWPJS ABI version");
  const actual = wasm.hwpjs_abi_version();
  if (actual !== ABI_VERSION)
    throw new Error(`Unsupported HWPJS ABI ${actual}; expected ${ABI_VERSION}`);
  for (const name of REQUIRED_FUNCTIONS) {
    if (typeof wasm[name] !== "function")
      throw new Error(`Missing HWPJS ABI export: ${name}`);
  }
  if (!(wasm.memory instanceof WebAssembly.Memory))
    throw new Error("Missing HWPJS ABI memory");
}

// js/output-bytes.mjs
var nodeBuffer = typeof Buffer !== "undefined" && typeof process !== "undefined" && process.versions?.node ? Buffer : null;

// js/input.mjs
var bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
var typedArrayName = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).get;
function inputBytes(data) {
  if (ArrayBuffer.isView(data) && typedArrayName.call(data) === "Uint8Array")
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let isBuffer = false;
  try {
    bufferLength.call(data);
    isBuffer = true;
  } catch {}
  if (isBuffer)
    return new Uint8Array(data);
  if (!Array.isArray(data))
    throw new TypeError("Expected Uint8Array, ArrayBuffer, or an array of bytes");
  const bytes = new Uint8Array(data.length);
  for (let i = 0;i < bytes.length; i++) {
    const value = data[i];
    if (!Number.isInteger(value) || value < 0 || value > 255)
      throw new TypeError(`Invalid byte at index ${i}`);
    bytes[i] = value;
  }
  return bytes;
}

// js/hwp5-text-wire.mjs
var decoder = new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true });
function decodeHwp5Text(bytes, { allowGenerated = false } = {}) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  function word() {
    if (offset + 4 > bytes.length)
      throw new Error("InvalidHwp5TextWire");
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  }
  function raw(length) {
    if (length > bytes.length - offset)
      throw new Error("InvalidHwp5TextWire");
    const result = bytes.slice(offset, offset + length);
    offset += length;
    return result;
  }
  if (new TextDecoder().decode(raw(4)) !== "H5T1")
    throw new Error("InvalidHwp5TextWire");
  const versionRaw = word();
  const sectionCount = word();
  if (sectionCount > 1024)
    throw new Error("InvalidHwp5TextWire");
  const sections = [];
  for (let s = 0;s < sectionCount; s++) {
    const index = word();
    const paragraphCount = word();
    if (index !== s || paragraphCount > bytes.length / 20)
      throw new Error("InvalidHwp5TextWire");
    const paragraphs = [];
    for (let p = 0;p < paragraphCount; p++) {
      const nodeRaw = word();
      const nodeIndex = allowGenerated && nodeRaw === 4294967295 ? null : nodeRaw;
      const parentRaw = word();
      const declaredUnits = word();
      const present = word();
      if (present > 1)
        throw new Error("InvalidHwp5TextWire");
      const tokenCount = word();
      if (tokenCount > bytes.length / 12)
        throw new Error("InvalidHwp5TextWire");
      const tokens = [];
      const textParts = [];
      for (let t = 0;t < tokenCount; t++) {
        const kind = word();
        const startUnit = word();
        const data = raw(word());
        if (kind === 0) {
          if (data.length % 2)
            throw new Error("InvalidHwp5TextWire");
          const value = decoder.decode(data);
          textParts.push(value);
          tokens.push({ type: "text", startUnit, text: value, raw: data });
        } else if (kind === 1 && (data.length === 2 || data.length === 16)) {
          const code = data[0] | data[1] << 8;
          tokens.push({ type: "control", startUnit, code, raw: data });
        } else
          throw new Error("InvalidHwp5TextWire");
      }
      if (!present && tokenCount)
        throw new Error("InvalidHwp5TextWire");
      paragraphs.push({
        nodeIndex,
        parentNodeIndex: parentRaw === 4294967295 ? null : parentRaw,
        declaredUnits,
        textPresent: Boolean(present),
        text: textParts.join(""),
        tokens
      });
    }
    sections.push({ index, paragraphs });
  }
  if (offset !== bytes.length)
    throw new Error("InvalidHwp5TextWire");
  return {
    version: [
      versionRaw >>> 24,
      versionRaw >>> 16 & 255,
      versionRaw >>> 8 & 255,
      versionRaw & 255
    ],
    sections
  };
}

// js/hwp5-section-inventory.mjs
var availableSectionExports = Object.freeze([
  "hwp5_text_read_available",
  "hwp5_text_declared_sections",
  "hwp5_text_distribution"
]);
function sectionInventory(declared, available) {
  if (![declared, available].every((value) => Number.isInteger(value) && value >= 1 && value <= 1024))
    throw new Error("InvalidSectionInventory");
  return { declared, available, mismatch: declared !== available };
}
function checkedSectionInventory(value) {
  const result = sectionInventory(value?.declared, value?.available);
  if (value.mismatch !== result.mismatch)
    throw new Error("InvalidSectionInventory");
  return result;
}

// js/hwp5.mjs
async function createHwp5Reader(source) {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  const memory = createMemory(wasm);
  let closed = false;
  const readText = (data, availableOnly = false) => {
    if (closed)
      throw new Error("ReaderClosed");
    if (availableOnly && !availableSectionExports.every((name) => typeof wasm[name] === "function"))
      throw new Error("AvailableSectionsPreviewUnavailable");
    const bytes = inputBytes(data);
    if (bytes.length > 64 * 1024 * 1024)
      throw new RangeError("LimitExceeded");
    return memory.withBytes(bytes, (ptr, size) => {
      try {
        const read = availableOnly ? wasm.hwp5_text_read_available : wasm.hwp5_text_read;
        if (!read(ptr, size))
          throw memory.error();
        const result = decodeHwp5Text(memory.copy(wasm.hwp5_text_ptr(), wasm.hwp5_text_len()));
        if (typeof wasm.hwp5_text_distribution === "function" && wasm.hwp5_text_distribution() === 1) {
          result.readOnly = true;
          result.primarySource = "distribution_viewtext";
        }
        if (availableOnly) {
          const declared = wasm.hwp5_text_declared_sections(), available = result.sections.length;
          result.readOnly = true;
          result.primarySource = result.primarySource === "distribution_viewtext" ? "available_viewtext" : "available_bodytext";
          result.sectionInventory = sectionInventory(declared, available);
        }
        return result;
      } finally {
        wasm.hwp5_text_free();
      }
    });
  };
  return {
    readText(data) {
      return readText(data);
    },
    readAvailableText(data) {
      return readText(data, true);
    },
    close() {
      if (!closed)
        wasm.hwp5_text_free();
      closed = true;
    }
  };
}

// web/preview/text-offsets.mjs
function retainedTextView(paragraph) {
  const retained = (code) => [2, 3, 4, 8, 9, 11, 16, 17, 18, 21, 22, 23].includes(code);
  if (!paragraph.tokens.some((t) => t.type === "control" && (retained(t.code) || t.code === 10 || t.code === 24 || t.code === 30 || t.code === 31)))
    return null;
  const chunks = [], offsets = [{ at: 0, source: 0 }];
  let source = 0, display = 0, ended = false;
  for (const t of paragraph.tokens) {
    if (ended || t.startUnit !== source)
      return null;
    if (t.type === "text") {
      if (t.raw.length !== t.text.length * 2)
        return null;
      chunks.push(t.text);
      display += t.text.length;
    } else if (t.code === 10 && t.raw.length === 2) {
      chunks.push(`
`);
      display++;
    } else if (t.code === 24 && t.raw.length === 2) {
      chunks.push("­");
      display++;
    } else if ((t.code === 30 || t.code === 31) && t.raw.length === 2) {
      chunks.push(" ");
      display++;
    } else if (retained(t.code) && t.raw.length === 16) {
      chunks.push(t.code === 9 ? "\t" : t.code === 3 ? "«" : t.code === 4 ? "»" : "￼");
      display++;
      offsets.push({ at: display, source: source + t.raw.length / 2 });
    } else if (t.code === 13 && t.raw.length === 2)
      ended = true;
    else
      return null;
    source += t.raw.length / 2;
  }
  if (!ended || source !== paragraph.declaredUnits)
    return null;
  return { text: chunks.join(""), offsets };
}
function sourceDisplayPosition(unit, offsets, displayLength) {
  if (!Number.isInteger(unit) || unit < 0 || !Number.isInteger(displayLength) || displayLength < 0 || !Array.isArray(offsets) || offsets.length === 0)
    throw new RangeError("InvalidSourceDisplayPosition");
  let previous;
  for (const row of offsets) {
    if (!row || !Number.isInteger(row.at) || !Number.isInteger(row.source) || row.at < 0 || row.source < 0 || previous && (row.at <= previous.at || row.source <= previous.source))
      throw new RangeError("InvalidSourceDisplayPosition");
    previous = row;
  }
  if (offsets[0].at !== 0 || offsets[0].source !== 0)
    throw new RangeError("InvalidSourceDisplayPosition");
  const index = offsets.findLastIndex((row) => row.source <= unit);
  if (index < 0)
    throw new RangeError("InvalidSourceDisplayPosition");
  const row = offsets[index], result = row.at + unit - row.source, next = offsets[index + 1];
  if (result > displayLength || next && result >= next.at && unit < next.source)
    throw new RangeError("InvalidSourceDisplayPosition");
  return result;
}

// web/preview/content.mjs
function clipText(text, maxUnits) {
  let end = Math.min(text.length, maxUnits);
  if (end < text.length && end > 0 && text.charCodeAt(end - 1) >= 55296 && text.charCodeAt(end - 1) <= 56319)
    end--;
  return text.slice(0, end);
}
function displayContent(result, { maxUnits = 200000, maxParagraphs = 20000, paragraphOffset = 0, paragraphOrdinals = null } = {}) {
  if (![maxUnits, maxParagraphs, paragraphOffset].every((value) => Number.isSafeInteger(value) && value >= 0))
    throw new RangeError("InvalidDisplayBounds");
  const total = result.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
  if (paragraphOrdinals !== null && (paragraphOffset !== 0 || !Array.isArray(paragraphOrdinals) || paragraphOrdinals.some((value, index) => !Number.isSafeInteger(value) || value < 0 || value >= total || index > 0 && value <= paragraphOrdinals[index - 1])))
    throw new RangeError("InvalidDisplayBounds");
  if (paragraphOrdinals !== null && paragraphOrdinals.length > maxParagraphs)
    throw new RangeError("ParagraphWindowBudgetExceeded");
  const selected = paragraphOrdinals === null ? null : new Set(paragraphOrdinals);
  const paragraphs = [];
  let units = 0, totalParagraphs = 0, ordinal = 0, limited = paragraphOffset > 0 || selected !== null && selected.size < total;
  for (const section of result.sections) {
    totalParagraphs += section.paragraphs.length;
    for (const [index, p] of section.paragraphs.entries()) {
      const current = ordinal++;
      if (selected !== null ? !selected.has(current) : current < paragraphOffset)
        continue;
      if (paragraphs.length >= maxParagraphs) {
        limited = true;
        continue;
      }
      const room = maxUnits - units;
      const retainedView = retainedTextView(p), fullText = retainedView?.text ?? p.text;
      let text = fullText;
      if (text.length > room) {
        text = clipText(text, room);
        limited = true;
      }
      units += text.length;
      const controls = p.tokens.filter((t) => t.type === "control").length;
      const empty = !p.textPresent && p.declaredUnits <= 1;
      const editable = !result.readOnly && (p.textPresent || empty) && text.length === fullText.length && (retainedView !== null || p.tokens.every((t) => t.type !== "control" || t.code === 13));
      paragraphs.push({
        section: section.index,
        paragraph: index,
        editable,
        label: `구역 ${section.index + 1} · 문단 ${index + 1}${p.parentNodeIndex !== null ? " · 중첩" : ""}${empty ? " · 빈 문단" : ""}${controls ? ` · 제어 표식 ${controls}개 (표시 의미 미적용)` : ""}`,
        text: p.textPresent || empty ? text : "[직접 텍스트 없음]"
      });
      if (text.length !== fullText.length)
        paragraphs.at(-1).clipped = true;
      paragraphs.at(-1).selectionOwner = p.parentNodeIndex === null ? `section:${section.index}:body` : null;
      if (retainedView && text.length === fullText.length)
        paragraphs.at(-1).sourceOffsets = retainedView.offsets;
    }
  }
  return {
    format: "hwp5",
    version: result.version.join("."),
    paragraphs,
    totalParagraphs,
    limited,
    ...result.readOnly ? { readOnly: true, primarySource: result.primarySource } : {}
  };
}

// web/preview/hwp5-available-preview.mjs
function availableSectionsCapability(module) {
  if (!(module instanceof WebAssembly.Module))
    return false;
  const names = new Set(WebAssembly.Module.exports(module).filter((entry) => entry.kind === "function").map((entry) => entry.name));
  return availableSectionExports.every((name) => names.has(name));
}
function availableSectionsRequest(message) {
  const value = message.availableSectionsOnly ?? false;
  if (message.availableSectionsOnly === null || typeof value !== "boolean")
    throw new Error("InvalidAvailableSectionsPolicy");
  if (value && (message.format ?? "hwp5") !== "hwp5")
    throw new Error("UnsupportedAvailableSectionsFormat");
  return value;
}
function availableSectionsContent(preview) {
  if (preview?.readOnly !== true || !["available_bodytext", "available_viewtext"].includes(preview.primarySource))
    throw new Error("InvalidAvailableSectionsPreview");
  const inventory = checkedSectionInventory(preview.sectionInventory);
  return { ...displayContent(preview), availableSectionsOnly: true, sectionInventory: inventory };
}

// js/hwp5-available-section-copy.mjs
var availableSectionCopyExports = Object.freeze([
  "hwp5_edit_open_available_section_copy",
  "hwp5_edit_available_section_copy_info"
]);
function validateAvailableSectionCopyOption(value, distribution, normalizeObservedCfb) {
  if (typeof value !== "boolean")
    throw new TypeError("Invalid available section copy option");
  if (value && (distribution || normalizeObservedCfb))
    throw new Error("ConflictingAvailableSectionCopyOptions");
}
function decodeAvailableSectionCopyInfo(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (value === null)
    return null;
  const inventory = sectionInventory(value?.declared, value?.available);
  if (!inventory.mismatch)
    throw new Error("InvalidAvailableSectionCopyInfo");
  return {
    normalized: true,
    historyBaseline: "available-sections-copy",
    deviations: null,
    sectionInventory: inventory,
    missingContentRecovered: false
  };
}

// web/preview/hwp5-available-copy-preview.mjs
function availableSectionCopyCapability(module) {
  if (!(module instanceof WebAssembly.Module))
    return false;
  const names = new Set(WebAssembly.Module.exports(module).filter((row) => row.kind === "function").map((row) => row.name));
  return availableSectionCopyExports.every((name) => names.has(name));
}
function availableSectionCopyRequest(message) {
  const value = message.availableSectionCopy === undefined ? false : message.availableSectionCopy;
  validateAvailableSectionCopyOption(value, message.distribution ?? false, message.normalizeObservedCfb ?? false);
  if (value && message.availableSectionsOnly === true)
    throw new Error("ConflictingAvailableSectionCopyOptions");
  if (value && (message.format ?? "hwp5") !== "hwp5")
    throw new Error("UnsupportedAvailableSectionCopyFormat");
  return value;
}

// js/hwpx-text-wire.mjs
var kinds = [
  "paragraph_start",
  "paragraph_end",
  "run_start",
  "run_end",
  "text_start",
  "text_end",
  "content",
  "inline_start",
  "inline_end",
  "inline_empty"
];
var inlineKinds = [
  "tab",
  "fw_space",
  "nb_space",
  "line_break",
  "title_mark",
  "markpen_begin",
  "markpen_end",
  "hypen",
  "unknown"
];
var decoder2 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
function decodeHwpxText(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const invalid = () => {
    throw new Error("InvalidHwpxTextWire");
  };
  const word = () => {
    if (offset + 4 > bytes.length)
      invalid();
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  };
  if (word() !== 827611208)
    invalid();
  const sectionCount = word(), paragraphCount = word(), eventCount = word();
  if (sectionCount > 4096 || eventCount > (bytes.length - offset) / 32 || paragraphCount > eventCount / 2)
    invalid();
  const events = [];
  let starts = 0, ends = 0;
  for (let i = 0;i < eventCount; i++) {
    const section = word(), itemIndex = word(), paragraph = word(), run = word(), text = word();
    const kind = word(), inline = word(), length = word();
    if (section >= sectionCount || paragraph === 0 || kind >= kinds.length || length > bytes.length - offset)
      invalid();
    if (kind >= 7 ? inline >= inlineKinds.length : inline !== 4294967295)
      invalid();
    if (kind === 5 && length !== 0)
      invalid();
    const raw = Uint8Array.from(bytes.subarray(offset, offset + length));
    offset += length;
    let value;
    try {
      value = decoder2.decode(raw);
    } catch {
      invalid();
    }
    if (kind === 0)
      starts++;
    if (kind === 1)
      ends++;
    events.push({
      section,
      itemIndex,
      paragraph,
      run,
      text,
      kind: kinds[kind],
      inlineKind: kind >= 7 ? inlineKinds[inline] : null,
      value,
      raw
    });
  }
  if (offset !== bytes.length || starts !== paragraphCount || ends !== paragraphCount)
    invalid();
  return { format: "hwpx", branchPolicy: "selected_default", sectionCount, paragraphCount, events };
}

// js/hwpx.mjs
async function createHwpxReader(source) {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  for (const name of ["hwpx_text_read", "hwpx_text_ptr", "hwpx_text_len", "hwpx_text_free"])
    if (typeof wasm[name] !== "function")
      throw new Error("HwpxTextAbiUnavailable");
  const memory = createMemory(wasm);
  let closed = false;
  return {
    readTextEvents(data) {
      if (closed)
        throw new Error("ReaderClosed");
      const bytes = inputBytes(data);
      if (bytes.length > 64 * 1024 * 1024)
        throw new RangeError("LimitExceeded");
      return memory.withBytes(bytes, (ptr, size) => {
        try {
          if (!wasm.hwpx_text_read(ptr, size))
            throw memory.error();
          return decodeHwpxText(memory.copy(wasm.hwpx_text_ptr(), wasm.hwpx_text_len()));
        } finally {
          wasm.hwpx_text_free();
        }
      });
    },
    close() {
      if (!closed)
        wasm.hwpx_text_free();
      closed = true;
    }
  };
}

// js/atomic-formatting-api.mjs
function createAtomicFormattingApi({ wasm, memory, check, prefix }) {
  const suffixes = [
    "formatting_capabilities",
    "query_formatting",
    "apply_formatting_patch",
    "output_ptr",
    "output_len",
    "output_free",
    "history_revision",
    "history_stats"
  ];
  const available = () => suffixes.every((s) => typeof wasm[`${prefix}_${s}`] === "function");
  const required = () => {
    check();
    if (!available())
      throw Error("AtomicFormattingUnavailable");
  };
  const read = (action) => {
    try {
      if (action() !== 1)
        throw memory.error();
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm[`${prefix}_output_ptr`](), wasm[`${prefix}_output_len`]())));
    } finally {
      wasm[`${prefix}_output_free`]();
    }
  };
  const caps = () => {
    required();
    const value = read(() => wasm[`${prefix}_formatting_capabilities`]());
    if (value?.schemaVersion !== 1 || value.atomic !== true || value.format !== prefix.replace(/_edit$/, "") || value.coordinateSpace !== "native-source-utf16" || value.requiresHistoryProtocol !== 2 || typeof value.binding?.session !== "string" || !value.binding.session || !value.fields || typeof value.fields !== "object" || Array.isArray(value.fields) || !Object.values(value.fields).some((field) => field && field.readable === true) || !value.limits || !["requestBytes", "replyBytes", "targets", "ranges", "commands", "fontNameBytes"].every((k) => Number.isSafeInteger(value.limits[k]) && value.limits[k] > 0))
      throw Error("AtomicFormattingUnavailable");
    if (value.binding.revision !== null && (!Number.isSafeInteger(value.binding.revision) || value.binding.revision < 0 || value.binding.revision >= 4294967295))
      throw Error("InvalidFormattingBinding");
    return value;
  };
  const encode = (value, limit) => {
    const bytes = new TextEncoder().encode(JSON.stringify(ownedJSON(value)));
    if (bytes.byteLength > limit)
      throw Error("LimitExceeded");
    return bytes;
  };
  return {
    supportsAtomicFormatting() {
      check();
      return available();
    },
    atomicFormattingCapabilities: caps,
    queryFormatting(request) {
      const policy = caps();
      const bytes = encode(request, policy.limits.requestBytes);
      const value = memory.withBytes(bytes, (ptr, size) => read(() => wasm[`${prefix}_query_formatting`](ptr, size)));
      if (value?.schemaVersion !== 1 || !Array.isArray(value.targets) || !value.observations || value.binding?.session !== request.binding?.session || value.binding?.revision !== request.binding?.revision)
        throw Error("MalformedFormattingQuery");
      return value;
    },
    applyFormattingPatch(request) {
      const policy = caps();
      const bytes = encode(request, policy.limits.requestBytes);
      let started = false, completed;
      try {
        return memory.withBytes(bytes, (ptr, size) => {
          started = true;
          const nativeCode = wasm[`${prefix}_apply_formatting_patch`](ptr, size);
          if (![0, 1, 2, 3].includes(nativeCode))
            return {
              application: "unknown",
              changed: null,
              error: "InvalidAtomicFormattingResult"
            };
          const error = nativeCode === 0 || nativeCode === 3 ? memory.error().message : undefined;
          return completed = {
            nativeCode,
            application: nativeCode === 1 ? "applied" : nativeCode === 3 ? "unknown" : "unapplied",
            changed: nativeCode === 3 ? null : nativeCode === 1,
            ...error ? { error } : {}
          };
        });
      } catch (error) {
        if (!started)
          throw error;
        if (completed)
          return {
            ...completed,
            cleanupError: error?.message || String(error),
            refreshRequired: true
          };
        return { application: "unknown", changed: null, error: error?.message || String(error) };
      }
    }
  };
}
function ownedJSON(value, seen = new Set) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw Error("InvalidNumber");
    return value;
  }
  if (typeof value !== "object" || seen.has(value))
    throw Error("InvalidFormattingDTO");
  const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
  if (!array && proto !== Object.prototype && proto !== null)
    throw Error("InvalidFormattingDTO");
  seen.add(value);
  try {
    const result = array ? [] : Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === "length")
        continue;
      if (typeof key !== "string")
        throw Error("InvalidFormattingDTO");
      if (array && !/^(0|[1-9][0-9]*)$/.test(key))
        throw Error("InvalidFormattingDTO");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor))
        throw Error("AccessorPayloadUnsupported");
      if (descriptor.value === undefined) {
        if (array)
          throw Error("InvalidFormattingDTO");
        continue;
      }
      result[key] = ownedJSON(descriptor.value, seen);
    }
    if (array && result.length !== value.length)
      throw Error("InvalidFormattingDTO");
    for (let i = 0;array && i < value.length; i++)
      if (!Object.hasOwn(result, i))
        throw Error("InvalidFormattingDTO");
    return result;
  } finally {
    seen.delete(value);
  }
}

// js/hwpx-table-caption.mjs
function decodeTableCaption(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  return validateTableCaption(value);
}
function validateTableCaption(value) {
  if (value === null)
    return null;
  const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
  const signed = (v) => Number.isSafeInteger(v) && v >= -2147483648 && v <= 4294967295;
  const optional = (v, check) => v === null || check(v);
  for (const field of ["text_direction", "line_wrap", "vertical_alignment"])
    if (!optional(value?.[field], (v) => uint(v) && v <= 2))
      throw new Error("InvalidTableCaption");
  if (!value || typeof value !== "object" || Array.isArray(value) || !uint(value.caption_node) || !optional(value.list_node, uint) || !optional(value.side, (v) => uint(v) && v <= 3) || ![null, false, true].includes(value.full_size) || !optional(value.width, signed) || !optional(value.gap, signed) || !optional(value.last_width, uint))
    throw new Error("InvalidTableCaption");
  return value;
}

// js/hwpx-shape-source-values.mjs
function validateShapeSourceValues(value) {
  const fail = () => {
    throw new Error("InvalidShapeSourceValues");
  };
  const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
  const signed = (v) => Number.isSafeInteger(v) && v >= -2147483648 && v <= 4294967295;
  const optional = (v, check) => v === null || check(v);
  const geometry = value?.geometry;
  if (!geometry || ![geometry.width, geometry.height].every((v) => optional(v, uint)) || !optional(geometry.width_relative, (v) => uint(v) && v <= 4) || !optional(geometry.height_relative, (v) => uint(v) && v <= 2) || ![null, false, true].includes(geometry.treat_as_character) || ![geometry.horizontal_offset, geometry.vertical_offset].every((v) => optional(v, signed)))
    fail();
  if (Object.hasOwn(value, "position")) {
    const p = value.position;
    if (!p || !Array.isArray(p.flags) || p.flags.length !== 4 || !p.flags.every((v) => [null, false, true].includes(v)) || !Array.isArray(p.relations) || p.relations.length !== 4 || !p.relations.every((v, i) => optional(v, (n) => uint(n) && n <= [2, 3, 4, 4][i])))
      fail();
  }
  if (Object.hasOwn(value, "flow")) {
    const f = value.flow;
    if (!f || !optional(f.text_wrap, (n) => uint(n) && n <= 5) || !optional(f.text_flow, (n) => uint(n) && n <= 3) || !optional(f.z_order, signed) || !Array.isArray(f.outside_margins) || f.outside_margins.length !== 4 || !f.outside_margins.every((v) => optional(v, signed)))
      fail();
  }
  return value;
}

// js/hwpx-drawing-text-values.mjs
function validDrawingTextValues(text, drawingNode) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const signed = (value) => Number.isSafeInteger(value) && value >= -2147483648 && value <= 4294967295;
  const optional = (value, check) => value === null || check(value);
  return Boolean(text && typeof text === "object" && !Array.isArray(text) && uint(drawingNode) && uint(text.node) && text.node > drawingNode && optional(text.list_node, uint) && (text.list_node === null || text.list_node > text.node) && typeof text.margin_present === "boolean" && Array.isArray(text.margins) && text.margins.length === 4 && Array.from(text.margins).every((value) => optional(value, signed)) && [null, false, true].includes(text.editable) && optional(text.last_width, uint) && (text.margin_present || text.margins.every((value) => value === null)) && [text.text_direction, text.line_wrap, text.vertical_alignment].every((value) => optional(value, (n) => uint(n) && n <= 2)));
}

// js/hwpx-drawing-text-snapshot.mjs
function decodeDrawingTextSnapshot(bytes) {
  const fail = () => {
    throw new Error("InvalidDrawingTextSnapshot");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length > 65536)
    return fail();
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
  const signed = (v) => Number.isSafeInteger(v) && v >= -2147483648 && v <= 4294967295;
  const optional = (v, check) => v === null || check(v);
  if (!value || ![value.drawing_node, value.paragraph, value.anchor_unit].every(uint) || value.paragraph === 0)
    return fail();
  if (value.group_context !== undefined && value.group_context !== null) {
    const group = value.group_context;
    if (!group || ![group.parent_container, group.root_anchor, group.depth].every(uint) || group.depth < 1 || group.root_anchor > group.parent_container || group.parent_container >= value.drawing_node)
      return fail();
  }
  const geometry = value.geometry, text = value.text;
  if (!geometry || !validDrawingTextValues(text, value.drawing_node))
    return fail();
  try {
    validateShapeSourceValues(value);
  } catch {
    return fail();
  }
  if (Object.hasOwn(value, "caption")) {
    try {
      validateTableCaption(value.caption);
    } catch {
      return fail();
    }
    if (value.caption !== null && value.caption.caption_node <= value.drawing_node)
      return fail();
  }
  if (Object.hasOwn(value, "transform_identity") && ![null, false, true].includes(value.transform_identity))
    return fail();
  if (Object.hasOwn(value, "rendering")) {
    const r = value.rendering;
    if (!r || !Array.isArray(r.flip) || r.flip.length !== 2 || !r.flip.every((v) => [null, false, true].includes(v)) || ![null, false, true].includes(r.reverse) || !optional(r.angle, uint))
      return fail();
    if (Object.hasOwn(r, "center") && (!Array.isArray(r.center) || r.center.length !== 2 || !r.center.every((v) => optional(v, signed))))
      return fail();
    if (Object.hasOwn(r, "rotate_image") && ![null, false, true].includes(r.rotate_image))
      return fail();
    if (r.matrix === null) {
      if (![
        "UnsupportedPictureMatrixSequence",
        "IncompletePictureMatrix",
        "NonFinitePictureMatrix"
      ].includes(r.matrix_error))
        return fail();
    } else if (!Array.isArray(r.matrix) || r.matrix.length !== 6 || !r.matrix.every(Number.isFinite) || r.matrix_error !== null)
      return fail();
  }
  if (Object.hasOwn(value, "rectangle")) {
    const r = value.rectangle;
    if (!r || typeof r.present !== "boolean" || !uint(r.unknown_children) || !Array.isArray(r.points) || r.points.length !== 4 || !r.points.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => optional(v, signed))) || !Array.isArray(r.point_present) || r.point_present.length !== 4 || !r.point_present.every((v) => typeof v === "boolean"))
      return fail();
    if (r.points.some((point, i) => !r.point_present[i] && point.some((v) => v !== null)) || !r.present && r.point_present.some(Boolean))
      return fail();
  }
  if (Object.hasOwn(value, "stroke")) {
    if (value.stroke === null) {
      if (![
        "UnsupportedLineStrokeDecoration",
        "UnsupportedLineStrokeColor",
        "UnsupportedLineStrokeStyle"
      ].includes(value.stroke_error))
        return fail();
    } else {
      const s = value.stroke;
      if (!s || value.stroke_error !== null || !optional(s.color, (n) => uint(n) && n <= 16777215) || !optional(s.width, uint) || !optional(s.style, (n) => uint(n) && n <= 6))
        return fail();
    }
  }
  if (Object.hasOwn(value, "rendering_corners") && value.rendering_corners !== null && (!Array.isArray(value.rendering_corners) || value.rendering_corners.length !== 4 || !value.rendering_corners.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))))
    return fail();
  if (Object.hasOwn(value, "paint")) {
    const p = value.paint;
    if (!p || ![p.fill_node, p.shadow_node].every((v) => optional(v, uint)) || !optional(p.shadow_type, (n) => uint(n) && n <= 14) || p.shadow_node === null && p.shadow_type !== null)
      return fail();
  }
  return value;
}

// js/hwpx-drawing-text-requested.mjs
var uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
function drawingTextRequest(nodes, limit) {
  if (!uint(limit) || limit < 1 || limit > 1024)
    throw Error("InvalidDrawingTextRequestLimit");
  if (!Array.isArray(nodes))
    throw Error("InvalidDrawingTextRequest");
  const count = nodes.length;
  if (!uint(count) || count > limit)
    throw Error("InvalidDrawingTextRequest");
  const requested = [];
  for (let index = 0;index < count; index++) {
    if (!Object.hasOwn(nodes, index))
      throw Error("InvalidDrawingTextRequest");
    const node = nodes[index];
    if (!uint(node))
      throw Error("InvalidDrawingTextRequest");
    requested.push(node);
  }
  if (nodes.length !== count)
    throw Error("InvalidDrawingTextRequest");
  return { requested, bytes: new TextEncoder().encode(JSON.stringify(requested)) };
}
function decodeDrawingTextRequested(bytes, requested) {
  const fail = () => {
    throw Error("InvalidDrawingTextRequested");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length > 1024 * (65536 + 256) + 2)
    fail();
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (!Array.isArray(rows) || rows.length !== requested.length || rows.length > 1024)
    fail();
  const encoder = new TextEncoder;
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row) || row.node !== requested[index] || Object.keys(row).length !== 2)
      fail();
    if (Object.hasOwn(row, "unavailable")) {
      if (typeof row.unavailable !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(row.unavailable) || row.unavailable === "OutOfMemory")
        fail();
      return { node: row.node, unavailable: row.unavailable };
    }
    if (!Object.hasOwn(row, "source"))
      fail();
    const source = decodeDrawingTextSnapshot(encoder.encode(JSON.stringify(row.source)));
    if (source.drawing_node !== row.node)
      fail();
    return { node: row.node, source };
  });
}

// js/u32-index-request.mjs
function encodeU32IndexRequest(indices, limit, limitError, requestError) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!uint(limit) || limit === 0)
    throw Error(limitError);
  if (!Array.isArray(indices) || indices.length > limit)
    throw RangeError(requestError);
  for (let at = 0;at < indices.length; at++)
    if (!Object.hasOwn(indices, at) || !uint(indices[at]))
      throw RangeError(requestError);
  const bytes = new Uint8Array(4 + indices.length * 4), view = new DataView(bytes.buffer);
  view.setUint32(0, indices.length, true);
  indices.forEach((index, at) => view.setUint32(4 + at * 4, index, true));
  return bytes;
}

// js/hwpx-line-geometry.mjs
function decodeLineGeometry(bytes, expectedNode) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
  if (!value || value.current !== true || value.coordinateSpace !== "renderingInfo" || value.paintable !== false || value.geometry?.node !== expectedNode || !["node", "paragraph", "anchor_node", "anchor_unit"].every((name) => uint(value.geometry[name])) || value.geometry.paragraph < 1 || !Array.isArray(value.geometry.endpoints) || value.geometry.endpoints.length !== 2 || !value.geometry.endpoints.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)))
    throw new Error("InvalidLineGeometry");
  return value;
}

// js/hwpx-picture-geometry-wire.mjs
function decodePictureGeometry(bytes) {
  const fail = () => {
    throw new Error("InvalidPictureGeometry");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length !== 48)
    fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = view.getUint32(4, true);
  if (view.getUint32(0, true) !== 826757192 || flags & ~127 || view.getUint32(28, true))
    fail();
  const values = Array.from({ length: 5 }, (_, i) => view.getUint32(8 + i * 4, true));
  if (values[2] > 4 || values[3] > 2 || values[4] > 1)
    fail();
  const result = {};
  for (const [index, name] of [
    "width",
    "height",
    "widthRelative",
    "heightRelative",
    "treatAsCharacter"
  ].entries()) {
    if (!(flags & 1 << index) && values[index] !== 0)
      fail();
    result[name] = flags & 1 << index ? index === 4 ? Boolean(values[index]) : values[index] : null;
  }
  for (const [index, name] of ["horizontalOffset", "verticalOffset"].entries()) {
    const value = view.getBigInt64(32 + index * 8, true), present = flags & 1 << index + 5;
    if (value < -2147483648n || value > 4294967295n || !present && value !== 0n)
      fail();
    result[name] = present ? Number(value) : null;
  }
  return result;
}

// js/hwpx-picture-position-wire.mjs
function decodePicturePosition(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 40)
    throw new Error("InvalidPicturePosition");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), presence = view.getUint32(4, true);
  if (view.getUint32(0, true) !== 827347016 || presence & ~255)
    throw new Error("InvalidPicturePosition");
  const maxima = [1, 1, 1, 1, 2, 3, 4, 4];
  const fields = maxima.map((maximum, index) => {
    const value = view.getUint32(8 + index * 4, true), present = Boolean(presence & 1 << index);
    if (value > maximum || !present && value !== 0)
      throw new Error("InvalidPicturePosition");
    return present ? index < 4 ? Boolean(value) : value : null;
  });
  return { flags: fields.slice(0, 4), relations: fields.slice(4) };
}

// js/hwpx-picture-flow-wire.mjs
function decodePictureFlow(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 56)
    throw new Error("InvalidPictureFlow");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), presence = view.getUint32(4, true);
  if (view.getUint32(0, true) !== 826691656 || presence & ~127)
    throw new Error("InvalidPictureFlow");
  const fields = Array.from({ length: 7 }, (_, index) => {
    const value = index < 2 ? view.getUint32(8 + index * 4, true) : Number(view.getBigInt64(16 + (index - 2) * 8, true));
    const present = Boolean(presence & 1 << index);
    if (index < 2 ? value > [5, 3][index] : value < -2147483648 || value > 4294967295)
      throw new Error("InvalidPictureFlow");
    if (!present && value !== 0)
      throw new Error("InvalidPictureFlow");
    return present ? value : null;
  });
  return {
    textWrap: fields[0],
    textFlow: fields[1],
    zOrder: fields[2],
    outsideMargins: fields.slice(3)
  };
}

// js/hwpx-drawing-placement-wire.mjs
function decodeDrawingPlacement(bytes, errorName = "InvalidDrawingPlacement") {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 144)
    throw new Error(errorName);
  return {
    geometry: decodePictureGeometry(bytes.subarray(0, 48)),
    position: decodePicturePosition(bytes.subarray(48, 88)),
    flow: decodePictureFlow(bytes.subarray(88, 144))
  };
}

// js/hwpx-line-display-wire.mjs
function decodeLinePlacement(bytes) {
  return decodeDrawingPlacement(bytes, "InvalidLinePlacement");
}
function decodeLineNodes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8)
    throw new Error("InvalidLineNodes");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  if (view.getUint32(0, true) !== 827214920 || bytes.length !== 8 + count * 4)
    throw new Error("InvalidLineNodes");
  const nodes = Array.from({ length: count }, (_, i) => view.getUint32(8 + i * 4, true));
  if (nodes.some((node, i) => i > 0 && node <= nodes[i - 1]))
    throw new Error("InvalidLineNodes");
  return nodes;
}
function decodeLineDisplay(bytes) {
  if (!(bytes instanceof Uint8Array) || ![56, 72].includes(bytes.length))
    throw new Error("InvalidLineDisplay");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== (bytes.length === 56 ? 826559560 : 843336776) || view.getUint32(4, true) !== 0 || view.getUint32(12, true) === 0)
    throw new Error("InvalidLineDisplay");
  const endpoints = [0, 1].map((i) => [0, 1].map((axis) => view.getFloat64(24 + (i * 2 + axis) * 8, true)));
  if (endpoints.flat().some((number) => !Number.isFinite(number)))
    throw new Error("InvalidLineDisplay");
  let stroke = { color: null, width: null, style: null };
  if (bytes.length === 72) {
    const flags = view.getUint32(56, true);
    if (flags > 7)
      throw new Error("InvalidLineDisplay");
    stroke = Object.fromEntries(["color", "width", "style"].map((name, i) => {
      const value = view.getUint32(60 + i * 4, true), present = flags & 1 << i;
      if (!present && value !== 0)
        throw new Error("InvalidLineDisplay");
      return [name, present ? value : null];
    }));
    if (stroke.color > 16777215 || stroke.style > 5)
      throw new Error("InvalidLineDisplay");
  }
  return {
    lineNode: view.getUint32(8, true),
    paragraph: view.getUint32(12, true),
    anchorNode: view.getUint32(16, true),
    anchorUnit: view.getUint32(20, true),
    endpoints,
    stroke
  };
}

// js/hwpx-line-display-batch.mjs
function encodeLineDisplayNodes(nodes, limit) {
  return encodeU32IndexRequest(nodes, limit, "InvalidLineDisplayBatchLimit", "InvalidLineDisplayBatchNodes");
}
var errorName = (value) => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value) && value !== "OutOfMemory";
function decodeLineDisplayBatch(bytes, nodes) {
  const fail = () => {
    throw Error("InvalidLineDisplayBatch");
  };
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(rows) || rows.length !== nodes.length)
    fail();
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row) || row.node !== nodes[index])
      fail();
    if (Object.hasOwn(row, "error")) {
      if (Object.keys(row).length !== 2 || !errorName(row.error))
        fail();
      return row;
    }
    if (Object.keys(row).length !== 3 || !Object.hasOwn(row, "geometry"))
      fail();
    const geometry = decodeLineGeometry(new TextEncoder().encode(JSON.stringify(row.geometry)), nodes[index]);
    if (Object.hasOwn(row, "displayError")) {
      if (!errorName(row.displayError))
        fail();
      return { node: row.node, geometry, displayError: row.displayError };
    }
    if (!Array.isArray(row.display) || row.display.length !== 72 || !row.display.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
      fail();
    const display = decodeLineDisplay(Uint8Array.from(row.display)), g = geometry.geometry;
    if (display.lineNode !== row.node || display.paragraph !== g.paragraph || display.anchorNode !== g.anchor_node || display.anchorUnit !== g.anchor_unit || display.endpoints.some((p, i) => p.some((n, j) => n !== g.endpoints[i][j])))
      fail();
    return { node: row.node, geometry, display };
  });
}

// js/hwpx-fill-brushes.mjs
function decodeFillBrushes(bytes) {
  const fail = () => {
    throw new Error("InvalidFillBrushes");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length > 128 * 1024 * 1024)
    return fail();
  let v;
  try {
    v = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
  const optionalUint = (n) => n === null || uint(n);
  const kinds = ["win_brush", "gradation", "img_brush", "color", "image"];
  if (!v || !Array.isArray(v.brushes) || !Array.isArray(v.nodes) || !Array.isArray(v.kind_counts) || v.kind_counts.length !== kinds.length || !v.kind_counts.every(uint))
    return fail();
  for (const key of [
    "header_and_sections",
    "master_pages",
    "other_attributes",
    "unknown_enums",
    "non_six_hex_colors",
    "attribute_bytes",
    "direct_children",
    "color_count_mismatch"
  ])
    if (!uint(v[key]))
      return fail();
  for (const b of v.brushes) {
    if (!b || !["header", "section", "master_page"].includes(b.part_kind) || ![b.part_item_index, b.element_index, b.other_attributes, b.direct_children].every(uint) || !optionalUint(b.section_ordinal) || !optionalUint(b.parent_element_index) || !Array.isArray(b.child_counts) || b.child_counts.length !== 3 || !b.child_counts.every(uint))
      return fail();
  }
  const counts = kinds.map(() => 0);
  for (const [index, n] of v.nodes.entries()) {
    if (!n || !kinds.includes(n.kind) || !uint(n.brush_index) || n.brush_index >= v.brushes.length || !optionalUint(n.parent_node_index) || n.parent_node_index !== null && n.parent_node_index >= index || ![
      n.element_index,
      n.attribute_bytes,
      n.other_attributes,
      n.unknown_enums,
      n.non_six_hex_colors,
      n.direct_children,
      n.recognized_children
    ].every(uint) || !Array.isArray(n.raw) || n.raw.length !== 19 || !n.raw.every((s) => s === null || typeof s === "string"))
      return fail();
    if (n.parent_node_index !== null && v.nodes[n.parent_node_index].brush_index !== n.brush_index)
      return fail();
    counts[kinds.indexOf(n.kind)]++;
  }
  if (!counts.every((count, i) => count === v.kind_counts[i]))
    return fail();
  return v;
}

// js/hwpx-table-border-sources.mjs
function decodeTableBorderSources(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const fail = () => {
    throw new Error("InvalidTableBorderSources");
  };
  const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
  const optionalUint = (v) => v === null || uint(v);
  const text = (v) => v === null || typeof v === "string" && v.length <= 4096;
  const edge = (v) => v === null || v && !Array.isArray(v) && ["style", "width", "color"].every((k) => text(v[k]));
  if (!value || value.sourceOnly !== true || !Array.isArray(value.cells) || !Array.isArray(value.styles) || value.cells.length > 1e5 || value.styles.length > 4096)
    fail();
  const ids = new Set, nodes = new Set;
  for (const style of value.styles) {
    if (!style || !uint(style.id) || !uint(style.node) || ids.has(style.id) || nodes.has(style.node) || !Array.isArray(style.edges) || style.edges.length !== 4 || !style.edges.every(edge) || !edge(style.diagonal) || !["slash", "back_slash", "three_d", "shadow", "center_line"].every((k) => text(style[k])) || !["slash_node", "back_slash_node", "fill_node"].every((k) => optionalUint(style[k])) || !uint(style.unknown_children) || style.unknown_attributes !== undefined && !uint(style.unknown_attributes))
      fail();
    ids.add(style.id);
    nodes.add(style.node);
    if (style.fill_report !== undefined && style.fill_report !== null) {
      const report = decodeFillBrushes(new TextEncoder().encode(JSON.stringify(style.fill_report)));
      if (report.brushes.length !== 1 || report.brushes[0].part_kind !== "header" || report.brushes[0].section_ordinal !== null || report.brushes[0].element_index !== style.fill_node || report.brushes[0].parent_element_index !== style.node)
        fail();
    }
  }
  let previous = -1;
  const lists = new Set;
  for (const cell of value.cells) {
    if (!cell || !uint(cell.table_node) || !uint(cell.cell_node) || cell.cell_node <= previous || cell.table_node >= cell.cell_node || !uint(cell.list_node) || cell.list_node <= cell.cell_node || lists.has(cell.list_node) || !optionalUint(cell.border_fill_id) || !optionalUint(cell.style_index) || cell.border_fill_id === null !== (cell.style_index === null) || cell.style_index !== null && value.styles[cell.style_index]?.id !== cell.border_fill_id)
      fail();
    previous = cell.cell_node;
    lists.add(cell.list_node);
  }
  return value;
}

// js/hwpx-table-border-batch.mjs
var uint2 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
function encodeTableBorderSections(sections, limit) {
  return encodeU32IndexRequest(sections, limit, "InvalidTableBorderBatchLimit", "InvalidTableBorderSections");
}
function decodeTableBorderBatch(bytes, sections) {
  const fail = () => {
    throw Error("InvalidTableBorderBatch");
  };
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(value) || value.length !== sections.length)
    fail();
  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || entry.section !== sections[index] || !uint2(entry.section))
      fail();
    if (Object.hasOwn(entry, "error")) {
      if (Object.hasOwn(entry, "value") || Object.keys(entry).length !== 2 || typeof entry.error !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(entry.error) || entry.error === "OutOfMemory")
        fail();
    } else {
      if (Object.keys(entry).length !== 2 || !Object.hasOwn(entry, "value"))
        fail();
      entry.value = decodeTableBorderSources(new TextEncoder().encode(JSON.stringify(entry.value)));
    }
  }
  return value;
}

// js/hwpx-shape-layout-values.mjs
function validShapeLayoutValues(value) {
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
  const optional = (n, check) => n === null || check(n);
  const signed = (n) => Number.isSafeInteger(n) && n >= -2147483648 && n <= 4294967295;
  const bool = (n) => n === null || typeof n === "boolean";
  const array = (a, length, check) => Array.isArray(a) && a.length === length && a.every(check);
  const g = value?.geometry, p = value?.position, f = value?.flow;
  return Boolean(g && p && f && [g.width, g.height].every((n) => optional(n, uint)) && optional(g.width_relative, (n) => uint(n) && n <= 4) && optional(g.height_relative, (n) => uint(n) && n <= 2) && bool(g.treat_as_character) && [g.horizontal_offset, g.vertical_offset].every((n) => optional(n, signed)) && array(p.flags, 4, bool) && Array.isArray(p.relations) && p.relations.length === 4 && p.relations.every((n, i) => optional(n, (n) => uint(n) && n <= [2, 3, 4, 4][i])) && optional(f.text_wrap, (n) => uint(n) && n <= 5) && optional(f.text_flow, (n) => uint(n) && n <= 3) && optional(f.z_order, signed) && array(f.outside_margins, 4, (n) => optional(n, signed)));
}

// js/hwpx-shape-paint-values.mjs
function validShapePaintValues(source) {
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
  const optional = (n, check) => n === null || check(n);
  if (source?.stroke === null) {
    if (![
      "UnsupportedLineStrokeDecoration",
      "UnsupportedLineStrokeColor",
      "UnsupportedLineStrokeStyle"
    ].includes(source.stroke_error))
      return false;
  } else if (!source?.stroke || source.stroke_error !== null || !optional(source.stroke.color, (n) => uint(n) && n <= 16777215) || !optional(source.stroke.width, uint) || !optional(source.stroke.style, (n) => uint(n) && n <= 6))
    return false;
  const paint = source.paint;
  return Boolean(paint && [paint.fill_node, paint.shadow_node].every((n) => optional(n, uint)) && optional(paint.shadow_type, (n) => uint(n) && n <= 14) && !(paint.shadow_node === null && paint.shadow_type !== null));
}

// js/hwpx-shape-common-source.mjs
var object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var uint3 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var coordinate = (value) => value === null || Number.isInteger(value) && value >= -2147483648 && value <= 4294967295;
var optionalBoolean = (value) => value === null || typeof value === "boolean";
function validShapeCommonSource(value) {
  if (!validShapeLayoutValues(value))
    return false;
  if (Object.hasOwn(value, "component_sizes")) {
    const sizes = value.component_sizes;
    if (!object(sizes) || !["original", "current"].every((key) => sizes[key] === null || object(sizes[key]) && [sizes[key].width, sizes[key].height].every((n) => n === null || uint3(n))))
      return false;
  }
  if (Object.hasOwn(value, "stroke_style") && !(value.stroke_style === null || uint3(value.stroke_style) && value.stroke_style <= 17))
    return false;
  if (value.stroke && value.stroke_style !== undefined && value.stroke_style !== value.stroke.style)
    return false;
  if (["stroke", "stroke_error", "paint"].some((key) => Object.hasOwn(value, key)) && !validShapePaintValues(value))
    return false;
  const r = value.rendering;
  if (!object(r) || !Array.isArray(r.flip) || r.flip.length !== 2 || !Array.from(r.flip).every(optionalBoolean) || !(r.angle === null || uint3(r.angle)) || !optionalBoolean(r.reverse) || !optionalBoolean(r.rotate_image) || !Array.isArray(r.center) || r.center.length !== 2 || !Array.from(r.center).every(coordinate))
    return false;
  return r.matrix === null ? [
    "UnsupportedPictureMatrixSequence",
    "IncompletePictureMatrix",
    "NonFinitePictureMatrix"
  ].includes(r.matrix_error) : Array.isArray(r.matrix) && r.matrix.length === 6 && Array.from(r.matrix).every(Number.isFinite) && r.matrix_error === null;
}

// js/hwpx-group-context.mjs
function validGroupContext(value, node) {
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
  if (!uint(node))
    return false;
  if (value === null)
    return true;
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && [value.parent_container, value.root_anchor, value.depth].every(uint) && value.depth >= 1 && value.root_anchor <= value.parent_container && value.parent_container < node && value.depth <= value.parent_container - value.root_anchor + 1 && value.depth === 1 === (value.parent_container === value.root_anchor));
}

// js/hwpx-curve-geometry.mjs
var object2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var uint4 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var coordinate2 = (value) => value === null || Number.isInteger(value) && value >= -2147483648 && value <= 4294967295;
function decodeCurveGeometry(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!object2(value) || value.sourceOnly !== true || !uint4(value.node) || Object.hasOwn(value, "common") && (!validShapeCommonSource(value.common) || !validGroupContext(value.common.group_context, value.node)) || Object.hasOwn(value, "text") && value.text !== null && !validDrawingTextValues(value.text, value.node) || !Array.isArray(value.segments) || value.segments.length > 65536 || !Array.from(value.segments).every((segment) => object2(segment) && (segment.kind === null || typeof segment.kind === "string" && new TextEncoder().encode(segment.kind).length <= 4096) && ["x1", "y1", "x2", "y2"].every((key) => coordinate2(segment[key]))))
    throw new Error("InvalidCurveGeometry");
  return value;
}

// js/hwpx-curve-owner.mjs
var uint5 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var object3 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function decodeCurveOwner(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const owner = value?.owner;
  if (!object3(value) || value.sourceOnly !== true || !uint5(value.node) || owner !== null && (!object3(owner) || ![owner.paragraph, owner.anchor_node, owner.anchor_unit].every(uint5) || owner.paragraph === 0 || owner.anchor_node >= value.node))
    throw new Error("InvalidCurveOwner");
  return value;
}

// js/hwpx-tab-sources.mjs
var uint6 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var object4 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function decodeTabSources(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  return validateTabSources(value);
}
function validateTabSources(value) {
  if (!object4(value) || !uint6(value.section) || !uint6(value.paragraph) || value.paragraph === 0 || !Array.isArray(value.rows))
    throw new Error("InvalidTabSources");
  let previous = -1;
  const nodes = new Set;
  for (const row of value.rows) {
    if (!object4(row) || !uint6(row.unit) || !uint6(row.node) || row.unit <= previous || nodes.has(row.node) || ![row.width, row.tab_type, row.leader].every((raw) => raw === null || typeof raw === "string" && new TextEncoder().encode(raw).length <= 4096))
      throw new Error("InvalidTabSources");
    previous = row.unit;
    nodes.add(row.node);
  }
  return value;
}

// js/hwpx-tab-definitions.mjs
var uint7 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var object5 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var raw = (value) => value === null || typeof value === "string" && new TextEncoder().encode(value).length <= 4096;
function validateTabDefinitions(rows) {
  if (!Array.isArray(rows))
    throw new Error("InvalidTabDefinitions");
  let previous = -1, count = 0;
  for (const row of rows) {
    if (!object5(row) || !uint7(row.id) || row.id <= previous || !raw(row.auto_left) || !raw(row.auto_right) || !Array.isArray(row.items))
      throw new Error("InvalidTabDefinitions");
    previous = row.id;
    count += row.items.length;
    if (count > 1e6)
      throw new Error("InvalidTabDefinitions");
    for (const item of row.items)
      if (!object5(item) || !raw(item.pos) || !raw(item.kind) || !raw(item.leader) || Object.hasOwn(item, "unit") && !raw(item.unit))
        throw new Error("InvalidTabDefinitions");
  }
  return rows;
}
function decodeTabDefinitions(bytes) {
  return validateTabDefinitions(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// js/hwpx-section-tabs.mjs
var uint8 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var raw2 = (value) => value === null || typeof value === "string" && new TextEncoder().encode(value).length <= 4096;
function validateSectionTabs(rows) {
  if (!Array.isArray(rows))
    throw new Error("InvalidSectionTabSources");
  let previous = null;
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) || !uint8(row.section) || !uint8(row.node) || ![row.tab_stop, row.tab_stop_val, row.tab_stop_unit].every(raw2) || Object.hasOwn(row, "body_owner") && row.body_owner !== null && (!uint8(row.body_owner) || row.body_owner >= row.node) || previous && (row.section < previous.section || row.section === previous.section && row.node <= previous.node))
      throw new Error("InvalidSectionTabSources");
    previous = row;
  }
  return rows;
}
function decodeSectionTabs(bytes) {
  return validateSectionTabs(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// js/cell-size-batch.mjs
function encodeCellSizes(cells) {
  if (!Array.isArray(cells))
    throw new TypeError("InvalidCellSizeBatch");
  if (cells.length > 4096)
    throw new RangeError("LimitExceeded");
  const names = ["section", "listNode", "width", "height"], seen = new Set;
  const bytes = new Uint8Array(cells.length * 16), view = new DataView(bytes.buffer);
  for (let i = 0;i < cells.length; i++) {
    const cell = cells[i];
    if (!cell || typeof cell !== "object" || Array.isArray(cell) || Object.keys(cell).some((key) => !names.includes(key)))
      throw new TypeError("InvalidCellSizeBatch");
    const values = names.map((name) => {
      const value = cell[name];
      if (!Number.isInteger(value) || value < 0 || value > 4294967295)
        throw new RangeError("InvalidCellSizeBatch");
      return value;
    });
    const key = `${values[0]}:${values[1]}`;
    if (seen.has(key))
      throw new Error("DuplicateCellSizeEdit");
    seen.add(key);
    values.forEach((value, column) => view.setUint32(i * 16 + column * 4, value, true));
  }
  return bytes;
}

// js/font-face-identity.mjs
var FONT_LANGUAGES = Object.freeze([
  "hangul",
  "latin",
  "hanja",
  "japanese",
  "other",
  "symbol",
  "user"
]);
function validFontFaceOrder(rows) {
  let previousLanguage = -1, previousId = -1;
  for (const row of rows) {
    const language = FONT_LANGUAGES.indexOf(row?.language);
    if (language < 0 || language < previousLanguage || !Number.isInteger(row.id) || row.id < 0 || row.id > 4294967295 || language === previousLanguage && row.id <= previousId)
      return false;
    previousLanguage = language;
    previousId = row.id;
  }
  return true;
}

// js/font-metadata-wire.mjs
var metadataKeys = (row, names) => row !== null && typeof row === "object" && !Array.isArray(row) && Object.keys(row).length === names.length && names.every((name) => Object.hasOwn(row, name));
var metadataText = (value) => value === null || typeof value === "string" && value.isWellFormed() && new TextEncoder().encode(value).length <= 4096;
function decodeMetadataWire(bytes, errorName) {
  const fail = () => {
    throw new Error(errorName);
  };
  if (!(bytes instanceof Uint8Array))
    return fail();
  let wire;
  try {
    wire = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (!metadataKeys(wire, ["version", "fonts"]) || wire.version !== 1 || !Array.isArray(wire.fonts) || wire.fonts.length > 1e6 || !validFontFaceOrder(wire.fonts))
    return fail();
  return wire.fonts;
}

// js/character-font-metrics.mjs
var fields = ["ratio", "spacing", "relativeSize", "offset"];
function decodeCharacterFontMetrics(bytes, format) {
  const fail = () => {
    throw new Error("InvalidCharacterFontMetrics");
  };
  let wire;
  try {
    if (!(bytes instanceof Uint8Array))
      return fail();
    wire = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (!metadataKeys(wire, ["version", "format", "shapes"]) || wire.version !== 1 || wire.format !== format || !["hwp5", "hwpx"].includes(format) || !Array.isArray(wire.shapes) || wire.shapes.length > 1e5)
    return fail();
  let previous = -1;
  for (const row of wire.shapes) {
    if (!metadataKeys(row, ["id", "values"]) || !Number.isInteger(row.id) || row.id < 0 || row.id > 4294967295 || row.id <= previous || !metadataKeys(row.values, fields))
      return fail();
    previous = row.id;
    for (const key of fields) {
      const values = row.values[key];
      if (values === null && format === "hwpx")
        continue;
      if (!Array.isArray(values) || values.length !== 7)
        return fail();
      const signed = key === "spacing" || key === "offset";
      const lower = format === "hwpx" ? -2147483648 : signed ? -128 : 0;
      const upper = format === "hwpx" ? 2147483647 : signed ? 127 : 255;
      if (values.some((value) => !(value === null && format === "hwpx") && (!Number.isInteger(value) || value < lower || value > upper)))
        return fail();
    }
  }
  return wire.shapes;
}

// js/equation-engine.mjs
function createEquationEngine(wasm) {
  for (const name of [
    "equation_process",
    "equation_output_ptr",
    "equation_output_len",
    "equation_output_free",
    "equation_error_ptr",
    "equation_error_len"
  ])
    if (typeof wasm?.[name] !== "function")
      throw new Error("EquationEngineAbiUnavailable");
  const memory = createMemory(wasm);
  const encoder = new TextEncoder, decoder = new TextDecoder("utf-8", { fatal: true });
  function run(operation, source, settings, extra = {}) {
    if (typeof source !== "string" || !source.isWellFormed())
      throw new Error("InvalidEquationSource");
    if (source.length > 1024 * 1024)
      throw new Error("EquationProtocolLimitExceeded");
    for (const key of ["size", "script_scale", "fraction_scale"])
      if (!Number.isFinite(settings?.[key]) || settings[key] <= 0)
        throw new Error("InvalidEquationMeasurementSize");
    if (settings.allow_unclosed_groups !== undefined && typeof settings.allow_unclosed_groups !== "boolean")
      throw new Error("InvalidEquationRecoveryPolicy");
    const json = JSON.stringify({
      operation,
      source,
      size: settings.size,
      script_scale: settings.script_scale,
      fraction_scale: settings.fraction_scale,
      ...settings.allow_unclosed_groups === true ? { allow_unclosed_groups: true } : {},
      ...extra
    });
    if (json.length > 16 * 1024 * 1024)
      throw new Error("EquationProtocolLimitExceeded");
    const input = encoder.encode(json);
    if (input.length > 16 * 1024 * 1024)
      throw new Error("EquationProtocolLimitExceeded");
    try {
      return memory.withBytes(input, (ptr, size) => {
        if (!wasm.equation_process(ptr, size))
          throw new Error(decoder.decode(memory.copy(wasm.equation_error_ptr(), wasm.equation_error_len())));
        const length = wasm.equation_output_len();
        if (!Number.isInteger(length) || length < 0 || length > 32 * 1024 * 1024)
          throw new Error("InvalidEquationOutputLength");
        return JSON.parse(decoder.decode(memory.copy(wasm.equation_output_ptr(), length)));
      });
    } finally {
      wasm.equation_output_free();
    }
  }
  return {
    measure: (source, settings) => run("measure", source, settings),
    layout: (source, settings, measurements, layout) => run("layout", source, settings, { measurements, layout })
  };
}

// js/hwpx-equation-styles.mjs
function decodeEquationStyles(bytes) {
  const fail = () => {
    throw new Error("InvalidHwpxEquationStyles");
  };
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (!Array.isArray(rows) || rows.length > 1e5)
    return fail();
  const seen = new Set;
  const sizes = new Set, uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
  for (const row of rows) {
    if (!Number.isInteger(row?.node) || row.node < 0 || row.node > 4294967295 || seen.has(row.node))
      return fail();
    seen.add(row.node);
    for (const key of ["font", "base_unit", "base_line", "text_color", "line_mode", "error_name"])
      if (row[key] !== null && (typeof row[key] !== "string" || !row[key].isWellFormed() || row[key].length > 4096))
        return fail();
    if (row.error_name !== null && !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(row.error_name))
      return fail();
    if (row.error_name !== null && ["font", "base_unit", "base_line", "text_color", "line_mode"].some((key) => row[key] !== null))
      return fail();
    if (row.size_error !== undefined && row.size_error !== null && (typeof row.size_error !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(row.size_error) || row.source_size !== null))
      return fail();
    const size = row.source_size;
    if (size !== undefined && size !== null) {
      if (!size || typeof size !== "object" || Array.isArray(size) || !uint(size.node) || size.node <= row.node || sizes.has(size.node) || !uint(size.other_attributes) || !uint(size.direct_children) || row.error_name !== null || ["width", "height", "width_relative_to", "height_relative_to", "protect"].some((key) => size[key] !== null && (typeof size[key] !== "string" || !size[key].isWellFormed() || size[key].length > 4096)))
        return fail();
      sizes.add(size.node);
    }
  }
  return rows;
}

// js/chart-point-batch.mjs
function readChartPointBatchLimits(wasm) {
  if (![
    "hwpx_edit_set_chart_points",
    "hwpx_edit_chart_point_batch_max_edits",
    "hwpx_edit_chart_point_batch_max_bytes",
    "hwpx_edit_chart_point_max_bytes"
  ].every((name) => typeof wasm[name] === "function"))
    throw new Error("HwpxChartBatchEditAbiUnavailable");
  const limits = {
    maxEdits: wasm.hwpx_edit_chart_point_batch_max_edits(),
    maxBytes: wasm.hwpx_edit_chart_point_batch_max_bytes(),
    maxValueBytes: wasm.hwpx_edit_chart_point_max_bytes()
  };
  validateLimits(limits);
  if (!Number.isInteger(limits.maxValueBytes) || limits.maxValueBytes <= 0 || limits.maxValueBytes > 4294967295)
    throw new Error("InvalidChartBatchLimit");
  return limits;
}
function validateLimits({ maxEdits, maxBytes }) {
  if (!Number.isInteger(maxEdits) || maxEdits <= 0 || maxEdits > 4294967295 || !Number.isInteger(maxBytes) || maxBytes < 4 || maxBytes > 4294967295)
    throw new Error("InvalidChartBatchLimit");
}
function encodeChartPointBatch(edits, { maxEdits, maxBytes }, encodeValue) {
  validateLimits({ maxEdits, maxBytes });
  if (!Array.isArray(edits))
    throw new TypeError("InvalidChartPointBatch");
  if (edits.length > maxEdits)
    throw new RangeError("LimitExceeded");
  const seen = new Set, rows = [];
  let size = 4;
  for (const edit of edits) {
    if (!edit || typeof edit !== "object" || Array.isArray(edit))
      throw new TypeError("InvalidChartPointBatch");
    const { point, value } = edit;
    if (!Number.isInteger(point) || point < 0 || point > 4294967295)
      throw new RangeError("InvalidInteger");
    if (seen.has(point))
      throw new Error("DuplicateChartPointEdit");
    seen.add(point);
    const bytes = encodeValue(value);
    if (!(bytes instanceof Uint8Array))
      throw new TypeError("InvalidChartPointBytes");
    size += 8 + bytes.length;
    if (!Number.isSafeInteger(size) || size > maxBytes)
      throw new RangeError("LimitExceeded");
    rows.push({ point, bytes });
  }
  const output = new Uint8Array(size), view = new DataView(output.buffer);
  view.setUint32(0, rows.length, true);
  let offset = 4;
  for (const row of rows) {
    view.setUint32(offset, row.point, true);
    view.setUint32(offset + 4, row.bytes.length, true);
    output.set(row.bytes, offset + 8);
    offset += 8 + row.bytes.length;
  }
  return output;
}

// js/hwpx-chart-series-text.mjs
function decodeChartSeriesText(bytes) {
  return validateChartSeriesText(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function validateChartSeriesText(value) {
  if (value?.kind !== "direct_series" || !Array.isArray(value.values))
    throw new Error("InvalidChartSeriesText");
  const seen = new Set;
  for (const row of value.values) {
    if (!row || ![row.series_node, row.text_node, row.value_node].every((n) => Number.isInteger(n) && n >= 0 && n <= 4294967295) || !(row.series_node < row.text_node && row.text_node < row.value_node) || typeof row.text !== "string" || !row.text.isWellFormed() || seen.has(row.value_node))
      throw new Error("InvalidChartSeriesText");
    seen.add(row.value_node);
  }
  return value;
}

// js/hwpx-chart-rich-text.mjs
function decodeChartRichText(bytes) {
  return validateChartRichText(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function validateChartRichText(value) {
  if (value?.kind !== "rich_text" || !Array.isArray(value.values))
    throw new Error("InvalidChartRichText");
  let previousLeaf = -1;
  const runs = new Set;
  for (const row of value.values) {
    if (row?.owner_role !== undefined && !["chart_title", "axis_title", "data_label", "unclassified"].includes(row.owner_role))
      throw new Error("InvalidChartRichText");
    if (row?.plain_text_complete !== undefined && (typeof row.plain_text_complete !== "boolean" || row.owner_role === undefined))
      throw new Error("InvalidChartRichText");
    const nodes = row && [
      row.owner_node,
      row.text_node,
      row.rich_node,
      row.paragraph_node,
      row.run_node,
      row.value_node
    ];
    if (!nodes || !nodes.every((n) => Number.isInteger(n) && n >= 0 && n <= 4294967295) || !nodes.every((n, i) => i === 0 || nodes[i - 1] < n) || row.value_node <= previousLeaf || runs.has(row.run_node) || typeof row.text !== "string" || !row.text.isWellFormed())
      throw new Error("InvalidChartRichText");
    previousLeaf = row.value_node;
    runs.add(row.run_node);
  }
  return value;
}

// js/chart-display-fields.mjs
var object6 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var uint9 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var text = (value) => typeof value === "string" && value.isWellFormed();
var nullableUint = (value) => value === null || uint9(value);
var oneOf = (values) => (value) => values.includes(value);
function field(value, accepts, owner) {
  return value === null || object6(value) && uint9(value.node) && value.node > owner && (value.value === null || accepts(value.value));
}
function number(value) {
  return object6(value) && (value.kind === "finite" ? typeof value.value === "number" && Number.isFinite(value.value) : ["positive_infinity", "negative_infinity", "not_a_number"].includes(value.kind) && value.value === null);
}
function scaling(value, owner) {
  return value === null || object6(value) && uint9(value.node) && value.node > owner && field(value.orientation, oneOf(["minMax", "maxMin"]), value.node) && [value.minimum, value.maximum, value.log_base].every((item) => field(item, number, value.node));
}

// js/chart-display-host.mjs
var optional = (accepts) => (value) => value === null || accepts(value);
var bounded = (max) => (value) => uint9(value) && value <= max;
var boolean = (value) => typeof value === "boolean";
var offset = (value) => Number.isInteger(value) && value >= -2147483648 && value <= 4294967295;
function chartDisplayHost(value, wrapper) {
  if (!object6(value) || value.wrapper_node !== wrapper || !uint9(value.chart_node) || value.chart_node <= wrapper)
    return false;
  const { geometry: g, position: p } = value;
  return object6(g) && object6(p) && [g.width, g.height].every(optional(uint9)) && optional(bounded(4))(g.width_relative) && optional(bounded(2))(g.height_relative) && optional(boolean)(g.treat_as_character) && [g.horizontal_offset, g.vertical_offset].every(optional(offset)) && Array.isArray(p.flags) && p.flags.length === 4 && p.flags.every(optional(boolean)) && Array.isArray(p.relations) && p.relations.length === 4 && p.relations.every((v, i) => optional(bounded([2, 3, 4, 4][i]))(v));
}

// js/chart-series-settings.mjs
var symbols = [
  "auto",
  "circle",
  "dash",
  "diamond",
  "dot",
  "none",
  "picture",
  "plus",
  "square",
  "star",
  "triangle",
  "x"
];
function validChartSeriesSettings(values, plots, series, occupied = null) {
  if (!Array.isArray(values) || values.length !== series.size)
    return false;
  let index = 0;
  for (const [node, plotNode] of series) {
    const row = values[index++], kind = plots.get(plotNode)?.kind;
    if (!object6(row) || row.series_node !== node || row.plot_node !== plotNode || !field(row.smooth, (v) => typeof v === "boolean", node))
      return false;
    if (!field(row.index, uint9, node) || !field(row.order, uint9, node))
      return false;
    const line = ["lineChart", "line3DChart", "stockChart", "scatterChart"].includes(kind);
    if (row.smooth !== null && !line)
      return false;
    if (!field(row.explosion, uint9, node))
      return false;
    if (row.explosion !== null && !["pieChart", "pie3DChart", "ofPieChart", "doughnutChart"].includes(kind))
      return false;
    const marker = row.marker;
    if (marker !== null && (!line && kind !== "radarChart" || !object6(marker) || !uint9(marker.node) || marker.node <= node || !field(marker.symbol, oneOf(symbols), marker.node) || !field(marker.size, (v) => uint9(v) && v >= 2 && v <= 72, marker.node)))
      return false;
    const leaves = [
      row.index,
      row.order,
      row.smooth,
      row.explosion,
      ...marker ? [marker, marker.symbol, marker.size] : []
    ].filter((value) => value !== null);
    const stroke = row.stroke, strokeNodes = [];
    if (stroke !== undefined && stroke !== null) {
      if (!object6(stroke) || !uint9(stroke.node) || stroke.node <= node || !(stroke.no_fill_node === null || uint9(stroke.no_fill_node) && stroke.no_fill_node > stroke.node))
        return false;
      strokeNodes.push(stroke.node);
      if (stroke.no_fill_node !== null)
        strokeNodes.push(stroke.no_fill_node);
    }
    const identities = [...leaves.map((value) => value.node), ...strokeNodes];
    if (new Set(identities).size !== identities.length)
      return false;
    for (const leaf of leaves)
      occupied?.add(leaf.node);
  }
  return true;
}

// js/chart-point-settings.mjs
function validChartPointSettings(values, series, occupied = null) {
  if (!Array.isArray(values))
    return false;
  let previous = -1;
  for (const row of values) {
    if (!object6(row) || !uint9(row.node) || row.node <= previous || !series.has(row.series_node) || series.get(row.series_node) !== row.plot_node || row.node <= row.series_node || typeof row.unparsed_children !== "boolean" || !field(row.index, uint9, row.node) || !field(row.explosion, uint9, row.node))
      return false;
    if (row.index !== null && row.explosion !== null && row.index.node === row.explosion.node)
      return false;
    occupied?.add(row.node);
    if (row.index !== null)
      occupied?.add(row.index.node);
    if (row.explosion !== null)
      occupied?.add(row.explosion.node);
    previous = row.node;
  }
  return true;
}

// js/chart-stock-settings.mjs
function validChartStockSettings(stock, kind, plotNode, usedNodes) {
  if (kind !== "stockChart")
    return stock === null;
  if (!object6(stock))
    return false;
  for (const key of ["high_low_node", "up_down_node", "up_node", "down_node"])
    if (!nullableUint(stock[key]))
      return false;
  if (stock.up_down_node === null && (stock.up_node !== null || stock.down_node !== null || stock.gap_width !== null))
    return false;
  const parent = stock.up_down_node ?? plotNode;
  if (!field(stock.gap_width, (value) => uint9(value) && value <= 500, parent))
    return false;
  for (const key of ["up_node", "down_node"])
    if (stock[key] !== null && stock[key] <= parent)
      return false;
  for (const node of [
    stock.high_low_node,
    stock.up_down_node,
    stock.up_node,
    stock.down_node,
    stock.gap_width?.node ?? null
  ]) {
    if (node === null)
      continue;
    if (node <= plotNode || usedNodes.has(node))
      return false;
    usedNodes.add(node);
  }
  return true;
}

// js/chart-view-3d.mjs
function validChartView3D(value, occupied = null) {
  if (value === undefined || value === null)
    return true;
  if (!object6(value) || !uint9(value.node) || value.node === 0 || occupied?.has(value.node) || typeof value.unparsed_children !== "boolean")
    return false;
  const ranges = {
    rotation_x: [-90, 90],
    rotation_y: [0, 360],
    height_percent: [5, 500],
    depth_percent: [20, 2000],
    perspective: [0, 240]
  };
  const nodes = new Set([value.node]);
  for (const key of [...Object.keys(ranges), "right_angle_axes"]) {
    const accepts = key === "right_angle_axes" ? (v) => typeof v === "boolean" : (v) => Number.isInteger(v) && v >= ranges[key][0] && v <= ranges[key][1];
    const leaf = value[key];
    if (!field(leaf, accepts, value.node))
      return false;
    if (leaf !== null) {
      if (nodes.has(leaf.node) || occupied?.has(leaf.node))
        return false;
      nodes.add(leaf.node);
    }
  }
  return true;
}

// js/chart-spatial-settings.mjs
function validChartSpatialSettings(value, kind, owner, leaves) {
  if (value === undefined)
    return true;
  const spatial = ["bar3DChart", "line3DChart", "area3DChart"].includes(kind);
  if (!spatial)
    return value === null;
  if (!object6(value) || !field(value.gap_depth, (v) => uint9(v) && v <= 500, owner) || !field(value.shape, oneOf(["box", "cone", "coneToMax", "cylinder", "pyramid", "pyramidToMax"]), owner))
    return false;
  if (kind !== "bar3DChart" && value.shape !== null)
    return false;
  for (const leaf of [value.gap_depth, value.shape])
    if (leaf !== null) {
      if (leaves.has(leaf.node))
        return false;
      leaves.add(leaf.node);
    }
  return true;
}

// js/hwpx-chart-display.mjs
var plotKinds = new Set([
  "areaChart",
  "area3DChart",
  "lineChart",
  "line3DChart",
  "stockChart",
  "radarChart",
  "scatterChart",
  "pieChart",
  "pie3DChart",
  "doughnutChart",
  "barChart",
  "bar3DChart",
  "ofPieChart",
  "surfaceChart",
  "surface3DChart",
  "bubbleChart"
]);
var pointKinds = new Set([
  "numeric_cache",
  "numeric_literal",
  "string_cache",
  "string_literal",
  "multilevel_cache"
]);
var roles = new Set(["name", "category", "value", "x", "y", "bubble_size", "unclassified"]);
var fail = () => {
  throw new Error("InvalidChartDisplay");
};
var require2 = (condition) => {
  if (!condition)
    fail();
};
function decodeChartDisplay(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  require2(object6(value) && value.kind === "chart_display");
  for (const name of [
    "plots",
    "plot_settings",
    "axes",
    "axis_links",
    "points",
    "bindings",
    "series_text",
    "rich_text"
  ])
    require2(Array.isArray(value[name]));
  const pair = value.pair;
  require2(object6(pair) && text(pair.chart_path) && pair.chart_path.length > 0 && text(pair.ole_path) && pair.ole_path.length > 0 && uint9(pair.wrapper_node) && uint9(pair.section_ordinal) && typeof pair.declared_external === "boolean" && Array.isArray(pair.section_sha256) && pair.section_sha256.length === 32 && pair.section_sha256.every((n) => uint9(n) && n <= 255));
  require2(chartDisplayHost(value.host, pair.wrapper_node));
  require2(value.plots.length === value.plot_settings.length);
  const plots = new Map, series = new Map, references = new Map;
  const hasStrokes = Array.isArray(value.series_settings) && value.series_settings.some((row) => row?.stroke != null);
  const hasMajorTicks = value.axes.some((axis) => axis?.major_tick_mark != null);
  const occupied = value.view_3d == null && value.blank_policy == null && !hasStrokes && !hasMajorTicks ? null : new Set;
  let previousPlot = -1;
  for (const [index, plot] of value.plots.entries()) {
    require2(object6(plot) && uint9(plot.node) && plot.node > previousPlot && uint9(plot.area_node) && plot.area_node < plot.node && plotKinds.has(plot.kind) && Array.isArray(plot.series_nodes));
    plots.set(plot.node, plot);
    previousPlot = plot.node;
    occupied?.add(plot.node);
    occupied?.add(plot.area_node);
    let previousSeries = plot.node;
    for (const node of plot.series_nodes) {
      require2(uint9(node) && node > previousSeries && !series.has(node));
      series.set(node, plot.node);
      previousSeries = node;
      occupied?.add(node);
    }
    const settings = value.plot_settings[index];
    require2(object6(settings) && field(settings.direction, oneOf(["bar", "col"]), plot.node) && field(settings.grouping, oneOf(["standard", "clustered", "stacked", "percentStacked"]), plot.node) && field(settings.vary_colors, (v) => typeof v === "boolean", plot.node) && Array.isArray(settings.axis_references));
    require2(field(settings.gap_width, (v) => uint9(v) && v <= 500, plot.node) && field(settings.overlap, (v) => Number.isInteger(v) && v >= -100 && v <= 100, plot.node));
    require2(field(settings.scatter_style, oneOf(["line", "lineMarker", "marker", "smooth", "smoothMarker"]), plot.node));
    if (settings.scatter_style !== null)
      require2(plot.kind === "scatterChart");
    require2(field(settings.first_slice_angle, (v) => uint9(v) && v <= 360, plot.node));
    if (settings.first_slice_angle !== null)
      require2(["pieChart", "doughnutChart"].includes(plot.kind));
    require2(field(settings.of_pie_type, oneOf(["pie", "bar"]), plot.node) && field(settings.second_pie_size, (v) => uint9(v) && v >= 5 && v <= 200, plot.node) && field(settings.split_type, oneOf(["auto", "cust", "percent", "pos", "val"]), plot.node) && field(settings.split_position, number, plot.node) && nullableUint(settings.custom_split_node) && (settings.custom_split_node === null || settings.custom_split_node > plot.node));
    if ([
      settings.of_pie_type,
      settings.second_pie_size,
      settings.split_type,
      settings.split_position,
      settings.custom_split_node
    ].some((value) => value !== null))
      require2(plot.kind === "ofPieChart");
    const bar = ["barChart", "bar3DChart"].includes(plot.kind);
    if (settings.direction !== null)
      require2(bar);
    if (settings.grouping !== null)
      require2(bar || ["lineChart", "line3DChart", "areaChart", "area3DChart"].includes(plot.kind));
    if (!bar && settings.grouping?.value === "clustered")
      fail();
    if (settings.gap_width !== null)
      require2(["barChart", "bar3DChart", "ofPieChart"].includes(plot.kind));
    if (settings.overlap !== null)
      require2(plot.kind === "barChart");
    const leaves = new Set;
    for (const leaf of [
      settings.direction,
      settings.grouping,
      settings.vary_colors,
      settings.gap_width,
      settings.overlap,
      settings.scatter_style,
      settings.first_slice_angle,
      settings.of_pie_type,
      settings.second_pie_size,
      settings.split_type,
      settings.split_position,
      ...settings.custom_split_node === null ? [] : [{ node: settings.custom_split_node }],
      ...settings.axis_references
    ])
      if (leaf !== null) {
        require2(object6(leaf) && uint9(leaf.node) && !leaves.has(leaf.node));
        leaves.add(leaf.node);
      }
    require2(validChartStockSettings(settings.stock, plot.kind, plot.node, leaves));
    require2(validChartSpatialSettings(settings.spatial, plot.kind, plot.node, leaves));
    for (const node of leaves)
      occupied?.add(node);
    for (const reference of settings.axis_references) {
      require2(reference !== null && field(reference, uint9, plot.node));
      const key = plot.node + ":" + reference.node;
      require2(!references.has(key));
      references.set(key, reference.value);
    }
  }
  const axes = new Map, definitions = new Map;
  require2(validChartSeriesSettings(value.series_settings, plots, series, occupied));
  require2(validChartPointSettings(value.point_settings, series, occupied));
  for (const axis of value.axes) {
    require2(object6(axis) && uint9(axis.node) && !axes.has(axis.node) && uint9(axis.area_node) && axis.area_node < axis.node && ["catAx", "valAx", "dateAx", "serAx"].includes(axis.kind) && field(axis.id, uint9, axis.node) && field(axis.cross_axis, uint9, axis.node) && field(axis.position, oneOf(["b", "l", "r", "t"]), axis.node) && field(axis.deleted, (v) => typeof v === "boolean", axis.node) && scaling(axis.scaling, axis.node) && (axis.major_tick_mark === undefined || field(axis.major_tick_mark, oneOf(["cross", "in", "none", "out"]), axis.node)));
    axes.set(axis.node, axis);
    occupied?.add(axis.node);
    occupied?.add(axis.area_node);
    for (const leaf of [
      axis.id,
      axis.cross_axis,
      axis.position,
      axis.deleted,
      axis.scaling,
      ...axis.scaling ? [
        axis.scaling.orientation,
        axis.scaling.minimum,
        axis.scaling.maximum,
        axis.scaling.log_base
      ] : []
    ])
      if (leaf !== null)
        occupied?.add(leaf.node);
    if (axis.id?.value !== null && axis.id?.value !== undefined) {
      const key = axis.area_node + ":" + axis.id.value;
      const rows = definitions.get(key) ?? [];
      rows.push(axis.node);
      definitions.set(key, rows);
    }
  }
  require2(value.axis_links.length === references.size);
  const seenLinks = new Set;
  for (const link of value.axis_links) {
    require2(object6(link) && uint9(link.plot_node) && plots.has(link.plot_node) && uint9(link.reference_node) && nullableUint(link.id) && object6(link.target));
    const key = link.plot_node + ":" + link.reference_node;
    require2(references.has(key) && !seenLinks.has(key) && references.get(key) === link.id);
    seenLinks.add(key);
    const matches = link.id === null ? [] : definitions.get(plots.get(link.plot_node).area_node + ":" + link.id) ?? [];
    const status = link.id === null ? "missing_value" : matches.length === 0 ? "missing_definition" : matches.length > 1 ? "ambiguous" : "resolved";
    require2(link.target.status === status && link.target.node === (status === "resolved" ? matches[0] : null));
  }
  require2(value.bindings.length === value.points.length);
  let previousLeaf = -1;
  const pointNodes = new Set;
  for (const [index, point] of value.points.entries()) {
    require2(object6(point) && [point.cache_node, point.point_node, point.value_node, point.index].every(uint9) && point.cache_node < point.point_node && point.point_node < point.value_node && point.value_node > previousLeaf && !pointNodes.has(point.point_node) && pointKinds.has(point.kind) && text(point.value) && nullableUint(point.level_node) && (point.level_node === null || point.cache_node < point.level_node && point.level_node < point.point_node) && point.kind === "multilevel_cache" === (point.level_node !== null));
    previousLeaf = point.value_node;
    pointNodes.add(point.point_node);
    for (const node of [point.cache_node, point.point_node, point.value_node, point.level_node])
      if (node !== null)
        occupied?.add(node);
    const binding = value.bindings[index];
    require2(object6(binding) && binding.point === index && [binding.series_node, binding.plot_node, binding.role_node].every(nullableUint) && roles.has(binding.role));
    for (const node of [binding.series_node, binding.plot_node, binding.role_node])
      if (node !== null)
        occupied?.add(node);
    if (binding.series_node === null)
      require2(binding.plot_node === null && binding.role_node === null && binding.role === "unclassified");
    else {
      require2(binding.plot_node !== null);
      if (series.has(binding.series_node))
        require2(series.get(binding.series_node) === binding.plot_node);
      if (binding.role_node === null)
        require2(binding.role === "unclassified");
      else
        require2(binding.role_node > binding.series_node && binding.role_node < point.cache_node);
    }
  }
  try {
    validateChartSeriesText({ kind: "direct_series", values: value.series_text });
    validateChartRichText({ kind: "rich_text", values: value.rich_text });
  } catch {
    fail();
  }
  for (const row of value.series_text)
    for (const node of [row.series_node, row.text_node, row.value_node])
      occupied?.add(node);
  for (const row of value.rich_text)
    for (const node of [
      row.owner_node,
      row.text_node,
      row.rich_node,
      row.paragraph_node,
      row.run_node,
      row.value_node
    ])
      occupied?.add(node);
  for (const row of value.series_settings)
    if (row.stroke != null) {
      for (const node of [row.stroke.node, row.stroke.no_fill_node].filter((node) => node !== null)) {
        require2(!occupied.has(node));
        occupied.add(node);
      }
    }
  for (const axis of value.axes) {
    if (axis.major_tick_mark != null) {
      require2(!occupied.has(axis.major_tick_mark.node));
      occupied.add(axis.major_tick_mark.node);
    }
  }
  if (value.blank_policy !== undefined && value.blank_policy !== null) {
    require2(field(value.blank_policy, oneOf(["gap", "zero", "span"]), 0) && !occupied.has(value.blank_policy.node));
    occupied.add(value.blank_policy.node);
  }
  require2(validChartView3D(value.view_3d, occupied));
  return value;
}

// js/hwpx-chart-api.mjs
function createHwpxChartApi({ wasm, memory, ready, uint, encodedText }) {
  function chartPointBytes(text, legacyNumeric = false) {
    const nativeLimit = typeof wasm.hwpx_edit_chart_point_max_bytes === "function";
    if (!nativeLimit && !legacyNumeric)
      throw new Error("HwpxChartEditAbiUnavailable");
    const maxBytes = nativeLimit ? wasm.hwpx_edit_chart_point_max_bytes() : 1024 * 1024;
    if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 4294967295)
      throw new Error("InvalidChartPointLimit");
    const bytes = encodedText(text);
    if (bytes.length > maxBytes)
      throw new Error("LimitExceeded");
    return bytes;
  }
  return {
    chartPoints(section, wrapper) {
      ready();
      [section, wrapper].forEach(uint);
      if (typeof wasm.hwpx_edit_chart_points !== "function")
        throw new Error("HwpxChartEditAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_chart_points(section, wrapper))
          throw memory.error();
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    chartSeriesText(section, wrapper) {
      ready();
      [section, wrapper].forEach(uint);
      if (typeof wasm.hwpx_edit_chart_series_text !== "function")
        throw new Error("HwpxChartSeriesTextAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_chart_series_text(section, wrapper))
          throw memory.error();
        return decodeChartSeriesText(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    chartRichText(section, wrapper) {
      ready();
      [section, wrapper].forEach(uint);
      if (typeof wasm.hwpx_edit_chart_rich_text !== "function")
        throw new Error("HwpxChartRichTextAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_chart_rich_text(section, wrapper))
          throw memory.error();
        return decodeChartRichText(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    chartDisplay(section, wrapper) {
      ready();
      [section, wrapper].forEach(uint);
      if (typeof wasm.hwpx_edit_chart_display !== "function")
        throw new Error("HwpxChartDisplayAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_chart_display(section, wrapper))
          throw memory.error();
        return decodeChartDisplay(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    setChartRichText(section, wrapper, ordinal, text) {
      ready();
      [section, wrapper, ordinal].forEach(uint);
      if (typeof wasm.hwpx_edit_set_chart_rich_text !== "function" || typeof wasm.hwpx_edit_chart_rich_text_max_bytes !== "function")
        throw new Error("HwpxChartRichTextAbiUnavailable");
      const maxBytes = wasm.hwpx_edit_chart_rich_text_max_bytes();
      if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 4294967295)
        throw new Error("InvalidChartRichTextLimit");
      const bytes = encodedText(text);
      if (bytes.length > maxBytes)
        throw new Error("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_chart_rich_text(section, wrapper, ordinal, ptr, size))
          throw memory.error();
      });
    },
    setChartSeriesText(section, wrapper, ordinal, text) {
      ready();
      [section, wrapper, ordinal].forEach(uint);
      if (typeof wasm.hwpx_edit_set_chart_series_text !== "function" || typeof wasm.hwpx_edit_chart_series_text_max_bytes !== "function")
        throw new Error("HwpxChartSeriesTextAbiUnavailable");
      const maxBytes = wasm.hwpx_edit_chart_series_text_max_bytes();
      if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 4294967295)
        throw new Error("InvalidChartSeriesTextLimit");
      const bytes = encodedText(text);
      if (bytes.length > maxBytes)
        throw new Error("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_chart_series_text(section, wrapper, ordinal, ptr, size))
          throw memory.error();
      });
    },
    chartNodes(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_chart_nodes !== "function")
        throw new Error("HwpxChartEditAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_chart_nodes(section))
          throw memory.error();
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    chartSites(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_chart_sites !== "function")
        throw new Error("HwpxChartEditAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_chart_sites(section))
          throw memory.error();
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    setChartNumericPoint(section, wrapper, point, value) {
      ready();
      [section, wrapper, point].forEach(uint);
      if (typeof wasm.hwpx_edit_set_chart_numeric_point !== "function")
        throw new Error("HwpxChartEditAbiUnavailable");
      const bytes = chartPointBytes(value, true);
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_chart_numeric_point(section, wrapper, point, ptr, size))
          throw memory.error();
      });
    },
    setChartPoint(section, wrapper, point, value) {
      ready();
      [section, wrapper, point].forEach(uint);
      if (typeof wasm.hwpx_edit_set_chart_point !== "function" || typeof wasm.hwpx_edit_chart_point_max_bytes !== "function")
        throw new Error("HwpxChartEditAbiUnavailable");
      const bytes = chartPointBytes(value);
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_chart_point(section, wrapper, point, ptr, size))
          throw memory.error();
      });
    },
    setChartPoints(section, wrapper, edits) {
      ready();
      [section, wrapper].forEach(uint);
      const bytes = encodeChartPointBatch(edits, readChartPointBatchLimits(wasm), chartPointBytes);
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_chart_points(section, wrapper, ptr, size))
          throw memory.error();
      });
    },
    chartPointBatchLimits() {
      ready();
      return readChartPointBatchLimits(wasm);
    }
  };
}

// js/hwpx-picture-owners.mjs
function decodePictureOwners(bytes) {
  const fail = () => {
    throw new Error("InvalidPictureOwners");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length > 32 * 1024 * 1024)
    fail();
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail();
  }
  if (!Array.isArray(rows) || rows.length > 1e5)
    fail();
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const seen = new Set;
  return rows.map((row) => {
    if (!row || !uint(row.picture_node) || seen.has(row.picture_node))
      fail();
    seen.add(row.picture_node);
    if (row.owner === null) {
      if (typeof row.failure !== "string" || !/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(row.failure))
        fail();
      return { pictureNode: row.picture_node, owner: null, error: row.failure };
    }
    if (row.failure !== null || !row.owner || !uint(row.owner.paragraph) || row.owner.paragraph === 0 || !uint(row.owner.anchor_node) || !uint(row.owner.anchor_unit))
      fail();
    return {
      pictureNode: row.picture_node,
      owner: {
        paragraph: row.owner.paragraph,
        anchorNode: row.owner.anchor_node,
        anchorUnit: row.owner.anchor_unit
      },
      error: null
    };
  });
}

// js/hwpx-inline-string-sources.mjs
function decodeInlineStringSources(bytes) {
  const fail = () => {
    throw new Error("InvalidHwpxInlineStringSources");
  };
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
  const string = (s) => typeof s === "string";
  if (!value || value.sourceOnly !== true || !Array.isArray(value.controls) || !Array.isArray(value.texts))
    return fail();
  if (value.controls.length > 1e5 || value.texts.length > 200000)
    return fail();
  let cursor = 0;
  const seen = new Set;
  for (const [index, control] of value.controls.entries()) {
    if (!control || !["indexmark", "dutmal"].includes(control.kind))
      return fail();
    for (const key of [
      "section_ordinal",
      "element_index",
      "parent_element_index",
      "first_text",
      "text_count",
      "direct_children",
      "unknown_children",
      "other_attributes"
    ])
      if (!uint(control[key]))
        return fail();
    for (const key of ["parent_uri", "parent_local_name", "raw_xml", "direct_text"])
      if (!string(control[key]))
        return fail();
    if (control.parent_element_index >= control.element_index || control.first_text !== cursor || control.text_count > value.texts.length - cursor || control.direct_children !== control.text_count + control.unknown_children)
      return fail();
    const identity = `${control.section_ordinal}:${control.element_index}`;
    if (seen.has(identity))
      return fail();
    seen.add(identity);
    if (!control.attributes || typeof control.attributes !== "object" || Array.isArray(control.attributes))
      return fail();
    for (const key of ["pos_type", "sz_ratio", "option", "style_id_ref", "alignment"])
      if (control.attributes[key] !== null && !string(control.attributes[key]))
        return fail();
    const kinds = control.kind === "dutmal" ? ["main_text", "sub_text"] : ["first_key", "second_key"];
    for (const text of value.texts.slice(cursor, cursor + control.text_count)) {
      if (!text || text.control_index !== index || !kinds.includes(text.kind))
        return fail();
      for (const key of ["element_index", "direct_children", "other_attributes"])
        if (!uint(text[key]))
          return fail();
      if (!string(text.raw_xml) || !string(text.value) || text.element_index <= control.element_index)
        return fail();
      const textIdentity = `${control.section_ordinal}:${text.element_index}`;
      if (seen.has(textIdentity))
        return fail();
      seen.add(textIdentity);
    }
    cursor += control.text_count;
  }
  if (cursor !== value.texts.length)
    return fail();
  return value;
}

// js/hwpx-dutmal-kind.mjs
function dutmalKind(value) {
  if (value === "mainText")
    return 0;
  if (value === "subText")
    return 1;
  throw new RangeError("InvalidDutmalTextKind");
}

// js/hwpx-dutmal-sites.mjs
function decodeDutmalSites(bytes) {
  const fail = () => {
    throw new Error("InvalidHwpxDutmalSites");
  };
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (!Array.isArray(rows) || rows.length > 1e5)
    return fail();
  const nodes = new Set;
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  for (const row of rows) {
    if (!row || !uint(row.node) || !uint(row.paragraph) || row.paragraph === 0 || !uint(row.anchor_unit) || nodes.has(row.node))
      return fail();
    nodes.add(row.node);
  }
  return rows;
}

// js/hwpx-equation-sources.mjs
function decodeEquationSources(bytes) {
  const fail = () => {
    throw new Error("InvalidHwpxEquationSources");
  };
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  return validateEquationSources(rows);
}
function validateEquationSources(rows) {
  const fail = () => {
    throw new Error("InvalidHwpxEquationSources");
  };
  if (!Array.isArray(rows) || rows.length > 1e5)
    return fail();
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const seen = new Set;
  const issues = new Set([
    null,
    "inactive",
    "inline_text_descendant",
    "unsupported_encoding",
    "missing_script",
    "multiple_scripts",
    "nested_script"
  ]);
  let previous = -1;
  for (const row of rows) {
    if (!row || !uint(row.node) || row.node <= previous || typeof row.active !== "boolean" || !uint(row.script_count) || !issues.has(row.issue))
      return fail();
    if (row.script_count === 0 ? row.script_node !== null : !uint(row.script_node) || row.script_node <= row.node)
      return fail();
    if (row.issue === null && (!row.active || row.script_count !== 1))
      return fail();
    if (!row.active && !["inactive", "inline_text_descendant"].includes(row.issue))
      return fail();
    if (row.issue === "inactive" && row.active || row.issue === "missing_script" && row.script_count !== 0 || row.issue === "multiple_scripts" && row.script_count < 2 || row.issue === "nested_script" && row.script_count !== 1)
      return fail();
    for (const node of [row.node, row.script_node])
      if (node !== null) {
        if (seen.has(node))
          return fail();
        seen.add(node);
      }
    previous = row.node;
  }
  return rows;
}

// js/hwpx-equation-scripts.mjs
function decodeEquationScripts(bytes) {
  const fail = () => {
    throw new Error("InvalidHwpxEquationScripts");
  };
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (!value || !Array.isArray(value.rows) || !Number.isInteger(value.script_bytes) || value.script_bytes < 0 || value.script_bytes > 4294967295)
    return fail();
  try {
    validateEquationSources(value.rows.map((row) => row?.source));
  } catch {
    return fail();
  }
  let total = 0;
  const encode = new TextEncoder;
  for (const row of value.rows) {
    if (row.source.issue !== null) {
      if (row.value !== null)
        return fail();
      continue;
    }
    if (typeof row.value !== "string" || !row.value.isWellFormed())
      return fail();
    const count = encode.encode(row.value).length;
    if (count > 4294967295 - total)
      return fail();
    total += count;
  }
  if (total !== value.script_bytes)
    return fail();
  return value;
}

// js/hwpx-equation-sites.mjs
function decodeEquationSites(bytes) {
  const fail = () => {
    throw new Error("InvalidHwpxEquationSites");
  };
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!Array.isArray(rows))
      return fail();
    validateEquationSources(rows.map((row) => row?.source));
  } catch {
    return fail();
  }
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const paragraph = (value) => uint(value) && value > 0;
  for (const row of rows) {
    if (row.source.issue !== null) {
      if (row.paragraph !== null || row.anchor_unit !== null || row.error_name !== null)
        return fail();
    } else if (row.error_name === null) {
      if (!paragraph(row.paragraph) || !uint(row.anchor_unit))
        return fail();
    } else {
      if (typeof row.error_name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(row.error_name) || row.anchor_unit !== null || row.paragraph !== null && !paragraph(row.paragraph))
        return fail();
    }
  }
  return rows;
}

// js/hwpx-field-target-wire.mjs
function validateFieldTargets(targets) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!Array.isArray(targets) || targets.length > 4096 || Array.from(targets).some((target) => !target || ![target.beginElement, target.start, target.end].every(uint) || target.end < target.start))
    throw new Error("InvalidFieldTargets");
  return targets;
}
function decodeFieldTargets(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4)
    throw new Error("InvalidFieldTargets");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(0, true);
  if (count > 4096 || bytes.length !== 4 + count * 12)
    throw new Error("InvalidFieldTargets");
  return validateFieldTargets(Array.from({ length: count }, (_, index) => {
    const offset = 4 + index * 12;
    const target = {
      beginElement: view.getUint32(offset, true),
      start: view.getUint32(offset + 4, true),
      end: view.getUint32(offset + 8, true)
    };
    if (target.end < target.start)
      throw new Error("InvalidFieldTargets");
    return target;
  }));
}

// js/formula-result-paragraphs.mjs
function decodeFormulaResultParagraphs(bytes) {
  const values = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(values))
    throw new Error("InvalidFormulaResultParagraphs");
  let previous = 0;
  for (const value of values) {
    if (!Number.isInteger(value) || value <= previous || value > 4294967295)
      throw new Error("InvalidFormulaResultParagraphs");
    previous = value;
  }
  return values;
}

// js/formula-result-display-snapshot.mjs
function decodeFormulaResultDisplaySnapshot(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const invalid = () => {
    throw new Error("InvalidFormulaResultDisplaySnapshot");
  };
  if (!Array.isArray(rows) || rows.length > 1e5)
    invalid();
  let previous = 0;
  return rows.map((row) => {
    if (!row || !Number.isInteger(row.paragraph) || row.paragraph <= previous || row.paragraph > 4294967295 || typeof row.text !== "string" || !Array.isArray(row.targets) || !row.targets.length)
      invalid();
    previous = row.paragraph;
    const targets = validateFieldTargets(row.targets.map((target) => ({
      beginElement: target?.begin_element,
      start: target?.start,
      end: target?.end
    })));
    if (targets.some((target) => target.end > row.text.length))
      invalid();
    return { paragraph: row.paragraph, text: row.text, targets };
  });
}

// js/hwpx-page-area-declarations.mjs
function decodePageAreaDeclarations(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const invalid = () => {
    throw Error("InvalidPageAreaDeclarations");
  };
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!Array.isArray(rows) || rows.length > 1e5)
    invalid();
  const owners = new Set;
  let previousParagraph = 0;
  return rows.map((row) => {
    if (!row || ![row.paragraph, row.source_element, row.source_control, row.unit].every(uint) || row.paragraph < 1 || row.paragraph < previousParagraph || row.source_control >= row.source_element || !["left", "right"].includes(row.affinity) || owners.has(row.source_element))
      invalid();
    owners.add(row.source_element);
    previousParagraph = row.paragraph;
    return {
      paragraph: row.paragraph,
      sourceElement: row.source_element,
      sourceControl: row.source_control,
      unit: row.unit,
      affinity: row.affinity
    };
  });
}

// js/created-table-identity.mjs
function createdTableIdentity(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,19}$/.test(value))
    throw new RangeError("InvalidCreatedTableIdentity");
  const id = BigInt(value);
  if (id > 18446744073709551615n)
    throw new RangeError("InvalidCreatedTableIdentity");
  return id;
}

// js/hwpx-created-tables.mjs
function decodeCreatedTables(bytes) {
  const fail = () => {
    throw new Error("InvalidCreatedTables");
  };
  if (!(bytes instanceof Uint8Array))
    return fail();
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  return validateCreatedTables(rows);
}
function validateCreatedTables(rows, { hostBase = 1 } = {}) {
  const fail = () => {
    throw new Error("InvalidCreatedTables");
  };
  if (hostBase !== 0 && hostBase !== 1)
    return fail();
  if (!Array.isArray(rows) || rows.length > 1e5)
    return fail();
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const keys = (value, names) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
  const identities = new Set, instances = new Set, paragraphs = new Set;
  for (const row of rows) {
    if (!keys(row, [
      "identity",
      "instance_id",
      "host_paragraph",
      "anchor_unit",
      "rows",
      "columns",
      "width",
      "height",
      "resources",
      "cells"
    ]))
      return fail();
    try {
      createdTableIdentity(row.identity);
    } catch {
      return fail();
    }
    if (identities.has(row.identity))
      return fail();
    identities.add(row.identity);
    if (![
      row.instance_id,
      row.host_paragraph,
      row.anchor_unit,
      row.rows,
      row.columns,
      row.width,
      row.height
    ].every(uint) || !row.instance_id || row.host_paragraph < hostBase || !row.rows || !row.columns || row.width < row.columns || row.height < row.rows || row.height % row.rows || instances.has(row.instance_id))
      return fail();
    instances.add(row.instance_id);
    if (!keys(row.resources, ["paragraph", "character", "style", "border_fill"]) || !Object.values(row.resources).every(uint))
      return fail();
    const count = row.rows * row.columns;
    if (count > 1e5 || !Array.isArray(row.cells) || row.cells.length !== count)
      return fail();
    const height = row.height / row.rows;
    let x = 0;
    for (let index = 0;index < count; index++) {
      const cell = row.cells[index];
      if (!keys(cell, ["paragraph_id", "row", "column", "x", "y", "width", "height", "text"]) || ![cell.paragraph_id, cell.row, cell.column, cell.x, cell.y, cell.width, cell.height].every(uint))
        return fail();
      if (!cell.paragraph_id || paragraphs.has(cell.paragraph_id) || cell.row !== Math.floor(index / row.columns) || cell.column !== index % row.columns || cell.x !== x || !cell.width || cell.height !== height || cell.y !== cell.row * height || typeof cell.text !== "string" || !cell.text.isWellFormed())
        return fail();
      paragraphs.add(cell.paragraph_id);
      x += cell.width;
      if (x > row.width)
        return fail();
      if (cell.column === row.columns - 1) {
        if (x !== row.width)
          return fail();
        x = 0;
      }
    }
  }
  return rows;
}

// js/table-creation-resources.mjs
var decoder3 = new TextDecoder("utf-8", { fatal: true });
function decodeTableCreationResources(bytes) {
  const value = JSON.parse(decoder3.decode(bytes));
  const keys = ["paragraph", "character", "style", "border_fill"];
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key) && Array.isArray(value[key]) && value[key].every((id, i, ids) => Number.isInteger(id) && id >= 0 && id <= 4294967295 && (!i || ids[i - 1] < id))))
    throw new Error("InvalidTableCreationResources");
  return value;
}

// js/hwpx-form-source.mjs
var kinds2 = new Set(["button", "check_button", "combo_box", "radio_button", "edit_box"]);
var uint10 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var object7 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function decode(bytes, maximum) {
  if (!(bytes instanceof Uint8Array) || bytes.length > maximum)
    throw new Error("InvalidFormSource");
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("InvalidFormSource");
  }
}
function decodeFormSourceNodes(bytes) {
  const value = decode(bytes, 8 * 1024 * 1024);
  if (!object7(value) || value.sourceOnly !== true || !Array.isArray(value.nodes) || value.nodes.length > 1e5 || !value.nodes.every((row, i) => object7(row) && uint10(row.formNode) && kinds2.has(row.kind) && (i === 0 || row.formNode > value.nodes[i - 1].formNode)))
    throw new Error("InvalidFormSource");
  return value;
}
function decodeFormSourceAttributes(bytes) {
  const value = decode(bytes, 1024 * 1024);
  const group = (data, check) => object7(data) && Object.keys(data).length <= 128 && Object.entries(data).every(([key, item]) => /^[A-Za-z][A-Za-z0-9]*$/.test(key) && key.length <= 128 && (item === null || check(item)));
  if (!object7(value) || value.sourceOnly !== true || !kinds2.has(value.kind) || !group(value.strings, (item) => typeof item === "string" && item.isWellFormed() && new TextEncoder().encode(item).length <= 65536) || !group(value.booleans, (item) => typeof item === "boolean") || !group(value.integers, uint10))
    throw new Error("InvalidFormSource");
  return value;
}
function decodeFormSites(bytes) {
  const sites = decode(bytes, 16 * 1024 * 1024);
  if (!Array.isArray(sites) || sites.length > 1e5 || !sites.every((site, i) => {
    if (!object7(site) || !uint10(site.formNode) || !kinds2.has(site.kind) || i > 0 && site.formNode <= sites[i - 1].formNode)
      return false;
    if (site.state === "located")
      return uint10(site.paragraph) && site.paragraph > 0 && uint10(site.anchorUnit);
    if (site.state === "unsupported_anchor")
      return uint10(site.paragraph) && site.paragraph > 0 && site.anchorUnit === null;
    return ["conditional", "missing_host", "ambiguous_host"].includes(site.state) && site.paragraph === null && site.anchorUnit === null;
  }))
    throw new Error("InvalidFormSource");
  return sites;
}
function decodeFormSourceLayout(bytes) {
  const value = decode(bytes, 65536);
  const bool = (value) => value === null || typeof value === "boolean";
  if (!object7(value) || value.sourceOnly !== true || !uint10(value.formNode) || !kinds2.has(value.kind) || !validShapeLayoutValues(value) || !object7(value.character) || !(value.character.id === null || uint10(value.character.id)) || ![
    value.character.follow_context,
    value.character.auto_size,
    value.character.word_wrap,
    value.sizeProtected
  ].every(bool))
    throw new Error("InvalidFormSource");
  return value;
}

// js/character-snapshot-json.mjs
function decodeCharacterSnapshot(bytes, keys, errorName) {
  const fail = () => {
    throw new Error(errorName);
  };
  if (!(bytes instanceof Uint8Array))
    return fail();
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (!Array.isArray(rows) || rows.length > 1e6)
    return fail();
  let previous = -1;
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length !== keys.length || keys.some((key) => !Object.hasOwn(row, key)) || !Number.isInteger(row.id) || row.id <= previous || row.id > 4294967295)
      return fail();
    previous = row.id;
  }
  return rows;
}

// js/character-effect-args.mjs
var CHARACTER_EFFECTS = Object.freeze(["emboss", "engrave", "superscript", "subscript"]);
function characterEffectMode(exclusive) {
  if (typeof exclusive !== "boolean")
    throw new TypeError("InvalidCharacterEffectMode");
  return exclusive;
}
function characterEffectArgs(effect, enabled) {
  const kind = CHARACTER_EFFECTS.indexOf(effect);
  if (kind < 0 || typeof enabled !== "boolean")
    throw new TypeError("InvalidCharacterEffect");
  return [kind, Number(enabled)];
}

// js/character-effects.mjs
function decodeCharacterEffects(bytes) {
  const flags = CHARACTER_EFFECTS;
  const rows = decodeCharacterSnapshot(bytes, ["id", ...flags], "InvalidCharacterEffects");
  if (rows.some((row) => flags.some((flag) => typeof row[flag] !== "boolean")))
    throw new Error("InvalidCharacterEffects");
  return rows;
}

// js/character-outline-args.mjs
var HWP5_CHARACTER_OUTLINE_KINDS = Object.freeze([
  "none",
  "solid",
  "dot",
  "thick",
  "dash",
  "dash-dot",
  "dash-dot-dot"
]);
function hwp5CharacterOutlineArg(kind) {
  const value = HWP5_CHARACTER_OUTLINE_KINDS.indexOf(kind);
  if (value < 0)
    throw new TypeError("InvalidCharacterOutline");
  return value;
}
function characterOutlineArg(kind) {
  const value = hwp5CharacterOutlineArg(kind);
  if (value > 1)
    throw new TypeError("InvalidCharacterOutline");
  return value;
}

// js/character-outlines.mjs
function decodeCharacterOutlines(bytes) {
  const rows = decodeCharacterSnapshot(bytes, ["id", "state", "rawKind"], "InvalidCharacterOutlines");
  for (const row of rows) {
    if (!["absent", "none", "solid", "other", "unknown"].includes(row.state))
      throw new Error("InvalidCharacterOutlines");
    if (row.rawKind !== null) {
      if (!Number.isInteger(row.rawKind) || row.rawKind < 0 || row.rawKind > 7 || row.state !== (row.rawKind === 0 ? "none" : row.rawKind === 1 ? "solid" : row.rawKind === 7 ? "unknown" : "other"))
        throw new Error("InvalidCharacterOutlines");
    } else if (row.state === "other")
      throw new Error("InvalidCharacterOutlines");
  }
  return rows;
}

// js/paragraph-spacing-args.mjs
var paragraphSpacingTypes = Object.freeze([
  "PERCENT",
  "FIXED",
  "BETWEEN_LINES",
  "AT_LEAST"
]);
function paragraphSpacingArgs(type, value) {
  const kind = paragraphSpacingTypes.indexOf(type);
  if (kind < 0 || !Number.isInteger(value) || value < -2147483648 || value > 2147483647)
    throw new RangeError("InvalidParagraphSpacing");
  return [kind, value];
}

// js/character-property-args.mjs
function characterPropertyArgs(properties) {
  const names = ["size", "bold", "italic"];
  if (!properties || typeof properties !== "object" || Array.isArray(properties) || Object.keys(properties).some((key) => !names.includes(key)))
    throw new TypeError("InvalidCharacterProperties");
  let mask = 0;
  const values = names.map((key, index) => {
    if (!Object.hasOwn(properties, key) || properties[key] === null)
      return 0;
    const value = properties[key];
    if (key === "size") {
      if (!Number.isInteger(value) || value < 0 || value > 409600)
        throw new RangeError("InvalidCharacterSize");
    } else if (typeof value !== "boolean")
      throw new TypeError("InvalidCharacterProperties");
    mask |= 1 << index;
    return key === "size" ? value : Number(value);
  });
  return [mask, ...values];
}

// js/character-range-batch.mjs
function encodeCharacterRanges(ranges) {
  if (!Array.isArray(ranges))
    throw new TypeError("InvalidCharacterRanges");
  if (ranges.length > 4096)
    throw new RangeError("LimitExceeded");
  const bytes = new Uint8Array(ranges.length * 16);
  const view = new DataView(bytes.buffer);
  for (let i = 0;i < ranges.length; i++) {
    const range = ranges[i];
    const names = ["section", "paragraph", "startUnit", "endUnit"];
    if (!range || typeof range !== "object" || Array.isArray(range) || Object.keys(range).some((key) => !names.includes(key)))
      throw new TypeError("InvalidCharacterRanges");
    const values = names.map((name) => {
      const value = range[name];
      if (!Number.isInteger(value) || value < 0 || value > 4294967295)
        throw new RangeError("InvalidTextPosition");
      return value;
    });
    if (values[3] < values[2])
      throw new RangeError("InvalidTextPosition");
    values.forEach((value, j) => view.setUint32(i * 16 + j * 4, value, true));
  }
  return bytes;
}

// js/paragraph-replacement.mjs
function normalizeParagraphReplacement(text) {
  return text.replace(/\r\n?/g, `
`);
}
function encodeParagraphReplacement(text) {
  if (typeof text !== "string" || !text.isWellFormed())
    throw new TypeError("InvalidText");
  if (text.length > 4 * 1024 * 1024)
    throw new RangeError("LimitExceeded");
  const bytes = new TextEncoder().encode(normalizeParagraphReplacement(text));
  if (bytes.length > 4 * 1024 * 1024)
    throw new RangeError("LimitExceeded");
  return bytes;
}

// js/character-underline-args.mjs
function characterUnderlineArg(kind) {
  const values = ["none", "bottom", "center", "top"];
  const value = values.indexOf(kind);
  if (value < 0)
    throw new TypeError("InvalidCharacterUnderlineKind");
  return value;
}

// js/character-color-args.mjs
function characterColorArg(color) {
  const value = parseCharacterColor(color);
  if (value === null)
    throw new TypeError("InvalidCharacterColor");
  return value;
}
function parseCharacterColor(color) {
  return typeof color === "string" && color.length === 7 && /^#[0-9a-f]{6}$/i.test(color) ? Number.parseInt(color.slice(1), 16) : null;
}

// js/character-shade-args.mjs
function characterShadeArgs(color) {
  return color === null ? [0, 0] : [1, characterColorArg(color)];
}

// js/character-shades.mjs
function decodeCharacterShades(bytes) {
  const rows = decodeCharacterSnapshot(bytes, ["id", "state", "color"], "InvalidCharacterShades");
  for (const row of rows) {
    if (!["absent", "none", "color", "unknown"].includes(row.state) || (row.state === "color" ? !Number.isInteger(row.color) || row.color < 0 || row.color > 16777215 : row.color !== null))
      throw new Error("InvalidCharacterShades");
  }
  return rows;
}

// js/font-faces.mjs
function decodeFontFaces(bytes) {
  const fail = () => {
    throw new Error("InvalidFontFaces");
  };
  if (!(bytes instanceof Uint8Array))
    return fail();
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (!Array.isArray(rows) || rows.length > 1e6)
    return fail();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length !== 3 || !["language", "id", "name"].every((key) => Object.hasOwn(row, key)))
      return fail();
    if (row.name !== null && (typeof row.name !== "string" || !row.name.isWellFormed() || new TextEncoder().encode(row.name).length > 4096))
      return fail();
  }
  if (!validFontFaceOrder(rows))
    return fail();
  return rows;
}

// js/character-font-args.mjs
function characterFontArgs(language, fontId) {
  const index = FONT_LANGUAGES.indexOf(language);
  if (index < 0)
    throw new RangeError("InvalidCharacterFontLanguage");
  if (!Number.isInteger(fontId) || fontId < 0 || fontId > 4294967295)
    throw new RangeError("InvalidFontId");
  return [index, fontId];
}

// js/character-font-name-args.mjs
function characterFontNameArgs(language, name) {
  const index = characterFontArgs(language, 0)[0];
  if (typeof name !== "string")
    throw new TypeError("InvalidFontName");
  for (let i = 0;i < name.length; i++) {
    const unit = name.charCodeAt(i);
    if (unit >= 55296 && unit <= 56319) {
      const next = name.charCodeAt(++i);
      if (!(next >= 56320 && next <= 57343))
        throw new RangeError("InvalidFontName");
    } else if (unit >= 56320 && unit <= 57343)
      throw new RangeError("InvalidFontName");
  }
  const bytes = new TextEncoder().encode(name);
  if (bytes.length === 0)
    throw new RangeError("InvalidFontName");
  if (bytes.length > 4096)
    throw new RangeError("LimitExceeded");
  return { language: index, bytes };
}

// js/text-transaction-args.mjs
function textTransactionArgs({ section, paragraph, startUnit, endUnit, text }) {
  const positions = [section, paragraph, startUnit, endUnit];
  if (positions.some((value) => !Number.isInteger(value) || value < 0 || value > 4294967295) || endUnit < startUnit)
    throw new RangeError("InvalidTextPosition");
  if (typeof text !== "string")
    throw new TypeError("Text must be a string");
  if (!text.isWellFormed())
    throw new RangeError("InvalidUnicodeEncoding");
  if (text.length === 0 || startUnit + text.length > 4294967295)
    throw new RangeError("InvalidTextPosition");
  if (text.length > 4 * 1024 * 1024)
    throw new RangeError("LimitExceeded");
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 4 * 1024 * 1024)
    throw new RangeError("LimitExceeded");
  return { positions, bytes };
}

// js/named-font-text-args.mjs
function namedFontTextArgs({
  section,
  paragraph,
  startUnit,
  endUnit,
  text,
  language,
  name
}) {
  const { positions, bytes } = textTransactionArgs({
    section,
    paragraph,
    startUnit,
    endUnit,
    text
  });
  return { positions, bytes, font: characterFontNameArgs(language, name) };
}

// js/character-underlines.mjs
function decodeCharacterUnderlines(bytes) {
  const rows = decodeCharacterSnapshot(bytes, ["id", "kind"], "InvalidCharacterUnderlines");
  for (const row of rows) {
    if (![null, "none", "bottom", "center", "top"].includes(row.kind))
      throw new Error("InvalidCharacterUnderlines");
  }
  return rows;
}

// js/character-strikes.mjs
function decodeCharacterStrikes(bytes) {
  const rows = decodeCharacterSnapshot(bytes, ["id", "enabled"], "InvalidCharacterStrikes");
  for (const row of rows)
    if (row.enabled !== null && typeof row.enabled !== "boolean")
      throw new Error("InvalidCharacterStrikes");
  return rows;
}

// js/character-strike-styles.mjs
function decodeCharacterStrikeStyles(bytes) {
  const rows = decodeCharacterSnapshot(bytes, ["id", "raw_style", "raw_color", "shape", "color"], "InvalidCharacterStrikeStyles");
  const text = (value) => value === null || typeof value === "string" && new TextEncoder().encode(value).length <= 4096;
  const color = (value) => value === null || Number.isInteger(value) && value >= 0 && value <= 4294967295;
  for (const row of rows) {
    if (row.raw_style !== null ? !Number.isInteger(row.raw_style) || row.raw_style < 0 || row.raw_style > 15 || !color(row.raw_color) || row.shape !== null || row.color !== null : row.raw_color !== null || !text(row.shape) || !text(row.color))
      throw new Error("InvalidCharacterStrikeStyles");
  }
  return rows;
}

// js/hwpx-document-provenance.mjs
var object8 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var exact = (value, keys) => object8(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
var uint11 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var text2 = (value) => typeof value === "string" && value.length <= 4096;
function isSourceColorProfile(value) {
  return exact(value, ["id", "encoding", "verified"]) && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 256 && ["rgb24", "colorref24"].includes(value.encoding) && typeof value.verified === "boolean";
}
function decodeDocumentProvenance(bytes) {
  const fail = () => {
    throw Error("InvalidDocumentProvenance");
  };
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1024 * 1024)
    return fail();
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (!exact(value, ["sourceOnly", "sourceVersion", "sourceVersionError", "sourceColorProfile"]) || value.sourceOnly !== true || !isSourceColorProfile(value.sourceColorProfile))
    return fail();
  const version = value.sourceVersion;
  if (version !== null) {
    if (!exact(version, [
      "major",
      "minor",
      "micro",
      "build_number",
      "patch",
      "revision",
      "os",
      "xml_version",
      "target_application",
      "application",
      "app_version",
      "xml_bytes"
    ]) || ![version.major, version.minor, version.xml_bytes].every(uint11) || !["micro", "build_number", "patch", "revision", "os"].every((key) => version[key] === null || uint11(version[key])) || !["xml_version", "target_application", "application", "app_version"].every((key) => version[key] === null || text2(version[key])))
      return fail();
  }
  if (value.sourceVersionError !== null && (version !== null || typeof value.sourceVersionError !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value.sourceVersionError)))
    return fail();
  return value;
}

// js/character-text-colors.mjs
function decodeCharacterTextColors(bytes) {
  const rows = decodeCharacterSnapshot(bytes, ["id", "color"], "InvalidCharacterTextColors");
  for (const row of rows) {
    if (row.color !== null && (!Number.isInteger(row.color) || row.color < 0 || row.color > 16777215)) {
      throw new Error("InvalidCharacterTextColors");
    }
  }
  return rows;
}

// js/hwpx-font-face-metadata.mjs
function decodeHwpxFontFaceMetadata(bytes) {
  const fail = () => {
    throw new Error("InvalidHwpxFontFaceMetadata");
  };
  const font = (row) => metadataKeys(row, ["face", "type", "isEmbedded", "binaryItemIDRef"]) && Object.values(row).every(metadataText);
  const rows = decodeMetadataWire(bytes, "InvalidHwpxFontFaceMetadata");
  for (const row of rows) {
    if (!metadataKeys(row, ["format", "language", "id", "font", "substitute", "typeInfo"]) || row.format !== "hwpx" || !font(row.font) || row.substitute !== null && !font(row.substitute))
      return fail();
    if (row.typeInfo !== null && (!metadataKeys(row.typeInfo, [
      "familyType",
      "weight",
      "proportion",
      "contrast",
      "strokeVariation",
      "armStyle",
      "letterform",
      "midline",
      "xHeight"
    ]) || !Object.values(row.typeInfo).every(metadataText)))
      return fail();
  }
  return rows;
}

// js/character-font-references.mjs
function decodeCharacterFontReferences(bytes) {
  const rows = decodeCharacterSnapshot(bytes, ["id", "fontIds"], "InvalidCharacterFontReferences");
  for (const row of rows) {
    if (row.fontIds !== null && (!Array.isArray(row.fontIds) || row.fontIds.length !== FONT_LANGUAGES.length || row.fontIds.some((id) => id !== null && (!Number.isInteger(id) || id < 0 || id > 4294967295))))
      throw new Error("InvalidCharacterFontReferences");
  }
  return rows;
}

// js/character-underline-styles.mjs
function decodeCharacterUnderlineStyles(bytes) {
  const rows = decodeCharacterSnapshot(bytes, ["id", "raw_style", "raw_color", "shape", "color"], "InvalidCharacterUnderlineStyles");
  const text = (value) => value === null || typeof value === "string" && new TextEncoder().encode(value).length <= 4096;
  for (const row of rows) {
    const raw = row.raw_style !== null;
    if (raw && (!Number.isInteger(row.raw_style) || row.raw_style < 0 || row.raw_style > 15 || !Number.isInteger(row.raw_color) || row.raw_color < 0 || row.raw_color > 4294967295 || row.shape !== null || row.color !== null) || !raw && (row.raw_color !== null || !text(row.shape) || !text(row.color)))
      throw new Error("InvalidCharacterUnderlineStyles");
  }
  return rows;
}

// js/hwpx-paragraph-shapes.mjs
function decodeHwpxParagraphShapes(bytes) {
  const result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const invalid = () => {
    throw new Error("InvalidParagraphShapes");
  };
  const text = (value) => value === null || typeof value === "string";
  const measure = (value) => value === null || value && typeof value === "object" && !Array.isArray(value) && (value.value === null || Number.isInteger(value.value) && value.value >= -2147483648 && value.value <= 4294967295) && text(value.unit);
  const breaks = (value) => value === null || value && typeof value === "object" && !Array.isArray(value) && ["widow_orphan", "keep_with_next", "keep_lines", "page_break_before"].every((key) => value[key] === null || typeof value[key] === "boolean");
  if (!Array.isArray(result))
    invalid();
  const ids = new Set;
  for (const row of result) {
    if (!row || typeof row !== "object" || !Number.isInteger(row.id) || row.id < 0 || row.id > 4294967295 || ids.has(row.id) || Object.hasOwn(row, "tab_pr_id") && row.tab_pr_id !== null && (!Number.isInteger(row.tab_pr_id) || row.tab_pr_id < 0 || row.tab_pr_id > 4294967295) || Object.hasOwn(row, "break_settings") && !breaks(row.break_settings) || !text(row.horizontal) || !text(row.spacing_type) || !measure(row.spacing) || !Array.isArray(row.margins) || row.margins.length !== 5 || !row.margins.every(measure))
      invalid();
    ids.add(row.id);
  }
  return result;
}

// js/table-bindings-wire.mjs
function decodeTableBindings(bytes) {
  const fail = () => {
    throw new Error("InvalidTableBindings");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length < 8)
    return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true), optional = magic === 827872328;
  if (!optional && magic !== 826430536)
    return fail();
  const stride = optional ? 48 : 44;
  const count = view.getUint32(4, true);
  if (count > 1e5 || bytes.length !== 8 + count * stride)
    return fail();
  let previous = -1;
  return Array.from({ length: count }, (_, index) => {
    const row = {};
    for (const [column, field] of [
      "paragraph",
      "tableNode",
      "listNode",
      "rows",
      "columns",
      "row",
      "column",
      "rowSpan",
      "columnSpan",
      "width",
      "height"
    ].entries())
      row[field] = view.getUint32(8 + index * stride + column * 4, true);
    if (optional) {
      const flags = view.getUint32(8 + index * stride + 44, true);
      if (flags & ~3 || !(flags & 1) && row.width !== 0 || !(flags & 2) && row.height !== 0 || row.paragraph === 0)
        return fail();
      if (!(flags & 1))
        row.width = null;
      if (!(flags & 2))
        row.height = null;
    }
    if (row.paragraph <= previous || !row.rows || !row.columns || !row.rowSpan || !row.columnSpan || row.row >= row.rows || row.column >= row.columns || row.rowSpan > row.rows - row.row || row.columnSpan > row.columns - row.column)
      return fail();
    previous = row.paragraph;
    return row;
  });
}

// js/table-placements-wire.mjs
function decodeTablePlacements(bytes, format = "hwpx") {
  const fail = () => {
    throw new Error("InvalidTablePlacements");
  };
  if (!["hwp5", "hwpx"].includes(format) || !(bytes instanceof Uint8Array) || bytes.length < 8)
    return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), count = view.getUint32(4, true);
  const magic = view.getUint32(0, true), hasAnchor = format === "hwpx" && magic === 844125256, stride = hasAnchor ? 28 : 20;
  if (!hasAnchor && magic !== (format === "hwp5" ? 894456904 : 827348040) || count > 1e5 || bytes.length !== 8 + count * stride)
    return fail();
  const seen = new Set;
  const rows = Array.from({ length: count }, (_, index) => {
    const at = 8 + index * stride, values = Array.from({ length: 5 }, (_, column) => view.getUint32(at + column * 4, true));
    const [tableNode, paragraph, parentTable, parentList, flags] = values;
    if (format === "hwpx" && !paragraph || flags > 1 || seen.has(tableNode) || !flags && (parentTable || parentList) || flags && parentTable === tableNode)
      return fail();
    seen.add(tableNode);
    const anchorUnit = hasAnchor ? view.getUint32(at + 20, true) : 0, anchorPresent = hasAnchor ? view.getUint32(at + 24, true) : 0;
    if (anchorPresent > 1 || !anchorPresent && anchorUnit !== 0)
      return fail();
    return {
      tableNode,
      paragraph,
      parentTableNode: flags ? parentTable : null,
      parentListNode: flags ? parentList : null,
      ...hasAnchor ? { anchorUnit: anchorPresent ? anchorUnit : null } : {}
    };
  });
  const byNode = new Map(rows.map((row) => [row.tableNode, row])), checked = new Set;
  for (const row of rows) {
    let node = row;
    const path = new Set;
    while (node && !checked.has(node.tableNode)) {
      if (path.has(node.tableNode))
        return fail();
      path.add(node.tableNode);
      if (node.parentTableNode === null)
        break;
      node = byNode.get(node.parentTableNode);
      if (!node)
        return fail();
    }
    for (const node of path)
      checked.add(node);
  }
  return rows;
}

// js/hwpx-drawing-text-bindings.mjs
function decodeDrawingTextBindings(bytes) {
  const fail = () => {
    throw new Error("InvalidDrawingTextBindings");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length > 16000000)
    return fail();
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (!Array.isArray(rows) || rows.length > 1e5)
    return fail();
  const seen = new Set, owners = new Map, integer = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 4294967295;
  return rows.map((row) => {
    if (!row || !integer(row.paragraph) || row.paragraph === 0 || seen.has(row.paragraph) || !row.owner)
      return fail();
    const owner = row.owner;
    if (Object.hasOwn(owner, "kind") && !["text", "caption"].includes(owner.kind))
      return fail();
    if (![owner.drawing_node, owner.text_node, owner.list_node].every(integer) || !(owner.drawing_node < owner.text_node && owner.text_node < owner.list_node))
      return fail();
    const key = `${owner.drawing_node}:${owner.text_node}:${owner.kind ?? "text"}`;
    if (owners.has(owner.list_node) && owners.get(owner.list_node) !== key)
      return fail();
    owners.set(owner.list_node, key);
    seen.add(row.paragraph);
    return {
      paragraph: row.paragraph,
      drawingNode: owner.drawing_node,
      textNode: owner.text_node,
      listNode: owner.list_node,
      ...Object.hasOwn(owner, "kind") ? { kind: owner.kind } : {}
    };
  });
}

// js/hwpx-drawing-text-snapshots.mjs
function decodeDrawingTextSnapshots(bytes) {
  if (!(bytes instanceof Uint8Array))
    throw new Error("InvalidDrawingTextSnapshots");
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(rows) || rows.length > 1e5)
    throw new Error("InvalidDrawingTextSnapshots");
  const encoder = new TextEncoder;
  return rows.map((row, index) => {
    const value = decodeDrawingTextSnapshot(encoder.encode(JSON.stringify(row)));
    if (index && value.drawing_node <= rows[index - 1].drawing_node)
      throw new Error("InvalidDrawingTextSnapshots");
    return value;
  });
}

// js/hwpx-container-source.mjs
function decodeContainerSource(bytes) {
  const fail = () => {
    throw new Error("InvalidContainerSource");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length > 1048576)
    return fail();
  let v;
  try {
    v = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
  const optional = (n, check) => n === null || check(n);
  const signed = (n) => Number.isSafeInteger(n) && n >= -2147483648 && n <= 4294967295;
  const bool = (n) => n === null || typeof n === "boolean";
  const array = (a, length, check) => Array.isArray(a) && a.length === length && a.every(check);
  if (!v || !uint(v.container_node))
    return fail();
  if (Object.hasOwn(v, "has_caption") || Object.hasOwn(v, "caption")) {
    if (typeof v.has_caption !== "boolean" || v.has_caption !== (v.caption !== null))
      return fail();
    try {
      validateTableCaption(v.caption);
    } catch {
      return fail();
    }
  }
  if (!Array.isArray(v.children) || !v.children.every((c, i) => c && uint(c.node) && c.node > v.container_node && (i === 0 || c.node > v.children[i - 1].node) && typeof c.namespace_uri === "string" && typeof c.local_name === "string" && c.local_name.length > 0))
    return fail();
  if (v.has_caption === true && !v.children.some((c) => c.node === v.caption.caption_node && c.namespace_uri === "http://www.hancom.co.kr/hwpml/2011/paragraph" && c.local_name === "caption"))
    return fail();
  if (!validGroupContext(v.group_context, v.container_node))
    return fail();
  const g = v.geometry, p = v.position, f = v.flow, t = v.transform;
  if (!g || !p || !f || !t)
    return fail();
  if (!validShapeLayoutValues(v))
    return fail();
  if (!array(t.flip, 2, bool) || !optional(t.angle, uint) || !array(t.center, 2, (n) => optional(n, signed)) || !bool(t.rotate_image) || !bool(t.reverse) || !uint(t.unknown_matrix_nodes) || !Array.isArray(t.matrices) || t.matrices.length > 1024)
    return fail();
  if (!t.matrices.every((m) => m && ["translation", "scale", "rotation"].includes(m.kind) && array(m.values, 6, (n) => optional(n, (n) => typeof n === "number" && Number.isFinite(n)))))
    return fail();
  return v;
}

// js/hwpx-rectangle-rendering-source.mjs
function decodeRectangleRenderingSource(bytes) {
  const fail = () => {
    throw new Error("InvalidRectangleRenderingSource");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length > 65536)
    return fail();
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
  const signed = (n) => Number.isSafeInteger(n) && n >= -2147483648 && n <= 4294967295;
  const optional = (n, check) => n === null || check(n);
  const bool = (n) => n === null || typeof n === "boolean";
  const array = (a, length, check) => Array.isArray(a) && a.length === length && a.every(check);
  if (!value || !uint(value.rectangle_node) || !value.source)
    return fail();
  if (!value.owner || ![value.owner.paragraph, value.owner.anchor_unit, value.owner.anchor_node].every(uint) || value.owner.paragraph === 0 || value.owner.anchor_node > value.rectangle_node)
    return fail();
  const s = value.source, { rendering: r, rectangle: p } = s;
  if (!validShapeLayoutValues(s))
    return fail();
  if (!validShapePaintValues(s))
    return fail();
  if (!bool(s.transform_identity) || !r || !p || !array(r.flip, 2, bool) || !optional(r.angle, uint) || !bool(r.reverse) || !array(r.center, 2, (n) => optional(n, signed)) || !bool(r.rotate_image))
    return fail();
  if (r.matrix === null) {
    if (![
      "UnsupportedPictureMatrixSequence",
      "IncompletePictureMatrix",
      "NonFinitePictureMatrix"
    ].includes(r.matrix_error))
      return fail();
  } else if (!array(r.matrix, 6, Number.isFinite) || r.matrix_error !== null)
    return fail();
  if (typeof p.present !== "boolean" || !uint(p.unknown_children) || !array(p.point_present, 4, (n) => typeof n === "boolean") || !array(p.points, 4, (point) => array(point, 2, (n) => optional(n, signed))))
    return fail();
  if (p.points.some((point, i) => !p.point_present[i] && point.some((n) => n !== null)) || !p.present && p.point_present.some(Boolean))
    return fail();
  if (s.rendering_corners !== null && (!array(s.rendering_corners, 4, (point) => array(point, 2, Number.isFinite)) || r.matrix === null))
    return fail();
  return value;
}

// js/hwpx-rectangle-rendering-sources.mjs
function decodeRectangleRenderingSources(bytes) {
  if (!(bytes instanceof Uint8Array))
    throw new Error("InvalidRectangleRenderingSources");
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(rows) || rows.length > 1e5)
    throw new Error("InvalidRectangleRenderingSources");
  const encoder = new TextEncoder;
  return rows.map((row, index) => {
    const value = decodeRectangleRenderingSource(encoder.encode(JSON.stringify(row)));
    if (index && value.rectangle_node <= rows[index - 1].rectangle_node)
      throw new Error("InvalidRectangleRenderingSources");
    return value;
  });
}

// js/hwpx-ellipse-sources.mjs
var object9 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var uint12 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var coordinate3 = (value) => value === null || Number.isInteger(value) && value >= -2147483648 && value <= 4294967295;
function decodeEllipseSources(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const text = (value) => value === null || typeof value === "string" && new TextEncoder().encode(value).length <= 4096;
  if (!Array.isArray(rows) || rows.length > 1e5 || rows.some((row, index) => {
    const owner = row?.owner, geometry = row?.geometry;
    return !object9(row) || row.sourceOnly !== true || !uint12(row.node) || index > 0 && row.node <= rows[index - 1].node || Object.hasOwn(row, "common") && !validShapeCommonSource(row.common) || row.common && Object.hasOwn(row.common, "group_context") && !validGroupContext(row.common.group_context, row.node) || row.common?.group_context && row.common.group_context.root_anchor !== owner?.anchor_node || !object9(owner) || !["paragraph", "anchor_node", "anchor_unit"].every((key) => uint12(owner[key])) || owner.paragraph < 1 || !object9(geometry) || !["interval_dirty", "has_arc_properties", "arc_type"].every((key) => text(geometry[key])) || !Array.isArray(geometry.points) || geometry.points.length !== 7 || !Array.from(geometry.points).every((point) => point === null || object9(point) && coordinate3(point.x) && coordinate3(point.y));
  }))
    throw new Error("InvalidEllipseSources");
  return rows;
}

// js/hwpx-picture-sites-wire.mjs
var states = ["located", "conditional", "unsupported_anchor", "missing_host", "ambiguous_host"];
function decodePictureSites(bytes) {
  const fail = () => {
    throw new Error("InvalidPictureSites");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length < 8)
    fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 827871304)
    fail();
  const count = view.getUint32(4, true);
  if (count > 1e5 || bytes.length !== 8 + count * 16)
    fail();
  const result = [], seen = new Set;
  for (let index = 0;index < count; index++) {
    const at = 8 + index * 16;
    const pictureNode = view.getUint32(at, true), paragraphValue = view.getUint32(at + 4, true);
    const unitValue = view.getUint32(at + 8, true), flags = view.getUint32(at + 12, true);
    const stateIndex = flags & 255, hasParagraph = Boolean(flags & 256), hasUnit = Boolean(flags & 512);
    if (flags & ~775 || stateIndex > 4 || seen.has(pictureNode))
      fail();
    if (hasParagraph && paragraphValue === 0)
      fail();
    if (!hasParagraph && paragraphValue !== 0 || !hasUnit && unitValue !== 0)
      fail();
    if (stateIndex === 0 !== hasUnit || hasUnit && !hasParagraph)
      fail();
    if (stateIndex === 2 !== (hasParagraph && !hasUnit))
      fail();
    seen.add(pictureNode);
    result.push({
      pictureNode,
      paragraph: hasParagraph ? paragraphValue : null,
      anchorUnit: hasUnit ? unitValue : null,
      state: states[stateIndex]
    });
  }
  return result;
}

// js/hwpx-ole-source.mjs
var uint13 = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
var errors = new Set([
  "UnsupportedOleDisplayHost",
  "MissingCurrentParagraphDisplayHost",
  "AmbiguousParagraphDisplayHost",
  "MissingProtectedDisplayAnchor",
  "UnsupportedJoinedParagraphLocations",
  "UnsupportedInlineControl",
  "UnsupportedTextPositionProjection",
  "MissingTextSite"
]);
function parse(bytes, maxBytes, message) {
  if (!(bytes instanceof Uint8Array) || bytes.length > maxBytes)
    throw new Error(message);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(message);
  }
}
function decodeOleSites(bytes) {
  const fail = () => {
    throw new Error("InvalidOleSites");
  };
  const value = parse(bytes, 16 * 1024 * 1024, "InvalidOleSites"), seen = new Set;
  if (!Array.isArray(value) || value.length > 1e5)
    fail();
  for (const row of value) {
    if (!row || !uint13(row.ole_node) || seen.has(row.ole_node) || !(row.paragraph === null || uint13(row.paragraph) && row.paragraph > 0) || !(row.anchor_unit === null || uint13(row.anchor_unit)))
      fail();
    if (Object.hasOwn(row, "chart_wrapper") && row.chart_wrapper !== null && !uint13(row.chart_wrapper))
      fail();
    if (row.error_name === null ? row.paragraph === null || row.anchor_unit === null : !errors.has(row.error_name) || row.anchor_unit !== null)
      fail();
    seen.add(row.ole_node);
  }
  return value;
}
function decodeOleSource(bytes) {
  const fail = () => {
    throw new Error("InvalidOleSource");
  };
  const value = parse(bytes, 65536, "InvalidOleSource");
  if (!value || !Object.hasOwn(value, "position") || !Object.hasOwn(value, "flow"))
    fail();
  try {
    validateShapeSourceValues(value);
  } catch {
    fail();
  }
  for (const name of ["binary_item_id", "object_type", "draw_aspect"]) {
    const text = value[name];
    if (text !== null && (typeof text !== "string" || !text.isWellFormed() || new TextEncoder().encode(text).length > 4096))
      fail();
  }
  if (![null, false, true].includes(value.has_moniker))
    fail();
  if (Object.hasOwn(value, "transform_identity") && ![null, false, true].includes(value.transform_identity))
    fail();
  return value;
}
function decodeOleBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > 64 * 1024 * 1024 + 1 || bytes[0] > 1) {
    throw new Error("InvalidOleBytes");
  }
  return { declaredExternal: bytes[0] === 1, bytes: bytes.slice(1) };
}

// js/hwpx-picture-owner-wire.mjs
function decodePictureOwner(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 16)
    throw new Error("InvalidPictureOwner");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 827281480 || view.getUint32(4, true) === 0)
    throw new Error("InvalidPictureOwner");
  return {
    paragraph: view.getUint32(4, true),
    anchorNode: view.getUint32(8, true),
    anchorUnit: view.getUint32(12, true)
  };
}

// js/hwpx-picture-corners-wire.mjs
function decodePictureRenderingCorners(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 72)
    throw new Error("InvalidPictureRenderingCorners");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 827019336 || view.getUint32(4, true) !== 0)
    throw new Error("InvalidPictureRenderingCorners");
  return Array.from({ length: 4 }, (_, index) => Array.from({ length: 2 }, (_, coordinate) => {
    const number = view.getFloat64(8 + (index * 2 + coordinate) * 8, true);
    if (!Number.isFinite(number))
      throw new Error("InvalidPictureRenderingCorners");
    return number;
  }));
}

// js/hwpx-connector-source.mjs
var uint14 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var object10 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var parse2 = (bytes) => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
function decodeConnectorNodes(bytes) {
  const nodes = parse2(bytes);
  if (!Array.isArray(nodes) || !nodes.every((value, index) => uint14(value) && (index === 0 || value > nodes[index - 1])))
    throw new Error("InvalidConnectorNodes");
  return nodes;
}
function decodeConnectorSource(bytes) {
  const value = parse2(bytes), geometry = value?.geometry;
  const point = (item) => item === null || object10(item) && ["x", "y", "subject_id_ref", "subject_index", "control_type"].every((name) => item[name] === null || typeof item[name] === "string");
  if (!object10(value) || value.sourceOnly !== true || !uint14(value.node) || !object10(geometry) || !(geometry.raw_type === null || typeof geometry.raw_type === "string") || typeof geometry.known_type !== "boolean" || !point(geometry.start) || !point(geometry.end) || typeof geometry.controls_present !== "boolean" || !Array.isArray(geometry.controls) || geometry.controls.length > 4096 || !geometry.controls.every((item) => item !== null && point(item)) || !geometry.controls_present && geometry.controls.length !== 0 || !uint14(geometry.unexpected_children))
    throw new Error("InvalidConnectorSource");
  return value;
}
function decodeConnectorOwner(bytes, expectedNode) {
  const value = parse2(bytes);
  if (!object10(value) || value.current !== true || value.sourceOnly === true || !["node", "paragraph", "anchor_node", "anchor_unit"].every((name) => uint14(value[name])) || value.paragraph < 1 || expectedNode !== undefined && value.node !== expectedNode)
    throw new Error("InvalidConnectorOwner");
  return value;
}
function decodeConnectorRenderingSource(bytes, expectedNode) {
  const value = parse2(bytes);
  const point = (row) => Array.isArray(row) && row.length === 2 && row.every(Number.isFinite);
  if (!object10(value) || value.sourceOnly !== true || value.coordinateSpace !== "renderingInfo" || !uint14(value.node) || expectedNode !== undefined && value.node !== expectedNode || !Array.isArray(value.endpoints) || value.endpoints.length !== 2 || !value.endpoints.every(point) || !Array.isArray(value.controls) || value.controls.length > 4096 || !value.controls.every(point))
    throw new Error("InvalidConnectorRenderingSource");
  return value;
}

// js/hwpx-drawing-stroke-source.mjs
var fields2 = [
  "color",
  "width",
  "style",
  "endCap",
  "headStyle",
  "tailStyle",
  "headfill",
  "tailfill",
  "headSz",
  "tailSz",
  "outlineStyle",
  "alpha"
];
var uint15 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
function decodeDrawingStrokeSource(bytes, expectedNode) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const attr = value?.attributes;
  if (!value || value.sourceOnly !== true || !uint15(value.node) || value.node !== expectedNode || !(value.lineShapeNode === null || uint15(value.lineShapeNode)) || !(value.knownColor === null || typeof value.knownColor === "boolean") || !uint15(value.unknownEnums) || value.unknownEnums > 8 || !attr || typeof attr !== "object" || Array.isArray(attr) || !fields2.every((name) => attr[name] === null || typeof attr[name] === "string" && new TextEncoder().encode(attr[name]).length <= 4096))
    throw new Error("InvalidDrawingStrokeSource");
  return value;
}

// js/hwpx-page-settings.mjs
function validateColumn(column) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!column || !uint(column.declaration_node) || !uint(column.owner_node) || ![column.count, column.gap].every((value) => value === null || uint(value)) || ![null, true, false].includes(column.same_size) || ![null, "left", "right", "mirror"].includes(column.direction) || ![null, "newspaper", "balanced_newspaper", "parallel"].includes(column.kind) || typeof column.ambiguous !== "boolean")
    throw new Error("InvalidParagraphFlow");
  if (column.sizes !== undefined && (!Array.isArray(column.sizes) || column.sizes.some((size) => !size || ![size.width, size.gap].every((value) => value === null || uint(value)))))
    throw new Error("InvalidParagraphFlow");
}
function decodeParagraphFlow(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(rows))
    throw new Error("InvalidParagraphFlow");
  for (const row of rows) {
    if (!row)
      throw new Error("InvalidParagraphFlow");
    if (row.empty_line_eligible !== undefined && typeof row.empty_line_eligible !== "boolean")
      throw new Error("InvalidParagraphFlow");
    if (row.note_context !== undefined && row.note_context !== null) {
      const note = row.note_context;
      if (![note.note_node, note.list_node].every((value) => Number.isInteger(value) && value >= 0 && value <= 4294967295) || !["footnote", "endnote"].includes(note.kind) || row.host !== note.kind || row.top_level !== false)
        throw new Error("InvalidParagraphFlow");
    }
    if (row.single_column !== undefined && typeof row.single_column !== "boolean")
      throw new Error("InvalidParagraphFlow");
    if (row.host !== undefined && !["body", "header", "footer", "footnote", "endnote", "drawing", "other"].includes(row.host))
      throw new Error("InvalidParagraphFlow");
    if (row.column_declaration !== undefined && row.column_declaration !== null) {
      validateColumn(row.column_declaration);
    }
    if (row.column_start_declaration !== undefined && row.column_start_declaration !== null) {
      validateColumn(row.column_start_declaration);
    }
    if (row.column_changes !== undefined) {
      if (!Array.isArray(row.column_changes))
        throw new Error("InvalidParagraphFlow");
      let previous = 0;
      for (const change of row.column_changes) {
        if (!change || !Number.isInteger(change.unit) || change.unit < previous || change.unit > 4294967295)
          throw new Error("InvalidParagraphFlow");
        validateColumn(change.declaration);
        previous = change.unit;
      }
    }
    if (row.page_number_source !== undefined && row.page_number_source !== null) {
      const source = row.page_number_source;
      if (typeof source.supported !== "boolean" || source.start_page !== null && (!Number.isInteger(source.start_page) || source.start_page < 1 || source.start_page > 4294967295) || ![null, true, false].includes(source.hide_first_header) || ![null, true, false].includes(source.hide_first_footer))
        throw new Error("InvalidParagraphFlow");
    }
    if (row.page_area !== undefined && row.page_area !== null) {
      const area = row.page_area;
      const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
      if (!area || !uint(area.owner_node) || !uint(area.list_node) || ![area.width, area.height].every((value) => value === null || uint(value)) || ![null, "both", "odd", "even"].includes(area.apply) || ![null, "top", "center", "bottom"].includes(area.vertical_alignment))
        throw new Error("InvalidParagraphFlow");
    }
    if (!row || !Number.isInteger(row.paragraph) || row.paragraph <= 0 || row.paragraph > 4294967295 || !Number.isInteger(row.source_node) || row.source_node < 0 || row.source_node > 4294967295 || typeof row.top_level !== "boolean" || ![null, true, false].includes(row.page_break) || ![null, true, false].includes(row.column_break))
      throw new Error("InvalidParagraphFlow");
  }
  if (rows.some((row, i) => i > 0 && row.paragraph !== rows[i - 1].paragraph + 1))
    throw new Error("InvalidParagraphFlow");
  return rows;
}
function decodePageSettings(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const optional = (value) => value === null || uint(value);
  if (!Array.isArray(rows))
    throw new Error("InvalidPageSettings");
  for (const row of rows) {
    if (!row || !uint(row.section_ordinal) || !uint(row.element_index) || !uint(row.duplicate_margins) || !optional(row.width) || !optional(row.height) || ![null, "widely", "narrowly"].includes(row.orientation) || ![null, "left_only", "left_right", "top_bottom"].includes(row.gutter_type))
      throw new Error("InvalidPageSettings");
    if (row.hide_first_empty_line !== undefined && ![null, true, false].includes(row.hide_first_empty_line))
      throw new Error("InvalidPageSettings");
    if (Object.hasOwn(row, "hide_first_empty_line") !== Object.hasOwn(row, "visibility_count"))
      throw new Error("InvalidPageSettings");
    if (row.visibility_count !== undefined && (!uint(row.visibility_count) || row.visibility_count !== 1 && row.hide_first_empty_line != null))
      throw new Error("InvalidPageSettings");
    if (row.margin !== null && (!row.margin || !["header", "footer", "gutter", "left", "right", "top", "bottom"].every((name) => optional(row.margin[name]))))
      throw new Error("InvalidPageSettings");
  }
  return rows;
}

// js/hwpx-note-shapes.mjs
function decodeNoteShapes(bytes) {
  const report = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const invalid = () => {
    throw new Error("InvalidNoteShapes");
  };
  if (!report || ![
    "sections",
    "foot_notes",
    "end_notes",
    "other_attributes",
    "unknown_enums",
    "noncanonical_colors",
    "direct_children"
  ].every((name) => uint(report[name])) || !Array.isArray(report.notes) || !Array.isArray(report.children))
    invalid();
  for (const note of report.notes) {
    if (!note || !["foot", "end"].includes(note.kind) || ![
      "section_ordinal",
      "element_index",
      "parent_element_index",
      "other_attributes",
      "direct_children"
    ].every((name) => uint(note[name])) || note.section_ordinal >= report.sections || !Array.isArray(note.child_counts) || note.child_counts.length !== 5 || !note.child_counts.every(uint))
      invalid();
  }
  for (const child of report.children) {
    if (!child || !["auto_num_format", "note_line", "note_spacing", "numbering", "placement"].includes(child.kind) || ![
      "note_index",
      "element_index",
      "other_attributes",
      "unknown_enums",
      "noncanonical_colors",
      "direct_children"
    ].every((name) => uint(child[name])) || child.note_index >= report.notes.length || !Array.isArray(child.raw) || child.raw.length !== 16 || !child.raw.every((value) => value === null || typeof value === "string"))
      invalid();
  }
  return report;
}

// js/hwpx-table-pagination.mjs
function decodeTablePagination(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const optional = (value) => value === null || uint(value);
  if (!Array.isArray(rows))
    throw new Error("InvalidTablePagination");
  let previous = -1;
  for (const row of rows) {
    const value = row?.values;
    if (!row || !uint(row.table_node) || row.table_node <= previous || !value || ![null, "none", "table", "cell", "unknown"].includes(value.page_break) || ![null, false, true].includes(value.repeat_header) || ![null, false, true].includes(value.no_adjust) || !optional(value.cell_spacing) || !optional(value.border_fill_id))
      throw new Error("InvalidTablePagination");
    previous = row.table_node;
  }
  return rows;
}

// js/hwpx-table-geometry.mjs
function decodeTableGeometry(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!value || typeof value !== "object")
    throw new Error("InvalidTableGeometry");
  const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
  const signed = (v) => Number.isSafeInteger(v) && v >= -2147483648 && v <= 4294967295;
  const optional = (v, check) => v === null || check(v);
  const bool = (v) => [null, false, true].includes(v);
  const bounded = (max) => (v) => uint(v) && v <= max;
  if (Object.hasOwn(value, "z_order") && !optional(value.z_order, signed))
    throw new Error("InvalidTableGeometry");
  const g = value?.geometry;
  const margin = (v) => v === null || Array.isArray(v) && v.length === 4 && v.every((n) => optional(n, signed));
  for (const [name, maximum] of [
    ["text_wrap", 5],
    ["text_flow", 3]
  ]) {
    if (name in value && !optional(value[name], bounded(maximum)))
      throw new Error("InvalidTableGeometry");
  }
  if (!g || !optional(g.width, uint) || !optional(g.height, uint) || !optional(g.width_relative, bounded(4)) || !optional(g.height_relative, bounded(2)) || !bool(g.treat_as_character) || !optional(g.horizontal_offset, signed) || !optional(g.vertical_offset, signed) || ![
    value.affect_line_spacing,
    value.flow_with_text,
    value.allow_overlap,
    value.hold_anchor
  ].every(bool) || !optional(value.vertical_relative, bounded(2)) || !optional(value.horizontal_relative, bounded(3)) || !optional(value.vertical_alignment, bounded(4)) || !optional(value.horizontal_alignment, bounded(4)) || !margin(value.out_margin) || !margin(value.in_margin))
    throw new Error("InvalidTableGeometry");
  return value;
}

// js/caption-bindings-wire.mjs
function decodeCaptionBindings(bytes, ownerField, errorName) {
  if (!["table_node", "picture_node", "container_node"].includes(ownerField))
    throw new Error("InvalidCaptionBindingOwnerField");
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
  const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!Array.isArray(rows) || rows.length > 1e5)
    throw new Error(errorName);
  let previous = 0;
  for (const row of rows) {
    if (!object(row) || !uint(row.paragraph) || row.paragraph <= previous || !object(row.owner) || !uint(row.owner[ownerField]) || !uint(row.owner.caption_node) || !uint(row.owner.list_node))
      throw new Error(errorName);
    previous = row.paragraph;
  }
  return rows;
}

// js/hwpx-table-caption-bindings.mjs
function decodeTableCaptionBindings(bytes) {
  return decodeCaptionBindings(bytes, "table_node", "InvalidTableCaptionBindings");
}

// js/hwpx-automatic-number-sites.mjs
function decodeAutomaticNumberSites(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const optional = (value) => value === null || uint(value);
  if (!Array.isArray(rows) || rows.length > 1e5)
    throw new Error("InvalidAutomaticNumberSites");
  const nodes = new Set;
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) || !uint(row.number_node) || nodes.has(row.number_node) || !optional(row.anchor_node) || !optional(row.paragraph) || !optional(row.anchor_unit) || row.paragraph === null !== (row.anchor_unit === null) || row.paragraph === 0 || row.anchor_node === null && row.paragraph !== null)
      throw new Error("InvalidAutomaticNumberSites");
    nodes.add(row.number_node);
  }
  return rows;
}

// js/hwpx-automatic-number-sources.mjs
function decodeAutomaticNumberSources(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
  const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const flag = (v) => v === null || typeof v === "boolean";
  const raw = (v, n) => Array.isArray(v) && v.length === n && v.every((s) => s === null || typeof s === "string");
  const nodes = new Set;
  if (!Array.isArray(rows) || rows.length > 1e5)
    throw new Error("InvalidAutomaticNumberSources");
  for (const row of rows) {
    const value = row?.values, format = row?.format;
    if (!object(row) || !uint(row.number_node) || nodes.has(row.number_node) || !(row.anchor_node === null || uint(row.anchor_node)) || !object(value) || !raw(value.raw, 2) || !uint(value.other_attributes) || !flag(value.type_known) || !(value.num === null || Number.isInteger(value.num) && value.num >= -2147483648 && value.num <= 2147483647) || !(format === null || object(format) && raw(format.raw, 5) && uint(format.other_attributes) && flag(format.type_known) && flag(format.supscript)))
      throw new Error("InvalidAutomaticNumberSources");
    nodes.add(row.number_node);
  }
  return rows;
}

// js/hwpx-note-reference-sites.mjs
function decodeNoteReferenceSites(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!Array.isArray(rows) || rows.length > 1e5)
    throw new Error("InvalidNoteReferenceSites");
  const notes = new Set, anchors = new Set, numbers = new Set;
  for (const row of rows) {
    if (!row || Array.isArray(row) || !["note_node", "number_node", "anchor_node", "paragraph", "anchor_unit"].every((key) => uint(row[key])) || row.paragraph === 0 || notes.has(row.note_node) || anchors.has(row.anchor_node) || numbers.has(row.number_node))
      throw new Error("InvalidNoteReferenceSites");
    notes.add(row.note_node);
    anchors.add(row.anchor_node);
    numbers.add(row.number_node);
  }
  return rows;
}

// js/hwpx-paragraph-text-snapshot.mjs
function decodeParagraphTextSnapshot(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(rows) || rows.length > 1e5)
    throw new Error("InvalidParagraphTextSnapshot");
  let previous = null;
  for (const row of rows) {
    if (!row || !Number.isInteger(row.paragraph) || row.paragraph < 1 || row.paragraph > 4294967295 || previous !== null && row.paragraph !== previous + 1 || typeof row.text !== "string" || !row.text.isWellFormed() || typeof row.nested !== "boolean")
      throw new Error("InvalidParagraphTextSnapshot");
    previous = row.paragraph;
  }
  return rows;
}

// js/hwpx-formula-field-sources.mjs
function decodeFormulaFieldSources(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const optionalBoolean = (value) => value === null || typeof value === "boolean";
  if (!Array.isArray(rows) || rows.length > 1e5)
    throw new Error("InvalidFormulaFieldSources");
  const begins = new Set, ends = new Set;
  for (const row of rows) {
    if (!row || !uint(row.begin_node) || !uint(row.end_node) || row.end_node <= row.begin_node || begins.has(row.begin_node) || ends.has(row.end_node) || !optionalBoolean(row.editable) || !optionalBoolean(row.dirty) || !Array.isArray(row.raw) || row.raw.length !== 5 || row.raw.some((value) => value !== null && (typeof value !== "string" || !value.isWellFormed())))
      throw new Error("InvalidFormulaFieldSources");
    begins.add(row.begin_node);
    ends.add(row.end_node);
  }
  return rows;
}

// js/hwpx-table-cell-margin.mjs
function decodeTableCellMargin(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const bool = (v) => [null, false, true].includes(v);
  const number = (v) => v === null || Number.isSafeInteger(v) && v >= -2147483648 && v <= 4294967295;
  if (!value || !bool(value.has_margin) || !bool(value.header) || !(value.margin === null || Array.isArray(value.margin) && value.margin.length === 4 && value.margin.every(number)))
    throw new Error("InvalidTableCellMargin");
  for (const field of ["text_direction", "line_wrap", "vertical_alignment"]) {
    if (value[field] !== undefined && value[field] !== null && !(Number.isInteger(value[field]) && value[field] >= 0 && value[field] <= 2))
      throw new Error("InvalidTableCellMargin");
  }
  return value;
}

// js/hwpx-formula-sources.mjs
function decodeFormulaSources(bytes, { current = false } = {}) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(rows) || rows.length > 4096)
    throw new Error("InvalidFormulaSources");
  let previous = -1;
  for (const row of rows) {
    if (!row || !Number.isInteger(row.begin_element) || row.begin_element <= previous || row.begin_element > 4294967295 || !row.values || !["command", "formula", "result_format", "last_result"].every((key) => row.values[key] === null || typeof row.values[key] === "string"))
      throw new Error("InvalidFormulaSources");
    previous = row.begin_element;
    if (current) {
      const owner = row.owner;
      const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
      if (!owner || ![
        owner.table,
        owner.cell,
        owner.columns,
        owner.rows,
        owner.origin?.column,
        owner.origin?.row
      ].every(uint) || owner.columns === 0 || owner.rows === 0 || owner.origin.column >= owner.columns || owner.origin.row >= owner.rows)
        throw new Error("InvalidFormulaSources");
    }
  }
  return rows;
}

// js/hwpx-picture-crop-wire.mjs
function decodePictureCrop(bytes) {
  const fail = () => {
    throw new Error("InvalidPictureCrop");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length !== 48)
    fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), flags = view.getUint32(4, true);
  if (view.getUint32(0, true) !== 826495048 || flags & ~63)
    fail();
  const clip = [];
  for (let index = 0;index < 4; index++) {
    const value = view.getBigInt64(8 + index * 8, true), present = flags & 1 << index;
    if (value < -2147483648n || value > 4294967295n || !present && value !== 0n)
      fail();
    clip.push(present ? Number(value) : null);
  }
  const imageDimensions = [];
  for (let index = 0;index < 2; index++) {
    const value = view.getUint32(40 + index * 4, true), present = flags & 1 << index + 4;
    if (!present && value !== 0)
      fail();
    imageDimensions.push(present ? value : null);
  }
  return { clip, imageDimensions };
}

// js/hwpx-picture-transform-wire.mjs
function decodePictureTransform(bytes) {
  const fail = () => {
    throw new Error("InvalidPictureTransform");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length < 24)
    fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true), flags = view.getUint32(12, true), angle = view.getUint32(16, true), identity = view.getUint32(20, true);
  if (view.getUint32(0, true) !== 827609160 || count > 1024 || bytes.length !== 24 + count * 56 || flags & ~1807 || identity > 2 || !(flags & 8) && angle !== 0)
    fail();
  const booleans = [0, 1, 2].map((index) => {
    const present = flags & 1 << index, value = Boolean(flags & 1 << index + 8);
    if (!present && value)
      fail();
    return present ? value : null;
  });
  const matrices = [];
  for (let index = 0;index < count; index++) {
    const at = 24 + index * 56, kind = view.getUint32(at, true), presence = view.getUint32(at + 4, true);
    if (kind > 2 || presence & ~63)
      fail();
    const values = Array.from({ length: 6 }, (_, field) => {
      const value = view.getFloat64(at + 8 + field * 8, true), present = presence & 1 << field;
      if (!present && value !== 0)
        fail();
      return present ? value : null;
    });
    matrices.push({ kind: ["translation", "scale", "rotation"][kind], values });
  }
  return {
    flip: booleans.slice(0, 2),
    reverse: booleans[2],
    angle: flags & 8 ? angle : null,
    identity: identity === 0 ? null : identity === 1,
    unknownMatrixNodes: view.getUint32(8, true),
    matrices
  };
}

// js/character-shapes-wire.mjs
function decodeCharacterShapes(bytes) {
  const fail = () => {
    throw new Error("InvalidCharacterShapes");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length < 8)
    return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 827540296)
    return fail();
  const count = view.getUint32(4, true);
  if (count > 1e6 || bytes.length !== 8 + count * 12)
    return fail();
  let previous = -1;
  return Array.from({ length: count }, (_, index) => {
    const offset = 8 + index * 12, id = view.getUint32(offset, true), rawHeight = view.getInt32(offset + 4, true), flags = view.getUint32(offset + 8, true);
    if (id <= previous || flags > 7 || !(flags & 1) && rawHeight !== 0)
      return fail();
    previous = id;
    return {
      id,
      height: flags & 1 ? rawHeight : null,
      bold: Boolean(flags & 2),
      italic: Boolean(flags & 4)
    };
  });
}
function decodeCharacterRanges(bytes) {
  const fail = () => {
    throw new Error("InvalidCharacterRanges");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length < 8)
    return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 827474760)
    return fail();
  const count = view.getUint32(4, true);
  if (count > 1e6 || bytes.length !== 8 + count * 16)
    return fail();
  let cursor = 0;
  return Array.from({ length: count }, (_, index) => {
    const offset = 8 + index * 16, start = view.getUint32(offset, true), end = view.getUint32(offset + 4, true), id = view.getUint32(offset + 8, true), flags = view.getUint32(offset + 12, true);
    if (start !== cursor || end < start || flags > 1 || flags === 0 && id !== 0)
      return fail();
    cursor = end;
    return { start, end, charShapeId: flags ? id : null };
  });
}
// js/paragraph-break-api.mjs
function createParagraphBreakApi({
  wasm,
  memory,
  check,
  uint,
  prefix,
  endAsCount,
  unavailable
}) {
  const name = `${prefix}_split_with_break`;
  return {
    supportsParagraphBreaks() {
      check();
      return typeof wasm[name] === "function";
    },
    splitParagraphWithBreak({ section, paragraph, atUnit, endUnit = atUnit, kind }) {
      check();
      const values = [section, paragraph, atUnit, endUnit];
      for (const [index, label] of ["section", "paragraph", "atUnit", "endUnit"].entries())
        uint(values[index], label);
      if (endUnit < atUnit)
        throw new RangeError("InvalidTextPosition");
      if (kind !== "page" && kind !== "column")
        throw new Error("InvalidParagraphBreakKind");
      if (typeof wasm[name] !== "function")
        throw new Error(unavailable);
      if (wasm[name](section, paragraph, atUnit, endAsCount ? endUnit - atUnit : endUnit, kind === "page" ? 1 : 2) !== 1)
        throw memory.error();
    }
  };
}

// js/editor-history.mjs
function createHistoryApi({ wasm, memory, check, uint, prefix, unavailable }) {
  const travel = (kind) => {
    check();
    const action = wasm[`${prefix}_${kind}`];
    if (typeof action !== "function")
      throw new Error(unavailable);
    const value = action();
    if (value !== 0 && value !== 1)
      throw memory.error();
    return value === 1;
  };
  let legacyPolicy;
  let negotiation;
  const api = {
    historyRevisions() {
      check();
      const count = wasm[`${prefix}_history_revision_count`], at = wasm[`${prefix}_history_revision_at`];
      if (typeof count !== "function" || typeof at !== "function")
        throw new Error(unavailable);
      const length = count();
      if (!Number.isInteger(length) || length < 1 || length > 65536)
        throw memory.error();
      const revisions = Array.from({ length }, (_, index) => at(index));
      if (revisions.some((value) => !Number.isInteger(value) || value < 0 || value >= 4294967295) || new Set(revisions).size !== length)
        throw memory.error();
      return revisions;
    },
    historyRevision() {
      check();
      const action = wasm[`${prefix}_history_revision`];
      if (typeof action !== "function")
        throw new Error(unavailable);
      const value = action();
      if (!Number.isInteger(value) || value < 0 || value >= 4294967295)
        throw memory.error();
      return value;
    },
    enableHistory({ maxEntries = 16, maxCheckpointBytes = 8 * 1024 * 1024 } = {}) {
      check();
      uint(maxEntries, "maxEntries");
      uint(maxCheckpointBytes, "maxCheckpointBytes");
      const action = wasm[`${prefix}_history_enable`];
      if (typeof action !== "function")
        throw new Error(unavailable);
      if (action(maxEntries, maxCheckpointBytes) !== 1)
        throw memory.error();
      legacyPolicy = Object.freeze({ maxEntries, maxCheckpointBytes });
      negotiation = "explicit-v1";
    },
    historyV2Available() {
      check();
      return typeof wasm[`${prefix}_history_enable_options`] === "function" && typeof wasm[`${prefix}_history_stats`] === "function";
    },
    enableHistoryV2(options = {}) {
      check();
      if (!api.historyV2Available())
        throw new Error("HistoryV2AbiUnavailable");
      if (options === null || typeof options !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(options)))
        throw new TypeError("InvalidHistoryOptions");
      const allowed = new Set([
        "maxEntries",
        "maxCheckpointBytes",
        "maxCheckpointOwnedBytes",
        "maxRetainedBytes"
      ]);
      const clean = {};
      for (const key of Reflect.ownKeys(options)) {
        const d = Object.getOwnPropertyDescriptor(options, key);
        if (!allowed.has(key) || !d || !("value" in d))
          throw new TypeError("InvalidHistoryOptions");
        uint(d.value, key);
        clean[key] = d.value;
      }
      const bytes = new TextEncoder().encode(JSON.stringify(clean));
      memory.withBytes(bytes, (ptr, length) => {
        if (wasm[`${prefix}_history_enable_options`](ptr, length) !== 1)
          throw memory.error();
      });
      negotiation = "explicit-v2";
    },
    enableHistoryDefault(options) {
      check();
      if (options !== undefined) {
        const mode = options && typeof options === "object" ? Object.getOwnPropertyDescriptor(options, "mode") : undefined;
        if (mode && "value" in mode && mode.value === "legacy-v1") {
          if (![Object.prototype, null].includes(Object.getPrototypeOf(options)))
            throw new TypeError("InvalidHistoryOptions");
          const clean = {};
          for (const key of Reflect.ownKeys(options)) {
            const d = Object.getOwnPropertyDescriptor(options, key);
            if (!["mode", "maxEntries", "maxCheckpointBytes"].includes(key) || !d || !("value" in d))
              throw new TypeError("InvalidHistoryOptions");
            if (key !== "mode") {
              uint(d.value, key);
              clean[key] = d.value;
            }
          }
          api.enableHistory(clean);
          return;
        }
        api.enableHistoryV2(options);
        return;
      }
      if (api.historyV2Available()) {
        api.enableHistoryV2({});
        negotiation = "native-default-v2";
      } else {
        api.enableHistory();
        negotiation = "negotiated-legacy-v1";
      }
    },
    historyStats() {
      check();
      const action = wasm[`${prefix}_history_stats`];
      if (typeof action !== "function") {
        if (!legacyPolicy)
          throw new Error("HistoryNotEnabled");
        return Object.freeze({
          protocolVersion: 1,
          negotiation,
          requested: legacyPolicy,
          resolved: legacyPolicy,
          retainedBytes: null,
          metadataOwnedBytes: null,
          currentOwnedBytes: null,
          undoOwnedBytes: null,
          redoOwnedBytes: null,
          evictedCount: null,
          policySource: "legacy-abi-success"
        });
      }
      if (action() !== 1)
        throw memory.error();
      try {
        const bytes = memory.copy(wasm[`${prefix}_output_ptr`](), wasm[`${prefix}_output_len`]());
        return {
          ...JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
          negotiation
        };
      } finally {
        wasm[`${prefix}_output_free`]();
      }
    },
    undo: () => travel("undo"),
    redo: () => travel("redo")
  };
  return api;
}

// js/paragraph-margin-args.mjs
function paragraphMarginArgs(margins) {
  const names = ["left", "right", "indent", "before", "after"];
  if (!margins || typeof margins !== "object" || Array.isArray(margins) || Object.keys(margins).some((key) => !names.includes(key)))
    throw new TypeError("InvalidParagraphMargins");
  let mask = 0;
  const values = names.map((key, index) => {
    if (!Object.hasOwn(margins, key) || margins[key] === null)
      return 0;
    const value = margins[key];
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)
      throw new RangeError("InvalidParagraphMargins");
    mask |= 1 << index;
    return value;
  });
  return [mask, ...values];
}

// js/hwpx-editor.mjs
async function createHwpxEditor(source) {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  for (const suffix of [
    "open",
    "close",
    "section_count",
    "can_edit",
    "splice",
    "save",
    "output_ptr",
    "output_len",
    "output_free"
  ])
    if (typeof wasm[`hwpx_edit_${suffix}`] !== "function")
      throw new Error("HwpxEditAbiUnavailable");
  const memory = createMemory(wasm);
  let closed = false;
  function ready() {
    if (closed)
      throw new Error("EditorClosed");
  }
  function uint(value) {
    if (!Number.isInteger(value) || value < 0 || value > 4294967295)
      throw new RangeError("InvalidInteger");
    return value;
  }
  function encodedText(text) {
    if (typeof text !== "string" || !text.isWellFormed())
      throw new TypeError("InvalidText");
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > 4 * 1024 * 1024)
      throw new RangeError("LimitExceeded");
    return bytes;
  }
  function manualFormulaResultBytes(text, action, unavailable) {
    if (typeof wasm[action] !== "function" || typeof wasm.hwpx_edit_manual_formula_result_max_bytes !== "function")
      throw new Error(unavailable);
    const maxBytes = wasm.hwpx_edit_manual_formula_result_max_bytes();
    if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 4294967295)
      throw new Error("InvalidManualFormulaResultLimit");
    const bytes = encodedText(text);
    if (bytes.length > maxBytes)
      throw new Error("LimitExceeded");
    return bytes;
  }
  function fieldLabels(section, paragraph) {
    ready();
    uint(section);
    uint(paragraph);
    if (typeof wasm.hwpx_edit_field_labels !== "function")
      throw new Error("HwpxFieldEditAbiUnavailable");
    try {
      if (!wasm.hwpx_edit_field_labels(section, paragraph))
        throw memory.error();
      return decodeFieldTargets(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
    } finally {
      wasm.hwpx_edit_output_free();
    }
  }
  function paragraphIds(suffix, args = []) {
    ready();
    args.forEach(uint);
    const action = wasm[`hwpx_edit_${suffix}`];
    if (typeof action !== "function")
      throw new Error("HwpxParagraphFormatAbiUnavailable");
    try {
      if (!action(...args))
        throw memory.error();
      const bytes = memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
      if (bytes.length % 4 || suffix === "paragraph_shape_id" && bytes.length !== 4)
        throw new Error("InvalidParagraphShapeIds");
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return Array.from({ length: bytes.length / 4 }, (_, index) => view.getUint32(index * 4, true));
    } finally {
      wasm.hwpx_edit_output_free();
    }
  }
  return {
    ...createAtomicFormattingApi({ wasm, memory, check: ready, prefix: "hwpx_edit" }),
    ...createParagraphBreakApi({
      wasm,
      memory,
      check: ready,
      uint,
      prefix: "hwpx_edit",
      endAsCount: true,
      unavailable: "HwpxParagraphBreakAbiUnavailable"
    }),
    paragraphShapeIds() {
      return paragraphIds("paragraph_shape_ids");
    },
    paragraphNeighbors(section) {
      const values = paragraphIds("paragraph_neighbors", [section]);
      if (values.length < 2 || values[0] < 1 || values[1] !== values.length - 2)
        throw new Error("InvalidParagraphNeighbors");
      const firstParagraph = values[0], next = values.slice(2);
      for (const [index, value] of next.entries())
        if (value !== 0 && (value <= firstParagraph + index || value >= firstParagraph + next.length))
          throw new Error("InvalidParagraphNeighbors");
      return { firstParagraph, next: next.map((value) => value === 0 ? null : value) };
    },
    paragraphShapeRefs(section) {
      const values = paragraphIds("paragraph_shape_refs", [section]);
      if (values.length < 2 || values[0] < 1 || values[1] !== values.length - 2)
        throw new Error("InvalidParagraphShapeIds");
      return { firstParagraph: values[0], ids: values.slice(2) };
    },
    paragraphShapeId(section, paragraph) {
      return paragraphIds("paragraph_shape_id", [section, paragraph])[0];
    },
    setParagraphFormat({ section, paragraph, paraShapeId }) {
      ready();
      [section, paragraph, paraShapeId].forEach(uint);
      if (typeof wasm.hwpx_edit_set_paragraph_format !== "function")
        throw new Error("HwpxParagraphFormatAbiUnavailable");
      if (!wasm.hwpx_edit_set_paragraph_format(section, paragraph, paraShapeId))
        throw memory.error();
    },
    setParagraphAlignment({ section, paragraph, alignment }) {
      ready();
      [section, paragraph].forEach(uint);
      const value = [
        "LEFT",
        "RIGHT",
        "CENTER",
        "JUSTIFY",
        "DISTRIBUTE",
        "DISTRIBUTE_SPACE"
      ].indexOf(alignment);
      if (value < 0)
        throw new RangeError("InvalidParagraphAlignment");
      if (typeof wasm.hwpx_edit_set_paragraph_alignment !== "function")
        throw new Error("HwpxParagraphAlignmentAbiUnavailable");
      if (!wasm.hwpx_edit_set_paragraph_alignment(section, paragraph, value))
        throw memory.error();
    },
    setParagraphMargins({ section, paragraph, margins }) {
      ready();
      [section, paragraph].forEach(uint);
      const args = paragraphMarginArgs(margins);
      if (typeof wasm.hwpx_edit_set_paragraph_margins !== "function")
        throw new Error("HwpxParagraphMarginsAbiUnavailable");
      if (!wasm.hwpx_edit_set_paragraph_margins(section, paragraph, ...args))
        throw memory.error();
    },
    setParagraphSpacing({ section, paragraph, type, value }) {
      ready();
      [section, paragraph].forEach(uint);
      const args = paragraphSpacingArgs(type, value);
      if (typeof wasm.hwpx_edit_set_paragraph_spacing !== "function")
        throw new Error("HwpxParagraphSpacingAbiUnavailable");
      if (!wasm.hwpx_edit_set_paragraph_spacing(section, paragraph, ...args))
        throw memory.error();
    },
    ...createHistoryApi({
      wasm,
      memory,
      check: ready,
      uint,
      prefix: "hwpx_edit",
      unavailable: "HwpxHistoryAbiUnavailable"
    }),
    canEditOutsideField(section, paragraph, startUnit, endUnit) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (typeof wasm.hwpx_edit_can_edit_outside_field !== "function")
        throw new Error("HwpxOutsideFieldQueryAbiUnavailable");
      const result = wasm.hwpx_edit_can_edit_outside_field(section, paragraph, startUnit, endUnit);
      if (result > 1)
        throw memory.error();
      return result === 1;
    },
    createdTableHostMode(section, anchored = false) {
      ready();
      uint(section);
      if (typeof anchored !== "boolean")
        throw new TypeError("InvalidCreatedTableHostMode");
      if (typeof wasm.hwpx_edit_created_table_host_mode !== "function")
        return false;
      const result = wasm.hwpx_edit_created_table_host_mode(section, Number(anchored));
      if (result > 1)
        throw memory.error();
      return result === 1;
    },
    createdTableFieldLabelMode(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_created_table_field_label_mode !== "function")
        return false;
      const result = wasm.hwpx_edit_created_table_field_label_mode(section);
      if (result > 1)
        throw memory.error();
      return result === 1;
    },
    canEdit(section, paragraph) {
      ready();
      uint(section);
      uint(paragraph);
      const result = wasm.hwpx_edit_can_edit(section, paragraph);
      if (result > 1)
        throw memory.error();
      return result === 1;
    },
    canSplitParagraph({ section, paragraph, atUnit, endUnit = atUnit }) {
      ready();
      [section, paragraph, atUnit, endUnit].forEach(uint);
      if (endUnit < atUnit)
        throw new RangeError("InvalidTextPosition");
      if (typeof wasm.hwpx_edit_can_split !== "function")
        throw new Error("HwpxSplitQueryAbiUnavailable");
      const result = wasm.hwpx_edit_can_split(section, paragraph, atUnit, endUnit - atUnit);
      if (result > 1)
        throw memory.error();
      return result === 1;
    },
    supportsAnchoredSplitQuery() {
      return typeof wasm.hwpx_edit_can_split_anchored === "function";
    },
    canSplitParagraphAnchored({ section, paragraph, atUnit, endUnit = atUnit }) {
      ready();
      [section, paragraph, atUnit, endUnit].forEach(uint);
      if (endUnit < atUnit)
        throw new RangeError("InvalidTextPosition");
      if (typeof wasm.hwpx_edit_can_split_anchored !== "function")
        throw new Error("HwpxAnchoredSplitQueryAbiUnavailable");
      const result = wasm.hwpx_edit_can_split_anchored(section, paragraph, atUnit, endUnit - atUnit);
      if (result > 1)
        throw memory.error();
      return result === 1;
    },
    open(data, options = {}) {
      ready();
      if (!options || typeof options !== "object" || Array.isArray(options))
        throw new TypeError("InvalidEditorOptions");
      const allow = options.allowObservedChartOleDeviations === undefined ? false : options.allowObservedChartOleDeviations;
      if (typeof allow !== "boolean")
        throw new TypeError("InvalidChartOlePolicy");
      if (allow && typeof wasm.hwpx_edit_open_with_chart_ole_policy !== "function")
        throw new Error("HwpxChartOlePolicyAbiUnavailable");
      const bytes = inputBytes(data);
      if (bytes.length > 64 * 1024 * 1024)
        throw new RangeError("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => {
        const result = allow ? wasm.hwpx_edit_open_with_chart_ole_policy(ptr, size, 1) : wasm.hwpx_edit_open(ptr, size);
        if (!result)
          throw memory.error();
      });
      return { sectionCount: wasm.hwpx_edit_section_count() };
    },
    splice(section, paragraph, start, deleted, text) {
      ready();
      [section, paragraph, start, deleted].forEach(uint);
      const bytes = encodedText(text);
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_splice(section, paragraph, start, deleted, ptr, size))
          throw memory.error();
      });
    },
    splitParagraph({ section, paragraph, atUnit, endUnit = atUnit }) {
      ready();
      [section, paragraph, atUnit, endUnit].forEach(uint);
      if (endUnit < atUnit)
        throw new RangeError("InvalidTextPosition");
      if (typeof wasm.hwpx_edit_split !== "function")
        throw new Error("HwpxStructureAbiUnavailable");
      if (!wasm.hwpx_edit_split(section, paragraph, atUnit, endUnit - atUnit))
        throw memory.error();
    },
    splitParagraphAnchored({ section, paragraph, atUnit, endUnit = atUnit }) {
      ready();
      [section, paragraph, atUnit, endUnit].forEach(uint);
      if (endUnit < atUnit)
        throw new RangeError("InvalidTextPosition");
      if (typeof wasm.hwpx_edit_split_anchored !== "function")
        throw new Error("HwpxStructureAbiUnavailable");
      if (!wasm.hwpx_edit_split_anchored(section, paragraph, atUnit, endUnit - atUnit))
        throw memory.error();
    },
    mergeParagraph({ section, paragraph }) {
      ready();
      [section, paragraph].forEach(uint);
      if (typeof wasm.hwpx_edit_merge !== "function")
        throw new Error("HwpxStructureAbiUnavailable");
      if (!wasm.hwpx_edit_merge(section, paragraph))
        throw memory.error();
    },
    mergeParagraphPair({ section, paragraph, rightParagraph }) {
      ready();
      [section, paragraph, rightParagraph].forEach(uint);
      if (typeof wasm.hwpx_edit_merge_pair !== "function")
        throw new Error("HwpxStructureAbiUnavailable");
      if (!wasm.hwpx_edit_merge_pair(section, paragraph, rightParagraph))
        throw memory.error();
    },
    setCharacterFormat({ section, paragraph, startUnit, endUnit, charShapeId }) {
      ready();
      [section, paragraph, startUnit, endUnit, charShapeId].forEach(uint);
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      if (typeof wasm.hwpx_edit_set_character_format !== "function")
        throw new Error("HwpxCharacterFormatAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_format(section, paragraph, startUnit, endUnit, charShapeId))
        throw memory.error();
    },
    setCharacterProperties({ section, paragraph, startUnit, endUnit, properties }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const args = characterPropertyArgs(properties);
      if (typeof wasm.hwpx_edit_set_character_properties !== "function")
        throw new Error("HwpxCharacterPropertiesAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_properties(section, paragraph, startUnit, endUnit, ...args))
        throw memory.error();
    },
    replaceParagraphRangesWithFontName({ ranges, text, language, name, properties }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), inserted = encodeParagraphReplacement(text), font = characterFontNameArgs(language, name);
      const args = properties === undefined ? null : characterPropertyArgs(properties);
      const action = args ? wasm.hwpx_edit_replace_paragraph_ranges_font_name_properties : wasm.hwpx_edit_replace_paragraph_ranges_font_name;
      if (typeof action !== "function")
        throw new Error(args ? "HwpxNamedFontPropertyReplacementAbiUnavailable" : "HwpxNamedFontReplacementAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(inserted, (tp, ts) => memory.withBytes(font.bytes, (np, ns) => {
        if (!action(ptr, size, tp, ts, font.language, np, ns, ...args ?? []))
          throw memory.error();
      })));
    },
    replaceParagraphRanges({ ranges, text, properties }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), inserted = encodeParagraphReplacement(text);
      const args = properties === undefined ? null : characterPropertyArgs(properties);
      const action = args ? wasm.hwpx_edit_replace_paragraph_ranges_properties : wasm.hwpx_edit_replace_paragraph_ranges;
      if (typeof action !== "function")
        throw new Error(args ? "HwpxPropertyReplacementAbiUnavailable" : "HwpxParagraphReplacementAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(inserted, (tp, ts) => {
        if (!action(ptr, size, tp, ts, ...args ?? []))
          throw memory.error();
      }));
    },
    setCharacterStrikeRanges({ ranges, enabled }) {
      ready();
      const bytes = encodeCharacterRanges(ranges);
      if (typeof enabled !== "boolean")
        throw new TypeError("InvalidCharacterProperties");
      if (typeof wasm.hwpx_edit_set_character_strike_ranges !== "function")
        throw new Error("HwpxCharacterStrikeRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_strike_ranges(ptr, size, Number(enabled)))
          throw memory.error();
      });
    },
    setCharacterUnderlineRanges({ ranges, kind }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), value = characterUnderlineArg(kind);
      if (typeof wasm.hwpx_edit_set_character_underline_ranges !== "function")
        throw new Error("HwpxCharacterUnderlineRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_underline_ranges(ptr, size, value))
          throw memory.error();
      });
    },
    setCharacterPropertiesRanges({ ranges, properties }) {
      ready();
      const bytes = encodeCharacterRanges(ranges);
      const args = characterPropertyArgs(properties);
      if (typeof wasm.hwpx_edit_set_character_properties_ranges !== "function")
        throw new Error("HwpxCharacterPropertiesRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_properties_ranges(ptr, size, ...args))
          throw memory.error();
      });
    },
    setCharacterFontNameRanges({ ranges, language, name }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), args = characterFontNameArgs(language, name);
      if (typeof wasm.hwpx_edit_set_character_font_name_ranges !== "function")
        throw new Error("HwpxCharacterFontNameRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(args.bytes, (namePtr, nameSize) => {
        if (!wasm.hwpx_edit_set_character_font_name_ranges(ptr, size, args.language, namePtr, nameSize))
          throw memory.error();
      }));
    },
    setCharacterFontRanges({ ranges, language, fontId }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), args = characterFontArgs(language, fontId);
      if (typeof wasm.hwpx_edit_set_character_font_ranges !== "function")
        throw new Error("HwpxCharacterFontRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_font_ranges(ptr, size, ...args))
          throw memory.error();
      });
    },
    setCharacterTextColorRanges({ ranges, color }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), value = characterColorArg(color);
      if (typeof wasm.hwpx_edit_set_character_text_color_ranges !== "function")
        throw new Error("HwpxCharacterTextColorRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_text_color_ranges(ptr, size, value))
          throw memory.error();
      });
    },
    setCharacterShadeRanges({ ranges, color }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), args = characterShadeArgs(color);
      if (typeof wasm.hwpx_edit_set_character_shade_ranges !== "function")
        throw new Error("HwpxCharacterShadeRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_shade_ranges(ptr, size, ...args))
          throw memory.error();
      });
    },
    setCharacterEffectRanges({ ranges, effect, enabled, exclusive = false }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), args = characterEffectArgs(effect, enabled);
      const method = characterEffectMode(exclusive) ? wasm.hwpx_edit_set_character_effect_ranges_exclusive : wasm.hwpx_edit_set_character_effect_ranges;
      if (typeof method !== "function")
        throw new Error(exclusive ? "HwpxCharacterEffectRangesExclusiveAbiUnavailable" : "HwpxCharacterEffectRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!method(ptr, size, ...args))
          throw memory.error();
      });
    },
    setCharacterOutlineRanges({ ranges, kind }) {
      ready();
      const bytes = encodeCharacterRanges(ranges), value = characterOutlineArg(kind);
      if (typeof wasm.hwpx_edit_set_character_outline_ranges !== "function")
        throw new Error("HwpxCharacterOutlineRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_outline_ranges(ptr, size, value))
          throw memory.error();
      });
    },
    setCharacterStrike({ section, paragraph, startUnit, endUnit, enabled }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      if (typeof enabled !== "boolean")
        throw new TypeError("InvalidCharacterProperties");
      if (typeof wasm.hwpx_edit_set_character_strike !== "function")
        throw new Error("HwpxCharacterStrikeAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_strike(section, paragraph, startUnit, endUnit, Number(enabled)))
        throw memory.error();
    },
    setCharacterUnderline({ section, paragraph, startUnit, endUnit, kind }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const value = characterUnderlineArg(kind);
      if (typeof wasm.hwpx_edit_set_character_underline !== "function")
        throw new Error("HwpxCharacterUnderlineAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_underline(section, paragraph, startUnit, endUnit, value))
        throw memory.error();
    },
    setCharacterStrikeColor({ section, paragraph, startUnit, endUnit, color }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const value = characterColorArg(color);
      if (typeof wasm.hwpx_edit_set_character_strike_color !== "function")
        throw new Error("HwpxCharacterStrikeColorAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_strike_color(section, paragraph, startUnit, endUnit, value))
        throw memory.error();
    },
    setCharacterUnderlineColor({ section, paragraph, startUnit, endUnit, color }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const value = characterColorArg(color);
      if (typeof wasm.hwpx_edit_set_character_underline_color !== "function")
        throw new Error("HwpxCharacterUnderlineColorAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_underline_color(section, paragraph, startUnit, endUnit, value))
        throw memory.error();
    },
    setCharacterFont({ section, paragraph, startUnit, endUnit, language, fontId }) {
      ready();
      for (const [name, value] of Object.entries({ section, paragraph, startUnit, endUnit })) {
        if (!Number.isInteger(value) || value < 0 || value > 4294967295)
          throw new RangeError(`Invalid ${name}`);
      }
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const args = characterFontArgs(language, fontId);
      if (typeof wasm.hwpx_edit_set_character_font !== "function")
        throw new Error("HwpxCharacterFontAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_font(section, paragraph, startUnit, endUnit, ...args))
        throw memory.error();
    },
    setCharacterFontName({ section, paragraph, startUnit, endUnit, language, name }) {
      ready();
      for (const [key, value] of Object.entries({ section, paragraph, startUnit, endUnit })) {
        if (!Number.isInteger(value) || value < 0 || value > 4294967295)
          throw new RangeError(`Invalid ${key}`);
      }
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const args = characterFontNameArgs(language, name);
      if (typeof wasm.hwpx_edit_set_character_font_name !== "function")
        throw new Error("HwpxCharacterFontNameAbiUnavailable");
      memory.withBytes(args.bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_character_font_name(section, paragraph, startUnit, endUnit, args.language, ptr, size))
          throw memory.error();
      });
    },
    spliceWithCharacterProperties(input) {
      ready();
      const { positions, bytes } = textTransactionArgs(input);
      const properties = characterPropertyArgs(input.properties);
      const mode = input.textMode ?? "plain";
      if (!["plain", "anchored", "field"].includes(mode))
        throw new RangeError("InvalidTextKind");
      const begin = input.beginElement ?? 0;
      uint(begin);
      const action = mode === "plain" ? wasm.hwpx_edit_splice_character_properties : wasm.hwpx_edit_splice_character_properties_protected;
      if (typeof action !== "function")
        throw new Error("HwpxCharacterPropertyTextAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        const extra = mode === "plain" ? [] : [mode === "anchored" ? 1 : 2, begin];
        if (!action(...positions, ptr, size, ...properties, ...extra))
          throw memory.error();
      });
    },
    spliceWithFontName(input) {
      ready();
      const { positions, bytes, font } = namedFontTextArgs(input);
      const mode = input.textMode ?? "plain", begin = input.beginElement ?? 0;
      if (!["plain", "anchored", "field"].includes(mode))
        throw new RangeError("InvalidTextKind");
      uint(begin);
      const properties = input.properties === undefined ? null : characterPropertyArgs(input.properties);
      const action = properties ? wasm.hwpx_edit_splice_font_name_properties : mode === "plain" ? wasm.hwpx_edit_splice_font_name : wasm.hwpx_edit_splice_font_name_protected;
      if (typeof action !== "function")
        throw new Error(properties ? "HwpxNamedFontPropertyTextAbiUnavailable" : "HwpxNamedFontTextAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(font.bytes, (namePtr, nameSize) => {
        const extra = properties ? [...properties, mode === "plain" ? 0 : mode === "anchored" ? 1 : 2, begin] : mode === "plain" ? [] : [mode === "anchored" ? 1 : 2, begin];
        if (!action(...positions, ptr, size, font.language, namePtr, nameSize, ...extra))
          throw memory.error();
      }));
    },
    setCharacterTextColor({ section, paragraph, startUnit, endUnit, color }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const value = characterColorArg(color);
      if (typeof wasm.hwpx_edit_set_character_text_color !== "function")
        throw new Error("HwpxCharacterTextColorAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_text_color(section, paragraph, startUnit, endUnit, value))
        throw memory.error();
    },
    setCharacterShade({ section, paragraph, startUnit, endUnit, color }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const args = characterShadeArgs(color);
      if (typeof wasm.hwpx_edit_set_character_shade !== "function")
        throw new Error("HwpxCharacterShadeAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_shade(section, paragraph, startUnit, endUnit, ...args))
        throw memory.error();
    },
    setCharacterEffect({
      section,
      paragraph,
      startUnit,
      endUnit,
      effect,
      enabled,
      exclusive = false
    }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const args = characterEffectArgs(effect, enabled);
      const method = characterEffectMode(exclusive) ? wasm.hwpx_edit_set_character_effect_exclusive : wasm.hwpx_edit_set_character_effect;
      if (typeof method !== "function")
        throw new Error(exclusive ? "HwpxCharacterEffectExclusiveAbiUnavailable" : "HwpxCharacterEffectAbiUnavailable");
      if (!method(section, paragraph, startUnit, endUnit, ...args))
        throw memory.error();
    },
    setCharacterOutline({ section, paragraph, startUnit, endUnit, kind }) {
      ready();
      [section, paragraph, startUnit, endUnit].forEach(uint);
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const value = characterOutlineArg(kind);
      if (typeof wasm.hwpx_edit_set_character_outline !== "function")
        throw new Error("HwpxCharacterOutlineAbiUnavailable");
      if (!wasm.hwpx_edit_set_character_outline(section, paragraph, startUnit, endUnit, value))
        throw memory.error();
    },
    setCellSize({ section, listNode, width, height }) {
      ready();
      [section, listNode, width, height].forEach(uint);
      if (typeof wasm.hwpx_edit_set_cell_size !== "function")
        throw new Error("HwpxCellSizeAbiUnavailable");
      if (!wasm.hwpx_edit_set_cell_size(section, listNode, width, height))
        throw memory.error();
    },
    setCellSizes(cells) {
      ready();
      const bytes = encodeCellSizes(cells);
      if (typeof wasm.hwpx_edit_set_cell_sizes !== "function")
        throw new Error("HwpxCellSizeBatchAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_cell_sizes(ptr, size))
          throw memory.error();
      });
    },
    setPictureDimensions({ section, pictureNode, display, original, current }) {
      ready();
      [section, pictureNode].forEach(uint);
      let mask = 0;
      const values = [];
      for (const [index, pair] of [display, original, current].entries()) {
        if (pair === undefined || pair === null) {
          values.push(0, 0);
          continue;
        }
        if (!Array.isArray(pair) || pair.length !== 2)
          throw new TypeError("InvalidPictureDimensionPair");
        const width = pair[0], height = pair[1];
        uint(width);
        uint(height);
        mask |= 1 << index;
        values.push(width, height);
      }
      if (typeof wasm.hwpx_edit_set_picture_dimensions !== "function")
        throw new Error("HwpxPictureDimensionsAbiUnavailable");
      if (!wasm.hwpx_edit_set_picture_dimensions(section, pictureNode, mask, ...values))
        throw memory.error();
    },
    resizePicture({ section, pictureNode, width, height }) {
      ready();
      [section, pictureNode, width, height].forEach(uint);
      if (width === 0 || height === 0)
        throw new RangeError("InvalidResizeAxisSize");
      if (typeof wasm.hwpx_edit_resize_picture !== "function")
        throw new Error("HwpxPictureResizeAbiUnavailable");
      if (!wasm.hwpx_edit_resize_picture(section, pictureNode, width, height))
        throw memory.error();
    },
    groupedPictureResizeAvailable(section, pictureNode) {
      ready();
      [section, pictureNode].forEach(uint);
      if (typeof wasm.hwpx_edit_group_picture_resize_available !== "function")
        throw new Error("HwpxGroupedPictureResizeAbiUnavailable");
      if (!wasm.hwpx_edit_group_picture_resize_available(section, pictureNode))
        throw memory.error();
      return true;
    },
    characterShapeIds() {
      ready();
      if (typeof wasm.hwpx_edit_character_shape_ids !== "function")
        throw new Error("HwpxCharacterFormatAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_shape_ids())
          throw memory.error();
        const bytes = memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
        if (bytes.length % 4 !== 0)
          throw new Error("InvalidCharacterShapeIds");
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return Array.from({ length: bytes.length / 4 }, (_, index) => view.getUint32(index * 4, true));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    paragraphShapes() {
      ready();
      if (typeof wasm.hwpx_edit_paragraph_shapes !== "function")
        throw new Error("HwpxParagraphShapesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_paragraph_shapes())
          throw memory.error();
        return decodeHwpxParagraphShapes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    characterShapes() {
      ready();
      if (typeof wasm.hwpx_edit_character_shapes !== "function")
        throw new Error("HwpxCharacterShapesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_shapes())
          throw memory.error();
        return decodeCharacterShapes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    characterFontReferences() {
      ready();
      if (typeof wasm.hwpx_edit_character_font_references !== "function")
        throw new Error("HwpxCharacterFontReferencesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_font_references())
          throw memory.error();
        return decodeCharacterFontReferences(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    fontFaces() {
      ready();
      if (typeof wasm.hwpx_edit_font_faces !== "function")
        throw new Error("HwpxFontFacesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_font_faces())
          throw memory.error();
        return decodeFontFaces(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    fontFaceMetadata() {
      ready();
      if (typeof wasm.hwpx_edit_font_face_metadata !== "function")
        throw new Error("HwpxFontFaceMetadataAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_font_face_metadata())
          throw memory.error();
        return decodeHwpxFontFaceMetadata(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    characterFontMetrics() {
      ready();
      if (typeof wasm.hwpx_edit_character_font_metrics !== "function")
        throw new Error("HwpxCharacterFontMetricsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_font_metrics())
          throw memory.error();
        return decodeCharacterFontMetrics(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), "hwpx");
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    supportsDocumentProvenance() {
      return typeof wasm.hwpx_edit_document_provenance === "function";
    },
    documentProvenance() {
      ready();
      if (typeof wasm.hwpx_edit_document_provenance !== "function")
        throw new Error("HwpxDocumentProvenanceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_document_provenance())
          throw memory.error();
        return decodeDocumentProvenance(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    characterTextColors() {
      ready();
      if (typeof wasm.hwpx_edit_character_text_colors !== "function")
        throw new Error("HwpxCharacterTextColorsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_text_colors())
          throw memory.error();
        return decodeCharacterTextColors(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    characterShades() {
      ready();
      if (typeof wasm.hwpx_edit_character_shades !== "function")
        throw new Error("HwpxCharacterShadesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_shades())
          throw memory.error();
        return decodeCharacterShades(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    characterEffects() {
      ready();
      if (typeof wasm.hwpx_edit_character_effects !== "function")
        throw new Error("HwpxCharacterEffectsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_effects())
          throw memory.error();
        return decodeCharacterEffects(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    characterOutlines() {
      ready();
      if (typeof wasm.hwpx_edit_character_outlines !== "function")
        throw new Error("HwpxCharacterOutlinesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_outlines())
          throw memory.error();
        return decodeCharacterOutlines(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    characterStrikeStyles() {
      ready();
      if (typeof wasm.hwpx_edit_character_strike_styles !== "function")
        throw new Error("HwpxCharacterStrikeStylesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_strike_styles())
          throw memory.error();
        return decodeCharacterStrikeStyles(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    characterStrikes() {
      ready();
      if (typeof wasm.hwpx_edit_character_strikes !== "function")
        throw new Error("HwpxCharacterStrikesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_strikes())
          throw memory.error();
        return decodeCharacterStrikes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    characterUnderlines() {
      ready();
      if (typeof wasm.hwpx_edit_character_underlines !== "function")
        throw new Error("HwpxCharacterUnderlinesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_underlines())
          throw memory.error();
        return decodeCharacterUnderlines(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    characterUnderlineStyles() {
      ready();
      if (typeof wasm.hwpx_edit_character_underline_styles !== "function")
        throw new Error("HwpxCharacterUnderlineStylesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_underline_styles())
          throw memory.error();
        return decodeCharacterUnderlineStyles(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    tableBindings(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_table_bindings !== "function")
        throw new Error("HwpxTableBindingsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_bindings(section))
          throw memory.error();
        return decodeTableBindings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    tablePlacements(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_table_placements !== "function")
        throw new Error("HwpxTablePlacementsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_placements(section))
          throw memory.error();
        return decodeTablePlacements(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    drawingTextBindings(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_drawing_text_bindings !== "function")
        throw new Error("HwpxDrawingTextBindingsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_drawing_text_bindings(section))
          throw memory.error();
        return decodeDrawingTextBindings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    drawingTextSnapshot(section, drawingNode) {
      ready();
      uint(section);
      uint(drawingNode);
      if (typeof wasm.hwpx_edit_drawing_text_snapshot !== "function")
        throw new Error("HwpxDrawingTextSnapshotAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_drawing_text_snapshot(section, drawingNode))
          throw memory.error();
        return decodeDrawingTextSnapshot(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    ...typeof wasm.hwpx_edit_drawing_text_requested === "function" && typeof wasm.hwpx_edit_drawing_text_requested_max_nodes === "function" ? {
      drawingTextRequestedMaxNodes: wasm.hwpx_edit_drawing_text_requested_max_nodes(),
      drawingTextRequested(section, nodes) {
        ready();
        uint(section);
        const { requested, bytes } = drawingTextRequest(nodes, wasm.hwpx_edit_drawing_text_requested_max_nodes());
        return memory.withBytes(bytes, (ptr, size) => {
          try {
            if (!wasm.hwpx_edit_drawing_text_requested(section, ptr, size))
              throw memory.error();
            return decodeDrawingTextRequested(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), requested);
          } finally {
            wasm.hwpx_edit_output_free();
          }
        });
      }
    } : {},
    drawingTextSnapshots(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_drawing_text_snapshots !== "function")
        throw new Error("HwpxDrawingTextSnapshotsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_drawing_text_snapshots(section))
          throw memory.error();
        return decodeDrawingTextSnapshots(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    sectionFillBrushes(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_section_fill_brushes !== "function")
        throw new Error("HwpxFillBrushesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_section_fill_brushes(section))
          throw memory.error();
        return decodeFillBrushes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    rectangleNodes(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_rectangle_nodes !== "function")
        throw new Error("HwpxRectangleNodesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_rectangle_nodes(section))
          throw memory.error();
        const nodes = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
        if (!Array.isArray(nodes) || !nodes.every((n, i) => Number.isInteger(n) && n >= 0 && n <= 4294967295 && (i === 0 || n > nodes[i - 1])))
          throw new Error("InvalidRectangleNodes");
        return nodes;
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    rectangleRenderingSource(section, rectangleNode) {
      ready();
      uint(section);
      uint(rectangleNode);
      if (typeof wasm.hwpx_edit_rectangle_rendering_source !== "function")
        throw new Error("HwpxRectangleRenderingSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_rectangle_rendering_source(section, rectangleNode))
          throw memory.error();
        return decodeRectangleRenderingSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    rectangleRenderingSources(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_rectangle_rendering_sources !== "function")
        throw new Error("HwpxRectangleRenderingSourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_rectangle_rendering_sources(section))
          throw memory.error();
        return decodeRectangleRenderingSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    ellipseSources(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_ellipse_sources !== "function")
        throw new Error("HwpxEllipseSourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_ellipse_sources(section))
          throw memory.error();
        return decodeEllipseSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    curveGeometry(section, node) {
      ready();
      uint(section);
      uint(node);
      if (typeof wasm.hwpx_edit_curve_geometry !== "function")
        throw new Error("HwpxCurveGeometryAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_curve_geometry(section, node))
          throw memory.error();
        const value = decodeCurveGeometry(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
        if (value.node !== node)
          throw new Error("CurveGeometryNodeMismatch");
        return value;
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    curveOwner(section, node) {
      ready();
      uint(section);
      uint(node);
      if (typeof wasm.hwpx_edit_curve_owner !== "function")
        throw new Error("HwpxCurveOwnerAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_curve_owner(section, node))
          throw memory.error();
        const value = decodeCurveOwner(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
        if (value.node !== node)
          throw new Error("CurveOwnerNodeMismatch");
        return value;
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    tabSources(section, paragraph) {
      ready();
      uint(section);
      uint(paragraph);
      if (typeof wasm.hwpx_edit_tab_sources !== "function")
        throw new Error("HwpxTabSourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_tab_sources(section, paragraph))
          throw memory.error();
        const value = decodeTabSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
        if (value.section !== section || value.paragraph !== paragraph)
          throw new Error("TabSourcesParagraphMismatch");
        return value;
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    tabDefinitions() {
      ready();
      if (typeof wasm.hwpx_edit_tab_definitions !== "function")
        throw new Error("HwpxTabDefinitionsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_tab_definitions())
          throw memory.error();
        return decodeTabDefinitions(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    sectionTabSources() {
      ready();
      if (typeof wasm.hwpx_edit_section_tabs !== "function")
        throw new Error("HwpxSectionTabsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_section_tabs())
          throw memory.error();
        return decodeSectionTabs(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    supportsCreatedCellSoftLineBreaks() {
      return typeof wasm.hwpx_edit_created_cell_soft_line_breaks === "function" && wasm.hwpx_edit_created_cell_soft_line_breaks() === 1;
    },
    tableCreationResources() {
      ready();
      if (typeof wasm.hwpx_edit_table_creation_resources !== "function")
        throw new Error("HwpxTableCreationResourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_creation_resources())
          throw memory.error();
        return decodeTableCreationResources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    saveForDisplay() {
      ready();
      try {
        const save = typeof wasm.hwpx_edit_save_for_display === "function" ? wasm.hwpx_edit_save_for_display : wasm.hwpx_edit_save;
        if (!save())
          throw memory.error();
        return memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    insertTable(section, paragraph, unit, options) {
      ready();
      [section, paragraph, unit].forEach(uint);
      if (!options || typeof options !== "object" || Array.isArray(options))
        throw new TypeError("InvalidTableCreationOptions");
      const { rows, columns, width, rowHeight, resources } = options;
      if (!resources || typeof resources !== "object" || Array.isArray(resources))
        throw new TypeError("InvalidTableCreationResources");
      const args = [
        rows,
        columns,
        width,
        rowHeight,
        resources.paragraph,
        resources.character,
        resources.style,
        resources.border_fill
      ];
      args.forEach(uint);
      if (typeof wasm.hwpx_edit_insert_table !== "function")
        throw new Error("HwpxTableCreationAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_insert_table(section, paragraph, unit, ...args))
          throw memory.error();
        const identity = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
        createdTableIdentity(identity);
        return identity;
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    createdTables(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_created_tables !== "function")
        throw new Error("HwpxCreatedTablesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_created_tables(section))
          throw memory.error();
        return decodeCreatedTables(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    setCreatedCellText(section, identity, row, column, text) {
      ready();
      [section, row, column].forEach(uint);
      const id = createdTableIdentity(identity);
      const bytes = encodedText(text);
      if (typeof wasm.hwpx_edit_set_created_cell_text !== "function")
        throw new Error("HwpxCreatedCellTextAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_created_cell_text(section, Number(id & 0xffffffffn), Number(id >> 32n), row, column, ptr, size))
          throw memory.error();
      });
    },
    containerSourceSnapshot(section, containerNode) {
      ready();
      uint(section);
      uint(containerNode);
      if (typeof wasm.hwpx_edit_container_source_snapshot !== "function")
        throw new Error("HwpxContainerSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_container_source_snapshot(section, containerNode))
          throw memory.error();
        return decodeContainerSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    containerCaptionBindings(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_container_caption_bindings !== "function")
        throw new Error("HwpxContainerCaptionBindingsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_container_caption_bindings(section))
          throw memory.error();
        return decodeCaptionBindings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), "container_node", "InvalidContainerCaptionBindings");
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    oleBytes(section, oleNode, { allowExternalPackagedCopy = false } = {}) {
      ready();
      uint(section);
      uint(oleNode);
      if (typeof allowExternalPackagedCopy !== "boolean")
        throw new Error("InvalidOleSourceOptions");
      if (typeof wasm.hwpx_edit_ole_bytes !== "function")
        throw new Error("HwpxOleBytesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_ole_bytes(section, oleNode, Number(allowExternalPackagedCopy)))
          throw memory.error();
        return decodeOleBytes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    oleSites(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_ole_sites !== "function")
        throw new Error("HwpxOleSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_ole_sites(section))
          throw memory.error();
        return decodeOleSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    oleSource(section, oleNode) {
      ready();
      uint(section);
      uint(oleNode);
      if (typeof wasm.hwpx_edit_ole_source !== "function")
        throw new Error("HwpxOleSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_ole_source(section, oleNode))
          throw memory.error();
        return decodeOleSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    pictureSites(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_picture_sites !== "function")
        throw new Error("HwpxPictureSitesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_sites(section))
          throw memory.error();
        return decodePictureSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    pictureFlow(section, pictureNode) {
      ready();
      uint(section);
      uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_flow !== "function")
        throw new Error("HwpxPictureFlowAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_flow(section, pictureNode))
          throw memory.error();
        return decodePictureFlow(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    picturePosition(section, pictureNode) {
      ready();
      uint(section);
      uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_position !== "function")
        throw new Error("HwpxPicturePositionAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_position(section, pictureNode))
          throw memory.error();
        return decodePicturePosition(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    pictureRenderingCorners(section, pictureNode) {
      ready();
      uint(section);
      uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_rendering_corners !== "function")
        throw new Error("HwpxPictureCornersAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_rendering_corners(section, pictureNode))
          throw memory.error();
        return decodePictureRenderingCorners(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    pictureOwner(section, pictureNode) {
      ready();
      uint(section);
      uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_owner !== "function")
        throw new Error("HwpxPictureOwnerAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_owner(section, pictureNode))
          throw memory.error();
        return decodePictureOwner(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    pictureOwners(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_picture_owners !== "function")
        throw new Error("HwpxPictureOwnersAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_owners(section))
          throw memory.error();
        return decodePictureOwners(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    lineNodes(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_line_nodes !== "function")
        throw new Error("HwpxLineDisplayAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_line_nodes(section))
          throw memory.error();
        return decodeLineNodes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    lineGeometry(section, node) {
      ready();
      uint(section);
      uint(node);
      if (typeof wasm.hwpx_edit_line_geometry !== "function")
        throw new Error("HwpxLineGeometryAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_line_geometry(section, node))
          throw memory.error();
        return decodeLineGeometry(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), node);
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    connectorNodes(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_connector_nodes !== "function")
        throw new Error("HwpxConnectorSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_connector_nodes(section))
          throw memory.error();
        return decodeConnectorNodes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    connectorGeometrySource(section, node) {
      ready();
      uint(section);
      uint(node);
      if (typeof wasm.hwpx_edit_connector_geometry_source !== "function")
        throw new Error("HwpxConnectorSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_connector_geometry_source(section, node))
          throw memory.error();
        return decodeConnectorSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    drawingStrokeSource(section, node) {
      ready();
      uint(section);
      uint(node);
      if (typeof wasm.hwpx_edit_drawing_stroke_source !== "function")
        throw new Error("HwpxDrawingStrokeSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_drawing_stroke_source(section, node))
          throw memory.error();
        return decodeDrawingStrokeSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), node);
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    connectorOwner(section, node) {
      ready();
      uint(section);
      uint(node);
      if (typeof wasm.hwpx_edit_connector_owner !== "function")
        throw new Error("HwpxConnectorOwnerAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_connector_owner(section, node))
          throw memory.error();
        return decodeConnectorOwner(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), node);
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    connectorRenderingSource(section, node) {
      ready();
      uint(section);
      uint(node);
      if (typeof wasm.hwpx_edit_connector_rendering_source !== "function")
        throw new Error("HwpxConnectorRenderingSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_connector_rendering_source(section, node))
          throw memory.error();
        return decodeConnectorRenderingSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), node);
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    connectorPlacementSource(section, node) {
      ready();
      uint(section);
      uint(node);
      if (typeof wasm.hwpx_edit_connector_placement_source !== "function")
        throw new Error("HwpxConnectorPlacementSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_connector_placement_source(section, node))
          throw memory.error();
        return {
          sourceOnly: true,
          ...decodeDrawingPlacement(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), "InvalidConnectorPlacementSource")
        };
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    pageSettings() {
      ready();
      if (typeof wasm.hwpx_edit_page_settings !== "function")
        throw new Error("HwpxPageSettingsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_page_settings())
          throw memory.error();
        return decodePageSettings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    noteShapes() {
      ready();
      if (typeof wasm.hwpx_edit_note_shapes !== "function")
        throw new Error("HwpxNoteShapesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_note_shapes())
          throw memory.error();
        return decodeNoteShapes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    paragraphFlow(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_paragraph_flow !== "function")
        throw new Error("HwpxParagraphFlowAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_paragraph_flow(section))
          throw memory.error();
        return decodeParagraphFlow(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    tablePagination(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_table_pagination !== "function")
        throw new Error("HwpxTablePaginationAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_pagination(section))
          throw memory.error();
        return decodeTablePagination(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    ...typeof wasm.hwpx_edit_line_display_batch === "function" && typeof wasm.hwpx_edit_line_display_batch_max_nodes === "function" ? {
      lineDisplayBatchMaxNodes: wasm.hwpx_edit_line_display_batch_max_nodes(),
      lineDisplayBatch(section, nodes) {
        ready();
        uint(section);
        const bytes = encodeLineDisplayNodes(nodes, wasm.hwpx_edit_line_display_batch_max_nodes());
        return memory.withBytes(bytes, (ptr, size) => {
          try {
            if (!wasm.hwpx_edit_line_display_batch(section, ptr, size))
              throw memory.error();
            return decodeLineDisplayBatch(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), nodes);
          } finally {
            wasm.hwpx_edit_output_free();
          }
        });
      }
    } : {},
    ...typeof wasm.hwpx_edit_table_border_sources_batch === "function" && typeof wasm.hwpx_edit_table_border_sources_batch_max_sections === "function" ? {
      tableBorderSourcesBatchMaxSections: wasm.hwpx_edit_table_border_sources_batch_max_sections(),
      tableBorderSourcesBatch(sections) {
        ready();
        const bytes = encodeTableBorderSections(sections, wasm.hwpx_edit_table_border_sources_batch_max_sections());
        return memory.withBytes(bytes, (ptr, size) => {
          try {
            if (!wasm.hwpx_edit_table_border_sources_batch(ptr, size))
              throw memory.error();
            return decodeTableBorderBatch(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), sections);
          } finally {
            wasm.hwpx_edit_output_free();
          }
        });
      }
    } : {},
    tableBorderSources(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_table_border_sources !== "function")
        throw new Error("HwpxTableBorderSourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_border_sources(section))
          throw memory.error();
        return decodeTableBorderSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    tableGeometry(section, tableNode) {
      ready();
      uint(section);
      uint(tableNode);
      if (typeof wasm.hwpx_edit_table_geometry !== "function")
        throw new Error("HwpxTableGeometryAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_geometry(section, tableNode))
          throw memory.error();
        return decodeTableGeometry(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    automaticNumberSources(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_automatic_number_sources !== "function")
        throw new Error("HwpxAutomaticNumberSourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_automatic_number_sources(section))
          throw memory.error();
        return decodeAutomaticNumberSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    automaticNumberSites(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_automatic_number_sites !== "function")
        throw new Error("HwpxAutomaticNumberSitesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_automatic_number_sites(section))
          throw memory.error();
        return decodeAutomaticNumberSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    noteReferenceSites(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_note_reference_sites !== "function")
        throw new Error("HwpxNoteReferenceSitesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_note_reference_sites(section))
          throw memory.error();
        return decodeNoteReferenceSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    paragraphTextSnapshot(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_paragraph_text_snapshot !== "function")
        throw new Error("HwpxParagraphTextSnapshotAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_paragraph_text_snapshot(section))
          throw memory.error();
        return decodeParagraphTextSnapshot(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    formulaFieldSources(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_formula_field_sources !== "function")
        throw new Error("HwpxFormulaFieldSourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_formula_field_sources(section))
          throw memory.error();
        return decodeFormulaFieldSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    tableCaptionBindings(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_table_caption_bindings !== "function")
        throw new Error("HwpxTableCaptionBindingsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_caption_bindings(section))
          throw memory.error();
        return decodeTableCaptionBindings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    tableCaption(section, tableNode) {
      ready();
      uint(section);
      uint(tableNode);
      if (typeof wasm.hwpx_edit_table_caption !== "function")
        throw new Error("HwpxTableCaptionAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_caption(section, tableNode))
          throw memory.error();
        return decodeTableCaption(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    pictureCaptionBindings(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_picture_caption_bindings !== "function")
        throw new Error("HwpxPictureCaptionBindingsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_caption_bindings(section))
          throw memory.error();
        return decodeCaptionBindings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), "picture_node", "InvalidPictureCaptionBindings");
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    pictureCaption(section, pictureNode) {
      ready();
      uint(section);
      uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_caption !== "function")
        throw new Error("HwpxPictureCaptionAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_caption(section, pictureNode))
          throw memory.error();
        return decodeTableCaption(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    tableCellMargin(section, listNode) {
      ready();
      uint(section);
      uint(listNode);
      if (typeof wasm.hwpx_edit_table_cell_margin !== "function")
        throw new Error("HwpxTableCellMarginAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_cell_margin(section, listNode))
          throw memory.error();
        return decodeTableCellMargin(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    formulaSources(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_formula_sources !== "function")
        throw new Error("HwpxFormulaSourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_formula_sources(section))
          throw memory.error();
        return decodeFormulaSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    formulaCurrent(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_formula_current !== "function")
        throw new Error("HwpxFormulaCurrentAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_formula_current(section))
          throw memory.error();
        return decodeFormulaSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), { current: true });
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    linePlacement(section, lineNode) {
      ready();
      uint(section);
      uint(lineNode);
      if (typeof wasm.hwpx_edit_line_placement !== "function")
        throw new Error("HwpxLinePlacementAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_line_placement(section, lineNode))
          throw memory.error();
        return decodeLinePlacement(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    lineDisplay(section, lineNode) {
      ready();
      uint(section);
      uint(lineNode);
      if (typeof wasm.hwpx_edit_line_display !== "function")
        throw new Error("HwpxLineDisplayAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_line_display(section, lineNode))
          throw memory.error();
        return decodeLineDisplay(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    tableBackgroundBytes(section, listNode) {
      ready();
      uint(section);
      uint(listNode);
      if (typeof wasm.hwpx_edit_table_background_bytes !== "function")
        throw new Error("HwpxTableBackgroundBytesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_table_background_bytes(section, listNode))
          throw memory.error();
        return memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    pictureBytes(section, pictureNode) {
      ready();
      uint(section);
      uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_bytes !== "function")
        throw new Error("HwpxPictureBytesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_bytes(section, pictureNode))
          throw memory.error();
        return memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    pictureGeometry(section, pictureNode) {
      ready();
      uint(section);
      uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_geometry !== "function")
        throw new Error("HwpxPictureGeometryAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_geometry(section, pictureNode))
          throw memory.error();
        return decodePictureGeometry(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    pictureSizeProtection(section, pictureNode) {
      ready();
      uint(section);
      uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_size_protection !== "function")
        throw new Error("HwpxPictureSizeProtectionAbiUnavailable");
      const value = wasm.hwpx_edit_picture_size_protection(section, pictureNode);
      if (value === 3)
        throw memory.error();
      if (![0, 1, 2].includes(value))
        throw new Error("InvalidPictureSizeProtection");
      return value === 0 ? null : value === 2;
    },
    pictureCrop(section, pictureNode) {
      ready();
      uint(section);
      uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_crop !== "function")
        throw new Error("HwpxPictureCropAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_crop(section, pictureNode))
          throw memory.error();
        return decodePictureCrop(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    pictureTransform(section, pictureNode) {
      ready();
      uint(section);
      uint(pictureNode);
      if (typeof wasm.hwpx_edit_picture_transform !== "function")
        throw new Error("HwpxPictureTransformAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_picture_transform(section, pictureNode))
          throw memory.error();
        return decodePictureTransform(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    characterRanges(section, paragraph) {
      ready();
      uint(section);
      uint(paragraph);
      if (typeof wasm.hwpx_edit_character_ranges !== "function")
        throw new Error("HwpxCharacterRangesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_character_ranges(section, paragraph))
          throw memory.error();
        return decodeCharacterRanges(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    anchorText(section, paragraph) {
      ready();
      uint(section);
      uint(paragraph);
      if (typeof wasm.hwpx_edit_anchor_text !== "function")
        throw new Error("HwpxAnchorEditAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_anchor_text(section, paragraph))
          throw memory.error();
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    spliceAnchored(section, paragraph, start, deleted, text) {
      ready();
      [section, paragraph, start, deleted].forEach(uint);
      if (typeof wasm.hwpx_edit_splice_anchored !== "function")
        throw new Error("HwpxAnchorEditAbiUnavailable");
      const bytes = encodedText(text);
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_splice_anchored(section, paragraph, start, deleted, ptr, size))
          throw memory.error();
      });
    },
    spliceFieldLabel(section, paragraph, beginElement, start, deleted, text) {
      ready();
      [section, paragraph, beginElement, start, deleted].forEach(uint);
      if (typeof wasm.hwpx_edit_splice_field_label !== "function")
        throw new Error("HwpxFieldEditAbiUnavailable");
      const bytes = encodedText(text);
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_splice_field_label(section, paragraph, beginElement, start, deleted, ptr, size))
          throw memory.error();
      });
    },
    setFormulaDefinition(section, beginElement, formula) {
      ready();
      [section, beginElement].forEach(uint);
      if (typeof wasm.hwpx_edit_set_formula_definition !== "function")
        throw new Error("HwpxFormulaEditAbiUnavailable");
      const bytes = encodedText(formula);
      if (bytes.length > 4096)
        throw new Error("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_formula_definition(section, beginElement, ptr, size))
          throw memory.error();
      });
    },
    setManualFormulaResult(section, beginElement, display) {
      ready();
      [section, beginElement].forEach(uint);
      const bytes = manualFormulaResultBytes(display, "hwpx_edit_set_manual_formula_result", "HwpxManualFormulaResultAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_manual_formula_result(section, beginElement, ptr, size))
          throw memory.error();
      });
    },
    spliceManualFormulaResult(section, beginElement, start, deleted, text) {
      ready();
      [section, beginElement, start, deleted].forEach(uint);
      const bytes = manualFormulaResultBytes(text, "hwpx_edit_splice_manual_formula_result", "HwpxManualFormulaResultSpliceAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_splice_manual_formula_result(section, beginElement, start, deleted, ptr, size))
          throw memory.error();
      });
    },
    ...createHwpxChartApi({ wasm, memory, ready, uint, encodedText }),
    formSourceNodes(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_form_source_nodes !== "function")
        throw new Error("HwpxFormSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_form_source_nodes(section))
          throw memory.error();
        return decodeFormSourceNodes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    inlineStringSources() {
      ready();
      if (typeof wasm.hwpx_edit_inline_string_sources !== "function")
        throw new Error("HwpxInlineStringSourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_inline_string_sources())
          throw memory.error();
        return decodeInlineStringSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    dutmalText(section, node, kind) {
      ready();
      [section, node].forEach(uint);
      const selected = dutmalKind(kind);
      if (typeof wasm.hwpx_edit_dutmal_text !== "function")
        throw new Error("HwpxDutmalTextAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_dutmal_text(section, node, selected))
          throw memory.error();
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    equationScript(section, node) {
      ready();
      [section, node].forEach(uint);
      if (typeof wasm.hwpx_edit_equation_script !== "function")
        throw new Error("HwpxEquationScriptAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_equation_script(section, node))
          throw memory.error();
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    measureEquation(source, settings) {
      ready();
      return createEquationEngine(wasm).measure(source, settings);
    },
    equationStyles(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_equation_styles !== "function")
        throw new Error("HwpxEquationStylesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_equation_styles(section))
          throw memory.error();
        return decodeEquationStyles(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    layoutEquation(source, settings, measurements, options) {
      ready();
      return createEquationEngine(wasm).layout(source, settings, measurements, options);
    },
    equationSources(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_equation_sources !== "function")
        throw new Error("HwpxEquationSourcesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_equation_sources(section))
          throw memory.error();
        return decodeEquationSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    equationScripts(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_equation_scripts !== "function")
        throw new Error("HwpxEquationSnapshotAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_equation_scripts(section))
          throw memory.error();
        return decodeEquationScripts(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    setEquationScript(section, node, value) {
      ready();
      [section, node].forEach(uint);
      if (typeof wasm.hwpx_edit_set_equation_script !== "function" || typeof wasm.hwpx_edit_equation_script_max_bytes !== "function")
        throw new Error("HwpxEquationScriptAbiUnavailable");
      const maxBytes = wasm.hwpx_edit_equation_script_max_bytes();
      if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 4294967295)
        throw new Error("InvalidEquationScriptLimit");
      const bytes = encodedText(value);
      if (bytes.length > maxBytes)
        throw new Error("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_equation_script(section, node, ptr, size))
          throw memory.error();
      });
    },
    equationSites(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_equation_sites !== "function")
        throw new Error("HwpxEquationSitesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_equation_sites(section))
          throw memory.error();
        return decodeEquationSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    dutmalSites(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_dutmal_sites !== "function")
        throw new Error("HwpxDutmalSitesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_dutmal_sites(section))
          throw memory.error();
        return decodeDutmalSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    dutmalDisplayText(section, node) {
      ready();
      [section, node].forEach(uint);
      if (typeof wasm.hwpx_edit_dutmal_display_text !== "function")
        throw new Error("HwpxDutmalDisplayTextAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_dutmal_display_text(section, node))
          throw memory.error();
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    fieldLabelDisplayText(section, paragraph) {
      ready();
      [section, paragraph].forEach(uint);
      if (typeof wasm.hwpx_edit_field_label_display_text !== "function")
        throw new Error("HwpxFieldLabelDisplayTextAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_field_label_display_text(section, paragraph))
          throw memory.error();
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    setDutmalText(section, node, kind, value) {
      ready();
      [section, node].forEach(uint);
      const selected = dutmalKind(kind);
      if (typeof wasm.hwpx_edit_set_dutmal_text !== "function" || typeof wasm.hwpx_edit_dutmal_text_max_bytes !== "function")
        throw new Error("HwpxDutmalTextAbiUnavailable");
      const maxBytes = wasm.hwpx_edit_dutmal_text_max_bytes();
      if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 4294967295)
        throw new Error("InvalidDutmalTextLimit");
      const bytes = encodedText(value);
      if (bytes.length > maxBytes)
        throw new Error("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_dutmal_text(section, node, selected, ptr, size))
          throw memory.error();
      });
    },
    formSites(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_form_sites !== "function")
        throw new Error("HwpxFormSitesAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_form_sites(section))
          throw memory.error();
        return decodeFormSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    formSourceAttributes(section, formNode) {
      ready();
      [section, formNode].forEach(uint);
      if (typeof wasm.hwpx_edit_form_source_attributes !== "function")
        throw new Error("HwpxFormSourceAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_form_source_attributes(section, formNode))
          throw memory.error();
        return decodeFormSourceAttributes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    checkBoxState(section, formNode) {
      ready();
      [section, formNode].forEach(uint);
      if (typeof wasm.hwpx_edit_checkbox_state !== "function")
        throw new Error("HwpxCheckBoxStateAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_checkbox_state(section, formNode))
          throw memory.error();
        return new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    formSourceLayout(section, formNode) {
      ready();
      [section, formNode].forEach(uint);
      if (typeof wasm.hwpx_edit_form_source_layout !== "function")
        throw new Error("HwpxFormLayoutAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_form_source_layout(section, formNode))
          throw memory.error();
        return decodeFormSourceLayout(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    setCheckBoxState(section, formNode, state) {
      ready();
      [section, formNode].forEach(uint);
      if (typeof wasm.hwpx_edit_set_checkbox_state !== "function")
        throw new Error("HwpxCheckBoxStateAbiUnavailable");
      const bytes = encodedText(state);
      if (bytes.length > 32)
        throw new RangeError("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_set_checkbox_state(section, formNode, ptr, size))
          throw memory.error();
      });
    },
    fieldLabels,
    manualFormulaResultDisplaySnapshot(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_manual_formula_result_display_snapshot !== "function")
        throw new Error("HwpxFormulaResultSnapshotAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_manual_formula_result_display_snapshot(section))
          throw memory.error();
        return decodeFormulaResultDisplaySnapshot(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    pageAreaDeclarations(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_page_area_declarations !== "function")
        throw new Error("HwpxPageAreaDeclarationsAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_page_area_declarations(section))
          throw memory.error();
        return decodePageAreaDeclarations(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    manualFormulaResultParagraphs(section) {
      ready();
      uint(section);
      if (typeof wasm.hwpx_edit_manual_formula_result_paragraphs !== "function")
        throw new Error("HwpxManualFormulaResultParagraphAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_manual_formula_result_paragraphs(section))
          throw memory.error();
        return decodeFormulaResultParagraphs(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    manualFormulaResultTargets(section, paragraph) {
      ready();
      [section, paragraph].forEach(uint);
      if (typeof wasm.hwpx_edit_manual_formula_result_targets !== "function")
        throw new Error("HwpxManualFormulaResultTargetAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_manual_formula_result_targets(section, paragraph))
          throw memory.error();
        return decodeFieldTargets(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    manualFormulaResultDisplayText(section, paragraph) {
      ready();
      [section, paragraph].forEach(uint);
      if (typeof wasm.hwpx_edit_manual_formula_result_display_text !== "function")
        throw new Error("HwpxManualFormulaResultTargetAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_manual_formula_result_display_text(section, paragraph))
          throw memory.error();
        return new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    manualFormulaResultRangeTarget(section, paragraph, start, end) {
      ready();
      [section, paragraph, start, end].forEach(uint);
      if (end < start)
        throw new Error("InvalidTextPosition");
      if (typeof wasm.hwpx_edit_manual_formula_result_range_target !== "function")
        throw new Error("HwpxManualFormulaResultTargetAbiUnavailable");
      try {
        if (!wasm.hwpx_edit_manual_formula_result_range_target(section, paragraph, start, end))
          throw memory.error();
        const targets = decodeFieldTargets(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
        if (targets.length > 1)
          throw new Error("InvalidFieldTargets");
        return targets[0] ?? null;
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    fieldRangeTarget(section, paragraph, start, end) {
      ready();
      [section, paragraph, start, end].forEach(uint);
      if (end < start)
        throw new Error("InvalidTextPosition");
      if (typeof wasm.hwpx_edit_field_range_target !== "function") {
        const targets = fieldLabels(section, paragraph).filter((t) => start >= t.start && end <= t.end);
        if (targets.length > 1)
          throw new Error("UnsupportedFieldLabelRange");
        return targets[0] ?? null;
      }
      try {
        if (!wasm.hwpx_edit_field_range_target(section, paragraph, start, end))
          throw memory.error();
        const targets = decodeFieldTargets(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
        if (targets.length > 1)
          throw new Error("InvalidFieldTargets");
        return targets[0] ?? null;
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    save() {
      ready();
      try {
        if (!wasm.hwpx_edit_save())
          throw memory.error();
        return memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
      } finally {
        wasm.hwpx_edit_output_free();
      }
    },
    close() {
      if (!closed)
        wasm.hwpx_edit_close();
      closed = true;
    }
  };
}

// web/preview/paragraph-split-command.mjs
function paragraphBreakIntent(message) {
  if (!Object.hasOwn(message, "breakBefore"))
    return null;
  if (message.kind !== "split")
    throw new Error("InvalidStructureCommand");
  if (message.anchored !== undefined && typeof message.anchored !== "boolean")
    throw new Error("InvalidAnchorMode");
  if (message.anchored === true)
    throw new Error("InvalidStructureCommand");
  if (message.breakBefore !== "page" && message.breakBefore !== "column")
    throw new Error("InvalidParagraphBreakKind");
  return message.breakBefore;
}
function applyParagraphSplit(editor, target, message, allowAnchored = false) {
  const intent = paragraphBreakIntent(message);
  if (intent !== null)
    return editor.splitParagraphWithBreak({ ...target, kind: intent });
  if (allowAnchored && message.anchored === true)
    return editor.splitParagraphAnchored(target);
  return editor.splitParagraph(target);
}

// web/preview/hwpx-chart-content.mjs
function attachHwpxCharts(editor, content, exports, allowObservedRepairs) {
  content.chartDisplayAvailable = exports.has("hwpx_edit_chart_display");
  content.chartEditAvailable = [
    "hwpx_edit_chart_nodes",
    "hwpx_edit_chart_points",
    "hwpx_edit_set_chart_numeric_point"
  ].every((name) => exports.has(name));
  content.chartStringEditAvailable = [
    "hwpx_edit_set_chart_point",
    "hwpx_edit_chart_point_max_bytes"
  ].every((name) => exports.has(name));
  content.chartPointBatchEditAvailable = content.chartEditAvailable && content.chartStringEditAvailable && [
    "hwpx_edit_set_chart_points",
    "hwpx_edit_chart_point_batch_max_edits",
    "hwpx_edit_chart_point_batch_max_bytes",
    "hwpx_edit_history_revision"
  ].every((name) => exports.has(name));
  content.chartPointBatchLimits = content.chartPointBatchEditAvailable ? editor.chartPointBatchLimits() : null;
  content.chartSeriesTextEditAvailable = [
    "hwpx_edit_chart_series_text",
    "hwpx_edit_set_chart_series_text",
    "hwpx_edit_chart_series_text_max_bytes"
  ].every((name) => exports.has(name));
  content.chartRichTextEditAvailable = [
    "hwpx_edit_chart_rich_text",
    "hwpx_edit_set_chart_rich_text",
    "hwpx_edit_chart_rich_text_max_bytes"
  ].every((name) => exports.has(name));
  content.chartOleObservedRepairsAllowed = allowObservedRepairs;
  content.chartTargets = [];
  if (!content.chartEditAvailable)
    return content;
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    if (exports.has("hwpx_edit_chart_sites")) {
      for (const site of editor.chartSites(section))
        content.chartTargets.push({
          ...site,
          section,
          paragraph: site.paragraph === null ? null : site.paragraph - 1
        });
    } else
      for (const wrapper of editor.chartNodes(section))
        content.chartTargets.push({ section, wrapper });
  }
  return content;
}

// web/preview/chart-point-batch-command.mjs
function samePair(expected, current) {
  return expected && typeof expected === "object" && !Array.isArray(expected) && ["chart_path", "ole_path", "wrapper_node", "section_ordinal", "declared_external"].every((key) => expected[key] === current[key]) && Array.isArray(expected.section_sha256) && expected.section_sha256.length === current.section_sha256.length && Array.from(expected.section_sha256).every((byte, i) => byte === current.section_sha256[i]);
}
function applyChartPointBatchCommand(editor, message) {
  const limits = editor.chartPointBatchLimits();
  if (!Number.isInteger(message.expectedRevision) || message.expectedRevision < 0 || message.expectedRevision >= 4294967295 || !Array.isArray(message.changes) || message.changes.length > limits.maxEdits)
    throw new Error("InvalidChartBatchCommand");
  if (message.expectedRevision !== editor.historyRevision())
    throw new Error("StaleChartBatch");
  const current = editor.chartPoints(message.section, message.wrapper);
  if (!samePair(message.expectedPair, current.pair))
    throw new Error("StaleChartBatch");
  const edits = [];
  for (const change of message.changes) {
    if (!change || !Number.isInteger(change.point) || change.point < 0 || typeof change.before !== "string" || typeof change.value !== "string")
      throw new Error("InvalidChartBatchCommand");
    if (current.values.points[change.point]?.value !== change.before)
      throw new Error("StaleChartBatch");
    edits.push({ point: change.point, value: change.value });
  }
  editor.setChartPoints(message.section, message.wrapper, edits);
}

// web/preview/table-source-columns.mjs
function sourceTableColumns(table) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(table?.columns) || table.columns < 1 || table.columns > 1e4 || !Array.isArray(table.cells) || table.cells.length > 1e5)
    return unavailable("InvalidSourceTableColumns");
  const edges = Array.from({ length: table.columns + 1 }, () => []);
  for (const cell of table.cells) {
    if (!cell || !Number.isSafeInteger(cell.column) || !Number.isSafeInteger(cell.columnSpan) || cell.column < 0 || cell.columnSpan < 1 || cell.column > table.columns - cell.columnSpan || !(cell.width === null || Number.isSafeInteger(cell.width) && cell.width >= 0 && cell.width <= 4294967295))
      return unavailable("InvalidSourceTableColumns");
    if (cell.width === null)
      continue;
    const end = cell.column + cell.columnSpan;
    edges[cell.column].push({ end, delta: cell.width });
    edges[end].push({ end: cell.column, delta: -cell.width });
  }
  for (const list of edges)
    list.sort((a, b) => a.end - b.end || a.delta - b.delta);
  const positions = Array(table.columns + 1).fill(null), pending = [0];
  positions[0] = 0;
  for (let cursor = 0;cursor < pending.length; cursor++) {
    const start = pending[cursor];
    for (const edge of edges[start]) {
      const expected = positions[start] + edge.delta;
      if (!Number.isSafeInteger(expected))
        return unavailable("InvalidSourceTableColumns");
      if (positions[edge.end] === null) {
        positions[edge.end] = expected;
        pending.push(edge.end);
      } else if (positions[edge.end] !== expected)
        return {
          ...unavailable("ConflictingSourceTableColumns"),
          start,
          end: edge.end,
          expected,
          actual: positions[edge.end]
        };
    }
  }
  const missing = positions.flatMap((value, index) => value === null ? [index] : []);
  if (missing.length)
    return { ...unavailable("UnderdeterminedSourceTableColumns"), missing };
  const columns = positions.slice(1).map((position, index) => position - positions[index]);
  if (columns.some((width) => width <= 0))
    return {
      ...unavailable("InvalidSourceTableColumns"),
      reason: "NonPositiveSourceColumnSolution"
    };
  return { state: "resolved", columns, positions, width: positions.at(-1) };
}

// web/preview/source-table-row-horizontals.mjs
function sourceTableRowHorizontals(table, { maxCoveredCells = 1e6 } = {}) {
  const fail = (error) => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(table?.rows) || table.rows < 1 || table.rows > 1e4 || !Number.isSafeInteger(table.columns) || table.columns < 1 || table.columns > 1e4 || !Array.isArray(table.cells) || !table.cells.length || table.cells.length > 1e5 || !Number.isSafeInteger(maxCoveredCells) || maxCoveredCells < 1)
    return fail("InvalidSourceTableRowHorizontals");
  if (table.pagination?.cell_spacing !== undefined && table.pagination.cell_spacing !== 0)
    return fail("UnsupportedSourceTableRowSpacing");
  const rows = Array.from({ length: table.rows }, () => []), ids = new Set;
  let work = 0;
  for (const cell of table.cells) {
    if (!cell || !Number.isSafeInteger(cell.listNode) || cell.listNode < 0 || ids.has(cell.listNode) || !Number.isSafeInteger(cell.row) || !Number.isSafeInteger(cell.rowSpan) || cell.row < 0 || cell.rowSpan < 1 || cell.row > table.rows - cell.rowSpan || !Number.isSafeInteger(cell.column) || !Number.isSafeInteger(cell.columnSpan) || cell.column < 0 || cell.columnSpan < 1 || cell.column > table.columns - cell.columnSpan || !Number.isSafeInteger(cell.width) || cell.width <= 0 || cell.width > 4294967295)
      return fail("InvalidSourceTableRowHorizontals");
    ids.add(cell.listNode);
    work += cell.rowSpan;
    if (work > maxCoveredCells)
      return fail("SourceTableRowHorizontalLimit");
    for (let row = cell.row;row < cell.row + cell.rowSpan; row++)
      rows[row].push(cell);
  }
  const boxes = new Map, rowWidths = [];
  for (const [row, cells] of rows.entries()) {
    cells.sort((a, b) => a.column - b.column);
    let column = 0, x = 0;
    for (const cell of cells) {
      if (cell.column !== column)
        return { ...fail("IncompleteSourceTableRowCoverage"), row, column };
      const end = x + cell.width;
      if (!Number.isSafeInteger(end))
        return fail("InvalidSourceTableRowHorizontals");
      const previous = boxes.get(cell.listNode);
      if (previous && (previous.x !== x || previous.width !== cell.width))
        return { ...fail("ConflictingSourceSpanningCellPosition"), row, listNode: cell.listNode };
      boxes.set(cell.listNode, { listNode: cell.listNode, x, width: cell.width });
      x = end;
      column += cell.columnSpan;
    }
    if (column !== table.columns)
      return { ...fail("IncompleteSourceTableRowCoverage"), row, column };
    rowWidths.push(x);
  }
  return {
    state: "resolved",
    cells: table.cells.map((cell) => boxes.get(cell.listNode)),
    rowWidths,
    width: Math.max(...rowWidths),
    evidence: { kind: "source-row-cell-boundaries" }
  };
}

// web/preview/table-column-width-plan.mjs
function tableColumnWidthPlan(table, request) {
  const fail = (error) => ({ state: "unavailable", error });
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const resizeHeight = request?.height !== undefined || request?.expectedHeight !== undefined;
  if (!request || ![
    request.section,
    request.tableNode,
    request.listNode,
    request.width,
    request.expectedWidth
  ].every(uint) || request.width === 0 || table?.section !== request.section || table?.tableNode !== request.tableNode)
    return fail("InvalidTableColumnWidthRequest");
  if (resizeHeight && ![request.height, request.expectedHeight].every(uint))
    return fail("InvalidTableColumnWidthRequest");
  const local = sourceTableRowHorizontals(table);
  if (local.state !== "resolved")
    return local;
  const common = sourceTableColumns(table);
  if (common.state !== "resolved")
    return common;
  const selected = table.cells.find((cell) => cell.listNode === request.listNode);
  if (!selected)
    return fail("InvalidCellDisplayOwner");
  if (selected.width !== request.expectedWidth)
    return fail("StaleTableColumnWidth");
  if (resizeHeight && selected.height !== request.expectedHeight)
    return fail("StaleTableCellHeight");
  const boundary = selected.column + selected.columnSpan, delta = request.width - selected.width;
  if (common.columns[boundary - 1] + delta <= 0)
    return fail("InvalidTableColumnWidthRequest");
  const cells = [];
  for (const cell of table.cells) {
    if (cell.column >= boundary || cell.column + cell.columnSpan < boundary)
      continue;
    const width = cell.width + delta;
    if (!uint(width) || width === 0 || !uint(cell.height))
      return fail("InvalidTableColumnWidthRequest");
    const height = resizeHeight && cell.listNode === selected.listNode ? request.height : cell.height;
    if (delta !== 0 || height !== cell.height)
      cells.push({ section: table.section, listNode: cell.listNode, width, height });
  }
  if (cells.length > 4096)
    return fail("LimitExceeded");
  if (!Number.isSafeInteger(common.width + delta) || common.width + delta > 4294967295)
    return fail("InvalidTableColumnWidthRequest");
  return { state: "planned", cells, boundary, delta };
}

// web/preview/hwpx-field-range-target.mjs
function hwpxFieldRangeTarget(editor, createdTablesPending, section, paragraph, start, end) {
  if (createdTablesPending && !editor.createdTableFieldLabelMode(section))
    return null;
  return editor.fieldRangeTarget(section, paragraph, start, end);
}

// web/preview/checkbox-content.mjs
function attachCheckBoxes(editor, content, available) {
  content.checkBoxStateAvailable = available;
  content.checkBoxes = [];
  if (!available)
    return;
  for (const section of new Set(content.paragraphs.map((p) => p.section))) {
    for (const site of editor.formSites(section)) {
      if (site.kind !== "check_button")
        continue;
      const row = {
        section,
        formNode: site.formNode,
        paragraph: site.paragraph === null ? null : site.paragraph - 1,
        anchorUnit: site.anchorUnit,
        siteState: site.state,
        caption: null,
        state: null,
        editable: false,
        triState: false,
        error: null
      };
      row.sourceLayout = null;
      row.layoutError = null;
      if (typeof editor.formSourceLayout === "function") {
        try {
          row.sourceLayout = editor.formSourceLayout(section, site.formNode);
        } catch (error) {
          row.layoutError = error.message;
        }
      } else
        row.layoutError = "HwpxFormLayoutAbiUnavailable";
      try {
        const source = editor.formSourceAttributes(section, site.formNode);
        row.caption = source.strings.caption ?? source.strings.name;
        row.foreColor = source.strings.foreColor ?? null;
        row.backColor = source.strings.backColor ?? null;
        row.backStyle = source.strings.backStyle ?? null;
        row.triState = source.booleans.triState === true;
        if (site.state === "located") {
          row.state = editor.checkBoxState(section, site.formNode);
          row.editable = source.booleans.enabled === true && source.booleans.editable === true;
        } else
          row.error = site.state;
      } catch (error) {
        row.error = error.message;
      }
      content.checkBoxes.push(row);
    }
  }
}

// web/preview/hwpx-content.mjs
var inlineText = {
  tab: "\t",
  fw_space: "　",
  nb_space: " ",
  line_break: "↵",
  hypen: "­",
  unknown: "￼"
};
var HWPX_DISPLAY_BOUNDS = Object.freeze({ maxUnits: 200000, maxParagraphs: 20000 });
function displayHwpxContent(result, {
  maxUnits = HWPX_DISPLAY_BOUNDS.maxUnits,
  maxParagraphs = HWPX_DISPLAY_BOUNDS.maxParagraphs,
  paragraphOffset = 0
} = {}) {
  if (!Number.isSafeInteger(maxUnits) || maxUnits < 0 || !Number.isSafeInteger(maxParagraphs) || maxParagraphs < 0 || !Number.isSafeInteger(paragraphOffset) || paragraphOffset < 0 || paragraphOffset > result.paragraphCount)
    throw new RangeError("InvalidDisplayBounds");
  const paragraphs = [], stack = [], seen = new Set;
  let units = 0, limited = false, textClipped = false;
  const append = (frame, text) => {
    if (!frame.visible) {
      if (text)
        limited = true;
      return;
    }
    if (textClipped) {
      if (text)
        frame.value.clipped = true;
      return;
    }
    const clipped = clipText(text, maxUnits - units);
    if (clipped.length !== text.length) {
      limited = true;
      textClipped = true;
      frame.value.clipped = true;
    }
    frame.value.text += clipped;
    units += clipped.length;
  };
  for (const event of result.events) {
    if (event.kind === "paragraph_start") {
      const key = `${event.section}:${event.paragraph}`;
      if (seen.has(key))
        throw new Error("InvalidHwpxParagraphEvents");
      seen.add(key);
      const value = {
        section: event.section,
        paragraph: event.paragraph - 1,
        editable: false,
        label: `구역 ${event.section + 1} · 문단 ${event.paragraph}${stack.length ? " · 중첩" : ""} · HWPX 읽기 전용`,
        text: ""
      };
      const visible = seen.size - 1 >= paragraphOffset && paragraphs.length < maxParagraphs;
      value.selectionOwner = stack.length === 0 ? `section:${event.section}:body` : null;
      if (visible)
        paragraphs.push(value);
      else
        limited = true;
      stack.push({ section: event.section, paragraph: event.paragraph, value, visible });
      continue;
    }
    const frame = stack.at(-1);
    if (!frame || frame.section !== event.section || frame.paragraph !== event.paragraph)
      throw new Error("InvalidHwpxParagraphEvents");
    if (event.kind === "paragraph_end")
      stack.pop();
    else if (event.kind === "content")
      append(frame, event.value);
    else if (event.kind === "inline_start" || event.kind === "inline_empty")
      append(frame, inlineText[event.inlineKind] ?? "");
  }
  if (stack.length || seen.size !== result.paragraphCount)
    throw new Error("InvalidHwpxParagraphEvents");
  return {
    format: "hwpx",
    version: null,
    readOnly: true,
    paragraphs,
    totalParagraphs: result.paragraphCount,
    limited
  };
}

// web/preview/dutmal-content.mjs
function attachDutmal(editor, content, available) {
  content.dutmalAvailable = available;
  content.dutmalErrors = [];
  for (const paragraph of content.paragraphs)
    paragraph.dutmal = [];
  if (!available)
    return content;
  let sources;
  try {
    sources = editor.inlineStringSources();
  } catch (error) {
    content.dutmalErrors.push({ error: error.message });
    return content;
  }
  const controls = new Map(sources.controls.filter((row) => row.kind === "dutmal").map((row) => [`${row.section_ordinal}:${row.element_index}`, row]));
  const paragraphs = new Map(content.paragraphs.map((row) => [`${row.section}:${row.paragraph}`, row]));
  let units = content.paragraphs.reduce((sum, row) => sum + row.text.length, 0);
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    try {
      for (const site of editor.dutmalSites(section)) {
        const paragraph = paragraphs.get(`${section}:${site.paragraph - 1}`);
        if (!paragraph || paragraph.clipped)
          continue;
        const source = controls.get(`${section}:${site.node}`);
        const projected = editor.dutmalDisplayText(section, site.node);
        if (projected.length > HWPX_DISPLAY_BOUNDS.maxUnits - units + paragraph.text.length)
          throw new Error("DutmalDisplayBudgetExceeded");
        if (source && projected[site.anchor_unit] === "￼") {
          units += projected.length - paragraph.text.length;
          paragraph.text = projected;
        }
        if (!source || projected[site.anchor_unit] !== "￼") {
          content.dutmalErrors.push({ section, node: site.node, error: "DutmalBindingMismatch" });
          continue;
        }
        try {
          paragraph.dutmal.push({
            node: site.node,
            unit: site.anchor_unit,
            mainText: editor.dutmalText(section, site.node, "mainText"),
            subText: editor.dutmalText(section, site.node, "subText"),
            sourceAttributes: { ...source.attributes }
          });
        } catch (error) {
          content.dutmalErrors.push({ section, node: site.node, error: error.message });
        }
      }
    } catch (error) {
      content.dutmalErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/equation-content.mjs
function attachEquations(editor, content, available) {
  content.equationAvailable = available;
  content.equationErrors = [];
  for (const paragraph of content.paragraphs)
    paragraph.equations = [];
  if (!available)
    return content;
  const paragraphs = new Map(content.paragraphs.map((row) => [`${row.section}:${row.paragraph}`, row]));
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    try {
      const sites = editor.equationSites(section);
      const counts = new Map;
      for (const row of sites)
        if (row.source.issue === null && row.error_name === null) {
          const key = `${row.paragraph}:${row.anchor_unit}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      for (const row of sites) {
        const node = row.source.node;
        const error = row.source.issue ?? row.error_name;
        if (error !== null) {
          content.equationErrors.push({ section, node, error });
          continue;
        }
        const paragraph = paragraphs.get(`${section}:${row.paragraph - 1}`);
        if (!paragraph || paragraph.clipped)
          continue;
        if (counts.get(`${row.paragraph}:${row.anchor_unit}`) !== 1 || paragraph.text[row.anchor_unit] !== "￼") {
          content.equationErrors.push({ section, node, error: "EquationBindingMismatch" });
          continue;
        }
        paragraph.equations.push({ node, unit: row.anchor_unit });
      }
    } catch (error) {
      content.equationErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/equation-font-measure.mjs
function equationFont(request, family) {
  if (typeof family !== "string" || !family.trim() || /[\x00-\x1f\x7f]/u.test(family))
    throw new Error("InvalidEquationFontFamily");
  if (!Number.isFinite(request?.size) || request.size <= 0 || request.size > 1e6 || typeof request?.style?.italic !== "boolean" || typeof request?.style?.bold !== "boolean")
    throw new Error("InvalidEquationFontRequest");
  const quoted = family.replaceAll("\\", "\\\\").replaceAll('"', "\\\"");
  return `${request.style.italic ? "italic" : "normal"} ${request.style.bold ? "bold" : "normal"} ${request.size}px "${quoted}"`;
}
function configureEquationText(ctx) {
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.direction = "ltr";
  ctx.letterSpacing = "0px";
  ctx.wordSpacing = "0px";
  ctx.fontKerning = "normal";
  ctx.fontStretch = "normal";
  ctx.fontVariantCaps = "normal";
}
function measureEquationRequests(ctx, requests, family, { maxRequests = 65536, maxBytes = 4 * 1024 * 1024, maxExtent = 1e6 } = {}) {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 0 || !Number.isSafeInteger(maxBytes) || maxBytes < 0 || !Number.isFinite(maxExtent) || maxExtent <= 0)
    throw new Error("InvalidEquationMeasurementLimit");
  if (!Array.isArray(requests) || requests.length > maxRequests)
    throw new Error("EquationMeasurementLimitExceeded");
  let bytes = 0;
  const encoder = new TextEncoder;
  const fonts = requests.map((request) => {
    if (typeof request?.text !== "string" || !request.text.isWellFormed())
      throw new Error("InvalidEquationMeasurementText");
    if (request.text.length > maxBytes - bytes)
      throw new Error("EquationMeasurementLimitExceeded");
    bytes += encoder.encode(request.text).length;
    if (bytes > maxBytes)
      throw new Error("EquationMeasurementLimitExceeded");
    return equationFont(request, family);
  });
  ctx.save();
  try {
    configureEquationText(ctx);
    return requests.map((request, index) => {
      ctx.font = fonts[index];
      const value = ctx.measureText(request.text);
      const raw = [value.width, value.actualBoundingBoxAscent, value.actualBoundingBoxDescent];
      if (raw.some((n) => !Number.isFinite(n)) || raw[0] < 0)
        throw new Error("InvalidEquationLayoutMetric");
      const box = { width: raw[0], ascent: Math.max(0, raw[1]), descent: Math.max(0, raw[2]) };
      if (Math.max(box.width, box.ascent + box.descent) > maxExtent)
        throw new Error("EquationLayoutLimitExceeded");
      return { request: index, box };
    });
  } finally {
    ctx.restore();
  }
}

// web/preview/hwp-units.mjs
var hwpUnitPixels = (value) => value * 96 / 7200;

// web/preview/equation-display-style.mjs
var EQUATION_PREVIEW_FAMILY = "Times New Roman";
function equationDisplayStyle(source = null) {
  if (source?.error_name)
    throw new Error(source.error_name);
  let size = 16;
  if (source?.base_unit !== null && source?.base_unit !== undefined) {
    if (!/^\d+$/.test(source.base_unit) || source.base_unit.length > 32)
      throw new Error("InvalidEquationBaseUnit");
    const units = Number(source.base_unit);
    if (!Number.isSafeInteger(units) || units <= 0 || units > 4294967295)
      throw new Error("InvalidEquationBaseUnit");
    size = hwpUnitPixels(units);
    if (size > 1e6)
      throw new Error("EquationMeasurementLimitExceeded");
  }
  const family = source?.font ?? EQUATION_PREVIEW_FAMILY;
  if (!family.trim())
    throw new Error("InvalidEquationFontFamily");
  const rawColor = source?.text_color;
  if (rawColor !== null && rawColor !== undefined && !/^#?[0-9a-fA-F]{6}$/.test(rawColor))
    throw new Error("InvalidEquationTextColor");
  const color = rawColor === null || rawColor === undefined ? null : `#${rawColor.replace(/^#/, "")}`;
  return {
    settings: { size, script_scale: 0.7, fraction_scale: 0.9 },
    family,
    color,
    sourceStyle: source
  };
}

// web/preview/equation-render-content.mjs
var options = {
  fraction: { padding: 0.1, gap: 0.1, rule_thickness: 0.05, axis: 0.25 },
  script: { gap: 0.05, superscript_shift: 0.5, subscript_shift: 0.3, clearance: 0.1 },
  normal_space: 0.25,
  thin_space: 0.1
};
var radical = { hook_width: 0.5, gap: 0.1, padding: 0.1, thickness: 0.05 };
var grid = { column_gap: 0.6, row_gap: 0.3, padding: 0.1, thickness: 0.05, axis: 0.25 };
var delimiters = { width: 0.4, gap: 0.15, thickness: 0.05 };
var decoration = { gap: 0.1, height: 0.25, thickness: 0.05 };
var integral = { width: 0.5, height: 1.8, gap: 0.1, thickness: 0.05 };
var limit = { gap: 0.1 };
var EQUATION_PREVIEW_MAX_PLANS = 4096;
var context;
function hostContext() {
  if (!context) {
    if (typeof OffscreenCanvas !== "function")
      throw new Error("EquationFontMeasurementUnavailable");
    context = new OffscreenCanvas(1, 1).getContext("2d");
    if (!context)
      throw new Error("EquationFontMeasurementUnavailable");
  }
  return context;
}
function attachEquationRendering(editor, content, available, getContext = hostContext, sourceStyles = false) {
  content.equationPaintAvailable = available;
  content.equationSourceStylesAvailable = sourceStyles;
  content.equationPaintErrors = [];
  content.equationPaintWarnings = [];
  for (const paragraph of content.paragraphs)
    paragraph.equationPaint = [];
  if (!available)
    return content;
  let count = 0, addresses = 0, bytes = 0, requests = 0;
  const encoder = new TextEncoder;
  const snapshots = new Map;
  const styles = new Map;
  const layouts = new Map;
  for (const paragraph of content.paragraphs)
    for (const anchor of paragraph.equations ?? []) {
      const { section } = paragraph, { node, unit } = anchor;
      try {
        if (++addresses > 65536)
          throw new Error("EquationPreviewLimitExceeded");
        if (!snapshots.has(section))
          snapshots.set(section, new Map(editor.equationScripts(section).rows.map((row) => [row.source.node, row])));
        if (sourceStyles && !styles.has(section))
          styles.set(section, new Map(editor.equationStyles(section).map((row) => [row.node, row])));
        const row = snapshots.get(section).get(node);
        if (!row || row.source.issue !== null || typeof row.value !== "string")
          throw new Error("EquationScriptUnavailable");
        const style = sourceStyles ? styles.get(section).get(node) : null;
        if (sourceStyles && !style)
          throw new Error("EquationStyleUnavailable");
        const { settings, family, color, sourceStyle } = equationDisplayStyle(style);
        bytes += encoder.encode(row.value).length;
        if (bytes > 1024 * 1024)
          throw new Error("EquationPreviewLimitExceeded");
        const key = JSON.stringify([row.value, settings, family]);
        let cached = layouts.get(key);
        if (!cached) {
          if (++count > EQUATION_PREVIEW_MAX_PLANS)
            throw new Error("EquationPreviewLimitExceeded");
          cached = { plan: editor.measureEquation(row.value, settings), settings };
          layouts.set(key, cached);
          if (!cached.plan.ready && cached.plan.open_group_recovery === true && cached.plan.blockers?.length && cached.plan.blockers.every((b) => b.kind === "unclosed_group")) {
            if (++count > EQUATION_PREVIEW_MAX_PLANS) {
              cached.error = "EquationPreviewLimitExceeded";
              throw new Error(cached.error);
            }
            cached.settings = { ...settings, allow_unclosed_groups: true };
            try {
              cached.plan = editor.measureEquation(row.value, cached.settings);
            } catch (error) {
              cached.error = error.message;
              throw error;
            }
          }
        }
        if (cached.error)
          throw new Error(cached.error);
        const plan = cached.plan;
        if (!plan.ready) {
          content.equationPaintErrors.push({
            section,
            node,
            error: "UnsupportedEquationLayout",
            blockers: plan.blockers
          });
          continue;
        }
        requests += plan.requests.length;
        if (requests > 65536)
          throw new Error("EquationPreviewLimitExceeded");
        if (!cached.layout) {
          const values = measureEquationRequests(getContext(), plan.requests, family);
          const layoutOptions = { ...options };
          if (plan.radical_layout === true)
            layoutOptions.radical = radical;
          if (plan.grid_layout === true)
            layoutOptions.grid = grid;
          if (plan.pile_layout === true)
            layoutOptions.grid = { ...grid, minimum_row_height: 1 };
          if (plan.matrix_delimiters === true)
            layoutOptions.delimiters = delimiters;
          if (plan.decoration_layout === true)
            layoutOptions.decoration = decoration;
          if (plan.integral_layout === true)
            layoutOptions.integral = integral;
          if (plan.limit_layout === true)
            layoutOptions.limit = limit;
          cached.layout = editor.layoutEquation(row.value, cached.settings, values, layoutOptions);
        }
        paragraph.equationPaint.push({
          node,
          unit,
          family,
          color,
          sourceStyle,
          plan,
          layout: cached.layout
        });
        if (plan.recovered_open_groups > 0)
          content.equationPaintWarnings.push({
            section,
            node,
            warning: "UnclosedEquationGroupAtEnd",
            recoveredOpenGroups: plan.recovered_open_groups,
            diagnostics: plan.recovery_diagnostics
          });
      } catch (error) {
        content.equationPaintErrors.push({ section, node, error: error.message });
      }
    }
  return content;
}

// web/preview/field-label-display-content.mjs
function projectFieldLabelDisplay(editor, paragraph, maxUnits) {
  if (!paragraph.fieldLabels?.length)
    return 0;
  try {
    const text = editor.fieldLabelDisplayText(paragraph.section, paragraph.paragraph + 1);
    if (typeof text !== "string" || text.length > maxUnits)
      throw new Error("FieldLabelDisplayBudgetExceeded");
    const delta = text.length - paragraph.text.length;
    paragraph.text = text;
    return delta;
  } catch (error) {
    paragraph.fieldReadOnlyReason = error.message;
    paragraph.fieldLabels = [];
    return 0;
  }
}

// web/preview/formula-result-text-command.mjs
var exportsRequired = [
  "hwpx_edit_splice_manual_formula_result",
  "hwpx_edit_manual_formula_result_max_bytes",
  "hwpx_edit_manual_formula_result_targets",
  "hwpx_edit_manual_formula_result_range_target",
  "hwpx_edit_manual_formula_result_display_text"
];
function formulaResultTextAvailable(editor, module) {
  const names = new Set(WebAssembly.Module.exports(module).filter((entry) => entry.kind === "function").map((entry) => entry.name));
  return [
    "spliceManualFormulaResult",
    "manualFormulaResultTargets",
    "manualFormulaResultRangeTarget",
    "manualFormulaResultDisplayText"
  ].every((name) => typeof editor?.[name] === "function") && exportsRequired.every((name) => names.has(name));
}
function projectFormulaResultText(editor, paragraph, available, maxUnits, snapshot) {
  paragraph.manualFormulaResults = [];
  if (!available || paragraph.clipped || paragraph.plainEditable)
    return 0;
  const targets = snapshot === undefined ? editor.manualFormulaResultTargets(paragraph.section, paragraph.paragraph + 1) : snapshot.targets;
  if (!Array.isArray(targets))
    throw new Error("InvalidFormulaResultTarget");
  if (!targets.length)
    return 0;
  const text = snapshot === undefined ? editor.manualFormulaResultDisplayText(paragraph.section, paragraph.paragraph + 1) : snapshot.text;
  if (typeof text !== "string" || targets.some((target) => !uint16(target.beginElement) || !uint16(target.start) || !uint16(target.end) || target.end < target.start || target.end > text.length))
    throw new Error("InvalidFormulaResultTarget");
  const before = paragraph.text.length;
  paragraph.text = clipText(text, maxUnits);
  if (paragraph.text !== text) {
    paragraph.clipped = true;
    paragraph.plainEditable = false;
    paragraph.anchorEditable = false;
    paragraph.fieldLabels = [];
  } else
    paragraph.manualFormulaResults = targets;
  return paragraph.text.length - before;
}
function spliceFormulaResultText(editor, module, message) {
  if (!formulaResultTextAvailable(editor, module))
    return false;
  const target = editor.manualFormulaResultRangeTarget(message.section, message.paragraph + 1, message.startUnit, message.endUnit);
  if (target === null)
    return false;
  if (!uint16(target.beginElement) || !uint16(target.start) || !uint16(target.end) || target.start > message.startUnit || target.end < message.endUnit || target.end < target.start)
    throw new Error("InvalidFormulaResultTarget");
  editor.spliceManualFormulaResult(message.section, target.beginElement, message.startUnit - target.start, message.endUnit - message.startUnit, message.text);
  return true;
}
function formulaResultTextRangeAllowed(editor, module, section, nativeParagraph, start, end) {
  return formulaResultTextAvailable(editor, module) && editor.manualFormulaResultRangeTarget(section, nativeParagraph, start, end) !== null;
}
function uint16(value) {
  return Number.isInteger(value) && value >= 0 && value <= 4294967295;
}

// web/preview/formula-result-paragraph-filter.mjs
function createFormulaResultParagraphFilter(editor, exportNames) {
  if (!exportNames.has("hwpx_edit_manual_formula_result_paragraphs") || typeof editor.manualFormulaResultParagraphs !== "function")
    return () => true;
  const sections = new Map;
  return (section, paragraph) => {
    if (!sections.has(section))
      sections.set(section, new Set(editor.manualFormulaResultParagraphs(section)));
    return sections.get(section).has(paragraph);
  };
}

// web/preview/formula-result-display-lookup.mjs
function createFormulaResultDisplayLookup(editor, exports) {
  const available = exports.has("hwpx_edit_manual_formula_result_display_snapshot") && typeof editor.manualFormulaResultDisplaySnapshot === "function";
  const sections = new Map;
  return {
    available,
    get(section, paragraph) {
      if (!available)
        throw new Error("HwpxFormulaResultSnapshotAbiUnavailable");
      if (!sections.has(section)) {
        let rows;
        try {
          rows = editor.manualFormulaResultDisplaySnapshot(section);
        } catch (error) {
          if (error.message !== "LimitExceeded")
            throw error;
          sections.set(section, null);
          return;
        }
        const current = new Map;
        for (const row of rows) {
          if (current.has(row.paragraph))
            throw new Error("InvalidFormulaResultDisplaySnapshot");
          current.set(row.paragraph, row);
        }
        sections.set(section, current);
      }
      return sections.get(section)?.get(paragraph) ?? (sections.get(section) === null ? undefined : null);
    }
  };
}

// web/preview/hwpx-page-area-declarations.mjs
function attachHwpxPageAreaDeclarations(editor, content, available) {
  if (!available)
    return content;
  content.pageAreaDeclarations = [];
  content.pageAreaDeclarationErrors = [];
  const sections = new Set((content.paragraphFlows ?? []).filter((row) => row.page_area).map((row) => row.section));
  for (const section of sections) {
    try {
      const rows = editor.pageAreaDeclarations(section);
      content.pageAreaDeclarations.push(...rows.map((row) => ({ ...row, section, paragraph: row.paragraph - 1 })));
    } catch (error) {
      content.pageAreaDeclarationErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/hwpx-ole-content.mjs
function attachHwpxOleSources(editor, content, available) {
  content.oleSourceAvailable = available === true;
  delete content.oles;
  delete content.oleSourceErrors;
  if (!content.oleSourceAvailable)
    return content;
  content.oles = [];
  content.oleSourceErrors = [];
  const owners = new Map, sections = new Set;
  for (const p of content.paragraphs) {
    const key = `${p.section}:${p.paragraph}`, group = owners.get(key) ?? [];
    group.push(p);
    owners.set(key, group);
    sections.add(p.section);
  }
  for (const section of sections) {
    let sites;
    try {
      sites = editor.oleSites(section);
    } catch (error) {
      if (["OutOfMemory", "LimitExceeded"].includes(error.message))
        throw error;
      content.oleSourceErrors.push({ section, error: error.message });
      continue;
    }
    for (const site of sites) {
      const paragraph = site.paragraph === null ? null : site.paragraph - 1;
      const matches = paragraph === null ? [] : owners.get(`${section}:${paragraph}`) ?? [];
      if (content.window && paragraph !== null && !matches.length)
        continue;
      const row = {
        section,
        oleNode: site.ole_node,
        paragraph,
        anchorUnit: site.anchor_unit,
        state: "unavailable",
        error: site.error_name,
        source: null,
        sourceError: null,
        paintable: false,
        chartWrapper: site.chart_wrapper ?? null,
        representation: site.chart_wrapper == null ? "standalone" : "unresolved-chart-alternative"
      };
      if (!row.error && (matches.length !== 1 || matches[0].clipped || typeof matches[0].text !== "string" || matches[0].text[site.anchor_unit] !== "￼"))
        row.error = "OleDisplayBindingMismatch";
      if (!row.error) {
        row.state = "located";
        if (row.chartWrapper !== null) {
          const targets = (content.chartTargets ?? []).filter((target) => target.section === section && target.wrapper === row.chartWrapper && target.paragraph === paragraph && target.anchorUnit === row.anchorUnit && target.error_name === null);
          if (targets.length === 1)
            row.representation = "chart-alternative";
        }
        try {
          row.source = editor.oleSource(section, site.ole_node);
        } catch (error) {
          if (["OutOfMemory", "LimitExceeded"].includes(error.message))
            throw error;
          row.sourceError = error.message;
        }
      }
      content.oles.push(row);
    }
  }
  return content;
}

// web/preview/dutmal-edit-command.mjs
function dutmalQueryIdentity(message) {
  if (message.kind === "inline-string-sources")
    return { requestId: message.requestId };
  if (!["dutmal-text-query", "dutmal-text"].includes(message.kind))
    return {};
  return {
    requestId: message.requestId,
    section: message.section,
    node: message.node,
    textKind: message.textKind
  };
}
function readDutmalText(editor, message) {
  return {
    section: message.section,
    node: message.node,
    textKind: message.textKind,
    value: editor.dutmalText(message.section, message.node, message.textKind)
  };
}
function writeDutmalText(editor, message) {
  editor.setDutmalText(message.section, message.node, message.textKind, message.value);
  return readDutmalText(editor, message);
}

// web/preview/equation-edit-command.mjs
function equationQueryIdentity(message) {
  if (!["equation-sources", "equation-script-query", "equation-script-set"].includes(message.kind))
    return {};
  return { requestId: message.requestId, section: message.section, node: message.node };
}
function readEquationScript(editor, message) {
  return {
    section: message.section,
    node: message.node,
    value: editor.equationScript(message.section, message.node),
    revision: editor.historyRevision()
  };
}
function writeEquationScript(editor, message) {
  if (!Number.isInteger(message.expectedRevision) || message.expectedRevision < 0 || message.expectedRevision > 4294967295 || typeof message.before !== "string")
    throw new Error("InvalidEquationScriptLease");
  if (editor.historyRevision() !== message.expectedRevision)
    throw new Error("EquationRevisionMismatch");
  if (editor.equationScript(message.section, message.node) !== message.before)
    throw new Error("EquationScriptMismatch");
  editor.setEquationScript(message.section, message.node, message.value);
}

// js/password-decoder.mjs
async function createPasswordDecoder(source, prefix, unavailable) {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  const api = {};
  for (const name of ["decrypt", "ptr", "len", "free"]) {
    api[name] = wasm[`${prefix}_${name}`];
    if (typeof api[name] !== "function")
      throw new Error(unavailable);
  }
  const memory = createMemory(wasm);
  let closed = false;
  return {
    decryptToPlaintext(data, password) {
      if (closed)
        throw new Error("DecoderClosed");
      const bytes = inputBytes(data);
      if (bytes.length > 64 * 1024 * 1024)
        throw new RangeError("LimitExceeded");
      if (typeof password === "string" && !password.isWellFormed())
        throw new TypeError("InvalidPasswordUnicode");
      const secret = typeof password === "string" ? new TextEncoder().encode(password) : inputBytes(password).slice();
      try {
        if (secret.length > 4096)
          throw new RangeError("LimitExceeded");
        return memory.withBytes(bytes, (ptr, size) => memory.withSecretBytes(secret, (passwordPtr, passwordSize) => {
          try {
            const status = api.decrypt(ptr, size, passwordPtr, passwordSize);
            if (status === 0)
              throw memory.error();
            if (status === 2)
              return null;
            if (status !== 1)
              throw new Error("InvalidPasswordResult");
            return memory.copy(api.ptr(), api.len());
          } finally {
            api.free();
          }
        }));
      } finally {
        secret.fill(0);
      }
    },
    close() {
      if (!closed)
        api.free();
      closed = true;
    }
  };
}

// js/hwpx-password.mjs
function createHwpxPasswordDecoder(source) {
  return createPasswordDecoder(source, "hwpx_password", "HwpxPasswordAbiUnavailable");
}

// js/hwp5-password.mjs
function createHwp5PasswordDecoder(source) {
  return createPasswordDecoder(source, "hwp5_password", "Hwp5PasswordAbiUnavailable");
}

// web/preview/password-policy.mjs
function requirePasswordRemovalConsent(protectionRemoved, consent) {
  if (protectionRemoved && consent !== true)
    throw new Error("PasswordProtectionRemovalNotAcknowledged");
}

// web/preview/hwpx-window-dependencies.mjs
function hwpxWindowDependencies(editor, projection) {
  displayHwpxContent(projection, { maxUnits: 0, maxParagraphs: 0 });
  const ordinals = new Map, parents = new Map, sections = new Set, stack = [], groups = [];
  for (const event of projection.events) {
    if (event.kind === "paragraph_start") {
      const ordinal = ordinals.size;
      ordinals.set(`${event.section}:${event.paragraph}`, ordinal);
      sections.add(event.section);
      if (stack.length) {
        parents.set(ordinal, stack.at(-1));
        groups.push([stack.at(-1), ordinal]);
      }
      stack.push(ordinal);
    } else if (event.kind === "paragraph_end")
      stack.pop();
  }
  const resolve = (section, paragraph) => {
    const ordinal = ordinals.get(`${section}:${paragraph}`);
    if (ordinal === undefined)
      throw new Error("WindowDependencyBindingMismatch");
    return ordinal;
  };
  for (const section of sections) {
    const tables = new Map;
    const tableGroup = (node) => {
      if (!tables.has(node))
        tables.set(node, new Set);
      return tables.get(node);
    };
    for (const row of editor.tableBindings(section))
      tableGroup(row.tableNode).add(resolve(section, row.paragraph));
    for (const row of editor.tablePlacements(section))
      tableGroup(row.tableNode).add(resolve(section, row.paragraph));
    for (const row of editor.tableCaptionBindings(section))
      tableGroup(row.owner.table_node).add(resolve(section, row.paragraph));
    for (const values of tables.values())
      groups.push([...values]);
    const drawings = new Map;
    for (const row of editor.drawingTextBindings(section)) {
      if (!drawings.has(row.drawingNode))
        drawings.set(row.drawingNode, new Set);
      const ordinal = resolve(section, row.paragraph);
      const host = parents.get(ordinal);
      if (host === undefined)
        throw new Error("MissingWindowDrawingHost");
      drawings.get(row.drawingNode).add(ordinal);
      drawings.get(row.drawingNode).add(host);
    }
    for (const values of drawings.values())
      groups.push([...values]);
  }
  return groups;
}

// web/preview/paragraph-window-plan.mjs
function planParagraphWindow({ total, offset, count, groups, maxParagraphs }) {
  for (const value of [total, offset, count, maxParagraphs]) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new RangeError("InvalidParagraphWindow");
  }
  if (offset > total || count > total - offset || !Array.isArray(groups))
    throw new RangeError("InvalidParagraphWindow");
  for (const group of groups) {
    if (!Array.isArray(group) || group.length === 0)
      throw new RangeError("InvalidParagraphDependencies");
    const seen = new Set;
    for (const ordinal of group) {
      if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= total || seen.has(ordinal))
        throw new RangeError("InvalidParagraphDependencies");
      seen.add(ordinal);
    }
  }
  let start = offset, end = offset + count;
  if (count > maxParagraphs)
    throw new RangeError("ParagraphWindowBudgetExceeded");
  if (count === 0)
    return { paragraphOffset: start, maxParagraphs: 0 };
  let changed;
  do {
    changed = false;
    for (const group of groups) {
      if (!group.some((ordinal) => ordinal >= start && ordinal < end))
        continue;
      for (const ordinal of group) {
        if (ordinal < start) {
          start = ordinal;
          changed = true;
        }
        if (ordinal >= end) {
          end = ordinal + 1;
          changed = true;
        }
      }
      if (end - start > maxParagraphs)
        throw new RangeError("ParagraphWindowBudgetExceeded");
    }
  } while (changed);
  return { paragraphOffset: start, maxParagraphs: end - start };
}

// web/preview/hwpx-window-projection.mjs
function projectHwpxWindow(editor, projection, {
  offset,
  count,
  maxParagraphs = HWPX_DISPLAY_BOUNDS.maxParagraphs,
  maxUnits = HWPX_DISPLAY_BOUNDS.maxUnits
}) {
  planParagraphWindow({
    total: projection.paragraphCount,
    offset,
    count,
    groups: [],
    maxParagraphs
  });
  if (!Number.isSafeInteger(maxUnits) || maxUnits < 0)
    throw new RangeError("InvalidDisplayBounds");
  const groups = hwpxWindowDependencies(editor, projection);
  const plan = planParagraphWindow({
    total: projection.paragraphCount,
    offset,
    count,
    groups,
    maxParagraphs
  });
  const content = displayHwpxContent(projection, { ...plan, maxUnits });
  if (content.paragraphs.some((row) => row.clipped))
    throw new RangeError("ParagraphWindowTextBudgetExceeded");
  return {
    ...content,
    limited: false,
    window: {
      requestedOffset: offset,
      requestedCount: count,
      paragraphOffset: plan.paragraphOffset,
      paragraphCount: plan.maxParagraphs
    }
  };
}

// web/preview/character-underline-content.mjs
function attachCharacterUnderlines(editor, content) {
  content.characterUnderlines = null;
  content.characterUnderlinesError = null;
  content.characterUnderlineStyles = null;
  content.characterUnderlineStylesError = null;
  if (content.characterUnderlineAvailable === true && editor) {
    try {
      content.characterUnderlines = editor.characterUnderlines();
    } catch (error) {
      content.characterUnderlinesError = error.message;
    }
  }
  if (content.characterUnderlineAvailable === true && typeof editor?.characterUnderlineStyles === "function") {
    try {
      content.characterUnderlineStyles = editor.characterUnderlineStyles();
    } catch (error) {
      content.characterUnderlineStylesError = error.message;
    }
  }
  return content;
}

// web/preview/character-text-color-content.mjs
function attachCharacterTextColors(editor, content) {
  content.characterTextColors = null;
  content.characterTextColorsError = null;
  if (typeof editor?.characterTextColors === "function") {
    try {
      content.characterTextColors = editor.characterTextColors();
    } catch (error) {
      content.characterTextColorsError = error.message;
    }
  }
  return content;
}

// web/preview/character-shade-content.mjs
function attachCharacterShades(editor, content) {
  content.characterShades = null;
  content.characterShadesError = null;
  if (typeof editor?.characterShades === "function") {
    try {
      content.characterShades = editor.characterShades();
    } catch (error) {
      content.characterShadesError = error.message;
    }
  }
  return content;
}

// web/preview/character-effect-content.mjs
function attachCharacterEffects(editor, content) {
  content.characterEffects = null;
  content.characterEffectsError = null;
  if (typeof editor?.characterEffects === "function") {
    try {
      content.characterEffects = editor.characterEffects();
    } catch (error) {
      content.characterEffectsError = error?.message ?? "CharacterEffectsUnavailable";
    }
  }
  return content;
}

// web/preview/character-outline-content.mjs
function attachCharacterOutlines(editor, content) {
  content.characterOutlines = null;
  content.characterOutlinesError = null;
  if (typeof editor?.characterOutlines === "function") {
    try {
      content.characterOutlines = editor.characterOutlines();
    } catch (error) {
      content.characterOutlinesError = error?.message ?? "CharacterOutlinesUnavailable";
    }
  }
  return content;
}

// web/preview/character-font-content.mjs
function attachCharacterFonts(editor, content) {
  for (const key of [
    "fontFaces",
    "fontFaceMetadata",
    "characterFontReferences",
    "characterFontMetrics"
  ]) {
    content[key] = null;
    content[`${key}Error`] = null;
    if (typeof editor?.[key] !== "function")
      continue;
    try {
      content[key] = editor[key]();
    } catch (error) {
      content[`${key}Error`] = error.message;
    }
  }
  return content;
}

// web/preview/character-strike-content.mjs
function attachCharacterStrikes(editor, content) {
  content.characterStrikes = null;
  content.characterStrikesError = null;
  content.characterStrikeStyles = null;
  content.characterStrikeStylesError = null;
  if (content.characterStrikeAvailable === true && editor) {
    try {
      content.characterStrikes = editor.characterStrikes();
    } catch (error) {
      content.characterStrikesError = error.message;
    }
  }
  if (content.characterStrikeAvailable === true && typeof editor?.characterStrikeStyles === "function") {
    try {
      content.characterStrikeStyles = editor.characterStrikeStyles();
    } catch (error) {
      content.characterStrikeStylesError = error.message;
    }
  }
  return content;
}

// web/preview/tab-source-content.mjs
function attachTabSources(editor, content) {
  for (const paragraph of content.paragraphs) {
    paragraph.tabSources = null;
    delete paragraph.tabSourcesError;
    if (!paragraph.text.includes("\t") || paragraph.clipped)
      continue;
    try {
      if (typeof editor.tabSources !== "function")
        throw new Error("HwpxTabSourcesAbiUnavailable");
      const result = validateTabSources(editor.tabSources(paragraph.section, paragraph.paragraph + 1));
      if (result.section !== paragraph.section || result.paragraph !== paragraph.paragraph + 1)
        throw new Error("TabSourcesParagraphMismatch");
      const positions = [];
      for (let i = 0;i < paragraph.text.length; i++)
        if (paragraph.text[i] === "\t")
          positions.push(i);
      if (positions.length !== result.rows.length || result.rows.some((row, i) => row.unit !== positions[i]))
        throw new Error("TabSourcesDisplayMismatch");
      paragraph.tabSources = result.rows.map((row) => ({ ...row }));
    } catch (error) {
      paragraph.tabSourcesError = error.message;
    }
  }
  return content;
}

// web/preview/hwpx-style-content.mjs
function attachHwpxStyles(editor, content, available) {
  content.characterShapes = null;
  content.characterShapesError = null;
  if (available) {
    try {
      content.characterShapes = editor.characterShapes();
    } catch (error) {
      content.characterShapesError = error.message;
    }
  }
  for (const paragraph of content.paragraphs) {
    paragraph.characterRanges = null;
    paragraph.selectable = paragraph.editable === true;
    delete paragraph.characterRangesError;
    if (!available || paragraph.clipped)
      continue;
    try {
      const ranges = editor.characterRanges(paragraph.section, paragraph.paragraph + 1);
      if ((ranges.at(-1)?.end ?? 0) !== paragraph.text.length)
        throw new Error("CharacterDisplayLengthMismatch");
      paragraph.characterRanges = ranges;
      paragraph.selectable = paragraph.text.length > 0 || paragraph.editable === true;
    } catch (error) {
      paragraph.characterRangesError = error.message;
    }
  }
  return attachTabSources(editor, attachCharacterOutlines(editor, attachCharacterEffects(editor, attachCharacterShades(editor, attachCharacterStrikes(editor, attachCharacterFonts(editor, attachCharacterTextColors(editor, attachCharacterUnderlines(editor, content))))))));
}

// web/preview/tab-definition-content.mjs
function attachTabDefinitions(editor, content) {
  content.tabDefinitions = null;
  delete content.tabDefinitionsError;
  const selected = [];
  for (const paragraph of content.paragraphs) {
    paragraph.tabDefinition = null;
    delete paragraph.tabDefinitionError;
    if (paragraph.text.includes("\t") && !paragraph.clipped)
      selected.push(paragraph);
  }
  if (!selected.length)
    return content;
  try {
    if (typeof editor.tabDefinitions !== "function")
      throw new Error("HwpxTabDefinitionsAbiUnavailable");
    const rows = validateTabDefinitions(editor.tabDefinitions());
    content.tabDefinitions = rows;
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const paragraph of selected) {
      const id = paragraph.tabDefinitionId;
      if (!Number.isInteger(id) || id < 0 || id > 4294967295 || !byId.has(id)) {
        paragraph.tabDefinitionError = "TabDefinitionReferenceUnavailable";
        continue;
      }
      paragraph.tabDefinition = byId.get(id);
    }
  } catch (error) {
    content.tabDefinitionsError = error.message;
    for (const paragraph of selected)
      paragraph.tabDefinitionError = error.message;
  }
  return content;
}

// js/xml-integer-text.mjs
function integer(raw, minimum, maximum) {
  if (typeof raw !== "string" || raw.length > 4096 || !/^[ \t\r\n]*[+-]?\d+[ \t\r\n]*$/.test(raw))
    return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value === 0 ? 0 : value : null;
}
var xmlSigned32 = (raw) => integer(raw, -2147483648, 2147483647);

// web/preview/section-tab-interval.mjs
function resolveSectionTabInterval(rows, section) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (!Number.isInteger(section) || section < 0 || section > 4294967295)
    return unavailable("InvalidTabSection");
  try {
    validateSectionTabs(rows);
  } catch {
    return unavailable("InvalidSectionTabSources");
  }
  const declarations = rows.filter((row) => row.section === section && Number.isInteger(row.body_owner));
  if (declarations.length !== 1)
    return unavailable(declarations.length ? "AmbiguousSectionTabDefinition" : "MissingSectionTabOwner");
  const row = declarations[0], legacy = row.tab_stop === null ? null : xmlSigned32(row.tab_stop);
  if (row.tab_stop !== null && legacy === null)
    return unavailable("InvalidSectionTabInterval");
  if (row.tab_stop_val !== null || row.tab_stop_unit !== null) {
    if (row.tab_stop_val === null || row.tab_stop_unit === null)
      return unavailable("IncompleteSectionTabInterval");
    const value = xmlSigned32(row.tab_stop_val);
    if (value === null || value <= 0)
      return unavailable("InvalidSectionTabInterval");
    const unit = row.tab_stop_unit.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
    if (unit !== "HWPUNIT")
      return unavailable("UnsupportedSectionTabUnit");
    return {
      state: "resolved",
      section,
      node: row.node,
      bodyOwner: row.body_owner,
      pixels: hwpUnitPixels(value),
      basis: "tabStopVal",
      legacyMismatch: legacy !== null && legacy / 2 !== value
    };
  }
  if (legacy === null)
    return unavailable("MissingSectionTabInterval");
  if (legacy <= 0)
    return unavailable("InvalidSectionTabInterval");
  return {
    state: "resolved",
    section,
    node: row.node,
    bodyOwner: row.body_owner,
    pixels: hwpUnitPixels(legacy) / 2,
    basis: "tabStop",
    legacyMismatch: false
  };
}

// web/preview/section-tab-content.mjs
function attachSectionTabSources(editor, content) {
  content.sectionTabSources = null;
  delete content.sectionTabSourcesError;
  const selected = [];
  for (const paragraph of content.paragraphs) {
    paragraph.sectionTabSources = null;
    paragraph.sectionTabInterval = null;
    if (paragraph.text.includes("\t") && !paragraph.clipped)
      selected.push(paragraph);
  }
  if (!selected.length)
    return content;
  try {
    if (typeof editor.sectionTabSources !== "function")
      throw new Error("HwpxSectionTabsAbiUnavailable");
    const rows = validateSectionTabs(editor.sectionTabSources());
    content.sectionTabSources = rows;
    const intervals = new Map;
    for (const paragraph of selected) {
      paragraph.sectionTabSources = rows.filter((row) => row.section === paragraph.section);
      if (!intervals.has(paragraph.section))
        intervals.set(paragraph.section, resolveSectionTabInterval(rows, paragraph.section));
      paragraph.sectionTabInterval = intervals.get(paragraph.section);
    }
  } catch (error) {
    content.sectionTabSourcesError = error.message;
  }
  return content;
}

// web/preview/hwp5-style-content.mjs
function projectHwp5Ranges(ranges, source, text) {
  const rawUnits = source.tokens.reduce((sum, token) => sum + token.raw.length / 2, 0);
  if ((ranges.at(-1)?.end ?? 0) !== rawUnits)
    throw new Error("CharacterDisplayLengthMismatch");
  const retained = retainedTextView(source);
  if (!retained && source.tokens.some((t) => t.type === "control" && t.code !== 13))
    throw new Error("UnsupportedCharacterDisplayControls");
  const fullText = retained?.text ?? source.text;
  if (text !== fullText)
    throw new Error("CharacterDisplayLengthMismatch");
  const offsets = retained?.offsets ?? [{ at: 0, source: 0 }];
  const map = (unit) => {
    const boundary = offsets.findLast((row) => row.source <= unit);
    if (!boundary)
      throw new Error("InvalidCharacterDisplayPosition");
    return Math.min(text.length, boundary.at + unit - boundary.source);
  };
  const output = [];
  let cursor = 0;
  let rawCursor = 0;
  for (const range of ranges) {
    if (range.start !== rawCursor || range.end < range.start)
      throw new Error("CharacterDisplayLengthMismatch");
    rawCursor = range.end;
    const start = map(range.start), end = map(range.end);
    if (start !== cursor || end < start)
      throw new Error("CharacterDisplayLengthMismatch");
    cursor = end;
    if (end === start) {
      if (start === text.length)
        output.push({ start, end, charShapeId: range.charShapeId });
      continue;
    }
    const previous = output.at(-1);
    if (previous?.charShapeId === range.charShapeId)
      previous.end = end;
    else
      output.push({ start, end, charShapeId: range.charShapeId });
  }
  if (cursor !== text.length)
    throw new Error("CharacterDisplayLengthMismatch");
  return output;
}
function attachHwp5Styles(editor, preview, content, openError = null) {
  content.characterShapes = null;
  content.characterShapesError = openError;
  if (editor) {
    try {
      content.characterShapes = editor.characterShapes();
      content.characterShapesError = null;
    } catch (error) {
      content.characterShapesError = error.message;
    }
  }
  for (const paragraph of content.paragraphs) {
    paragraph.characterRanges = null;
    if (!editor)
      continue;
    try {
      const source = preview.sections[paragraph.section].paragraphs[paragraph.paragraph];
      paragraph.characterRanges = projectHwp5Ranges(editor.characterRanges(paragraph.section, paragraph.paragraph), source, paragraph.text);
    } catch (error) {
      paragraph.characterRangesError = error.message;
    }
  }
  return attachCharacterOutlines(editor, attachCharacterEffects(editor, attachCharacterShades(editor, attachCharacterStrikes(editor, attachCharacterFonts(editor, attachCharacterTextColors(editor, attachCharacterUnderlines(editor, content)))))));
}

// js/hwp5-text-source-protection.mjs
function validateHwp5TextSourceProtection(value, count) {
  const fail = () => {
    throw new Error("InvalidHwp5TextSourceProtection");
  };
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!uint(count) || !value || !Array.isArray(value.protected_paragraphs) || value.protected_paragraphs.length !== count)
    fail();
  let any = false;
  for (const bit of value.protected_paragraphs) {
    if (typeof bit !== "boolean")
      fail();
    any ||= bit;
  }
  if (value.mode === "strict") {
    if (value.retained_headers !== null || any)
      fail();
  } else if (value.mode === "retained_click" || value.mode === "retained_memo" || value.mode === "retained_company") {
    if (!uint(value.retained_headers) || value.retained_headers === 0 || !any)
      fail();
  } else
    fail();
  return {
    mode: value.mode,
    protected_paragraphs: value.protected_paragraphs,
    retained_headers: value.retained_headers
  };
}
function decodeHwp5TextSourceProtection(bytes, count) {
  return validateHwp5TextSourceProtection(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), count);
}

// web/preview/hwp5-retained-click-policy.mjs
function retainedClickProtection(editor, section, failure) {
  if (!["UnsupportedCrossParagraphField", "UnsupportedSectionControl"].includes(failure) || editor.supportsTextSourceProtection?.() !== true)
    return null;
  const value = validateHwp5TextSourceProtection(editor.textSourceProtection(section), editor.paragraphCount(section));
  const expected = failure === "UnsupportedSectionControl" ? "retained_memo" : "retained_click";
  if (value.mode !== expected && !(failure === "UnsupportedSectionControl" && value.mode === "retained_company"))
    throw new Error("InvalidHwp5TextSourceProtection");
  return value;
}
function restoreRetainedWindowCandidate(paragraph) {
  if (paragraph.fieldTopologyEditableCandidate === true && paragraph.windowContext !== true && paragraph.clipped !== true)
    paragraph.editable = true;
  delete paragraph.fieldTopologyEditableCandidate;
  if (paragraph.fieldTopologyError === "UnresolvedFieldMarkers")
    delete paragraph.fieldTopologyError;
}

// web/preview/hwp5-text-source-policy.mjs
function attachHwp5TextSourcePolicy(editor, content) {
  content.textSourcePolicyAvailable = editor?.supportsTextSourcePolicy?.() === true;
  if (!content.textSourcePolicyAvailable)
    return content;
  const sections = new Map;
  for (const paragraph of content.paragraphs) {
    if (!sections.has(paragraph.section)) {
      let error = null, protection = null;
      try {
        editor.validateTextSourcePolicy(paragraph.section);
      } catch (failure) {
        error = failure instanceof Error ? failure.message : "TextSourcePolicyQueryFailed";
      }
      if (error !== null) {
        try {
          protection = retainedClickProtection(editor, paragraph.section, error);
          if (protection) {
            error = null;
            if (protection.mode === "retained_memo")
              content.retainedMemoProtection = true;
            else if (protection.mode === "retained_company")
              content.retainedCompanyProtection = true;
            else
              content.retainedClickFieldProtection = true;
          }
        } catch (failure) {
          error = failure instanceof Error ? failure.message : "TextSourceProtectionQueryFailed";
        }
      }
      sections.set(paragraph.section, { error, protection });
    }
    const state = sections.get(paragraph.section);
    if (state.protection && (!Number.isInteger(paragraph.paragraph) || paragraph.paragraph < 0 || paragraph.paragraph >= state.protection.protected_paragraphs.length)) {
      paragraph.textSourcePolicyError = "InvalidHwp5TextSourceProtection";
      paragraph.editable = false;
      paragraph.characterPropertiesAvailable = false;
      continue;
    }
    const protectedRow = state.protection?.protected_paragraphs[paragraph.paragraph];
    const error = state.error ?? (protectedRow === true ? state.protection?.mode === "retained_memo" ? "OutsideEditableMemo" : state.protection?.mode === "retained_company" ? "ProtectedRetainedCompanyParagraph" : "UnsupportedCrossParagraphField" : null);
    if (state.protection && protectedRow === false)
      restoreRetainedWindowCandidate(paragraph);
    paragraph.textSourcePolicyError = error;
    if (state.protection?.mode === "retained_company" || state.error !== null) {
      paragraph.characterPropertiesAvailable = content.characterPropertiesAvailable === true && error === null && paragraph.editable === true;
    }
    if (error !== null) {
      paragraph.selectable = paragraph.clipped !== true && (paragraph.selectable === true || paragraph.editable === true);
      paragraph.editable = false;
    }
  }
  if (content.retainedCompanyProtection === true || [...sections.values()].every((state) => state.error !== null)) {
    content.characterPropertiesAvailable = content.characterPropertiesAvailable === true && content.paragraphs.some((paragraph) => paragraph.characterPropertiesAvailable === true || paragraph.characterPropertiesAvailable === undefined && paragraph.editable === true);
    content.characterPropertiesRangesAvailable = content.characterPropertiesRangesAvailable === true && content.characterPropertiesAvailable;
  }
  content.readOnly = !content.paragraphs.some((paragraph) => paragraph.editable === true);
  return content;
}

// web/preview/table-content.mjs
function attachTables(editor, preview, content) {
  content.tables = [];
  content.tableBindingsErrors = [];
  for (const paragraph of content.paragraphs)
    delete paragraph.tableCell;
  if (!editor)
    return content;
  const displayed = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p]));
  for (const section of preview.sections) {
    let bindings;
    try {
      bindings = editor.tableBindings(section.index);
    } catch (error) {
      content.tableBindingsErrors.push({ section: section.index, error: error.message });
      continue;
    }
    const tables = new Map, cellsByList = new Map;
    const selectedTables = content.window ? new Set(bindings.filter((binding) => displayed.has(`${section.index}:${binding.paragraph}`)).map((binding) => binding.tableNode)) : null;
    for (const binding of bindings) {
      if (selectedTables && !selectedTables.has(binding.tableNode))
        continue;
      let table = tables.get(binding.tableNode);
      if (!table) {
        table = {
          section: section.index,
          tableNode: binding.tableNode,
          rows: binding.rows,
          columns: binding.columns,
          cells: [],
          partial: false
        };
        tables.set(binding.tableNode, table);
      }
      const cellKey = `${binding.tableNode}:${binding.listNode}`;
      let cell = cellsByList.get(cellKey);
      if (!cell) {
        cell = {
          listNode: binding.listNode,
          row: binding.row,
          column: binding.column,
          rowSpan: binding.rowSpan,
          columnSpan: binding.columnSpan,
          width: binding.width,
          height: binding.height,
          paragraphs: []
        };
        cellsByList.set(cellKey, cell);
        table.cells.push(cell);
      }
      const paragraph = displayed.get(`${section.index}:${binding.paragraph}`);
      if (!paragraph) {
        table.partial = true;
        continue;
      }
      if (paragraph.clipped)
        table.partial = true;
      cell.paragraphs.push(binding.paragraph);
      paragraph.tableCell = {
        tableNode: binding.tableNode,
        listNode: binding.listNode,
        row: binding.row,
        column: binding.column,
        rowSpan: binding.rowSpan,
        columnSpan: binding.columnSpan
      };
    }
    content.tables.push(...tables.values());
  }
  return content;
}

// web/preview/table-placements-content.mjs
function attachTablePlacements(editor, sections, content, paragraphOffset = 0) {
  content.tablePlacementsErrors = [];
  for (const section of sections) {
    let placements;
    try {
      placements = editor.tablePlacements(section.index);
    } catch (error) {
      content.tablePlacementsErrors.push({ section: section.index, error: error.message });
      continue;
    }
    const tables = new Map(content.tables.filter((t) => t.section === section.index).map((t) => [t.tableNode, t]));
    for (const placement of placements) {
      const table = tables.get(placement.tableNode);
      if (!table)
        continue;
      table.hostParagraph = placement.paragraph + paragraphOffset;
      if (Object.hasOwn(placement, "anchorUnit"))
        table.anchorUnit = placement.anchorUnit;
      table.parentTableNode = placement.parentTableNode;
      table.parentListNode = placement.parentListNode;
    }
  }
  return content;
}

// web/preview/hwp5-table-layout-content.mjs
function attachHwp5TableLayoutSources(editor, content) {
  content.tableLayoutSourceErrors = [];
  for (const table of content.tables)
    delete table.layoutSource;
  if (!editor)
    return content;
  const sections = new Set(content.tables.map((table) => table.section));
  for (const section of sections) {
    try {
      const sources = editor.tableLayoutSources(section), byNode = new Map;
      for (const source of sources) {
        if (byNode.has(source.table_record_node))
          throw new Error("AmbiguousTableLayoutSource");
        byNode.set(source.table_record_node, source);
      }
      const tables = content.tables.filter((table) => table.section === section), attachments = [];
      if (sources.length !== tables.length)
        throw new Error("IncompleteTableLayoutInventory");
      for (const table of tables) {
        const source = byNode.get(table.tableNode);
        if (!source || source.rows !== table.rows || source.columns !== table.columns)
          throw new Error("TableLayoutSourceBindingMismatch");
        if (!Number.isInteger(table.hostParagraph) || table.hostParagraph < 0 || !content.paragraphs.some((row) => row.section === section && row.paragraph === table.hostParagraph))
          throw new Error("MissingTableLayoutHost");
        attachments.push({ table, source });
      }
      for (const { table, source } of attachments)
        table.layoutSource = source;
    } catch (error) {
      content.tableLayoutSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/hwp5-cell-layout-content.mjs
function attachHwp5CellLayoutSources(editor, content) {
  content.cellLayoutSourceErrors = [];
  for (const table of content.tables)
    for (const cell of table.cells) {
      delete cell.layoutSource;
      delete cell.sourceMargin;
      delete cell.sourceVerticalAlignment;
      delete cell.sourceLineWrap;
      delete cell.sourceTextDirection;
    }
  if (!editor)
    return content;
  for (const section of new Set(content.tables.map((table) => table.section))) {
    try {
      const sources = editor.cellLayoutSources(section), byList = new Map;
      for (const row of sources) {
        if (byList.has(row.list_node))
          throw new Error("AmbiguousCellLayoutSource");
        byList.set(row.list_node, row);
      }
      const selected = content.tables.filter((table) => table.section === section), attachments = [], seen = new Set;
      for (const table of selected)
        for (const cell of table.cells) {
          const row = byList.get(cell.listNode);
          if (!row || row.table_record_node !== table.tableNode || seen.has(cell.listNode))
            throw new Error("CellLayoutSourceBindingMismatch");
          seen.add(cell.listNode);
          attachments.push({ cell, row });
        }
      if (seen.size !== sources.length)
        throw new Error("IncompleteCellLayoutInventory");
      for (const { cell, row } of attachments) {
        cell.layoutSource = row;
        cell.sourceMargin = {
          has_margin: row.has_margin,
          margin: [...row.margins],
          header: row.header
        };
        cell.sourceVerticalAlignment = row.vertical_alignment;
        cell.sourceLineWrap = row.line_wrap;
        cell.sourceTextDirection = row.text_direction;
      }
    } catch (error) {
      content.cellLayoutSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/hwp5-table-anchor-content.mjs
function attachHwp5TableAnchors(editor, content) {
  content.tableAnchorErrors = [];
  for (const table of content.tables) {
    delete table.anchorUnit;
    delete table.anchorSource;
  }
  if (!editor)
    return content;
  const paragraphs = new Map(content.paragraphs.map((row) => [`${row.section}:${row.paragraph}`, row]));
  for (const section of new Set(content.tables.map((row) => row.section))) {
    try {
      const anchors = editor.tableAnchors(section), tables = content.tables.filter((row) => row.section === section), byNode = new Map;
      for (const row of anchors) {
        if (byNode.has(row.table_record_node))
          throw new Error("AmbiguousTableDisplayAnchor");
        byNode.set(row.table_record_node, row);
      }
      if (anchors.length !== tables.length)
        throw new Error("IncompleteTableDisplayAnchors");
      const prepared = [];
      for (const table of tables) {
        const row = byNode.get(table.tableNode), paragraph = paragraphs.get(`${section}:${table.hostParagraph}`);
        if (!row || row.paragraph !== table.hostParagraph || row.control_node !== table.layoutSource?.table_node || !paragraph || paragraph.clipped)
          throw new Error("TableDisplayAnchorBindingMismatch");
        const unit = sourceDisplayPosition(row.current_unit, paragraph.sourceOffsets, paragraph.text.length);
        const end = sourceDisplayPosition(row.current_unit + 8, paragraph.sourceOffsets, paragraph.text.length);
        if (end !== unit + 1 || paragraph.text[unit] !== "￼")
          throw new Error("TableDisplayAnchorMismatch");
        prepared.push({ table, row, unit });
      }
      for (const { table, row, unit } of prepared) {
        table.anchorUnit = unit;
        table.anchorSource = row;
      }
    } catch (error) {
      content.tableAnchorErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// js/hwp5-table-layout-sources.mjs
function decodeHwp5TableLayoutSources(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  return validateHwp5TableLayoutSources(rows);
}
function validateHwp5TableLayoutSources(rows) {
  const uint = (value, max = 4294967295) => Number.isInteger(value) && value >= 0 && value <= max;
  const signed = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5TableLayoutSources");
  for (const row of rows) {
    if (row && Object.hasOwn(row, "object_extra_u16") && row.object_extra_u16 !== null && (!uint(row.object_extra_u16, 65535) || row.object_extra_bytes !== 2))
      throw new Error("InvalidHwp5TableLayoutSources");
    if (!row || ![
      "table_node",
      "table_record_node",
      "object_flags",
      "width",
      "height",
      "instance_id",
      "object_extra_bytes",
      "table_flags",
      "table_extra_bytes"
    ].every((key) => uint(row[key])) || !["offset_y", "offset_x", "z_order", "prevent_page_break"].every((key) => signed(row[key], -2147483648, 2147483647)) || !["rows", "columns", "border_fill_id"].every((key) => uint(row[key], 65535)) || !signed(row.cell_spacing, -32768, 32767) || !["outer_margins", "inner_margins"].every((key) => Array.isArray(row[key]) && row[key].length === 4 && row[key].every((value) => signed(value, -32768, 32767))) || !["description_bytes", "zone_count"].every((key) => row[key] === null || uint(row[key])) || row.description_bytes !== null && row.description_bytes % 2 !== 0)
      throw new Error("InvalidHwp5TableLayoutSources");
  }
  return rows;
}

// web/preview/hwp5-object-flags.mjs
function hwp5UnsupportedObjectFlags(flags, { allowObservedLock = false } = {}) {
  if (!Number.isInteger(flags) || flags < 0 || flags > 4294967295)
    return null;
  const mask = allowObservedLock === true ? 2147483650 : 3221225474;
  return (flags & mask) >>> 0;
}
function hwp5ObjectFlags(flags, options) {
  if (hwp5UnsupportedObjectFlags(flags, options) !== 0)
    throw new Error("UnsupportedHwp5ObjectFlags");
  const vertical_relative = flags >>> 3 & 3, vertical_alignment = flags >>> 5 & 7;
  const horizontal_relative = flags >>> 8 & 3, horizontal_alignment = flags >>> 10 & 7;
  const width_relative = flags >>> 15 & 7, height_relative = flags >>> 18 & 3, text_wrap = flags >>> 21 & 7;
  if (vertical_relative > 2 || vertical_alignment > 4 || horizontal_alignment > 4 || width_relative > 4 || height_relative > 2 || text_wrap > 3)
    throw new Error("UnsupportedHwp5ObjectEnum");
  const flow_with_text = Boolean(flags & 1 << 13);
  return {
    vertical_relative,
    vertical_alignment,
    horizontal_relative,
    horizontal_alignment,
    width_relative,
    height_relative,
    size_protected: vertical_relative === 2 && Boolean(flags & 1 << 20),
    treat_as_character: Boolean(flags & 1),
    text_wrap,
    text_flow: flags >>> 24 & 3,
    has_caption: Boolean(flags & 1 << 29),
    affect_line_spacing: Boolean(flags & 4),
    flow_with_text,
    allow_overlap: flow_with_text ? false : Boolean(flags & 1 << 14),
    hold_anchor: null,
    ...options?.allowObservedLock === true ? { locked: Boolean(flags & 1073741824) } : {}
  };
}

// web/preview/hwp5-table-flags.mjs
function hwp5TableFlags(flags) {
  if (!Number.isInteger(flags) || flags < 0 || flags > 4294967295)
    throw new Error("InvalidHwp5TableFlags");
  return {
    page_break: ["none", "table", "cell", null][flags & 3],
    repeat_header: Boolean(flags & 4),
    no_adjust: Boolean(flags & 8),
    inner_margin_setup: Boolean(flags & 67108864),
    unknown_flags: (flags & ~67108879) >>> 0
  };
}

// web/preview/hwp5-table-object-tail.mjs
function hasObservedZeroTableObjectTail(source) {
  return source?.object_extra_bytes === 2 && Object.hasOwn(source, "object_extra_u16") && source.object_extra_u16 === 0;
}

// web/preview/hwp5-table-geometry.mjs
function hwp5TableUnsupportedObjectFlags(flags) {
  return hwp5UnsupportedObjectFlags(flags, { allowObservedLock: true });
}
function hwp5TableGeometry(source, { allowOpaqueTableFlags = false, allowObservedZeroObjectTail = false } = {}) {
  if (typeof allowOpaqueTableFlags !== "boolean" || typeof allowObservedZeroObjectTail !== "boolean")
    throw new Error("InvalidOpaqueTablePolicy");
  validateHwp5TableLayoutSources([source]);
  const flags = source.object_flags, table = hwp5TableFlags(source.table_flags);
  if (hwp5TableUnsupportedObjectFlags(flags) !== 0 || !allowOpaqueTableFlags && table.unknown_flags !== 0 || source.object_extra_bytes !== 0 && !(allowObservedZeroObjectTail && hasObservedZeroTableObjectTail(source)) || source.table_extra_bytes !== 0)
    throw new Error("UnsupportedHwp5TableExtension");
  let decoded;
  try {
    decoded = hwp5ObjectFlags(flags, { allowObservedLock: true });
  } catch {
    throw new Error("UnsupportedHwp5TableEnum");
  }
  if (table.page_break === null)
    throw new Error("UnsupportedHwp5TableEnum");
  return {
    size_protected: decoded.size_protected,
    geometry: {
      width: source.width,
      height: source.height,
      width_relative: decoded.width_relative,
      height_relative: decoded.height_relative,
      treat_as_character: decoded.treat_as_character,
      vertical_offset: source.offset_y,
      horizontal_offset: source.offset_x
    },
    text_wrap: decoded.text_wrap,
    text_flow: decoded.text_flow,
    has_caption: decoded.has_caption,
    inner_margin_setup: table.inner_margin_setup,
    no_adjust: table.no_adjust,
    locked: decoded.locked,
    affect_line_spacing: decoded.affect_line_spacing,
    flow_with_text: decoded.flow_with_text,
    allow_overlap: decoded.allow_overlap,
    hold_anchor: decoded.hold_anchor,
    vertical_relative: decoded.vertical_relative,
    horizontal_relative: decoded.horizontal_relative,
    vertical_alignment: decoded.vertical_alignment,
    horizontal_alignment: decoded.horizontal_alignment,
    out_margin: [...source.outer_margins],
    in_margin: [...source.inner_margins]
  };
}
function hwp5TablePagination(source, { allowOpaqueTableFlags = false } = {}) {
  if (typeof allowOpaqueTableFlags !== "boolean")
    throw new Error("InvalidOpaqueTablePolicy");
  validateHwp5TableLayoutSources([source]);
  const table = hwp5TableFlags(source.table_flags);
  if (!allowOpaqueTableFlags && table.unknown_flags !== 0 || table.page_break === null)
    throw new Error("UnsupportedHwp5TablePagination");
  return {
    page_break: table.page_break,
    repeat_header: table.repeat_header,
    no_adjust: table.no_adjust,
    cell_spacing: source.cell_spacing
  };
}

// web/preview/hwp5-table-geometry-content.mjs
function attachHwp5TableGeometry(content) {
  content.tableGeometryErrors = [];
  for (const table of content.tables) {
    delete table.sourceGeometry;
    delete table.pagination;
    try {
      if (!table.layoutSource)
        throw new Error("MissingTableLayoutSource");
      const geometry = hwp5TableGeometry(table.layoutSource), pagination = hwp5TablePagination(table.layoutSource);
      table.sourceGeometry = geometry;
      table.pagination = pagination;
    } catch (error) {
      const raw = table.layoutSource?.table_flags;
      const decoded = Number.isInteger(raw) && raw >= 0 && raw <= 4294967295 ? hwp5TableFlags(raw) : null;
      content.tableGeometryErrors.push({
        section: table.section,
        tableNode: table.tableNode,
        error: error.message,
        rawTableFlags: decoded ? raw : null,
        unknownTableFlags: decoded?.unknown_flags ?? null,
        rawObjectFlags: hwp5TableUnsupportedObjectFlags(table.layoutSource?.object_flags) === null ? null : table.layoutSource.object_flags,
        unsupportedObjectFlags: hwp5TableUnsupportedObjectFlags(table.layoutSource?.object_flags),
        objectExtraBytes: table.layoutSource?.object_extra_bytes ?? null,
        tableExtraBytes: table.layoutSource?.table_extra_bytes ?? null
      });
    }
  }
  return content;
}

// web/preview/hwp5-window-table-sources.mjs
function hwp5WindowTableSourceEditor(editor, content) {
  const scoped = Object.create(editor);
  const select = (section, query, key, selected, error) => {
    const rows = query(section), seen = new Set;
    for (const row of rows) {
      if (seen.has(row[key]))
        throw new Error(error);
      seen.add(row[key]);
    }
    return rows.filter((row) => selected.has(row[key]));
  };
  const tables = (section) => content.tables.filter((row) => row.section === section);
  const nodes = (section) => new Set(tables(section).map((row) => row.tableNode));
  scoped.tableLayoutSources = (section) => select(section, (index) => editor.tableLayoutSources(index), "table_record_node", nodes(section), "AmbiguousTableLayoutSource");
  scoped.tableAnchors = (section) => select(section, (index) => editor.tableAnchors(index), "table_record_node", nodes(section), "AmbiguousTableDisplayAnchor");
  scoped.cellLayoutSources = (section) => select(section, (index) => editor.cellLayoutSources(index), "list_node", new Set(tables(section).flatMap((row) => row.cells.map((cell) => cell.listNode))), "AmbiguousCellLayoutSource");
  return scoped;
}

// web/preview/hwp5-table-border-content.mjs
function attachHwp5TableBorderSources(editor, content) {
  content.hwp5BorderFillSources = null;
  content.hwp5BorderFillSourceError = null;
  if (!editor || !content.tables?.length)
    return content;
  try {
    if (typeof editor.borderFillSources !== "function")
      throw new Error("Hwp5BorderFillSourcesAbiUnavailable");
    content.hwp5BorderFillSources = editor.borderFillSources();
  } catch (error) {
    content.hwp5BorderFillSourceError = error.message;
  }
  return content;
}

// web/preview/hwp5-table-content.mjs
function attachHwp5Tables(editor, preview, content) {
  attachTables(editor, preview, content);
  attachHwp5TableBorderSources(editor, content);
  if (!editor) {
    content.tablePlacementsErrors = [];
    return content;
  }
  attachTablePlacements(editor, preview.sections, content);
  const sources = content.window ? hwp5WindowTableSourceEditor(editor, content) : editor;
  return attachHwp5TableGeometry(attachHwp5TableAnchors(sources, attachHwp5CellLayoutSources(sources, attachHwp5TableLayoutSources(sources, content))));
}

// web/preview/paragraph-alignments.mjs
var paragraphAlignments = Object.freeze([
  { value: 0, key: "JUSTIFY", label: "양쪽 정렬" },
  { value: 1, key: "LEFT", label: "왼쪽 정렬" },
  { value: 2, key: "RIGHT", label: "오른쪽 정렬" },
  { value: 3, key: "CENTER", label: "가운데 정렬" },
  { value: 4, key: "DISTRIBUTE", label: "배분 정렬" },
  { value: 5, key: "DISTRIBUTE_SPACE", label: "공백 배분" }
].map(Object.freeze));
var paragraphAlignmentValue = (key) => paragraphAlignments.find((entry) => entry.key === key)?.value;
var paragraphAlignmentLabel = (value) => paragraphAlignments.find((entry) => entry.value === value)?.label;
// web/preview/paragraph-spacing-source.mjs
function currentParagraphSpacing(shape) {
  const modern = shape?.modernSpacing;
  const hasModern = modern !== undefined && modern !== null;
  if (hasModern && (typeof modern !== "object" || Array.isArray(modern) || !Number.isInteger(modern.attributes) || modern.attributes < 0 || modern.attributes > 4294967295))
    return null;
  let kind = hasModern ? modern.attributes & 31 : shape?.legacySpacingKind;
  let value = hasModern ? modern.value : shape?.legacySpacing;
  if (hasModern && (!Number.isInteger(value) || value < -2147483648 || value > 2147483647))
    return null;
  if (shape?.spacingFormat !== "hwpx" && hasModern && kind === 0 && Number.isInteger(shape?.legacySpacingKind) && Number.isInteger(shape?.legacySpacing)) {
    kind = shape.legacySpacingKind;
    value = shape.legacySpacing;
  }
  if (!Number.isInteger(kind) || kind < 0 || kind >= paragraphSpacingTypes.length)
    return null;
  try {
    paragraphSpacingArgs(paragraphSpacingTypes[kind], value);
  } catch {
    return null;
  }
  return { kind, value };
}

// web/preview/paragraph-geometry.mjs
var paragraphSpacing = (shape) => currentParagraphSpacing(shape) ?? { kind: undefined, value: undefined };

// web/preview/paragraph-format-options.mjs
function paragraphFormatOptions(ids, shapes = []) {
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  return ids.map((id) => {
    const shape = byId.get(id), parts = [`ID ${id}`];
    const alignment = paragraphAlignmentLabel(shape?.alignment);
    if (alignment)
      parts.push(alignment);
    if (Number.isInteger(shape?.indent))
      parts.push(`들여쓰기 ${shape.indent} HWPUNIT`);
    const { kind: spacingKind, value: spacingValue } = paragraphSpacing(shape);
    if (spacingKind === 0 && Number.isInteger(spacingValue))
      parts.push(`줄 간격 ${spacingValue}%`);
    return { value: String(id), label: parts.join(" · ") };
  });
}

// web/preview/hwp5-paragraph-geometry.mjs
function hwp5ParagraphGeometry(shape) {
  return shape ? { ...shape, spacingFormat: "hwp5" } : shape;
}

// web/preview/hwp5-paragraph-formats.mjs
function attachHwp5ParagraphFormats(editor, content, available) {
  content.paragraphFormatAvailable = false;
  if (!editor || content.readOnly || !available)
    return content;
  content.paragraphShapeCount = editor.paragraphShapeCount();
  let shapes = null;
  try {
    shapes = editor.paragraphShapes();
  } catch (error) {
    content.paragraphDisplayError = error.message;
  }
  content.paragraphShapeOptions = paragraphFormatOptions(Array.from({ length: content.paragraphShapeCount }, (_, id) => id), shapes ?? []);
  for (const paragraph of content.paragraphs) {
    if (!paragraph.clipped) {
      paragraph.paraShapeId = editor.paragraphShapeId(paragraph.section, paragraph.paragraph);
      if (shapes) {
        const shape = shapes[paragraph.paraShapeId];
        paragraph.paragraphShape = hwp5ParagraphGeometry(shape);
      }
    }
  }
  content.paragraphFormatAvailable = true;
  return content;
}

// web/preview/hwpx-paragraph-geometry.mjs
function hwpxParagraphGeometry(shape) {
  const unitValue = (measure) => measure && (measure.unit == null || measure.unit === "HWPUNIT") ? measure.value : undefined;
  const marginValue = (measure) => measure && (measure.unit == null || measure.unit === "HWPUNIT") ? measure.value : undefined;
  const spacingKinds = { PERCENT: 0, FIXED: 1, BETWEEN_LINES: 2, AT_LEAST: 3 };
  const kind = Object.hasOwn(spacingKinds, shape.spacing_type) ? spacingKinds[shape.spacing_type] : undefined;
  const spacing = kind === 0 ? shape.spacing?.value : unitValue(shape.spacing);
  return {
    spacingFormat: "hwpx",
    ...Object.hasOwn(shape, "break_settings") ? { breakSettings: shape.break_settings === null ? null : { ...shape.break_settings } } : {},
    alignment: paragraphAlignmentValue(shape.horizontal),
    indent: marginValue(shape.margins[0]),
    left: marginValue(shape.margins[1]),
    right: marginValue(shape.margins[2]),
    before: marginValue(shape.margins[3]),
    after: marginValue(shape.margins[4]),
    legacySpacingKind: kind,
    legacySpacing: spacing
  };
}

// web/preview/hwpx-paragraph-formats.mjs
function attachHwpxParagraphFormats(editor, content, available) {
  content.paragraphFormatAvailable = false;
  for (const paragraph of content.paragraphs)
    delete paragraph.tabDefinitionId;
  if (!editor || !available)
    return content;
  const ids = editor.paragraphShapeIds();
  content.paragraphShapeIds = ids;
  content.paragraphShapeCount = ids.length;
  let shapes = null;
  if (typeof editor.paragraphShapes === "function") {
    try {
      shapes = new Map(editor.paragraphShapes().map((shape) => [shape.id, shape]));
    } catch (error) {
      content.paragraphShapesError = error.message;
    }
  }
  const sections = new Map;
  content.paragraphShapeOptions = paragraphFormatOptions(ids, shapes ? Array.from(shapes.values(), (shape) => ({ id: shape.id, ...hwpxParagraphGeometry(shape) })) : []);
  for (const paragraph of content.paragraphs) {
    if (paragraph.clipped)
      continue;
    if (!sections.has(paragraph.section))
      sections.set(paragraph.section, editor.paragraphShapeRefs(paragraph.section));
    const refs = sections.get(paragraph.section), index = paragraph.paragraph + 1 - refs.firstParagraph;
    if (index < 0 || index >= refs.ids.length)
      throw new Error("ParagraphDisplayBindingMismatch");
    paragraph.paraShapeId = refs.ids[index];
    if (shapes) {
      const shape = shapes.get(paragraph.paraShapeId);
      if (!shape)
        throw new Error("ParagraphDisplayResourceMismatch");
      paragraph.paragraphShape = hwpxParagraphGeometry(shape);
      paragraph.tabDefinitionId = shape.tab_pr_id;
    }
  }
  content.paragraphFormatAvailable = true;
  return content;
}

// web/preview/hwpx-formulas-content.mjs
function attachHwpxFormulas(editor, content) {
  if (content.window && !Array.isArray(content.tables))
    throw new Error("MissingWindowTableOwnership");
  content.formulas = [];
  content.formulaErrors = [];
  content.formulaDefinitionAvailable = typeof editor.setFormulaDefinition === "function";
  const sections = [...new Set(content.paragraphs.map((paragraph) => paragraph.section))];
  for (const section of sections) {
    try {
      if (editor.formulaSources(section).length === 0)
        continue;
      const selected = content.window ? new Set(content.tables.filter((table) => table.section === section).map((table) => table.tableNode)) : null;
      for (const row of editor.formulaCurrent(section)) {
        if (selected && !selected.has(row.owner.table))
          continue;
        content.formulas.push({
          section,
          beginElement: row.begin_element,
          owner: row.owner,
          ...row.values
        });
      }
    } catch (error) {
      content.formulaErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/hwp5-formulas-content.mjs
function attachHwp5Formulas(editor, content, available) {
  content.formulas = [];
  content.formulaErrors = [];
  content.formulaDefinitionAvailable = Boolean(editor) && available === true;
  if (!editor)
    return content;
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    try {
      for (const row of editor.formulaSources(section))
        content.formulas.push({
          section,
          beginElement: row.source_node,
          owner: { paragraph: row.paragraph },
          formula: row.formula,
          last_result: row.last_result,
          derived: row.derived
        });
    } catch (error) {
      content.formulaErrors.push({ section, error: error.message || String(error) });
    }
  }
  return content;
}

// js/hwp5-form-sources.mjs
var uint17 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var signed = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
var uniqueRows = (rows, inspect) => {
  const controls = new Set, objects = new Set;
  if (!Array.isArray(rows))
    throw Error("InvalidHwp5FormSources");
  for (const row of rows) {
    if (!row || !uint17(row.control_node) || !uint17(row.object_node) || row.control_node >= row.object_node || controls.has(row.control_node) || objects.has(row.object_node) || !inspect(row))
      throw Error("InvalidHwp5FormSources");
    controls.add(row.control_node);
    objects.add(row.object_node);
  }
  return rows;
};
function validateHwp5FormSources(rows) {
  return uniqueRows(rows, (row) => [
    "paragraph_node",
    "source_unit",
    "raw_length",
    "flags",
    "width",
    "height",
    "instance_id",
    "common_extra_bytes",
    "envelope_extra_bytes",
    "property_bytes",
    "property_nodes",
    "other_direct_children"
  ].every((k) => uint17(row[k])) && row.paragraph_node < row.control_node && row.source_unit <= 4294967287 && ["unknown", "push_button", "check_box", "combo_box", "radio_button", "edit"].includes(row.kind) && uint17(row.type_id) && uint17(row.secondary_type_id) && ["offset_x", "offset_y", "z_order", "prevent_page_break"].every((k) => signed(row[k], -2147483648, 2147483647)) && Array.isArray(row.margins) && row.margins.length === 4 && row.margins.every((v) => signed(v, -32768, 32767)) && (row.description_bytes === null || uint17(row.description_bytes)));
}
function validateHwp5FormAnchors(rows) {
  return uniqueRows(rows, (row) => uint17(row.paragraph) && uint17(row.source_unit) && row.source_unit <= 4294967287 && uint17(row.current_unit) && row.current_unit <= 4294967287);
}
var decode2 = (bytes, validate) => validate(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
var decodeHwp5FormSources = (bytes) => decode2(bytes, validateHwp5FormSources);
var decodeHwp5FormAnchors = (bytes) => decode2(bytes, validateHwp5FormAnchors);

// web/preview/hwp5-form-content.mjs
function attachHwp5Forms(editor, content) {
  content.hwp5FormSourcesAvailable = editor?.supportsFormSources?.() === true;
  content.hwp5Forms = [];
  content.hwp5FormErrors = [];
  if (!content.hwp5FormSourcesAvailable)
    return;
  for (const section of new Set(content.paragraphs.map((p) => p.section))) {
    try {
      const sources = validateHwp5FormSources(editor.formSources(section));
      const anchors = validateHwp5FormAnchors(editor.formAnchors(section)), rows = [];
      if (sources.length !== anchors.length)
        throw Error("IncompleteHwp5FormAnchors");
      const byControl = new Map(anchors.map((anchor) => [anchor.control_node, anchor])), paragraphs = new Map;
      for (const p of content.paragraphs)
        if (p.section === section) {
          if (paragraphs.has(p.paragraph))
            throw Error("AmbiguousCurrentHwp5FormOwner");
          paragraphs.set(p.paragraph, p);
        }
      for (const source of sources) {
        const anchor = byControl.get(source.control_node);
        if (!anchor || anchor.object_node !== source.object_node || anchor.source_unit !== source.source_unit)
          throw Error("AmbiguousHwp5FormAnchor");
        const p = paragraphs.get(anchor.paragraph);
        if (!p || p.clipped)
          throw Error("MissingCurrentHwp5FormOwner");
        const unit = sourceDisplayPosition(anchor.current_unit, p.sourceOffsets, p.text.length);
        const end = sourceDisplayPosition(anchor.current_unit + 8, p.sourceOffsets, p.text.length);
        if (p.text[unit] !== "￼" || end !== unit + 1)
          throw Error("InvalidCurrentHwp5FormAnchor");
        rows.push({
          section,
          controlNode: source.control_node,
          formNode: source.object_node,
          paragraph: anchor.paragraph,
          anchorUnit: unit,
          source,
          anchor
        });
      }
      content.hwp5Forms.push(...rows);
    } catch (error) {
      content.hwp5FormErrors.push({ section, error: error.message });
    }
  }
}

// js/hwp5-form-properties.mjs
var uint18 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
function validateHwp5FormProperties(rows) {
  const fail = () => {
    throw Error("InvalidHwp5FormProperties");
  };
  if (!Array.isArray(rows) || rows.length > 1e5)
    fail();
  let totalUnits = 0, totalFields = 0;
  const controls = new Set, objects = new Set;
  for (const row of rows) {
    if (!row || !["control_node", "object_node", "known_nodes", "deferred_nodes"].every((k) => uint18(row[k])) || row.control_node >= row.object_node || controls.has(row.control_node) || objects.has(row.object_node) || !Array.isArray(row.fields))
      fail();
    const fields = new Set;
    for (const property of row.fields) {
      if (!property || typeof property.field !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(property.field) || fields.has(property.field) || !["wstring", "integer", "boolean"].includes(property.kind) || !Array.isArray(property.units) || property.units.length > 1e6 - totalUnits || property.units.some((unit) => !Number.isInteger(unit) || unit < 0 || unit > 65535))
        fail();
      totalUnits += property.units.length;
      totalFields++;
      fields.add(property.field);
      if (totalFields > 1e5)
        fail();
    }
    if (row.fields.length > row.known_nodes)
      fail();
    controls.add(row.control_node);
    objects.add(row.object_node);
  }
  return rows;
}
function decodeHwp5FormProperties(bytes) {
  return validateHwp5FormProperties(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/hwp5-form-property-content.mjs
function attachHwp5FormProperties(editor, content) {
  content.hwp5FormPropertiesAvailable = editor?.supportsFormProperties?.() === true;
  content.hwp5FormPropertyErrors = [];
  for (const form of content.hwp5Forms ?? [])
    form.properties = null;
  if (!content.hwp5FormPropertiesAvailable)
    return;
  const sections = new Map;
  for (const form of content.hwp5Forms ?? []) {
    const rows = sections.get(form.section) ?? [];
    rows.push(form);
    sections.set(form.section, rows);
  }
  for (const [section, forms] of sections) {
    try {
      const properties = validateHwp5FormProperties(editor.formProperties(section));
      const byControl = new Map(properties.map((row) => [row.control_node, row]));
      if (properties.length !== forms.length)
        throw Error("IncompleteHwp5FormProperties");
      const selected = forms.map((form) => {
        const row = byControl.get(form.controlNode);
        if (!row || row.object_node !== form.formNode || row.known_nodes + row.deferred_nodes !== form.source.property_nodes)
          throw Error("MismatchedHwp5FormProperties");
        return row;
      });
      forms.forEach((form, index) => {
        form.properties = selected[index];
      });
    } catch (error) {
      content.hwp5FormPropertyErrors.push({ section, error: error.message });
    }
  }
}

// web/preview/table-caption-content.mjs
function attachTableCaptions(editor, sections, content) {
  content.tableCaptionBindingErrors = [];
  for (const paragraph of content.paragraphs)
    delete paragraph.tableCaption;
  for (const table of content.tables)
    table.captionParagraphs = [];
  const paragraphs = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p]));
  const tables = new Map(content.tables.map((t) => [`${t.section}:${t.tableNode}`, t]));
  for (const { index } of sections) {
    let bindings;
    try {
      bindings = editor.tableCaptionBindings(index);
    } catch (error) {
      content.tableCaptionBindingErrors.push({ section: index, error: error.message });
      continue;
    }
    for (const { paragraph: nativeParagraph, owner } of bindings) {
      const id = nativeParagraph - 1;
      const table = tables.get(`${index}:${owner.table_node}`);
      const paragraph = paragraphs.get(`${index}:${id}`);
      if (!table) {
        if (content.window && !paragraph)
          continue;
        content.tableCaptionBindingErrors.push({
          section: index,
          paragraph: id,
          error: "MissingCaptionTable"
        });
        continue;
      }
      if (!paragraph) {
        table.partial = true;
        continue;
      }
      if (paragraph.clipped)
        table.partial = true;
      table.captionParagraphs.push(id);
      paragraph.tableCaption = {
        tableNode: owner.table_node,
        captionNode: owner.caption_node,
        listNode: owner.list_node
      };
    }
  }
  return content;
}

// web/preview/hwpx-table-content.mjs
function attachHwpxTables(editor, content) {
  const sections = [...new Set(content.paragraphs.map((p) => p.section))].map((index) => ({
    index
  }));
  const displayed = {
    tableBindings(section) {
      return editor.tableBindings(section).map((row) => ({ ...row, paragraph: row.paragraph - 1 }));
    }
  };
  attachTables(displayed, { sections }, content);
  attachTablePlacements(editor, sections, content, -1);
  attachTableCaptions(editor, sections, content);
  content.tablePaginationErrors = [];
  content.tableGeometryErrors = [];
  content.tableCellMarginErrors = [];
  content.tableCaptionErrors = [];
  for (const table of content.tables) {
    for (const cell of table.cells) {
      try {
        cell.sourceMargin = editor.tableCellMargin(table.section, cell.listNode);
        cell.sourceVerticalAlignment = cell.sourceMargin.vertical_alignment;
        cell.sourceLineWrap = cell.sourceMargin.line_wrap;
        cell.sourceTextDirection = cell.sourceMargin.text_direction;
      } catch (error) {
        content.tableCellMarginErrors.push({
          section: table.section,
          listNode: cell.listNode,
          error: error.message
        });
      }
    }
    try {
      table.sourceGeometry = editor.tableGeometry(table.section, table.tableNode);
    } catch (error) {
      content.tableGeometryErrors.push({
        section: table.section,
        tableNode: table.tableNode,
        error: error.message
      });
    }
    try {
      table.sourceCaption = editor.tableCaption(table.section, table.tableNode);
    } catch (error) {
      content.tableCaptionErrors.push({
        section: table.section,
        tableNode: table.tableNode,
        error: error.message
      });
    }
  }
  for (const section of sections) {
    try {
      const rows = editor.tablePagination(section.index);
      const tables = new Map(content.tables.filter((table) => table.section === section.index).map((table) => [table.tableNode, table]));
      for (const row of rows) {
        const table = tables.get(row.table_node);
        if (table)
          table.pagination = row.values;
      }
    } catch (error) {
      content.tablePaginationErrors.push({ section: section.index, error: error.message });
    }
  }
  return content;
}

// web/preview/hwpx-table-border-content.mjs
function attachHwpxTableBorders(editor, content, available) {
  if (!available)
    return content;
  content.tableBorderSources = [];
  content.tableBorderSourceErrors = [];
  const sections = new Set((content.tables ?? []).map((table) => table.section));
  let batch;
  if (typeof editor.tableBorderSourcesBatch === "function") {
    batch = new Map;
    const selected = [...sections], limit = editor.tableBorderSourcesBatchMaxSections ?? Math.max(1, selected.length);
    if (!Number.isInteger(limit) || limit < 1) {
      for (const section of selected)
        batch.set(section, { section, error: "InvalidTableBorderBatchLimit" });
    } else
      for (let start = 0;start < selected.length; start += limit) {
        const chunk = selected.slice(start, start + limit);
        try {
          for (const entry of editor.tableBorderSourcesBatch(chunk))
            batch.set(entry.section, entry);
        } catch (error) {
          for (const section of chunk)
            batch.set(section, { section, error: error.message });
        }
      }
  }
  for (const section of sections) {
    try {
      const entry = batch?.get(section);
      if (batch && !entry)
        throw new Error("MissingTableBorderBatchSection");
      if (entry?.error)
        throw new Error(entry.error);
      const report = entry ? entry.value : editor.tableBorderSources(section);
      const selected = [];
      const byList = new Map, used = new Set;
      for (const row of report.cells) {
        const key = `${row.table_node}:${row.list_node}`;
        byList.set(key, byList.has(key) ? null : row);
      }
      for (const table of content.tables.filter((t) => t.section === section))
        for (const cell of table.cells) {
          const key = `${table.tableNode}:${cell.listNode}`, row = byList.get(key);
          if (!row || used.has(key))
            throw new Error("TableBorderSourceOwnerMismatch");
          used.add(key);
          selected.push(row);
        }
      content.tableBorderSources.push({
        section,
        sourceOnly: true,
        cells: selected,
        styles: report.styles
      });
    } catch (error) {
      content.tableBorderSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/table-insets.mjs
function tableInsets(value) {
  const insets = typeof value === "number" ? { left: value, right: value, top: value, bottom: value } : value;
  if (!insets || ![insets.left, insets.right, insets.top, insets.bottom].every((v) => Number.isFinite(v) && v >= 0) || !Number.isFinite(insets.left + insets.right) || !Number.isFinite(insets.top + insets.bottom))
    return null;
  return { left: insets.left, right: insets.right, top: insets.top, bottom: insets.bottom };
}

// web/preview/table-source-insets.mjs
function sourceTableCellInsets(table, cell) {
  const flag = cell?.sourceMargin?.has_margin;
  const values = flag === true ? cell.sourceMargin.margin : flag === false ? table?.sourceGeometry?.in_margin : null;
  if (!Array.isArray(values) || values.length !== 4 || !values.every((v) => Number.isSafeInteger(v) && v >= 0 && v <= 4294967295))
    return null;
  const [left, right, top, bottom] = values.map(hwpUnitPixels);
  return tableInsets({ left, right, top, bottom });
}

// web/preview/hwpx-created-cell-display.mjs
function hwpxCreatedCellDisplay(table, shapes) {
  const shape = shapes?.find((shape) => shape.id === table.resources.paragraph);
  if (!shape)
    return {};
  const insets = sourceTableCellInsets({ sourceGeometry: { in_margin: [0, 0, 0, 0] } }, { sourceMargin: { has_margin: false } });
  return {
    displayFormat: "hwpx",
    displayParagraphShape: hwpxParagraphGeometry(shape),
    displayInsets: insets
  };
}

// web/preview/created-table-content.mjs
function attachCreatedTables(editor, content, available, maxUnits, sectionCount) {
  const visible = new Set(content.paragraphs.map((p) => `${p.section}:${p.paragraph}`));
  const rows = [];
  const pending = new Set;
  let units = 0;
  let paragraphShapes;
  const softLineBreakAvailable = available && editor.supportsCreatedCellSoftLineBreaks?.() === true;
  const sections = sectionCount === undefined ? new Set(content.paragraphs.map((p) => p.section)) : Array.from({ length: sectionCount }, (_, index) => index);
  if (available)
    for (const section of sections) {
      for (const table of editor.createdTables(section)) {
        pending.add(section);
        const hostParagraph = table.host_paragraph - 1;
        if (!visible.has(`${section}:${hostParagraph}`))
          continue;
        if (paragraphShapes === undefined) {
          try {
            paragraphShapes = typeof editor.paragraphShapes === "function" ? editor.paragraphShapes() : null;
          } catch (error) {
            paragraphShapes = null;
            content.createdTableParagraphDisplayError = error.message;
          }
        }
        for (const cell of table.cells) {
          units += cell.text.length;
          if (units > maxUnits)
            throw new Error("CreatedTableDisplayTextBudgetExceeded");
        }
        rows.push({
          ...table,
          ...hwpxCreatedCellDisplay(table, paragraphShapes),
          cells: table.cells.map((cell) => ({
            ...cell,
            ...softLineBreakAvailable ? { softLineBreakAvailable: true } : {}
          })),
          section,
          hostParagraph,
          anchorUnit: table.anchor_unit
        });
      }
    }
  content.createdTables = rows;
  content.createdTableHostPending = pending.size !== 0;
  const modes = new Map;
  if (pending.size)
    for (const section of new Set(content.paragraphs.map((p) => p.section))) {
      const query = typeof editor.createdTableHostMode === "function";
      modes.set(section, {
        plain: query && editor.createdTableHostMode(section),
        anchored: query && editor.createdTableHostMode(section, true),
        fields: typeof editor.createdTableFieldLabelMode === "function" && editor.createdTableFieldLabelMode(section)
      });
    }
  for (const paragraph of content.paragraphs)
    if (pending.size) {
      const mode = modes.get(paragraph.section);
      paragraph.plainEditable = !!paragraph.plainEditable && mode.plain === true;
      paragraph.anchorEditable = !!paragraph.anchorEditable && mode.anchored === true;
      paragraph.fieldLabels = mode.fields === true ? paragraph.fieldLabels ?? [] : [];
      paragraph.editable = paragraph.plainEditable || paragraph.anchorEditable || paragraph.fieldLabels.length > 0;
      paragraph.anchoredSplitAvailable = false;
      paragraph.nextMergeParagraph = null;
      paragraph.previousMergeParagraph = null;
      if (!paragraph.editable)
        paragraph.readOnlyReason = "UnsupportedCreatedTableHostEdit";
    }
  content.readOnly = !content.paragraphs.some((paragraph) => paragraph.editable);
  content.tableCreationAvailable = available;
  return content;
}

// web/preview/curve-owner-content.mjs
function queryCurveOwner(editor, section, node, root) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  try {
    if (typeof editor.curveOwner !== "function")
      throw new Error("HwpxCurveOwnerAbiUnavailable");
    if (![section, node, root].every(uint) || root >= node)
      throw new Error("CurveOwnerBindingMismatch");
    const result = editor.curveOwner(section, node), owner = result?.owner;
    if (result?.sourceOnly !== true || result.node !== node || !owner || owner.anchor_node !== root || !uint(owner.paragraph) || owner.paragraph < 1 || !uint(owner.anchor_unit))
      throw new Error("CurveOwnerBindingMismatch");
    return { state: "bound", owner };
  } catch (error) {
    return { state: "unavailable", error: error.message };
  }
}

// web/preview/curve-text-content.mjs
function readCurveTextSource(editor, section, node, bindings, paragraphs) {
  let source;
  try {
    if (typeof editor.curveGeometry !== "function")
      return { state: "not-curve" };
    source = editor.curveGeometry(section, node);
  } catch (error) {
    if (["InvalidCurveGeometryNode", "HwpxCurveGeometryAbiUnavailable"].includes(error.message))
      return { state: "not-curve" };
    return { state: "unavailable", error: error.message };
  }
  const fail = (error) => ({ state: "unavailable", error });
  if (source?.sourceOnly !== true || source.node !== node || !source.text || !Array.isArray(bindings) || !bindings.length || bindings.some((row) => row.drawingNode !== node || (row.kind ?? "text") !== "text" || row.listNode !== source.text.list_node || row.textNode !== source.text.node))
    return fail("CurveTextSourceBindingMismatch");
  const current = queryCurveOwner(editor, section, node, source.common?.group_context?.root_anchor);
  if (current.state !== "bound")
    return current;
  const host = paragraphs.get(`${section}:${current.owner.paragraph - 1}`);
  if (!host || host.clipped || typeof host.text !== "string" || host.text[current.owner.anchor_unit] !== "￼")
    return fail("CurveTextHostBindingMismatch");
  return {
    state: "bound",
    item: {
      section,
      curveNode: node,
      hostParagraph: current.owner.paragraph - 1,
      anchorUnit: current.owner.anchor_unit,
      owner: current.owner,
      source
    }
  };
}

// web/preview/drawing-text-content.mjs
function attachDrawingTextBindings(editor, content) {
  content.drawingTextBindingErrors = [];
  content.drawingTextSnapshotErrors = [];
  content.drawings = [];
  content.curveTextSources = [];
  content.curveTextSourceErrors = [];
  const paragraphs = new Map(content.paragraphs.map((paragraph) => [
    `${paragraph.section}:${paragraph.paragraph}`,
    paragraph
  ]));
  for (const paragraph of content.paragraphs) {
    delete paragraph.drawingText;
    delete paragraph.drawingCaption;
  }
  for (const section of new Set(content.paragraphs.map((paragraph) => paragraph.section))) {
    let usingRequested = false;
    try {
      const allRows = editor.drawingTextBindings(section);
      const selectedDrawings = content.window ? new Set(allRows.filter((row) => paragraphs.has(`${section}:${row.paragraph - 1}`)).map((row) => row.drawingNode)) : null;
      const rows = selectedDrawings ? allRows.filter((row) => selectedDrawings.has(row.drawingNode)) : allRows;
      if (rows.some((row) => !paragraphs.has(`${section}:${row.paragraph - 1}`)))
        throw new Error("DrawingTextDisplayBindingMismatch");
      const nodes = [...new Set(rows.map((row) => row.drawingNode))];
      let requested = null, batch = null;
      if (nodes.length && typeof editor.drawingTextRequested === "function") {
        usingRequested = true;
        const limit = editor.drawingTextRequestedMaxNodes;
        if (!Number.isInteger(limit) || limit < 1 || limit > 1024)
          throw Error("InvalidDrawingTextRequestLimit");
        requested = new Map;
        for (let start = 0;start < nodes.length; start += limit) {
          const chunk = nodes.slice(start, start + limit);
          const result = editor.drawingTextRequested(section, chunk);
          if (!Array.isArray(result) || result.length !== chunk.length)
            throw Error("InvalidDrawingTextRequested");
          for (let index = 0;index < chunk.length; index++) {
            const entry = result[index];
            if (!entry || entry.node !== chunk[index] || requested.has(entry.node))
              throw Error("InvalidDrawingTextRequested");
            if (Object.hasOwn(entry, "source") === Object.hasOwn(entry, "unavailable"))
              throw Error("InvalidDrawingTextRequested");
            if (Object.hasOwn(entry, "unavailable") && typeof entry.unavailable !== "string")
              throw Error("InvalidDrawingTextRequested");
            if (entry.unavailable === "OutOfMemory")
              throw Error("OutOfMemory");
            requested.set(entry.node, entry);
          }
        }
      } else if (rows.length && typeof editor.drawingTextSnapshots === "function") {
        try {
          batch = new Map(editor.drawingTextSnapshots(section).map((row) => [row.drawing_node, row]));
        } catch {}
      }
      for (const row of rows) {
        const paragraph = paragraphs.get(`${section}:${row.paragraph - 1}`);
        if (row.kind === "caption")
          paragraph.drawingCaption = {
            drawingNode: row.drawingNode,
            captionNode: row.textNode,
            listNode: row.listNode
          };
        else
          paragraph.drawingText = {
            drawingNode: row.drawingNode,
            textNode: row.textNode,
            listNode: row.listNode
          };
      }
      for (const drawingNode of nodes) {
        try {
          const entry = requested?.get(drawingNode);
          if (requested && !entry)
            throw Error("InvalidDrawingTextRequested");
          if (entry && Object.hasOwn(entry, "unavailable"))
            throw Error(entry.unavailable);
          const source = requested ? entry.source : batch?.get(drawingNode) ?? editor.drawingTextSnapshot(section, drawingNode);
          if (source.drawing_node !== drawingNode || !paragraphs.has(`${section}:${source.paragraph - 1}`))
            throw new Error("DrawingTextDisplayBindingMismatch");
          content.drawings.push({
            section,
            drawingNode,
            hostParagraph: source.paragraph - 1,
            anchorUnit: source.anchor_unit,
            source
          });
        } catch (error) {
          if (usingRequested && error.message === "OutOfMemory")
            throw error;
          if (error.message === "UnsupportedDrawingTextAnchor") {
            const curve = readCurveTextSource(editor, section, drawingNode, rows.filter((row) => row.drawingNode === drawingNode), paragraphs);
            if (curve.state === "bound") {
              content.curveTextSources.push(curve.item);
              continue;
            }
            if (curve.state === "unavailable") {
              if (usingRequested && curve.error === "OutOfMemory")
                throw Error("OutOfMemory");
              content.curveTextSourceErrors.push({
                section,
                curveNode: drawingNode,
                error: curve.error
              });
            }
          }
          content.drawingTextSnapshotErrors.push({ section, drawingNode, error: error.message });
        }
      }
    } catch (error) {
      if (usingRequested && error.message === "OutOfMemory")
        throw error;
      content.drawingTextBindingErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/ellipse-content.mjs
function attachEllipses(editor, content, available) {
  if (!available)
    return content;
  content.ellipses = [];
  content.ellipseSourceErrors = [];
  for (const section of new Set(content.paragraphs.map((p) => p.section))) {
    try {
      const rows = editor.ellipseSources(section);
      for (const source of rows) {
        const owner = content.paragraphs.find((p) => p.section === section && p.paragraph === source.owner.paragraph - 1);
        if (!owner && content.window)
          continue;
        if (!owner)
          throw new Error("EllipseDisplayBindingMismatch");
        content.ellipses.push({ section, source });
      }
    } catch (error) {
      content.ellipseSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/automatic-number-display-snapshot.mjs
function createAutomaticNumberDisplaySnapshot(editor) {
  const sections = new Map;
  return (section) => {
    if (!sections.has(section)) {
      const sources = new Map(editor.automaticNumberSources(section).map((row) => [row.number_node, row]));
      const sites = editor.automaticNumberSites(section);
      sections.set(section, { sources, sites });
    }
    return sections.get(section);
  };
}

// web/preview/automatic-number-content.mjs
function retainedNoteSource(source, site) {
  return source && source.anchor_node === site.anchor_node && site.anchor_unit === 0 && ["FOOTNOTE", "ENDNOTE"].includes(source.values?.raw?.[1]);
}
function retainedAutomaticNumberPlainText(editor, section, paragraph, _flattenedText, anchored, snapshot = createAutomaticNumberDisplaySnapshot(editor)) {
  if (!anchored.startsWith("￼"))
    return anchored;
  const { sources, sites } = snapshot(section);
  for (const site of sites) {
    if (site.paragraph === paragraph && retainedNoteSource(sources.get(site.number_node), site)) {
      if (editor.canEdit(section, paragraph) !== true)
        return anchored;
      return anchored.slice(1);
    }
  }
  return anchored;
}
function attachAutomaticNumbers(editor, content, snapshot = createAutomaticNumberDisplaySnapshot(editor)) {
  content.automaticNumberErrors = [];
  for (const paragraph of content.paragraphs) {
    paragraph.automaticNumbers = [];
    paragraph.automaticNumberPrefixes = [];
  }
  const paragraphs = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p]));
  const sections = [...new Set(content.paragraphs.map((p) => p.section))];
  for (const section of sections) {
    try {
      const { sources, sites } = snapshot(section);
      for (const site of sites) {
        if (site.paragraph === null)
          continue;
        const paragraph = paragraphs.get(`${section}:${site.paragraph - 1}`);
        if (!paragraph || paragraph.clipped)
          continue;
        const source = sources.get(site.number_node);
        if (retainedNoteSource(source, site) && paragraph.plainEditable && editor.canEdit(section, site.paragraph) && editor.anchorText(section, site.paragraph) === "￼" + paragraph.text) {
          paragraph.automaticNumberPrefixes.push({
            numberNode: site.number_node,
            anchorNode: site.anchor_node,
            source
          });
          continue;
        }
        if (!source || source.anchor_node !== site.anchor_node || paragraph.text[site.anchor_unit] !== "￼") {
          content.automaticNumberErrors.push({
            section,
            numberNode: site.number_node,
            error: "AutomaticNumberBindingMismatch"
          });
          continue;
        }
        paragraph.automaticNumbers.push({
          numberNode: site.number_node,
          anchorNode: site.anchor_node,
          unit: site.anchor_unit,
          source
        });
      }
    } catch (error) {
      content.automaticNumberErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/note-reference-content.mjs
function attachNoteReferences(editor, content) {
  content.noteReferenceErrors = [];
  for (const paragraph of content.paragraphs)
    paragraph.automaticNumbers = (paragraph.automaticNumbers ?? []).filter((row) => row.kind !== "note-reference");
  for (const section of new Set(content.paragraphs.map((p) => p.section))) {
    try {
      const sources = new Map(editor.automaticNumberSources(section).map((row) => [row.number_node, row]));
      for (const site of editor.noteReferenceSites(section)) {
        const paragraph = content.paragraphs.find((p) => p.section === section && p.paragraph === site.paragraph - 1);
        if (!paragraph || paragraph.clipped)
          continue;
        const source = sources.get(site.number_node);
        if (!source || !["FOOTNOTE", "ENDNOTE"].includes(source.values?.raw?.[1]) || paragraph.text[site.anchor_unit] !== "￼" || paragraph.automaticNumbers.some((row) => row.unit === site.anchor_unit)) {
          content.noteReferenceErrors.push({
            section,
            noteNode: site.note_node,
            error: "NoteReferenceBindingMismatch"
          });
          continue;
        }
        paragraph.automaticNumbers.push({
          numberNode: site.number_node,
          anchorNode: site.anchor_node,
          noteNode: site.note_node,
          unit: site.anchor_unit,
          source,
          kind: "note-reference"
        });
      }
    } catch (error) {
      content.noteReferenceErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/hwpx-picture-content.mjs
function attachHwpxPictures(editor, content) {
  content.pictures = [];
  content.pictureErrors = [];
  const sections = [...new Set(content.paragraphs.map((paragraph) => paragraph.section))];
  const displayed = content.window ? new Set(content.paragraphs.map((paragraph) => `${paragraph.section}:${paragraph.paragraph}`)) : null;
  for (const section of sections) {
    let sites;
    try {
      sites = editor.pictureSites(section);
    } catch (error) {
      content.pictureErrors.push({ section, error: error.message });
      continue;
    }
    let owners = null, ownerBatchError = null;
    if (typeof editor.pictureOwners === "function" && sites.some((site) => site.state === "located" || site.state === "unsupported_anchor")) {
      try {
        owners = new Map(editor.pictureOwners(section).map((row) => [row.pictureNode, row]));
      } catch (error) {
        if (error.message !== "HwpxPictureOwnersAbiUnavailable")
          ownerBatchError = error.message;
      }
    }
    for (const site of sites) {
      const picture = {
        ...site,
        section,
        paragraph: site.paragraph === null ? null : site.paragraph - 1,
        owner: null,
        ownerError: null,
        geometry: null,
        geometryError: null,
        sizeProtected: null,
        sizeProtectionError: null,
        position: null,
        positionError: null,
        flow: null,
        flowError: null,
        crop: null,
        cropError: null,
        transform: null,
        transformError: null,
        renderingCorners: null,
        renderingCornersError: null
      };
      if (site.state === "located" || site.state === "unsupported_anchor") {
        try {
          if (ownerBatchError)
            throw new Error(ownerBatchError);
          let owner;
          if (owners) {
            const row = owners.get(site.pictureNode);
            if (!row)
              throw new Error("MissingPictureOwnerBatchRow");
            if (row.error !== null)
              throw new Error(row.error);
            owner = row.owner;
          } else {
            if (typeof editor.pictureOwner !== "function")
              throw new Error("HwpxPictureOwnerAbiUnavailable");
            owner = editor.pictureOwner(section, site.pictureNode);
          }
          picture.owner = { ...owner, paragraph: owner.paragraph - 1 };
        } catch (error) {
          picture.ownerError = error.message;
        }
      }
      const host = picture.owner?.paragraph ?? picture.paragraph;
      if (displayed && host !== null && !displayed.has(`${section}:${host}`))
        continue;
      if (site.state === "located" || picture.owner !== null) {
        try {
          if (typeof editor.pictureFlow !== "function")
            throw new Error("HwpxPictureFlowAbiUnavailable");
          picture.flow = editor.pictureFlow(section, site.pictureNode);
        } catch (error) {
          picture.flowError = error.message;
        }
        try {
          if (typeof editor.picturePosition !== "function")
            throw new Error("HwpxPicturePositionAbiUnavailable");
          picture.position = editor.picturePosition(section, site.pictureNode);
        } catch (error) {
          picture.positionError = error.message;
        }
        try {
          picture.geometry = editor.pictureGeometry(section, site.pictureNode);
        } catch (error) {
          picture.geometryError = error.message;
        }
        try {
          if (typeof editor.pictureSizeProtection !== "function")
            throw new Error("HwpxPictureSizeProtectionAbiUnavailable");
          picture.sizeProtected = editor.pictureSizeProtection(section, site.pictureNode);
        } catch (error) {
          picture.sizeProtectionError = error.message;
        }
        try {
          picture.crop = editor.pictureCrop(section, site.pictureNode);
        } catch (error) {
          picture.cropError = error.message;
        }
        try {
          picture.transform = editor.pictureTransform(section, site.pictureNode);
        } catch (error) {
          picture.transformError = error.message;
        }
        try {
          if (typeof editor.pictureRenderingCorners !== "function")
            throw new Error("HwpxPictureCornersAbiUnavailable");
          picture.renderingCorners = editor.pictureRenderingCorners(section, site.pictureNode);
        } catch (error) {
          picture.renderingCornersError = error.message;
        }
      }
      picture.groupResizeAvailable = false;
      picture.groupResizeError = null;
      if (picture.owner && picture.owner.anchorNode !== site.pictureNode) {
        try {
          if (typeof editor.groupedPictureResizeAvailable !== "function")
            throw new Error("HwpxGroupedPictureResizeAbiUnavailable");
          picture.groupResizeAvailable = editor.groupedPictureResizeAvailable(section, site.pictureNode) === true;
        } catch (error) {
          picture.groupResizeError = error.message;
        }
      }
      content.pictures.push(picture);
    }
  }
  return content;
}

// web/preview/hwpx-picture-captions.mjs
function attachHwpxPictureCaptions(editor, content, available) {
  const pictureIds = new Set((content.pictures ?? []).map((p) => `${p.section}:${p.pictureNode}`));
  for (const paragraph of content.paragraphs)
    if (paragraph.drawingCaption && pictureIds.has(`${paragraph.section}:${paragraph.drawingCaption.drawingNode}`))
      delete paragraph.drawingCaption;
  for (const picture of content.pictures ?? []) {
    delete picture.caption;
    delete picture.captionPartial;
  }
  content.pictureCaptionAvailable = available === true;
  content.pictureCaptionErrors = [];
  if (!content.pictureCaptionAvailable)
    return content;
  const pending = [], claimed = new Set;
  const paragraphs = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p]));
  if (paragraphs.size !== content.paragraphs.length) {
    content.pictureCaptionErrors.push({ error: "AmbiguousPictureCaptionParagraphs" });
    return content;
  }
  for (const section of new Set((content.pictures ?? []).map((p) => p.section))) {
    try {
      const pictures = content.pictures.filter((p) => p.section === section);
      const byNode = new Map(pictures.map((p) => [p.pictureNode, p]));
      if (byNode.size !== pictures.length)
        throw new Error("AmbiguousPictureCaptionOwner");
      const bindings = editor.pictureCaptionBindings(section);
      for (const picture of pictures)
        picture.caption = editor.pictureCaption(section, picture.pictureNode);
      for (const binding of bindings) {
        const picture = byNode.get(binding.owner.picture_node);
        if (!picture && content.window)
          continue;
        const caption = picture?.caption;
        if (!caption || caption.caption_node !== binding.owner.caption_node || caption.list_node !== binding.owner.list_node)
          throw new Error("PictureCaptionBindingMismatch");
        const key = `${section}:${binding.paragraph - 1}`, paragraph = paragraphs.get(key);
        if (!paragraph && content.window) {
          picture.captionPartial = true;
          continue;
        }
        if (!paragraph || paragraph.drawingText || paragraph.drawingCaption || paragraph.tableCell || paragraph.tableCaption || claimed.has(key))
          throw new Error("PictureCaptionParagraphMismatch");
        claimed.add(key);
        pending.push({
          paragraph,
          owner: {
            drawingNode: picture.pictureNode,
            captionNode: caption.caption_node,
            listNode: caption.list_node
          }
        });
      }
    } catch (error) {
      content.pictureCaptionErrors.push({ section, error: error.message });
    }
  }
  if (!content.pictureCaptionErrors.length)
    for (const item of pending)
      item.paragraph.drawingCaption = item.owner;
  return content;
}

// web/preview/drawing-stroke-source-content.mjs
function drawingStrokeSourceContent(editor, section, node) {
  try {
    if (typeof editor.drawingStrokeSource !== "function")
      throw new Error("HwpxDrawingStrokeSourceAbiUnavailable");
    const value = editor.drawingStrokeSource(section, node);
    if (value.sourceOnly !== true || value.node !== node)
      throw new Error("DrawingStrokeSourceBindingMismatch");
    return { source: value, error: null };
  } catch (error) {
    return { source: null, error: error.message };
  }
}

// web/preview/arrow-reference-dimensions.mjs
var levels = ["SMALL", "MEDIUM", "LARGE"];
function arrowReferenceDimensions(strokeWidth, lineLength, size) {
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0 || !Number.isFinite(lineLength) || lineLength <= 0 || typeof size !== "string")
    return null;
  const parts = size.split("_");
  if (parts.length !== 2)
    return null;
  const width = levels.indexOf(parts[0]), length = levels.indexOf(parts[1]);
  if (width < 0 || length < 0)
    return null;
  const height = Math.max(strokeWidth * [1.5, 2.5, 3.5][width], 3);
  const extent = Math.min(height * [1, 1.5, 2][length], lineLength * 0.3);
  if (!Number.isFinite(height) || !Number.isFinite(extent) || extent <= 0)
    return null;
  return { length: extent, width: height, policy: "rhwp_reference" };
}

// web/preview/decorated-line-plan.mjs
function decoratedLinePlan(geometry, source) {
  const attr = source?.attributes;
  const fail = (error) => ({ state: "unavailable", error });
  if (!geometry || !source || source.sourceOnly !== true || geometry.node !== source.node || !attr)
    return fail("LineSourceBindingMismatch");
  if (attr.style !== "SOLID" || attr.endCap !== "FLAT" || attr.outlineStyle !== "NORMAL" || attr.alpha !== "0")
    return fail("UnsupportedDecoratedLineStyle");
  if (typeof attr.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(attr.color) || typeof attr.width !== "string" || !/^\+?[0-9]+$/.test(attr.width.trim()))
    return fail("InvalidDecoratedLineStroke");
  const rawWidth = Number(attr.width);
  if (!Number.isSafeInteger(rawWidth) || rawWidth <= 0 || rawWidth > 4294967295)
    return fail("UnsupportedDecoratedLineWidth");
  if (!Array.isArray(geometry.endpoints) || geometry.endpoints.length !== 2 || !geometry.endpoints.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))
    return fail("InvalidDecoratedLineEndpoints");
  const endpoints = geometry.endpoints.map((p) => p.map(hwpUnitPixels));
  const length = Math.hypot(endpoints[1][0] - endpoints[0][0], endpoints[1][1] - endpoints[0][1]);
  if (!Number.isFinite(length) || length <= 0)
    return fail("DegenerateDecoratedLine");
  const width = hwpUnitPixels(rawWidth), arrows = [];
  for (const [side, index] of [
    ["head", 0],
    ["tail", 1]
  ]) {
    const style = attr[`${side}Style`];
    if (style === "NORMAL")
      continue;
    if (!["ARROW", "SPEAR"].includes(style))
      return fail("UnsupportedArrowStyle");
    const rawFill = attr[`${side}fill`];
    if (!["0", "1", "false", "true"].includes(rawFill))
      return fail("UnsupportedArrowFill");
    const dimensions = arrowReferenceDimensions(width, length, attr[`${side}Sz`]);
    if (!dimensions)
      return fail("UnsupportedArrowSize");
    arrows.push({
      style,
      tip: endpoints[index],
      direction: [
        endpoints[index][0] - endpoints[1 - index][0],
        endpoints[index][1] - endpoints[1 - index][1]
      ],
      length: dimensions.length,
      width: dimensions.width,
      fill: rawFill === "1" || rawFill === "true"
    });
  }
  return {
    state: "planned",
    policy: "rhwp_reference",
    endpoints,
    color: parseInt(attr.color.slice(1), 16),
    strokeWidth: width,
    arrows
  };
}

// web/preview/hwpx-line-content.mjs
function attachHwpxLines(editor, content) {
  content.lines = [];
  content.lineErrors = [];
  const displayed = content.window ? new Set(content.paragraphs.map((paragraph) => `${paragraph.section}:${paragraph.paragraph}`)) : null;
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    let nodes;
    try {
      if (typeof editor.lineNodes !== "function")
        throw new Error("HwpxLineDisplayAbiUnavailable");
      nodes = editor.lineNodes(section);
    } catch (error) {
      content.lineErrors.push({ section, error: error.message });
      continue;
    }
    let batch;
    if (typeof editor.lineDisplayBatch === "function") {
      batch = new Map;
      const limit = editor.lineDisplayBatchMaxNodes ?? Math.max(1, nodes.length);
      if (!Number.isInteger(limit) || limit < 1) {
        for (const node of nodes)
          batch.set(node, { node, error: "InvalidLineDisplayBatchLimit" });
      } else
        for (let start = 0;start < nodes.length; start += limit) {
          const selected = nodes.slice(start, start + limit);
          try {
            for (const entry of editor.lineDisplayBatch(section, selected))
              batch.set(entry.node, entry);
          } catch (error) {
            for (const node of selected)
              batch.set(node, { node, error: error.message });
          }
        }
    }
    for (const lineNode of nodes) {
      const entry = batch?.get(lineNode);
      try {
        if (batch && !entry)
          throw new Error("MissingLineDisplayBatchNode");
        if (entry?.error || entry?.displayError)
          throw new Error(entry.error || entry.displayError);
        if (typeof editor.lineDisplay !== "function")
          throw new Error("HwpxLineDisplayAbiUnavailable");
        const snapshot = entry ? entry.display : editor.lineDisplay(section, lineNode);
        if (displayed && !displayed.has(`${section}:${snapshot.paragraph - 1}`))
          continue;
        const row = {
          ...snapshot,
          section,
          paragraph: snapshot.paragraph - 1,
          state: "located",
          error: null,
          placement: null,
          placementError: null
        };
        try {
          if (typeof editor.linePlacement !== "function")
            throw new Error("HwpxLinePlacementAbiUnavailable");
          row.placement = editor.linePlacement(section, lineNode);
        } catch (error) {
          row.placementError = error.message;
        }
        const raw = drawingStrokeSourceContent(editor, section, lineNode);
        row.sourceStroke = raw.source;
        row.sourceStrokeError = raw.error;
        content.lines.push(row);
      } catch (error) {
        const raw = drawingStrokeSourceContent(editor, section, lineNode);
        let geometry = null, geometryError = null;
        try {
          if (batch && !entry?.geometry)
            throw new Error(entry?.error || "MissingLineDisplayBatchGeometry");
          if (!batch && typeof editor.lineGeometry !== "function")
            throw new Error("HwpxLineGeometryAbiUnavailable");
          const value = entry ? entry.geometry : editor.lineGeometry(section, lineNode);
          if (value.current !== true || value.paintable !== false || value.coordinateSpace !== "renderingInfo" || value.geometry?.node !== lineNode || !Number.isInteger(value.geometry.paragraph) || value.geometry.paragraph < 1)
            throw new Error("LineGeometryBindingMismatch");
          geometry = value.geometry;
          if (displayed && !displayed.has(`${section}:${geometry.paragraph - 1}`))
            continue;
        } catch (queryError) {
          geometryError = queryError.message;
        }
        const row = {
          section,
          lineNode,
          paragraph: geometry ? geometry.paragraph - 1 : null,
          anchorNode: geometry?.anchor_node ?? null,
          anchorUnit: geometry?.anchor_unit ?? null,
          endpoints: null,
          geometry,
          geometryError,
          sourceStroke: raw.source,
          sourceStrokeError: raw.error,
          state: "unavailable",
          error: error.message
        };
        if (error.message === "UnsupportedLineStrokeDecoration" && geometry && raw.source) {
          const plan = decoratedLinePlan(geometry, raw.source);
          if (plan.state === "planned") {
            try {
              if (typeof editor.linePlacement !== "function")
                throw new Error("HwpxLinePlacementAbiUnavailable");
              row.placement = editor.linePlacement(section, lineNode);
              row.referencePlan = plan;
              row.endpoints = geometry.endpoints;
              row.state = "reference_located";
              row.nativeDisplayError = error.message;
              row.error = null;
            } catch (placementError) {
              row.placementError = placementError.message;
            }
          } else
            row.referencePlanError = plan.error;
        }
        content.lines.push(row);
      }
    }
  }
  return content;
}

// web/preview/connector-reference-path.mjs
function connectorReferencePath(source, rendering) {
  const fail = (error) => ({ state: "unavailable", error });
  if (source?.sourceOnly !== true || rendering?.sourceOnly !== true || source.node !== rendering.node || rendering.coordinateSpace !== "renderingInfo")
    return fail("ConnectorPathBindingMismatch");
  const raw = source.geometry;
  if (!raw || !["STRAIGHT_NOARROW", "STRAIGHT_ONEWAY", "STRAIGHT_BOTH"].includes(raw.raw_type))
    return fail("UnsupportedConnectorPathType");
  let points;
  if (!raw.controls_present && raw.controls?.length === 0)
    points = rendering.endpoints;
  else if (raw.controls?.length === 2 && raw.controls[0].control_type === "3" && raw.controls[1].control_type === "26" && rendering.controls?.length === 2)
    points = rendering.controls;
  else
    return fail("UnsupportedConnectorControlPath");
  if (!Array.isArray(points) || points.length !== 2 || !points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))
    return fail("InvalidConnectorPathPoints");
  return { state: "planned", policy: "rhwp_reference", endpoints: points.map((p) => p.slice()) };
}

// web/preview/connector-reference-content.mjs
function connectorReferenceContent(editor, section, node, source, stroke, owner) {
  try {
    for (const point of [source.geometry.start, source.geometry.end]) {
      if (!point || point.subject_id_ref !== "0")
        throw new Error("UnresolvedConnectorSubject");
    }
    if (!stroke)
      throw new Error("ConnectorStrokeUnavailable");
    const head = stroke.attributes?.headStyle, tail = stroke.attributes?.tailStyle;
    const type = source.geometry.raw_type;
    if (type === "STRAIGHT_NOARROW" && (head !== "NORMAL" || tail !== "NORMAL") || type === "STRAIGHT_ONEWAY" && (head !== "NORMAL" || tail !== "ARROW") || type === "STRAIGHT_BOTH" && (head !== "ARROW" || tail !== "ARROW"))
      throw new Error("ConnectorArrowTypeMismatch");
    if (typeof editor.connectorRenderingSource !== "function")
      throw new Error("HwpxConnectorRenderingSourceAbiUnavailable");
    if (typeof editor.connectorPlacementSource !== "function")
      throw new Error("HwpxConnectorPlacementSourceAbiUnavailable");
    const path = connectorReferencePath(source, editor.connectorRenderingSource(section, node));
    if (path.state !== "planned")
      throw new Error(path.error);
    const plan = decoratedLinePlan({ node, endpoints: path.endpoints }, stroke);
    if (plan.state !== "planned")
      throw new Error(plan.error);
    const placement = editor.connectorPlacementSource(section, node);
    return {
      line: {
        section,
        lineNode: node,
        connectorNode: node,
        paragraph: owner.paragraph - 1,
        anchorNode: owner.anchor_node,
        anchorUnit: owner.anchor_unit,
        endpoints: path.endpoints,
        placement,
        referencePlan: plan,
        state: "reference_located",
        error: null
      },
      error: null
    };
  } catch (error) {
    return { line: null, error: error.message };
  }
}

// web/preview/hwpx-connector-content.mjs
function attachHwpxConnectors(editor, content) {
  content.connectors = [];
  content.connectorErrors = [];
  const visible = content.window ? new Set(content.paragraphs.map((row) => `${row.section}:${row.paragraph}`)) : null;
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    let nodes;
    try {
      if (typeof editor.connectorNodes !== "function")
        throw new Error("HwpxConnectorSourceAbiUnavailable");
      nodes = editor.connectorNodes(section);
    } catch (error) {
      content.connectorErrors.push({ section, error: error.message });
      continue;
    }
    for (const node of nodes) {
      try {
        if (typeof editor.connectorOwner !== "function")
          throw new Error("HwpxConnectorOwnerAbiUnavailable");
        const owner = editor.connectorOwner(section, node);
        if (owner.current !== true || owner.node !== node || !Number.isInteger(owner.paragraph) || owner.paragraph < 1)
          throw new Error("ConnectorOwnerBindingMismatch");
        const paragraph = owner.paragraph - 1;
        if (visible && !visible.has(`${section}:${paragraph}`))
          continue;
        if (typeof editor.connectorGeometrySource !== "function")
          throw new Error("HwpxConnectorSourceAbiUnavailable");
        const source = editor.connectorGeometrySource(section, node);
        if (source.sourceOnly !== true || source.node !== node)
          throw new Error("ConnectorSourceBindingMismatch");
        const rawStroke = drawingStrokeSourceContent(editor, section, node);
        const { source: stroke, error: strokeError } = rawStroke;
        const reference = connectorReferenceContent(editor, section, node, source, stroke, owner);
        content.connectors.push({
          section,
          node,
          paragraph,
          anchorNode: owner.anchor_node,
          anchorUnit: owner.anchor_unit,
          geometry: source.geometry,
          stroke,
          strokeError,
          referenceLine: reference.line,
          referenceError: reference.error,
          state: "source_only",
          renderable: false,
          error: null
        });
      } catch (error) {
        content.connectors.push({
          section,
          node,
          paragraph: null,
          anchorNode: null,
          anchorUnit: null,
          geometry: null,
          stroke: null,
          strokeError: null,
          state: "unavailable",
          renderable: false,
          error: error.message
        });
      }
    }
  }
  return content;
}

// js/hwp5-drawing-line-endpoints.mjs
function validateHwp5DrawingLineEndpoints(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const pair = (value, valid) => Array.isArray(value) && value.length === 2 && Array.from(value).every((point) => Array.isArray(point) && point.length === 2 && Array.from(point).every(valid));
  const components = new Set, lines = new Set;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5DrawingLineEndpoints");
  for (const row of rows) {
    if (!row || ![row.component_node, row.owner_node, row.line_node, row.attributes, row.extra_bytes].every(uint) || row.owner_node >= row.component_node || row.component_node >= row.line_node || row.attributes > 65535 || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero || !pair(row.points, Number.isFinite) || !pair(row.raw_points, (value) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) || components.has(row.component_node) || lines.has(row.line_node))
      throw new Error("InvalidHwp5DrawingLineEndpoints");
    components.add(row.component_node);
    lines.add(row.line_node);
  }
  return rows;
}
function decodeHwp5DrawingLineEndpoints(bytes) {
  return validateHwp5DrawingLineEndpoints(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// js/hwp5-drawing-style-sources.mjs
function drawingStyleLayoutArgs(options) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => !["border", "tail"].includes(key)))
    throw new Error("InvalidDrawingStyleLayout");
  const border = ["spec11", "observed13"].indexOf(options.border);
  const tail = ["fill_only", "alpha_shadow", "alpha_shadow_metadata"].indexOf(options.tail);
  if (border < 0 || tail < 0)
    throw new Error("InvalidDrawingStyleLayout");
  return [border, tail];
}
function validateHwp5DrawingStyleSources(rows) {
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const uint = (value) => integer(value, 0, 4294967295);
  const byte = (value) => integer(value, 0, 255);
  const signed = (value) => integer(value, -2147483648, 2147483647);
  const optional = (value, check) => value === null || check(value);
  const fail = () => {
    throw new Error("InvalidHwp5DrawingStyleSources");
  };
  if (!Array.isArray(rows))
    fail();
  const seen = new Set;
  for (const row of rows) {
    const b = row?.border;
    if (!row || !uint(row.component_node) || !uint(row.owner_node) || row.owner_node >= row.component_node || seen.has(row.component_node) || !b || !uint(b.color) || !signed(b.width) || !uint(b.attributes?.raw) || !byte(b.outline) || !uint(row.fill_flags) || typeof row.fill_known !== "boolean" || !uint(row.extra_bytes))
      fail();
    seen.add(row.component_node);
    if (row.fill_known !== ((row.fill_flags & ~7) === 0))
      fail();
    const { pattern, image } = row;
    if (!optional(pattern, (p) => p && uint(p.background) && uint(p.foreground) && signed(p.kind)) || !optional(row.gradient_colors, uint) || !optional(row.additional_bytes, uint) || !optional(image, (p) => p && byte(p.mode) && p.picture && integer(p.picture.contrast, -128, 127) && integer(p.picture.brightness, -128, 127) && byte(p.picture.effect) && integer(p.picture.bin_data_id, 0, 65535)))
      fail();
    if (row.fill_known) {
      if (pattern !== null !== !!(row.fill_flags & 1) || image !== null !== !!(row.fill_flags & 2) || row.gradient_colors !== null !== !!(row.fill_flags & 4) || row.additional_bytes === null)
        fail();
    } else if ([
      pattern,
      image,
      row.gradient_colors,
      row.additional_bytes,
      row.alpha,
      row.shadow,
      row.metadata
    ].some((v) => v !== null))
      fail();
    if (row.alpha === null !== (row.shadow === null))
      fail();
    if (Object.hasOwn(row, "gradient")) {
      const g = row.gradient;
      if (g === null ? row.gradient_colors !== null : !g || !row.fill_known || !(row.fill_flags & 4) || !byte(g.kind) || !["angle", "center_x", "center_y", "blur"].every((key) => uint(g[key])) || !optional(g.blur_center, byte) || !Array.isArray(g.colors) || g.colors.length !== row.gradient_colors || !Array.from(g.colors).every(uint) || !Array.isArray(g.positions) || g.positions.length !== (g.colors.length > 2 ? g.colors.length : 0) || !Array.from(g.positions).every(signed))
        fail();
    }
    if (row.alpha !== null) {
      const alpha = row.alpha;
      if (!alpha)
        fail();
      for (const [key, mask] of [
        ["pattern", 1],
        ["gradient", 4],
        ["image", 2]
      ]) {
        if (!optional(alpha[key], byte) || alpha[key] !== null !== !!(row.fill_flags & mask))
          fail();
      }
      const s = row.shadow;
      if (!s || !uint(s.kind) || !uint(s.color) || !signed(s.offset_x) || !signed(s.offset_y))
        fail();
    }
    if (!optional(row.metadata, (m) => m && uint(m.instance_id) && byte(m.reserved) && byte(m.shadow_alpha)) || row.metadata !== null && row.shadow === null)
      fail();
  }
  return rows;
}
function decodeHwp5DrawingStyleSources(bytes) {
  return validateHwp5DrawingStyleSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/hwp5-drawing-paint-tail.mjs
function hwp5DrawingPaintTail(style) {
  if (!style?.fill_known)
    return { state: "unavailable", error: "UnselectedHwp5DrawingPaintTail" };
  if (style.alpha === null || style.shadow === null || style.metadata === null) {
    const absent = style.fileVersion === 83886343 && style.tailLayout === "fill_only" && style.borderLayout === "observed13" && style.alpha === null && style.shadow === null && style.metadata === null && style.extra_bytes === 0 && style.fill_flags === 0 && style.additional_bytes === 0;
    return absent ? { state: "selected", policy: "observed-absent-empty-fill", shadowType: 0 } : { state: "unavailable", error: "UnselectedHwp5DrawingPaintTail" };
  }
  if (style.extra_bytes !== 0 || style.metadata.reserved !== 0 || style.shadow.kind !== 0)
    return { state: "unavailable", error: "UnsupportedHwp5DrawingPaintTail" };
  return { state: "selected", policy: "selected-tail", shadowType: style.shadow.kind };
}

// js/hwp5-drawing-sources.mjs
function validateHwp5DrawingSources(rows) {
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5DrawingSources");
  const controls = new Set, components = new Set;
  for (const row of rows) {
    if (!row || ![
      "control_node",
      "component_node",
      "paragraph_node",
      "kind_id",
      "flags",
      "width",
      "height",
      "instance_id",
      "original_width",
      "original_height",
      "current_width",
      "current_height",
      "component_attributes",
      "matrix_pairs",
      "component_extra_bytes"
    ].every((key) => integer(row[key], 0, 4294967295)) || !["offset_x", "offset_y", "component_offset_x", "component_offset_y"].every((key) => integer(row[key], -2147483648, 2147483647)) || !integer(row.rotation_angle, -32768, 32767) || row.matrix_pairs > 65535 || !(row.paragraph_node < row.control_node && row.control_node < row.component_node) || controls.has(row.control_node) || components.has(row.component_node))
      throw new Error("InvalidHwp5DrawingSources");
    controls.add(row.control_node);
    components.add(row.component_node);
    const keys = [
      "z_order",
      "outer_margins",
      "prevent_page_break",
      "description_bytes",
      "object_extra_bytes"
    ];
    if (keys.some((key) => Object.hasOwn(row, key))) {
      if (!integer(row.z_order, -2147483648, 2147483647) || !integer(row.prevent_page_break, -2147483648, 2147483647) || !Array.isArray(row.outer_margins) || row.outer_margins.length !== 4 || !Array.from(row.outer_margins).every((value) => integer(value, -32768, 32767)) || row.description_bytes !== null && (!integer(row.description_bytes, 0, 131070) || row.description_bytes % 2 !== 0) || !integer(row.object_extra_bytes, 0, 4294967295))
        throw new Error("InvalidHwp5DrawingSources");
    }
  }
  return rows;
}
function decodeHwp5DrawingSources(bytes) {
  return validateHwp5DrawingSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/hwp5-drawing-object-extension.mjs
var version = 83951872;
var uint19 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
function hasObservedDrawingObjectExtension(source) {
  const proof = source?.observedObjectExtension;
  return source?.object_extra_bytes === 2 && proof?.fileVersion === version && proof.extraBytes === 2 && proof.extraHex === "0000" && uint19(source.control_node) && uint19(source.paragraph_node) && proof.controlNode === source.control_node && proof.paragraphNode === source.paragraph_node;
}
function withObservedDrawingObjectExtensions(editor, sources, section) {
  if (!sources.some((source) => source.object_extra_bytes === 2) || editor.fileVersion() !== version)
    return sources;
  if (!uint19(section))
    throw new Error("InvalidDrawingObjectExtensionSection");
  const extras = editor.drawingObjectExtras(section);
  if (!Array.isArray(extras) || extras.length !== sources.length)
    throw new Error("MismatchedDrawingObjectExtensionSources");
  const byControl = new Map(extras.map((row) => [row?.control_node, row]));
  if (byControl.size !== extras.length)
    throw new Error("AmbiguousDrawingObjectExtensionSources");
  const prepared = [];
  for (const source of sources) {
    const row = byControl.get(source.control_node);
    if (!row || row.paragraph_node !== source.paragraph_node || row.extra_bytes !== source.object_extra_bytes || typeof row.extra_hex !== "string" || row.extra_hex.length !== row.extra_bytes * 2 || !/^[0-9a-f]*$/.test(row.extra_hex))
      throw new Error("MismatchedDrawingObjectExtensionSources");
    prepared.push(source.object_extra_bytes === 2 && row.extra_hex === "0000" ? {
      ...source,
      observedObjectExtension: {
        fileVersion: version,
        controlNode: row.control_node,
        paragraphNode: row.paragraph_node,
        extraBytes: row.extra_bytes,
        extraHex: row.extra_hex
      }
    } : source);
  }
  return prepared;
}

// web/preview/hwp5-drawing-geometry.mjs
function hwp5DrawingGeometry(source) {
  validateHwp5DrawingSources([source]);
  if (source.object_extra_bytes !== 0 && !hasObservedDrawingObjectExtension(source) || !Array.isArray(source.outer_margins))
    throw new Error("UnsupportedHwp5DrawingObjectExtension");
  const flags = hwp5ObjectFlags(source.flags);
  return {
    size_protected: flags.size_protected,
    geometry: {
      width: source.width,
      height: source.height,
      width_relative: flags.width_relative,
      height_relative: flags.height_relative,
      treat_as_character: flags.treat_as_character,
      horizontal_offset: source.offset_x,
      vertical_offset: source.offset_y
    },
    position: {
      relations: [
        flags.vertical_relative,
        flags.horizontal_relative,
        flags.vertical_alignment,
        flags.horizontal_alignment
      ],
      flags: [
        flags.affect_line_spacing,
        flags.flow_with_text,
        flags.allow_overlap,
        flags.hold_anchor
      ]
    },
    flow: {
      text_wrap: flags.text_wrap,
      text_flow: flags.text_flow,
      z_order: source.z_order,
      outside_margins: [...source.outer_margins]
    },
    text_wrap: flags.text_wrap,
    text_flow: flags.text_flow,
    flow_with_text: flags.flow_with_text,
    allow_overlap: flags.allow_overlap,
    affect_line_spacing: flags.affect_line_spacing,
    hold_anchor: flags.hold_anchor,
    has_caption: flags.has_caption,
    out_margin: [...source.outer_margins],
    z_order: source.z_order
  };
}
function attachHwp5DrawingGeometry(content) {
  content.hwp5DrawingGeometry = [];
  content.hwp5DrawingGeometryErrors = [];
  for (const section of new Set((content.hwp5Drawings ?? []).map((row) => row.section))) {
    try {
      const prepared = content.hwp5Drawings.filter((row) => row.section === section).map((row) => ({
        section,
        controlNode: row.controlNode,
        componentNode: row.componentNode,
        source: hwp5DrawingGeometry(row.source)
      }));
      content.hwp5DrawingGeometry.push(...prepared);
    } catch (error) {
      content.hwp5DrawingGeometryErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/stroke-dash-pattern.mjs
var patterns = Object.freeze([
  null,
  ...[[], [2, 2], [6, 3], [6, 3, 2, 3], [6, 3, 2, 3, 2, 3]].map(Object.freeze)
]);
function strokeDashPattern(style) {
  return Number.isInteger(style) && style >= 1 && style < patterns.length ? patterns[style] : null;
}

// web/preview/colorref-css.mjs
function colorrefCss(raw) {
  return Number.isInteger(raw) && raw >= 0 && raw <= 16777215 ? `#${[raw & 255, raw >>> 8 & 255, raw >>> 16 & 255].map((value) => value.toString(16).padStart(2, "0")).join("")}` : null;
}

// web/preview/hwp5-stroke-display.mjs
function hwp5StrokeDisplay(border) {
  const raw = border?.attributes?.raw, width = border?.width, color = border?.color;
  if (!Number.isInteger(raw) || raw < 0 || raw > 4294967295 || !Number.isInteger(width) || width < -2147483648 || width > 2147483647 || !Number.isInteger(color) || color < 0 || color > 4294967295)
    return null;
  const kind = raw & 63, css = colorrefCss(color);
  if (kind > 5 || kind !== 0 && (width <= 0 || css === null))
    return null;
  return {
    color: css === null ? color : Number.parseInt(css.slice(1), 16),
    width,
    style: kind === 2 ? 3 : kind === 3 ? 2 : kind
  };
}

// web/preview/hwp5-line-content.mjs
function attachHwp5Lines(editor, content) {
  content.lines = [];
  content.lineErrors = [];
  if (!editor)
    return content;
  const groupBindings = content.hwp5GroupGeometry?.state === "projected" ? content.hwp5GroupGeometry.lineBindings ?? [] : [];
  for (const section of new Set([
    ...(content.hwp5Drawings ?? []).filter((row) => row.source.kind_id === 611084654).map((row) => row.section),
    ...groupBindings.map((row) => row.section)
  ])) {
    try {
      if (content.hwp5DrawingErrors?.some((row) => row.section === section) || content.hwp5DrawingStyleErrors?.some((row) => row.section === section))
        throw new Error("IncompleteHwp5LineSources");
      if (typeof editor.drawingLineEndpoints !== "function")
        throw new Error("Hwp5DrawingLineEndpointsAbiUnavailable");
      const endpoints = validateHwp5DrawingLineEndpoints(editor.drawingLineEndpoints(section));
      const prepared = [];
      const roots = content.hwp5Drawings.filter((row) => row.section === section && row.source.kind_id === 611084654).map((root) => ({ root, group: null }));
      for (const group of groupBindings.filter((row) => row.section === section)) {
        if (group.component?.component_node !== group.lineNode || group.component.owner_node !== group.parentContainer || group.component.kind_id !== 611084654 || group.component.second_id !== null)
          throw new Error("Hwp5GroupedLineBindingMismatch");
        const anchors = content.hwp5Drawings.filter((row) => row.section === section && row.componentNode === group.rootAnchor && row.source.kind_id === 610496366);
        if (anchors.length !== 1 || group.parentContainer !== group.rootAnchor || group.hostParagraph !== anchors[0].hostParagraph || group.anchorUnit !== anchors[0].anchorUnit)
          throw new Error("UnsupportedHwp5GroupedLineOwner");
        roots.push({ root: anchors[0], group });
      }
      for (const { root, group } of roots) {
        if (root.source.component_node !== root.componentNode || root.source.control_node !== root.controlNode)
          throw new Error("Hwp5LineOwnerMismatch");
        const componentNode = group?.lineNode ?? root.componentNode, ownerNode = group?.parentContainer ?? root.controlNode;
        const matches = endpoints.filter((row) => row.component_node === componentNode && row.owner_node === ownerNode);
        const styles = (content.hwp5DrawingStyles ?? []).filter((row) => row.section === section && row.component_node === componentNode && row.owner_node === ownerNode);
        if (matches.length !== 1 || styles.length !== 1)
          throw new Error("MissingHwp5LineSource");
        const endpoint = matches[0], style = styles[0];
        validateHwp5DrawingStyleSources([style]);
        const tail = hwp5DrawingPaintTail(style), attributes = style.border.attributes.raw, stroke = hwp5StrokeDisplay(style.border);
        if (endpoint.attributes !== 0 || endpoint.extra_nonzero || ![0, 2].includes(endpoint.extra_bytes) || (group ? group.component.attributes !== 0 || group.component.rotation_angle !== 0 : root.source.component_attributes !== 0) || ![83886848, 83951617, 83951872].includes(style.fileVersion) || style.tailLayout !== "alpha_shadow_metadata" || style.borderLayout !== "observed13" || tail.state !== "selected" || style.fill_flags !== 0 || style.additional_bytes !== 0 || style.metadata?.shadow_alpha !== 0 || !stroke || !strokeDashPattern(stroke.style) || (attributes >>> 6 & 15) !== 1 || (attributes >>> 10 & 63) !== 0 || (attributes >>> 16 & 63) !== 0 || style.border.outline !== 0)
          throw new Error("UnsupportedHwp5LinePaint");
        const source = hwp5DrawingGeometry(root.source), g = source.geometry;
        if (source.has_caption)
          throw new Error("UnsupportedHwp5LineCaption");
        const paragraph = content.paragraphs.filter((row) => row.section === section && row.paragraph === root.hostParagraph);
        if (paragraph.length !== 1 || paragraph[0].clipped || paragraph[0].text[root.anchorUnit] !== "￼")
          throw new Error("MissingHwp5LineAnchor");
        prepared.push({
          section,
          lineNode: endpoint.line_node,
          anchorNode: componentNode,
          paragraph: root.hostParagraph,
          ...group ? {
            groupContext: {
              rootAnchor: group.rootAnchor,
              parentContainer: group.parentContainer
            }
          } : {},
          anchorUnit: root.anchorUnit,
          state: "located",
          error: null,
          placementError: null,
          endpoints: endpoint.points.map((point) => [...point]),
          rawSource: endpoint,
          stroke,
          placement: {
            geometry: {
              width: g.width,
              height: g.height,
              widthRelative: g.width_relative,
              heightRelative: g.height_relative,
              treatAsCharacter: g.treat_as_character,
              horizontalOffset: g.horizontal_offset,
              verticalOffset: g.vertical_offset
            },
            position: source.position,
            flow: {
              textWrap: source.text_wrap,
              zOrder: source.z_order,
              outsideMargins: [...source.out_margin]
            }
          }
        });
      }
      if (new Set(prepared.map((row) => row.anchorNode)).size !== roots.length)
        throw new Error("AmbiguousHwp5LineSource");
      content.lines.push(...prepared);
    } catch (error) {
      content.lineErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/table-geometry-failure-evidence.mjs
function tableGeometryFailureEvidence(table, diagnostics = []) {
  if (!table || !Array.isArray(diagnostics))
    return {};
  const matches = diagnostics.filter((row) => row?.section === table.section && row?.tableNode === table.tableNode);
  if (matches.length !== 1)
    return {};
  const row = matches[0], evidence = {};
  if (typeof row.error === "string")
    evidence.sourceError = row.error.slice(0, 256);
  for (const key of ["rawTableFlags", "unknownTableFlags"])
    if (Number.isInteger(row[key]) && row[key] >= 0 && row[key] <= 4294967295)
      evidence[key] = row[key];
  return evidence;
}

// web/preview/mixed-inline-table-policy.mjs
function mixedInlineTablePolicy(table, { whole = false, captions = false, diagnostics = [] } = {}) {
  const reasons = [];
  if (table.parentTableNode !== null)
    reasons.push("NestedTable");
  if (typeof table.sourceGeometry?.geometry?.treat_as_character !== "boolean")
    reasons.push("MissingTableGeometry");
  else if (table.sourceGeometry.geometry.treat_as_character !== true)
    reasons.push("FloatingTable");
  if (table.sourceCaption && !(whole === true && captions === true))
    reasons.push("TableCaption");
  if (!table.pagination)
    reasons.push("MissingTablePagination");
  else {
    if (!["cell", "none"].includes(table.pagination.page_break) && !(whole && table.pagination.page_break === "table"))
      reasons.push("TablePageBreak");
    if (table.pagination.cell_spacing !== 0)
      reasons.push("TableCellSpacing");
  }
  if (table.cells?.some((cell) => cell.sourceMargin?.header !== false))
    reasons.push("TableHeaderCell");
  return reasons.length ? {
    state: "unavailable",
    error: "UnsupportedMixedInlineTable",
    section: table.section,
    tableNode: table.tableNode,
    reasons,
    ...reasons.includes("MissingTableGeometry") ? tableGeometryFailureEvidence(table, diagnostics) : {}
  } : { state: "supported" };
}

// web/preview/note-source-table-owners.mjs
function selectNoteSourceTables(content, { floatingNotes = false } = {}) {
  const fail = (error) => ({ state: "unavailable", error });
  if (!content || typeof content !== "object")
    return fail("InvalidNoteSourceBodyTables");
  if (typeof floatingNotes !== "boolean")
    return fail("InvalidNoteSourceBodyTables");
  const tables = content.tables ?? [], cells = new Set, bodyCells = new Set, noteCells = new Set;
  const bodyTables = [], noteTables = [], noteTablesByNote = new Map;
  const selected = () => ({
    state: "selected",
    cellParagraphs: cells,
    bodyCellParagraphs: bodyCells,
    noteCellParagraphs: noteCells,
    bodyTables,
    noteTables,
    noteTablesByNote,
    hasTables: tables.length > 0
  });
  if (!Array.isArray(tables))
    return fail("InvalidNoteSourceBodyTables");
  if (!tables.length)
    return selected();
  if (!["hwpx", "hwp5"].includes(content.format) || !Array.isArray(content.paragraphs) || !Array.isArray(content.paragraphFlows) || content.pageSettings?.length !== 1)
    return fail("UnsupportedNoteSourceBodyTables");
  const section = content.pageSettings[0]?.section_ordinal;
  if (!Number.isSafeInteger(section) || section < 0)
    return fail("InvalidNoteSourceBodyTables");
  const group = (rows) => {
    const result = new Map;
    for (const row of rows) {
      if (!row || !Number.isSafeInteger(row.section) || row.section < 0 || !Number.isSafeInteger(row.paragraph) || row.paragraph < 0)
        return null;
      const key = `${row.section}:${row.paragraph}`, matches = result.get(key) ?? [];
      matches.push(row);
      result.set(key, matches);
    }
    return result;
  };
  const paragraphs = group(content.paragraphs), flows = group(content.paragraphFlows), tableIds = new Set;
  if (!paragraphs || !flows)
    return fail("InvalidNoteSourceBodyTables");
  for (const table of tables) {
    if (!table || table.section !== section || !Number.isSafeInteger(table.tableNode) || table.tableNode < 0 || tableIds.has(table.tableNode) || !Array.isArray(table.cells) || !table.cells.length || table.cells.some((cell) => !cell))
      return fail("InvalidNoteSourceBodyTables");
    tableIds.add(table.tableNode);
    const hosts = flows.get(`${section}:${table.hostParagraph}`) ?? [];
    const policy = mixedInlineTablePolicy(table, {
      whole: true,
      diagnostics: content.tableGeometryErrors
    });
    const floatingNote = floatingNotes && policy.reasons?.length === 1 && policy.reasons[0] === "FloatingTable" && hosts.length === 1 && ["footnote", "endnote"].includes(hosts[0].host);
    if (policy.state !== "supported" && !floatingNote) {
      const host = hosts.length === 1 ? hosts[0] : null, context = host?.note_context;
      return {
        ...policy,
        ...["footnote", "endnote"].includes(host?.host) && host.top_level === false && context?.kind === host.host && Number.isSafeInteger(context.note_node) && context.note_node >= 0 && Number.isSafeInteger(context.list_node) && context.list_node >= 0 ? {
          noteKind: context.kind,
          noteNode: context.note_node,
          noteListNode: context.list_node,
          hostParagraph: table.hostParagraph
        } : {}
      };
    }
    if (hosts.length !== 1)
      return fail("UnsupportedNoteSourceTableOwner");
    const host = hosts[0], body = host.host === "body";
    if (body ? host.top_level !== true : !["footnote", "endnote"].includes(host.host) || host.top_level !== false || host.note_context?.kind !== host.host || !Number.isSafeInteger(host.note_context.note_node) || host.note_context.note_node < 0 || !Number.isSafeInteger(host.note_context.list_node) || host.note_context.list_node < 0)
      return fail("UnsupportedNoteSourceTableOwner");
    (body ? bodyTables : noteTables).push(table);
    if (!body) {
      const key = `${section}:${host.note_context.note_node}`, group = noteTablesByNote.get(key) ?? [];
      group.push(table);
      noteTablesByNote.set(key, group);
    }
    for (const cell of table.cells) {
      if (!cell || !Array.isArray(cell.paragraphs) || !cell.paragraphs.length)
        return fail("InvalidNoteSourceBodyTables");
      for (const paragraph of cell.paragraphs) {
        const owners = paragraphs.get(`${section}:${paragraph}`) ?? [];
        const cellFlows = flows.get(`${section}:${paragraph}`) ?? [];
        if (cells.has(paragraph) || owners.length !== 1 || owners[0].tableCell?.tableNode !== table.tableNode || owners[0].tableCell?.listNode !== cell.listNode || cellFlows.length !== 1 || cellFlows[0].host !== (content.format === "hwp5" ? "table_cell" : body ? "other" : host.host) || cellFlows[0].top_level !== false || cellFlows[0].note_context != null)
          return fail("InvalidNoteSourceTableCellOwner");
        cells.add(paragraph);
        (body ? bodyCells : noteCells).add(paragraph);
      }
    }
  }
  return selected();
}

// web/preview/drawing-column-context.mjs
function drawingColumnContext(drawing, paragraphs, flows) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (!drawing?.source || !Array.isArray(paragraphs) || !Array.isArray(flows))
    return unavailable("InvalidDrawingColumnContext");
  const members = paragraphs.filter((p) => p.section === drawing.section && p.drawingText?.drawingNode === drawing.drawingNode);
  if (drawing.source.text === null)
    return members.length ? unavailable("DrawingTextDisplayBindingMismatch") : { state: "selected", source: "no-text-list", declaration: null };
  if (!drawing.source.text)
    return unavailable("InvalidDrawingColumnContext");
  if (!members.length)
    return unavailable("MissingDrawingTextContent");
  let selected, signature;
  for (const member of members) {
    if (member.drawingText.listNode !== drawing.source.text.list_node)
      return unavailable("DrawingTextDisplayBindingMismatch");
    const candidates = flows.filter((f) => f.section === member.section && f.paragraph === member.paragraph);
    if (candidates.length !== 1 || candidates[0].host !== "drawing" || candidates[0].top_level !== false)
      return unavailable("AmbiguousDrawingColumnContext");
    const declaration = candidates[0].column_declaration;
    if (declaration === undefined)
      return unavailable("MissingDrawingColumnContext");
    const current = JSON.stringify(declaration);
    if (signature !== undefined && signature !== current)
      return unavailable("UnsupportedDrawingColumnChange");
    signature = current;
    selected = declaration;
  }
  if (selected === null)
    return {
      state: "selected",
      source: "implicit-single-list",
      declaration: {
        count: 1,
        same_size: true,
        gap: 0,
        direction: "left",
        kind: "newspaper",
        ambiguous: false
      }
    };
  return { state: "selected", source: "list-declaration", declaration: structuredClone(selected) };
}

// web/preview/drawing-note-reference-owners.mjs
function selectDrawingNoteReferenceOwners(content) {
  const fail = (error) => ({ state: "unavailable", error });
  if (!Array.isArray(content?.paragraphs) || !Array.isArray(content.paragraphFlows) || !Array.isArray(content.drawings))
    return fail("InvalidDrawingNoteReferenceOwners");
  const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  if (content.paragraphs.some((p) => !record(p) || typeof p.text !== "string" || p.automaticNumbers !== undefined && (!Array.isArray(p.automaticNumbers) || p.automaticNumbers.some((n) => !record(n)))) || content.paragraphFlows.some((f) => !record(f)) || content.drawings.some((d) => !record(d)) || content.hwp5Notes !== undefined && (!Array.isArray(content.hwp5Notes) || content.hwp5Notes.some((n) => !record(n))))
    return fail("InvalidDrawingNoteReferenceOwners");
  const owners = new Map;
  for (const paragraph of content.paragraphs) {
    if (!paragraph.drawingText)
      continue;
    const references = paragraph.automaticNumbers?.some((n) => ["note-reference", "hwp5-note-reference"].includes(n.kind)) || content.hwp5Notes?.some((n) => n.section === paragraph.section && n.hostParagraph === paragraph.paragraph);
    if (!references)
      continue;
    const candidates = content.drawings.filter((d) => d.section === paragraph.section && d.drawingNode === paragraph.drawingText.drawingNode);
    if (candidates.length !== 1)
      return fail("AmbiguousDrawingNoteReferenceOwner");
    const drawing = candidates[0];
    if (drawing.source?.group_context)
      return fail("UnsupportedGroupedDrawingNoteReference");
    const columns = drawingColumnContext(drawing, content.paragraphs, content.paragraphFlows);
    if (columns.state !== "selected")
      return columns;
    const hosts = content.paragraphs.filter((p) => p.section === drawing.section && p.paragraph === drawing.hostParagraph);
    const flows = content.paragraphFlows.filter((f) => f.section === drawing.section && f.paragraph === drawing.hostParagraph);
    if (hosts.length !== 1 || flows.length !== 1 || flows[0].host !== "body" || flows[0].top_level !== true || hosts[0].drawingText || hosts[0].tableCell || !Number.isSafeInteger(drawing.anchorUnit) || drawing.anchorUnit < 0 || hosts[0].text[drawing.anchorUnit] !== "￼")
      return fail("InvalidDrawingNoteReferenceAnchor");
    const key = `${paragraph.section}:${paragraph.paragraph}`;
    if (owners.has(key))
      return fail("AmbiguousDrawingNoteReferenceOwner");
    owners.set(key, { hostParagraph: drawing.hostParagraph, anchorUnit: drawing.anchorUnit });
  }
  return { state: "selected", owners };
}

// web/preview/note-body-bindings.mjs
function bindSourceNoteBodies(content, sourceTables, maxNotes = 1e4, options = {}) {
  if (!sourceTables)
    return bindNoteBodies(content, maxNotes, options);
  if (sourceTables.state !== "selected" || !(sourceTables.noteCellParagraphs instanceof Set) || !Array.isArray(sourceTables.bodyTables))
    return { state: "unavailable", error: "InvalidNoteBodyBindings" };
  const cells = sourceTables.noteCellParagraphs;
  const direct = cells.size ? {
    ...content,
    paragraphs: content.paragraphs.filter((p) => !cells.has(p.paragraph)),
    paragraphFlows: content.paragraphFlows.filter((p) => !cells.has(p.paragraph))
  } : content;
  return bindNoteBodies(direct, maxNotes, { ...options, bodyCellTables: sourceTables.bodyTables });
}
function bindNoteBodies(content, maxNotes = 1e4, { bodyCellTables = [], allowDrawingReferences = false } = {}) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (!Array.isArray(content?.paragraphs) || !Array.isArray(content.paragraphFlows) || !Number.isSafeInteger(maxNotes) || maxNotes < 1 || content.limited || content.noteReferenceErrors?.length || content.paragraphFlowErrors?.length)
    return unavailable("InvalidNoteBodyBindings");
  const paragraphs = new Map, flows = new Map, notes = new Map, references = new Map;
  const key = (section, node) => `${section}:${node}`;
  const uint = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 4294967295;
  if (!Array.isArray(bodyCellTables))
    return unavailable("InvalidNoteBodyBindings");
  const cellReferences = new Set;
  if (typeof allowDrawingReferences !== "boolean")
    return unavailable("InvalidNoteBodyBindings");
  const drawingReferences = allowDrawingReferences ? selectDrawingNoteReferenceOwners(content) : null;
  if (drawingReferences && drawingReferences.state !== "selected")
    return drawingReferences;
  if (bodyCellTables.length) {
    const selected = selectNoteSourceTables({ ...content, tables: bodyCellTables });
    if (selected.state !== "selected")
      return selected;
    if (selected.noteTables.length)
      return unavailable("InvalidNoteBodyBindings");
    for (const table of selected.bodyTables)
      for (const cell of table.cells)
        for (const paragraph of cell.paragraphs)
          cellReferences.add(key(table.section, paragraph));
  }
  for (const paragraph of content.paragraphs) {
    if (!paragraph || !uint(paragraph.section) || !uint(paragraph.paragraph) || typeof paragraph.text !== "string" || paragraph.clipped || paragraphs.has(key(paragraph.section, paragraph.paragraph)))
      return unavailable("InvalidNoteBodyBindings");
    paragraphs.set(key(paragraph.section, paragraph.paragraph), paragraph);
  }
  for (const flow of content.paragraphFlows) {
    if (!flow || !uint(flow.section) || !uint(flow.paragraph) || flows.has(key(flow.section, flow.paragraph)))
      return unavailable("InvalidNoteBodyBindings");
    flows.set(key(flow.section, flow.paragraph), flow);
    const context = flow.note_context;
    if (!["footnote", "endnote"].includes(flow.host)) {
      if (context != null)
        return unavailable("InvalidNoteBodyBindings");
      continue;
    }
    if (!context || !uint(context.note_node) || !uint(context.list_node) || context.kind !== flow.host || flow.top_level !== false)
      return unavailable("MissingNoteBodyOwnership");
    const paragraph = paragraphs.get(key(flow.section, flow.paragraph));
    if (!paragraph || paragraph.tableCell || paragraph.drawingText || paragraph.tableCaption || paragraph.drawingCaption)
      return unavailable("InvalidNoteBodyBindings");
    const owner = key(flow.section, context.note_node);
    let note = notes.get(owner);
    if (!note) {
      if (notes.size >= maxNotes)
        return unavailable("NoteBodyBindingLimit");
      note = {
        section: flow.section,
        noteNode: context.note_node,
        listNode: context.list_node,
        kind: context.kind,
        paragraphs: []
      };
      notes.set(owner, note);
    }
    if (note.listNode !== context.list_node || note.kind !== context.kind)
      return unavailable("AmbiguousNoteBodyOwnership");
    note.paragraphs.push(paragraph.paragraph);
  }
  const referenceAllowed = (section, paragraph) => {
    const flow = flows.get(key(section, paragraph));
    return flow?.host === "body" && flow.top_level === true || cellReferences.has(key(section, paragraph)) || drawingReferences?.owners.has(key(section, paragraph));
  };
  for (const paragraph of content.paragraphs) {
    if (paragraph.automaticNumbers !== undefined && !Array.isArray(paragraph.automaticNumbers))
      return unavailable("InvalidNoteBodyBindings");
    for (const reference of paragraph.automaticNumbers ?? []) {
      if (!reference)
        return unavailable("InvalidNoteBodyBindings");
      if (reference.kind !== "note-reference")
        continue;
      const owner = key(paragraph.section, reference.noteNode), note = notes.get(owner);
      if (!note || !referenceAllowed(paragraph.section, paragraph.paragraph) || !uint(reference.unit) || paragraph.text[reference.unit] !== "￼" || !uint(reference.numberNode) || reference.source?.values?.raw?.[1] !== (note.kind === "footnote" ? "FOOTNOTE" : "ENDNOTE"))
        return unavailable("NoteBodyReferenceMismatch");
      if (references.has(owner))
        return unavailable("AmbiguousNoteBodyReference");
      references.set(owner, {
        hostParagraph: paragraph.paragraph,
        anchorUnit: reference.unit,
        numberNode: reference.numberNode
      });
    }
  }
  if (content.hwp5NoteErrors?.length || content.hwp5Notes !== undefined && !Array.isArray(content.hwp5Notes))
    return unavailable("InvalidNoteBodyBindings");
  for (const reference of content.hwp5Notes ?? []) {
    if (!reference || !uint(reference.section) || !uint(reference.controlNode) || !uint(reference.listNode) || !uint(reference.hostParagraph))
      return unavailable("NoteBodyReferenceMismatch");
    const owner = key(reference.section, reference.controlNode), note = notes.get(owner);
    const paragraph = paragraphs.get(key(reference.section, reference.hostParagraph));
    if (!note || note.kind !== reference.kind || note.listNode !== reference.listNode || !referenceAllowed(reference.section, reference.hostParagraph) || !uint(reference.anchorUnit) || paragraph?.text[reference.anchorUnit] !== "￼" || !uint(reference.controlNode) || !Array.isArray(reference.paragraphs) || reference.paragraphs.length !== note.paragraphs.length || new Set(reference.paragraphs).size !== reference.paragraphs.length || reference.paragraphs.some((id) => !note.paragraphs.includes(id)))
      return unavailable("NoteBodyReferenceMismatch");
    if (references.has(owner))
      return unavailable("AmbiguousNoteBodyReference");
    references.set(owner, {
      hostParagraph: reference.hostParagraph,
      anchorUnit: reference.anchorUnit,
      numberNode: reference.controlNode
    });
  }
  if (notes.size !== references.size)
    return unavailable("MissingNoteBodyReference");
  return {
    state: "bound",
    notes: [...notes.entries()].map(([owner, note]) => ({
      ...note,
      paragraphs: note.paragraphs.toSorted((a, b) => a - b),
      ...references.get(owner)
    }))
  };
}

// web/preview/grouped-shape-content.mjs
function attachGroupedShapeSources(editor, content) {
  content.containers = [];
  content.containerSourceErrors = [];
  content.groupRectangles = [];
  content.groupRectangleErrors = [];
  content.groupCurves = [];
  content.groupCurveErrors = [];
  content.groupCurveOwnerErrors = [];
  const visited = new Set;
  const owners = new Map;
  const addOwner = (section, node, paragraph, unit) => {
    if (![section, node, paragraph, unit].every((n) => Number.isSafeInteger(n) && n >= 0))
      return;
    const key = `${section}:${node}`, old = owners.get(key);
    if (old === null || old && (old.paragraph !== paragraph || old.unit !== unit))
      owners.set(key, null);
    else
      owners.set(key, { paragraph, unit });
  };
  const rectangleBatches = new Map;
  const currentRectangles = new Map((content.rectangles ?? []).map((r) => [`${r.section}:${r.drawingNode}`, r]));
  const rectangleSource = (section, node) => {
    const current = currentRectangles.get(`${section}:${node}`);
    if (current)
      return { rectangle_node: current.drawingNode, source: current.source };
    if (!rectangleBatches.has(section)) {
      let batch = null;
      if (typeof editor.rectangleRenderingSources === "function") {
        try {
          batch = new Map(editor.rectangleRenderingSources(section).map((row) => [row.rectangle_node, row]));
        } catch {}
      }
      rectangleBatches.set(section, batch);
    }
    return rectangleBatches.get(section)?.get(node) ?? editor.rectangleRenderingSource(section, node);
  };
  const pending = [];
  const currentCurves = new Map((content.curveTextSources ?? []).map((item) => [`${item.section}:${item.curveNode}`, item]));
  for (const item of currentCurves.values()) {
    const group = item.source?.common?.group_context;
    if (group && item.owner?.anchor_node === group.root_anchor) {
      pending.push({ section: item.section, node: group.parent_container });
      addOwner(item.section, group.root_anchor, item.owner.paragraph - 1, item.owner.anchor_unit);
    }
  }
  for (const ellipse of content.ellipses ?? []) {
    const group = ellipse.source?.common?.group_context;
    if (group) {
      pending.push({ section: ellipse.section, node: group.parent_container });
      const owner = ellipse.source.owner;
      if (owner && owner.anchor_node === group.root_anchor)
        addOwner(ellipse.section, group.root_anchor, owner.paragraph - 1, owner.anchor_unit);
    }
  }
  for (const drawing of [...content.drawings ?? [], ...content.rectangles ?? []]) {
    const group = drawing.source?.group_context;
    if (group) {
      pending.push({ section: drawing.section, node: group.parent_container });
      addOwner(drawing.section, group.root_anchor, drawing.hostParagraph, drawing.anchorUnit);
    }
  }
  for (const picture of content.pictures ?? []) {
    if (picture.owner && picture.owner.anchorNode !== picture.pictureNode) {
      pending.push({ section: picture.section, node: picture.owner.anchorNode });
      addOwner(picture.section, picture.owner.anchorNode, picture.owner.paragraph, picture.owner.anchorUnit);
    }
  }
  while (pending.length) {
    const { section, node } = pending.pop();
    const key = `${section}:${node}`;
    if (visited.has(key))
      continue;
    visited.add(key);
    try {
      if (typeof editor.containerSourceSnapshot !== "function")
        throw new Error("HwpxContainerSourceAbiUnavailable");
      const source = editor.containerSourceSnapshot(section, node);
      if (source.container_node !== node)
        throw new Error("ContainerSourceBindingMismatch");
      const ownerKey = `${section}:${source.group_context?.root_anchor ?? node}`;
      if (owners.has(ownerKey) && owners.get(ownerKey) === null)
        throw new Error("ConflictingGroupOwner");
      const owner = owners.get(ownerKey);
      content.containers.push({
        section,
        containerNode: node,
        source,
        ...owner ? { hostParagraph: owner.paragraph, anchorUnit: owner.unit } : {}
      });
      if (source.group_context)
        pending.push({ section, node: source.group_context.parent_container });
      for (const child of source.children) {
        if (child.namespace_uri !== "http://www.hancom.co.kr/hwpml/2011/paragraph")
          continue;
        if (child.local_name === "container")
          pending.push({ section, node: child.node });
        if (child.local_name === "curve") {
          try {
            if (typeof editor.curveGeometry !== "function")
              throw new Error("HwpxCurveGeometryAbiUnavailable");
            const current = currentCurves.get(`${section}:${child.node}`);
            const geometry = current?.source ?? editor.curveGeometry(section, child.node);
            if (geometry.node !== child.node || geometry.sourceOnly !== true || geometry.common && geometry.common.group_context?.parent_container !== node)
              throw new Error("GroupCurveBindingMismatch");
            const binding = current ? { state: "bound", owner: current.owner } : queryCurveOwner(editor, section, child.node, geometry.common?.group_context?.root_anchor);
            const rootKey = `${section}:${geometry.common?.group_context?.root_anchor}`, known = owners.get(rootKey);
            if (binding.state === "bound" && (known === null || known && (known.paragraph !== binding.owner.paragraph - 1 || known.unit !== binding.owner.anchor_unit))) {
              binding.state = "unavailable";
              binding.error = "CurveOwnerBindingMismatch";
            }
            if (binding.state === "bound")
              addOwner(section, binding.owner.anchor_node, binding.owner.paragraph - 1, binding.owner.anchor_unit);
            else
              content.groupCurveOwnerErrors.push({
                section,
                curveNode: child.node,
                error: binding.error
              });
            content.groupCurves.push({
              section,
              curveNode: child.node,
              parentContainer: node,
              source: geometry,
              ...binding.state === "bound" ? {
                owner: binding.owner,
                hostParagraph: binding.owner.paragraph - 1,
                anchorUnit: binding.owner.anchor_unit
              } : { ownerError: binding.error }
            });
          } catch (error) {
            content.groupCurveErrors.push({ section, curveNode: child.node, error: error.message });
          }
        }
        if (child.local_name !== "rect")
          continue;
        try {
          const rendering = rectangleSource(section, child.node);
          if (rendering.rectangle_node !== child.node)
            throw new Error("GroupRectangleBindingMismatch");
          content.groupRectangles.push({
            section,
            rectangleNode: child.node,
            parentContainer: node,
            source: rendering.source
          });
        } catch (error) {
          content.groupRectangleErrors.push({
            section,
            rectangleNode: child.node,
            error: error.message
          });
        }
      }
    } catch (error) {
      content.containerSourceErrors.push({ section, containerNode: node, error: error.message });
    }
  }
  content.containers.sort((a, b) => a.section - b.section || a.containerNode - b.containerNode);
  for (const container of content.containers) {
    const owner = owners.get(`${container.section}:${container.source.group_context?.root_anchor ?? container.containerNode}`);
    if (owner) {
      container.hostParagraph = owner.paragraph;
      container.anchorUnit = owner.unit;
    }
  }
  return content;
}

// web/preview/container-caption-content.mjs
function attachContainerCaptions(editor, content) {
  content.containerCaptionErrors = [];
  for (const p of content.paragraphs)
    if (p.drawingCaption?.ownerKind === "container")
      delete p.drawingCaption;
  const containers = content.containers ?? [];
  if (!containers.some((c) => c.source?.has_caption === true))
    return content;
  const paragraphs = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p]));
  const pending = [], claimed = new Set;
  try {
    if (paragraphs.size !== content.paragraphs.length)
      throw new Error("AmbiguousContainerCaptionParagraphs");
    for (const section of new Set(containers.map((c) => c.section))) {
      const selected = containers.filter((c) => c.section === section);
      const owners = new Map(selected.map((c) => [c.containerNode, c]));
      if (owners.size !== selected.length)
        throw new Error("AmbiguousContainerCaptionOwner");
      if (typeof editor.containerCaptionBindings !== "function")
        throw new Error("HwpxContainerCaptionBindingsAbiUnavailable");
      const seen = new Set;
      for (const binding of editor.containerCaptionBindings(section)) {
        const owner = owners.get(binding.owner.container_node);
        if (!owner && content.window)
          continue;
        const caption = owner?.source?.caption;
        if (!owner?.source?.has_caption || !caption || caption.caption_node !== binding.owner.caption_node || caption.list_node !== binding.owner.list_node)
          throw new Error("ContainerCaptionBindingMismatch");
        const key = `${section}:${binding.paragraph - 1}`, paragraph = paragraphs.get(key);
        if (!paragraph || paragraph.drawingCaption || paragraph.drawingText || paragraph.tableCell || paragraph.tableCaption || claimed.has(key))
          throw new Error("ContainerCaptionParagraphMismatch");
        claimed.add(key);
        seen.add(owner.containerNode);
        pending.push({
          paragraph,
          binding: {
            ownerKind: "container",
            drawingNode: owner.containerNode,
            captionNode: caption.caption_node,
            listNode: caption.list_node
          }
        });
      }
      if (selected.some((c) => c.source?.has_caption === true && !seen.has(c.containerNode)))
        throw new Error("IncompleteContainerCaptionOwnership");
    }
  } catch (error) {
    content.containerCaptionErrors.push({ error: error.message });
  }
  if (!content.containerCaptionErrors.length)
    for (const item of pending)
      item.paragraph.drawingCaption = item.binding;
  return content;
}

// web/preview/fill-brush-content.mjs
function attachFillBrushSources(editor, content) {
  content.fillBrushReports = [];
  content.fillBrushErrors = [];
  for (const section of new Set(content.paragraphs.map((p) => p.section))) {
    try {
      if (typeof editor.sectionFillBrushes !== "function")
        throw new Error("HwpxFillBrushesAbiUnavailable");
      content.fillBrushReports.push({ section, report: editor.sectionFillBrushes(section) });
    } catch (error) {
      content.fillBrushErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/rectangle-content.mjs
function attachRectangleSources(editor, content) {
  content.rectangles = [];
  content.rectangleSourceErrors = [];
  const paragraphs = new Set(content.paragraphs.map((p) => `${p.section}:${p.paragraph}`));
  for (const section of new Set(content.paragraphs.map((p) => p.section))) {
    let batch = null;
    if (typeof editor.rectangleRenderingSources === "function") {
      try {
        batch = new Map(editor.rectangleRenderingSources(section).map((row) => [row.rectangle_node, row]));
      } catch {}
    }
    let nodes;
    try {
      nodes = editor.rectangleNodes(section);
    } catch (error) {
      content.rectangleSourceErrors.push({ section, error: error.message });
      continue;
    }
    for (const node of nodes) {
      try {
        const value = batch?.get(node) ?? editor.rectangleRenderingSource(section, node);
        if (value.rectangle_node !== node || !paragraphs.has(`${section}:${value.owner.paragraph - 1}`))
          throw new Error("RectangleDisplayBindingMismatch");
        content.rectangles.push({
          section,
          drawingNode: node,
          hostParagraph: value.owner.paragraph - 1,
          anchorUnit: value.owner.anchor_unit,
          anchorNode: value.owner.anchor_node,
          source: value.source
        });
      } catch (error) {
        content.rectangleSourceErrors.push({ section, drawingNode: node, error: error.message });
      }
    }
  }
  return content;
}

// web/preview/hwpx-page-content.mjs
function attachHwpxPageSettings(editor, content) {
  const sections = new Set(content.paragraphs.map((row) => row.section));
  const displayed = content.window ? new Set(content.paragraphs.map((row) => `${row.section}:${row.paragraph}`)) : null;
  attachRectangleSources(editor, content);
  attachGroupedShapeSources(editor, content);
  attachContainerCaptions(editor, content);
  attachFillBrushSources(editor, content);
  content.pageSettings = [];
  content.noteShapes = null;
  content.noteShapesError = null;
  try {
    content.noteShapes = editor.noteShapes();
  } catch (error) {
    content.noteShapesError = error.message;
  }
  content.pageSettingsError = null;
  try {
    if (typeof editor.pageSettings !== "function")
      throw new Error("HwpxPageSettingsAbiUnavailable");
    content.pageSettings = editor.pageSettings();
    if (displayed)
      content.pageSettings = content.pageSettings.filter((row) => sections.has(row.section_ordinal));
  } catch (error) {
    content.pageSettingsError = error.message;
  }
  content.paragraphFlows = [];
  content.paragraphFlowErrors = [];
  for (const section of sections) {
    try {
      if (typeof editor.paragraphFlow !== "function")
        throw new Error("HwpxParagraphFlowAbiUnavailable");
      for (const row of editor.paragraphFlow(section)) {
        if (displayed && !displayed.has(`${section}:${row.paragraph - 1}`))
          continue;
        content.paragraphFlows.push({ ...row, section, paragraph: row.paragraph - 1 });
      }
    } catch (error) {
      content.paragraphFlowErrors.push({ section, error: error.message });
    }
  }
  const sourceTables = content.tables?.length ? selectNoteSourceTables(content) : null;
  const notes = bindSourceNoteBodies(content, sourceTables?.state === "selected" ? sourceTables : null);
  content.noteBodies = notes.state === "bound" ? notes.notes : [];
  content.noteBodyBindingError = notes.state === "bound" ? null : notes.error;
  return content;
}

// js/hwp5-structural-anchors.mjs
var HWP5_STRUCTURAL_ANCHOR_KINDS = Object.freeze([
  "section",
  "column",
  "header",
  "footer",
  "bookmark"
]);
function decodeHwp5StructuralAnchors(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5StructuralAnchors");
  const seen = new Set;
  for (const row of rows) {
    if (!row || !HWP5_STRUCTURAL_ANCHOR_KINDS.includes(row.kind) || !["control_node", "paragraph", "source_unit", "current_unit"].every((key) => uint(row[key])) || row.source_unit > 4294967287 || row.current_unit > 4294967287 || seen.has(row.control_node))
      throw new Error("InvalidHwp5StructuralAnchors");
    seen.add(row.control_node);
  }
  return rows;
}

// web/preview/hwp5-structural-anchor-content.mjs
function attachHwp5StructuralAnchors(editor, content) {
  content.structuralAnchorErrors = [];
  for (const paragraph of content.paragraphs)
    delete paragraph.structuralAnchors;
  if (!editor)
    return content;
  for (let section = 0;section < editor.sectionCount(); section++) {
    try {
      const paragraphs = new Map(content.paragraphs.filter((row) => row.section === section).map((row) => [row.paragraph, row]));
      const prepared = [], controls = new Set, positions = new Set;
      for (const row of editor.structuralAnchors(section)) {
        const paragraph = paragraphs.get(row.paragraph);
        if (!paragraph || paragraph.clipped || controls.has(row.control_node) || !HWP5_STRUCTURAL_ANCHOR_KINDS.includes(row.kind))
          throw new Error("StructuralDisplayAnchorBindingMismatch");
        const unit = sourceDisplayPosition(row.current_unit, paragraph.sourceOffsets, paragraph.text.length);
        const end = sourceDisplayPosition(row.current_unit + 8, paragraph.sourceOffsets, paragraph.text.length);
        const key = `${row.paragraph}:${unit}`;
        if (end !== unit + 1 || paragraph.text[unit] !== "￼" || positions.has(key))
          throw new Error("StructuralDisplayAnchorMismatch");
        controls.add(row.control_node);
        positions.add(key);
        prepared.push({ paragraph, anchor: { ...row, unit } });
      }
      for (const { paragraph, anchor } of prepared)
        (paragraph.structuralAnchors ??= []).push(anchor);
    } catch (error) {
      content.structuralAnchorErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// js/hwp5-page-area-sources.mjs
function decodeHwp5PageAreaSources(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  return validateHwp5PageAreaSources(rows);
}
function validateHwp5PageAreaSources(rows) {
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5PageAreaSources");
  const uint = (value, max = 4294967295) => Number.isInteger(value) && value >= 0 && value <= max;
  const seen = new Set;
  for (const row of rows) {
    if (!row || !["header", "footer"].includes(row.kind) || ![
      "owner_node",
      "list_node",
      "paragraph_count",
      "control_attributes",
      "list_attributes",
      "width",
      "height",
      "control_extra_bytes",
      "list_extra_bytes"
    ].every((key) => uint(row[key])) || row.owner_node >= row.list_node || row.list_unknown !== null && !uint(row.list_unknown, 65535) || !uint(row.text_references, 255) || !uint(row.number_references, 255) || typeof row.control_extra_nonzero !== "boolean" || typeof row.list_extra_nonzero !== "boolean" || row.control_extra_bytes === 0 && row.control_extra_nonzero || row.list_extra_bytes === 0 && row.list_extra_nonzero || seen.has(row.list_node))
      throw new Error("InvalidHwp5PageAreaSources");
    seen.add(row.list_node);
    if (row.control_instance_id !== undefined && row.control_instance_id !== null && (!uint(row.control_instance_id) || row.control_extra_bytes !== 4 || row.control_extra_nonzero !== (row.control_instance_id !== 0)))
      throw new Error("InvalidHwp5PageAreaSources");
  }
  return rows;
}

// web/preview/hwp5-page-area-content.mjs
function attachHwp5PageAreas(editor, content) {
  content.pageAreaSources = [];
  content.pageAreaSourceErrors = [];
  if (!editor)
    return content;
  const flows = content.currentParagraphFlows ?? [];
  for (const section of new Set(flows.filter((row) => ["header", "footer"].includes(row.host)).map((row) => row.section))) {
    try {
      const areas = validateHwp5PageAreaSources(editor.pageAreaSources(section)), seen = new Set;
      const members = flows.filter((row) => row.section === section && ["header", "footer"].includes(row.host));
      for (const area of areas) {
        if (seen.has(area.list_node))
          throw new Error("AmbiguousHwp5PageAreaSource");
        seen.add(area.list_node);
        const current = members.filter((row) => row.host === area.kind && row.list_node === area.list_node && row.parent_node === area.owner_node);
        if (!current.length)
          throw new Error("MissingHwp5PageAreaOwner");
      }
      if (members.some((row) => !areas.some((area) => area.kind === row.host && area.list_node === row.list_node && area.owner_node === row.parent_node)))
        throw new Error("Hwp5PageAreaBindingMismatch");
      content.pageAreaSources.push(...areas.map((row) => ({ ...row, section })));
    } catch (error) {
      content.pageAreaSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// js/hwp5-master-page-sources.mjs
function decodeHwp5MasterPageSources(bytes) {
  return validateHwp5MasterPageSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function validateHwp5MasterPageSources(rows) {
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5MasterPageSources");
  const uint = (value, max = 4294967295) => Number.isInteger(value) && value >= 0 && value <= max;
  const seen = new Set;
  for (const row of rows) {
    if (!row || ![
      "owner_node",
      "list_node",
      "paragraph_count",
      "list_attributes",
      "width",
      "height",
      "extra_bytes"
    ].every((key) => uint(row[key])) || row.owner_node >= row.list_node || row.list_unknown !== null && !uint(row.list_unknown, 65535) || !uint(row.text_reference, 255) || !uint(row.number_reference, 255) || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero || seen.has(row.list_node))
      throw new Error("InvalidHwp5MasterPageSources");
    seen.add(row.list_node);
  }
  return rows;
}

// web/preview/hwp5-master-page-content.mjs
function attachHwp5MasterPages(editor, content) {
  content.masterPageSources = [];
  content.masterPageSourceErrors = [];
  if (!editor)
    return content;
  const flows = content.currentParagraphFlows ?? [];
  for (const section of new Set(flows.filter((row) => row.host === "master_page").map((row) => row.section))) {
    try {
      const sources = validateHwp5MasterPageSources(editor.masterPageSources(section));
      const members = flows.filter((row) => row.section === section && row.host === "master_page");
      const matches = (source, row) => row.list_node === source.list_node && row.parent_node === source.owner_node;
      if (sources.some((source) => !members.some((row) => matches(source, row))) || members.some((row) => !sources.some((source) => matches(source, row))))
        throw new Error("Hwp5MasterPageBindingMismatch");
      content.masterPageSources.push(...sources.map((row) => ({ ...row, section })));
    } catch (error) {
      content.masterPageSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// js/hwp5-note-sources.mjs
function validateHwp5NoteSources(rows) {
  const uint = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5NoteSources");
  const seen = new Set, controls = new Map;
  for (const row of rows) {
    if (!row || !["footnote", "endnote"].includes(row.kind) || ![
      "control_node",
      "list_node",
      "paragraph_count",
      "paragraph",
      "source_unit",
      "current_unit",
      "number",
      "number_shape",
      "control_extra_bytes",
      "list_attributes",
      "list_extra_bytes"
    ].every((key) => uint(row[key], 4294967295)) || row.control_node >= row.list_node || row.source_unit > 4294967287 || row.current_unit > 4294967287 || !uint(row.prefix, 65535) || !uint(row.suffix, 65535) || row.instance_id !== null && !uint(row.instance_id, 4294967295) || row.list_unknown !== null && !uint(row.list_unknown, 65535) || typeof row.control_extra_nonzero !== "boolean" || typeof row.list_extra_nonzero !== "boolean" || row.control_extra_bytes === 0 && row.control_extra_nonzero || row.list_extra_bytes === 0 && row.list_extra_nonzero || seen.has(row.list_node))
      throw new Error("InvalidHwp5NoteSources");
    const previous = controls.get(row.control_node);
    if (previous && [
      "kind",
      "paragraph",
      "source_unit",
      "current_unit",
      "number",
      "prefix",
      "suffix",
      "number_shape",
      "instance_id",
      "control_extra_bytes",
      "control_extra_nonzero"
    ].some((key) => previous[key] !== row[key]))
      throw new Error("InvalidHwp5NoteSources");
    controls.set(row.control_node, row);
    seen.add(row.list_node);
  }
  return rows;
}
function decodeHwp5NoteSources(bytes) {
  return validateHwp5NoteSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// js/hwp5-note-shape-sources.mjs
function validateHwp5NoteShapeSources(rows) {
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (!Array.isArray(rows) || rows.length !== 2)
    throw new Error("InvalidHwp5NoteShapeSources");
  for (const [index, row] of rows.entries()) {
    if (!row || row.kind !== ["footnote", "endnote"][index] || !["source_node", "owner_node", "flags", "color", "extra_bytes"].every((key) => integer(row[key], 0, 4294967295)) || row.owner_node >= row.source_node || !["user_char", "prefix", "suffix", "start_number"].every((key) => integer(row[key], 0, 65535)) || !integer(row.separator_length, -2147483648, 2147483647) || !["above", "below", "between"].every((key) => integer(row[key], -32768, 32767)) || !["line_type", "line_width"].every((key) => integer(row[key], 0, 255)) || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero)
      throw new Error("InvalidHwp5NoteShapeSources");
  }
  if (rows[0].owner_node !== rows[1].owner_node || rows[0].source_node >= rows[1].source_node)
    throw new Error("InvalidHwp5NoteShapeSources");
  return rows;
}
function decodeHwp5NoteShapeSources(bytes) {
  return validateHwp5NoteShapeSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/normalized-note-page-policy.mjs
function normalizedNotePagePolicy({
  section,
  kind,
  sourceNode,
  placement,
  beneathText,
  between,
  below,
  above,
  length,
  type,
  width,
  color
}) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const allowed = kind === "footnote" ? ["EACH_COLUMN", "MERGED_COLUMN", "RIGHT_MOST_COLUMN"] : kind === "endnote" ? ["END_OF_DOCUMENT", "END_OF_SECTION"] : [];
  if (!Number.isSafeInteger(section) || section < 0 || !allowed.includes(placement) || typeof beneathText !== "boolean" || ![between, below, above].every(uint) || !Number.isInteger(length) || length < -1 || length > 2147483647)
    return { state: "unavailable", error: "UnsupportedNotePagePolicy" };
  return {
    state: "selected",
    section,
    kind,
    sourceNode,
    placement,
    beneathText,
    betweenNotes: hwpUnitPixels(between),
    belowLine: hwpUnitPixels(below),
    aboveLine: hwpUnitPixels(above),
    separator: { length: length === -1 ? "full" : hwpUnitPixels(length), type, width, color }
  };
}

// web/preview/hwp5-note-page-policy.mjs
var widths = Object.freeze([
  "0.1 mm",
  "0.12 mm",
  "0.15 mm",
  "0.2 mm",
  "0.25 mm",
  "0.3 mm",
  "0.4 mm",
  "0.5 mm",
  "0.6 mm",
  "0.7 mm",
  "1.0 mm",
  "1.5 mm",
  "2.0 mm",
  "3.0 mm",
  "4.0 mm",
  "5.0 mm"
]);
function selectHwp5NotePagePolicy(rows, section, kind) {
  try {
    validateHwp5NoteShapeSources(rows);
  } catch {
    return { state: "unavailable", error: "InvalidHwp5NoteShapeSources" };
  }
  const shape = rows.find((row) => row.kind === kind);
  if (!shape)
    return { state: "unavailable", error: "InvalidNotePagePolicy" };
  const placement = shape.flags >>> 8 & 3;
  const places = kind === "footnote" ? ["EACH_COLUMN", "MERGED_COLUMN", "RIGHT_MOST_COLUMN"] : ["END_OF_DOCUMENT", "END_OF_SECTION"];
  if (shape.extra_bytes !== 0 || shape.flags >>> 14 !== 0 || shape.line_type !== 1 || !widths[shape.line_width] || shape.color > 16777215)
    return { state: "unavailable", error: "UnsupportedHwp5NotePagePolicy" };
  const color = `#${[shape.color & 255, shape.color >>> 8 & 255, shape.color >>> 16 & 255].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  return normalizedNotePagePolicy({
    section,
    kind,
    sourceNode: shape.source_node,
    placement: places[placement],
    beneathText: Boolean(shape.flags & 1 << 13),
    between: shape.between,
    below: shape.below,
    above: shape.above,
    length: shape.separator_length,
    type: "SOLID",
    width: widths[shape.line_width],
    color
  });
}

// web/preview/hwp5-note-shape-content.mjs
function attachHwp5NoteShapes(editor, content) {
  content.hwp5NoteShapes = [];
  content.hwp5NotePolicies = [];
  content.hwp5NoteShapeErrors = [];
  if (!editor)
    return content;
  const sections = new Set((content.currentParagraphFlows ?? []).filter((row) => ["footnote", "endnote"].includes(row.host)).map((row) => row.section));
  for (const section of sections) {
    try {
      const shapes = validateHwp5NoteShapeSources(editor.noteShapeSources(section));
      const policies = shapes.map((shape) => selectHwp5NotePagePolicy(shapes, section, shape.kind));
      content.hwp5NoteShapes.push({ section, shapes });
      for (const [index, policy] of policies.entries()) {
        if (policy.state === "selected")
          content.hwp5NotePolicies.push(policy);
        else
          content.hwp5NoteShapeErrors.push({
            section,
            kind: shapes[index].kind,
            error: policy.error
          });
      }
    } catch (error) {
      content.hwp5NoteShapeErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/hwp5-note-content.mjs
function attachHwp5Notes(editor, content) {
  content.hwp5Notes = [];
  content.hwp5NoteErrors = [];
  if (!editor)
    return attachHwp5NoteShapes(editor, content);
  const flows = content.currentParagraphFlows ?? [];
  for (const section of new Set(flows.filter((row) => ["footnote", "endnote"].includes(row.host)).map((row) => row.section))) {
    try {
      const sources = validateHwp5NoteSources(editor.noteSources(section)), prepared = [], positions = new Map, paragraphIds = new Set;
      for (const paragraph of content.paragraphs.filter((row) => row.section === section)) {
        if (paragraphIds.has(paragraph.paragraph))
          throw new Error("AmbiguousHwp5NoteParagraph");
        paragraphIds.add(paragraph.paragraph);
      }
      const members = flows.filter((row) => row.section === section && ["footnote", "endnote"].includes(row.host));
      if (new Set(members.map((row) => row.paragraph)).size !== members.length)
        throw new Error("AmbiguousHwp5NoteBody");
      for (const source of sources) {
        const paragraph = content.paragraphs.find((row) => row.section === section && row.paragraph === source.paragraph);
        if (!paragraph || paragraph.clipped)
          throw new Error("MissingHwp5NoteReferenceParagraph");
        const unit = sourceDisplayPosition(source.current_unit, paragraph.sourceOffsets, paragraph.text.length);
        const end = sourceDisplayPosition(source.current_unit + 8, paragraph.sourceOffsets, paragraph.text.length);
        if (end !== unit + 1 || paragraph.text[unit] !== "￼")
          throw new Error("Hwp5NoteReferenceMismatch");
        const key = `${source.paragraph}:${unit}`, owner = positions.get(key);
        if (owner !== undefined && owner !== source.control_node)
          throw new Error("AmbiguousHwp5NoteReference");
        positions.set(key, source.control_node);
        const body = members.filter((row) => row.host === source.kind && row.list_node === source.list_node && row.parent_node === source.control_node);
        if (!body.length || body.some((row) => !content.paragraphs.some((p) => p.section === section && p.paragraph === row.paragraph && !p.clipped)))
          throw new Error("MissingHwp5NoteBody");
        prepared.push({
          section,
          kind: source.kind,
          controlNode: source.control_node,
          listNode: source.list_node,
          hostParagraph: source.paragraph,
          anchorUnit: unit,
          paragraphs: body.map((row) => row.paragraph),
          source
        });
      }
      if (members.some((row) => !prepared.some((note) => note.kind === row.host && note.listNode === row.list_node && note.controlNode === row.parent_node)))
        throw new Error("IncompleteHwp5NoteSources");
      content.hwp5Notes.push(...prepared);
    } catch (error) {
      content.hwp5NoteErrors.push({ section, error: error.message });
    }
  }
  return attachHwp5NoteShapes(editor, content);
}

// js/hwp5-caption-sources.mjs
function validateHwp5CaptionSources(rows) {
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5CaptionSources");
  const lists = new Set, owners = new Map;
  for (const row of rows) {
    if (!row || ![
      "control_node",
      "table_record_node",
      "list_node",
      "attributes",
      "flags",
      "width",
      "max_text_width",
      "extra_bytes"
    ].every((key) => integer(row[key], 0, 4294967295)) || !(row.control_node < row.list_node && row.list_node < row.table_record_node) || !integer(row.paragraph_count, 0, 65535) || row.unknown !== null && !integer(row.unknown, 0, 65535) || !integer(row.gap, -32768, 32767) || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero || lists.has(row.list_node) || owners.has(row.control_node) && owners.get(row.control_node) !== row.table_record_node)
      throw new Error("InvalidHwp5CaptionSources");
    lists.add(row.list_node);
    owners.set(row.control_node, row.table_record_node);
  }
  return rows;
}
function decodeHwp5CaptionSources(bytes) {
  return validateHwp5CaptionSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/hwp5-caption-geometry.mjs
function hwp5CaptionGeometry(source) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!source || ![source.flags, source.attributes, source.list_node].every(uint) || ![0, 8].includes(source.extra_bytes) || source.extra_bytes === 8 && source.extra_nonzero !== false || (source.flags & ~7) !== 0 || (source.attributes & ~127) !== 0 || !Number.isInteger(source.width) || source.width < 0 || source.width > 4294967295 || !Number.isInteger(source.gap) || source.gap < -32768 || source.gap > 32767)
    throw new Error("UnsupportedHwp5CaptionGeometry");
  return {
    caption_node: source.list_node,
    list_node: source.list_node,
    side: source.flags & 3,
    full_size: Boolean(source.flags & 4),
    width: source.width,
    gap: source.gap,
    text_direction: source.attributes & 7,
    line_wrap: source.attributes >>> 3 & 3,
    vertical_alignment: source.attributes >>> 5 & 3
  };
}
function attachHwp5CaptionGeometry(content) {
  content.hwp5CaptionGeometryErrors = [];
  for (const table of content.tables ?? []) {
    delete table.sourceCaption;
    table.captionParagraphs = [];
  }
  for (const paragraph of content.paragraphs ?? [])
    delete paragraph.tableCaption;
  const captions = content.hwp5Captions ?? [];
  const sections = new Set([
    ...captions.map((row) => row.section),
    ...(content.tables ?? []).filter((row) => row.sourceGeometry).map((row) => row.section)
  ]);
  for (const section of sections) {
    let currentCaption = null;
    try {
      for (const table of content.tables.filter((row) => row.section === section && row.sourceGeometry?.has_caption !== undefined)) {
        const present = captions.some((row) => row.section === section && row.tableNode === table.tableNode);
        if (table.sourceGeometry.has_caption !== present)
          throw new Error("Hwp5CaptionPresenceMismatch");
      }
      const prepared = [], seenTables = new Set, seenParagraphs = new Set;
      for (const caption of captions.filter((row) => row.section === section)) {
        currentCaption = caption;
        const tables = content.tables.filter((row) => row.section === section && row.tableNode === caption.tableNode);
        if (tables.length !== 1 || seenTables.has(caption.tableNode))
          throw new Error("AmbiguousHwp5TableCaption");
        const table = tables[0], source = hwp5CaptionGeometry(caption.source), paragraphs = [];
        for (const id of caption.paragraphs) {
          const matches = content.paragraphs.filter((row) => row.section === section && row.paragraph === id);
          if (matches.length !== 1 || matches[0].clipped || matches[0].tableCell || seenParagraphs.has(id))
            throw new Error("InvalidHwp5CaptionParagraph");
          seenParagraphs.add(id);
          paragraphs.push(matches[0]);
        }
        seenTables.add(caption.tableNode);
        prepared.push({ table, source, paragraphs, ids: caption.paragraphs });
      }
      for (const { table, source, paragraphs, ids } of prepared) {
        table.sourceCaption = source;
        table.captionParagraphs = [...ids];
        for (const paragraph of paragraphs)
          paragraph.tableCaption = {
            tableNode: table.tableNode,
            captionNode: source.caption_node,
            listNode: source.list_node
          };
      }
    } catch (error) {
      const evidence = {};
      if (error.message === "UnsupportedHwp5CaptionGeometry" && currentCaption) {
        for (const [key, value] of [
          ["tableNode", currentCaption.tableNode],
          ["listNode", currentCaption.listNode],
          ["rawCaptionFlags", currentCaption.source?.flags],
          ["rawCaptionAttributes", currentCaption.source?.attributes]
        ]) {
          if (Number.isInteger(value) && value >= 0 && value <= 4294967295)
            evidence[key] = value;
        }
      }
      content.hwp5CaptionGeometryErrors.push({ section, error: error.message, ...evidence });
    }
  }
  return content;
}

// web/preview/hwp5-caption-content.mjs
function attachHwp5Captions(editor, content) {
  content.hwp5Captions = [];
  content.hwp5CaptionErrors = [];
  if (!editor)
    return attachHwp5CaptionGeometry(content);
  const flows = content.currentParagraphFlows ?? [];
  for (const section of new Set(flows.filter((row) => row.host === "table_caption").map((row) => row.section))) {
    try {
      const sources = validateHwp5CaptionSources(editor.captionSources(section));
      const members = flows.filter((row) => row.section === section && row.host === "table_caption"), prepared = [];
      if (new Set(members.map((row) => row.paragraph)).size !== members.length)
        throw new Error("AmbiguousHwp5CaptionFlow");
      const paragraphs = content.paragraphs.filter((row) => row.section === section);
      if (new Set(paragraphs.map((row) => row.paragraph)).size !== paragraphs.length)
        throw new Error("AmbiguousHwp5CaptionParagraph");
      for (const source of sources) {
        const tables = (content.tables ?? []).filter((row) => row.section === section && row.tableNode === source.table_record_node);
        if (tables.length !== 1 || tables[0].layoutSource?.table_node !== source.control_node)
          throw new Error("Hwp5CaptionTableMismatch");
        const body = members.filter((row) => row.list_node === source.list_node && row.parent_node === source.control_node);
        if (!body.length || body.some((row) => !paragraphs.some((p) => p.paragraph === row.paragraph && !p.clipped)))
          throw new Error("MissingHwp5CaptionBody");
        prepared.push({
          section,
          tableNode: source.table_record_node,
          controlNode: source.control_node,
          listNode: source.list_node,
          paragraphs: body.map((row) => row.paragraph),
          source
        });
      }
      if (members.some((row) => !prepared.some((caption) => caption.listNode === row.list_node && caption.controlNode === row.parent_node)))
        throw new Error("IncompleteHwp5CaptionSources");
      content.hwp5Captions.push(...prepared);
    } catch (error) {
      content.hwp5CaptionErrors.push({ section, error: error.message });
    }
  }
  return attachHwp5CaptionGeometry(content);
}

// js/hwp5-drawing-anchors.mjs
function validateHwp5DrawingAnchors(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5DrawingAnchors");
  const controls = new Set, components = new Set;
  for (const row of rows) {
    if (!row || !["control_node", "component_node", "paragraph", "source_unit", "current_unit"].every((key) => uint(row[key])) || row.control_node >= row.component_node || row.source_unit > 4294967287 || row.current_unit > 4294967287 || controls.has(row.control_node) || components.has(row.component_node))
      throw new Error("InvalidHwp5DrawingAnchors");
    controls.add(row.control_node);
    components.add(row.component_node);
  }
  return rows;
}
function decodeHwp5DrawingAnchors(bytes) {
  return validateHwp5DrawingAnchors(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// js/hwp5-drawing-list-sources.mjs
function validateHwp5DrawingListSources(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5DrawingListSources");
  const seen = new Set;
  for (const row of rows) {
    if (!row || !["caption", "body"].includes(row.kind) || ![
      "control_node",
      "owner_node",
      "list_node",
      "paragraph_count",
      "attributes",
      "extra_bytes"
    ].every((key) => uint(row[key])) || row.paragraph_count > 65535 || row.owner_node >= row.list_node || (row.kind === "caption" ? row.owner_node !== row.control_node : row.owner_node <= row.control_node) || row.unknown !== null && (!uint(row.unknown) || row.unknown > 65535) || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero || seen.has(row.list_node))
      throw new Error("InvalidHwp5DrawingListSources");
    seen.add(row.list_node);
    if (Object.hasOwn(row, "caption")) {
      const c = row.caption;
      if (row.kind === "body" ? c !== null : !c || ![c.flags, c.width, c.max_text_width, c.extra_bytes].every(uint) || !Number.isInteger(c.gap) || c.gap < -32768 || c.gap > 32767 || typeof c.extra_nonzero !== "boolean" || c.extra_bytes === 0 && c.extra_nonzero || row.extra_bytes !== c.extra_bytes + 14)
        throw new Error("InvalidHwp5DrawingListSources");
    }
    if (row.kind === "caption" ? row.margins !== null || row.last_width !== null || row.body_extra_bytes !== null : !Array.isArray(row.margins) || row.margins.length !== 4 || !Array.from(row.margins).every((value) => Number.isInteger(value) && value >= -32768 && value <= 32767) || !uint(row.last_width) || !uint(row.body_extra_bytes) || row.extra_bytes < 12 || row.body_extra_bytes !== row.extra_bytes - 12)
      throw new Error("InvalidHwp5DrawingListSources");
  }
  return rows;
}
function decodeHwp5DrawingListSources(bytes) {
  return validateHwp5DrawingListSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/hwp5-drawing-body-content.mjs
function attachHwp5DrawingBodies(editor, content) {
  content.hwp5DrawingBodies = [];
  content.hwp5DrawingBodyErrors = [];
  if (!editor)
    return content;
  const flows = content.currentParagraphFlows ?? [];
  const sections = new Set([
    ...(content.hwp5Drawings ?? []).map((row) => row.section),
    ...flows.filter((row) => row.host === "drawing").map((row) => row.section)
  ]);
  for (const section of sections) {
    try {
      if (content.hwp5DrawingErrors?.some((row) => row.section === section))
        throw new Error("IncompleteHwp5DrawingSources");
      const sources = validateHwp5DrawingListSources(editor.drawingListSources(section)), prepared = [];
      const members = flows.filter((row) => row.section === section && row.host === "drawing");
      const paragraphs = content.paragraphs.filter((row) => row.section === section);
      if (new Set(members.map((row) => row.paragraph)).size !== members.length || new Set(paragraphs.map((row) => row.paragraph)).size !== paragraphs.length)
        throw new Error("AmbiguousHwp5DrawingBody");
      for (const source of sources) {
        if (!content.hwp5Drawings?.some((row) => row.section === section && row.controlNode === source.control_node))
          throw new Error("MissingHwp5DrawingBodyControl");
        const body = members.filter((row) => row.parent_node === source.owner_node && row.list_node === source.list_node);
        if (source.paragraph_count > 0 && !body.length || body.some((row) => !paragraphs.some((p) => p.paragraph === row.paragraph && !p.clipped)))
          throw new Error("MissingHwp5DrawingBodyParagraph");
        prepared.push({
          section,
          kind: source.kind,
          controlNode: source.control_node,
          ownerNode: source.owner_node,
          listNode: source.list_node,
          paragraphs: body.map((row) => row.paragraph),
          source
        });
      }
      if (members.some((row) => !prepared.some((body) => body.ownerNode === row.parent_node && body.listNode === row.list_node)))
        throw new Error("IncompleteHwp5DrawingBodies");
      content.hwp5DrawingBodies.push(...prepared);
    } catch (error) {
      content.hwp5DrawingBodyErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// js/hwp5-drawing-matrix-sources.mjs
function validateHwp5DrawingMatrixSources(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5DrawingMatrixSources");
  const seen = new Set;
  let current;
  for (const row of rows) {
    if (!row || !uint(row.component_node) || !uint(row.owner_node) || row.owner_node >= row.component_node || !["translation", "scale", "rotation"].includes(row.kind) || !Array.isArray(row.bits) || row.bits.length !== 6 || !Array.from(row.bits).every((pair) => Array.isArray(pair) && pair.length === 2 && Array.from(pair).every(uint)))
      throw new Error("InvalidHwp5DrawingMatrixSources");
    if (!current || current.node !== row.component_node) {
      if (current?.next === "rotation" || seen.has(row.component_node) || row.kind !== "translation" || row.pair !== null)
        throw new Error("InvalidHwp5DrawingMatrixSources");
      seen.add(row.component_node);
      current = { node: row.component_node, owner: row.owner_node, next: "scale", ordinal: 0 };
    } else {
      if (row.owner_node !== current.owner || row.kind !== current.next || row.pair !== current.ordinal || !uint(row.pair) || row.pair >= 65535)
        throw new Error("InvalidHwp5DrawingMatrixSources");
      if (row.kind === "rotation") {
        current.next = "scale";
        current.ordinal++;
      } else
        current.next = "rotation";
    }
  }
  if (current?.next === "rotation")
    throw new Error("InvalidHwp5DrawingMatrixSources");
  return rows;
}
function decodeHwp5DrawingMatrixSources(bytes) {
  return validateHwp5DrawingMatrixSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/hwp5-drawing-matrix-content.mjs
function attachHwp5DrawingMatrices(editor, content) {
  content.hwp5DrawingMatrices = [];
  content.hwp5DrawingMatrixErrors = [];
  if (!editor)
    return content;
  for (const section of new Set((content.hwp5Drawings ?? []).map((row) => row.section))) {
    try {
      const rows = validateHwp5DrawingMatrixSources(editor.drawingMatrixSources(section));
      const components = new Map(rows.filter((row) => row.kind === "translation").map((row) => [row.component_node, row]));
      const drawings = content.hwp5Drawings.filter((row) => row.section === section);
      const roots = new Map(drawings.map((row) => [row.componentNode, row]));
      if (roots.size !== drawings.length)
        throw new Error("AmbiguousHwp5DrawingMatrixRoot");
      for (const root of drawings) {
        const first = components.get(root.componentNode);
        if (!first || first.owner_node !== root.controlNode || rows.filter((row) => row.component_node === root.componentNode && row.kind === "rotation").length !== root.source.matrix_pairs)
          throw new Error("Hwp5DrawingMatrixSourceMismatch");
      }
      for (const component of components.values()) {
        let current = component;
        while (!roots.has(current.component_node)) {
          const parent = components.get(current.owner_node);
          if (!parent || parent.component_node >= current.component_node)
            throw new Error("MissingHwp5DrawingMatrixParent");
          current = parent;
        }
      }
      content.hwp5DrawingMatrices.push(...rows.map((row) => ({ ...row, section })));
    } catch (error) {
      content.hwp5DrawingMatrixErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// js/hwp5-drawing-local-transforms.mjs
function validateHwp5DrawingLocalTransforms(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5DrawingLocalTransforms");
  const seen = new Set;
  for (const row of rows) {
    if (!row || !uint(row.component_node) || !uint(row.owner_node) || row.owner_node >= row.component_node || !Array.isArray(row.matrix) || row.matrix.length !== 6 || !Array.from(row.matrix).every(Number.isFinite) || seen.has(row.component_node))
      throw new Error("InvalidHwp5DrawingLocalTransforms");
    seen.add(row.component_node);
  }
  return rows;
}
function decodeHwp5DrawingLocalTransforms(bytes) {
  return validateHwp5DrawingLocalTransforms(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/hwp5-drawing-local-content.mjs
function attachHwp5DrawingLocalTransforms(editor, content) {
  content.hwp5DrawingLocalTransforms = [];
  content.hwp5DrawingLocalErrors = [];
  if (!editor)
    return content;
  for (const section of new Set((content.hwp5Drawings ?? []).map((row) => row.section))) {
    try {
      if (content.hwp5DrawingMatrixErrors?.some((row) => row.section === section))
        throw new Error("IncompleteHwp5DrawingMatrices");
      const raw = (content.hwp5DrawingMatrices ?? []).filter((row) => row.section === section && row.kind === "translation");
      if (new Set(raw.map((row) => row.component_node)).size !== raw.length)
        throw new Error("AmbiguousHwp5DrawingTransformSource");
      const local = validateHwp5DrawingLocalTransforms(editor.drawingLocalTransforms(section));
      if (raw.length !== local.length)
        throw new Error("Hwp5DrawingTransformInventoryMismatch");
      for (const row of local)
        if (!raw.some((source) => source.component_node === row.component_node && source.owner_node === row.owner_node))
          throw new Error("Hwp5DrawingTransformOwnerMismatch");
      content.hwp5DrawingLocalTransforms.push(...local.map((row) => ({ ...row, section })));
    } catch (error) {
      content.hwp5DrawingLocalErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// js/hwp5-drawing-rectangle-corners.mjs
function validateHwp5DrawingRectangleCorners(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5DrawingRectangleCorners");
  const components = new Set, rectangles = new Set;
  for (const row of rows) {
    if (!row || !uint(row.component_node) || !uint(row.rectangle_node) || row.component_node >= row.rectangle_node || !uint(row.round_rate) || row.round_rate > 255 || !Array.isArray(row.points) || row.points.length !== 4 || !Array.from(row.points).every((point) => Array.isArray(point) && point.length === 2 && Array.from(point).every(Number.isFinite)) || components.has(row.component_node) || rectangles.has(row.rectangle_node))
      throw new Error("InvalidHwp5DrawingRectangleCorners");
    components.add(row.component_node);
    rectangles.add(row.rectangle_node);
    if (Object.hasOwn(row, "raw_points") && (!Array.isArray(row.raw_points) || row.raw_points.length !== 4 || !Array.from(row.raw_points).every((point) => Array.isArray(point) && point.length === 2 && Array.from(point).every((value) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647))))
      throw new Error("InvalidHwp5DrawingRectangleCorners");
  }
  return rows;
}
function decodeHwp5DrawingRectangleCorners(bytes) {
  return validateHwp5DrawingRectangleCorners(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/hwp5-drawing-corner-content.mjs
function attachHwp5DrawingCorners(editor, content) {
  content.hwp5DrawingCorners = [];
  content.hwp5DrawingCornerErrors = [];
  if (!editor)
    return content;
  for (const section of new Set((content.hwp5Drawings ?? []).map((row) => row.section))) {
    try {
      if (content.hwp5DrawingLocalErrors?.some((row) => row.section === section))
        throw new Error("IncompleteHwp5DrawingTransforms");
      const corners = validateHwp5DrawingRectangleCorners(editor.drawingRectangleCorners(section));
      const locals = (content.hwp5DrawingLocalTransforms ?? []).filter((row) => row.section === section);
      const nodes = new Set(locals.map((row) => row.component_node));
      if (nodes.size !== locals.length)
        throw new Error("AmbiguousHwp5DrawingCornerTransform");
      if (corners.some((row) => !nodes.has(row.component_node)))
        throw new Error("MissingHwp5DrawingCornerTransform");
      for (const drawing of content.hwp5Drawings.filter((row) => row.section === section && row.source.kind_id === 611476835)) {
        if (!corners.some((row) => row.component_node === drawing.componentNode))
          throw new Error("MissingHwp5RectangleCorners");
      }
      content.hwp5DrawingCorners.push(...corners.map((row) => ({ ...row, section })));
    } catch (error) {
      content.hwp5DrawingCornerErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/hwp5-drawing-style-content.mjs
function attachHwp5DrawingStyles(editor, content) {
  content.hwp5DrawingStyles = [];
  content.hwp5DrawingStyleErrors = [];
  if (!editor)
    return content;
  for (const section of new Set((content.hwp5Drawings ?? []).map((row) => row.section))) {
    try {
      if (content.hwp5DrawingMatrixErrors?.some((row) => row.section === section))
        throw new Error("IncompleteHwp5DrawingMatrices");
      const components = (content.hwp5DrawingMatrices ?? []).filter((row) => row.section === section && row.kind === "translation");
      const owners = new Map(components.map((row) => [row.component_node, row.owner_node]));
      if (owners.size !== components.length)
        throw new Error("AmbiguousHwp5DrawingStyleOwner");
      const version = typeof editor.fileVersion === "function" ? editor.fileVersion() : null;
      const tail = [83886848, 83887360, 83951617, 83951872].includes(version) ? "alpha_shadow_metadata" : "fill_only";
      const rows = validateHwp5DrawingStyleSources(editor.drawingStyleSources(section, { border: "observed13", tail }));
      for (const row of rows) {
        if (!owners.has(row.component_node) || owners.get(row.component_node) !== row.owner_node)
          throw new Error("Hwp5DrawingStyleOwnerMismatch");
        if (tail === "fill_only" ? row.alpha !== null || row.shadow !== null || row.metadata !== null : row.fill_known && (row.alpha === null || row.shadow === null || row.metadata === null))
          throw new Error("Hwp5DrawingStyleProfileMismatch");
      }
      for (const corner of (content.hwp5DrawingCorners ?? []).filter((row) => row.section === section)) {
        if (!rows.some((row) => row.component_node === corner.component_node))
          throw new Error("MissingHwp5RectangleStyle");
      }
      content.hwp5DrawingStyles.push(...rows.map((row) => ({
        ...row,
        section,
        fileVersion: version,
        borderLayout: "observed13",
        tailLayout: tail
      })));
    } catch (error) {
      content.hwp5DrawingStyleErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// js/hwp5-drawing-component-sources.mjs
function validateHwp5DrawingComponentSources(rows) {
  const fail = () => {
    throw new Error("InvalidHwp5DrawingComponentSources");
  };
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (!Array.isArray(rows))
    fail();
  const components = new Map, controls = new Set;
  let previous = -1;
  for (const row of rows) {
    if (!row || ![
      "component_node",
      "owner_node",
      "kind_id",
      "original_width",
      "original_height",
      "current_width",
      "current_height",
      "attributes",
      "extra_bytes"
    ].every((key) => integer(row[key], 0, 4294967295)) || !["offset_x", "offset_y", "rotation_x", "rotation_y"].every((key) => integer(row[key], -2147483648, 2147483647)) || !["group_count", "local_version", "matrix_pairs"].every((key) => integer(row[key], 0, 65535)) || !integer(row.rotation_angle, -32768, 32767) || row.second_id !== null && !integer(row.second_id, 0, 4294967295) || row.owner_node >= row.component_node || row.component_node <= previous)
      fail();
    if (row.second_id === null) {
      if (components.get(row.owner_node)?.kind_id !== 610496366)
        fail();
    } else {
      if (components.has(row.owner_node) || controls.has(row.owner_node))
        fail();
      controls.add(row.owner_node);
    }
    components.set(row.component_node, row);
    previous = row.component_node;
  }
  return rows;
}
function decodeHwp5DrawingComponentSources(bytes) {
  return validateHwp5DrawingComponentSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/hwp5-drawing-component-content.mjs
function attachHwp5DrawingComponents(editor, content) {
  content.hwp5DrawingComponents = [];
  content.hwp5DrawingComponentErrors = [];
  if (!editor)
    return content;
  for (const section of new Set((content.hwp5Drawings ?? []).map((row) => row.section))) {
    try {
      const rows = validateHwp5DrawingComponentSources(editor.drawingComponentSources(section));
      const roots = content.hwp5Drawings.filter((row) => row.section === section);
      const declared = rows.filter((row) => row.second_id !== null);
      if (roots.length !== declared.length || new Set(roots.map((row) => row.componentNode)).size !== roots.length)
        throw new Error("IncompleteHwp5DrawingComponents");
      for (const row of declared) {
        const root = roots.find((root) => root.componentNode === row.component_node);
        if (!root || root.controlNode !== row.owner_node)
          throw new Error("Hwp5DrawingComponentOwnerMismatch");
        for (const [key, sourceKey] of [
          ["kind_id", "kind_id"],
          ["offset_x", "component_offset_x"],
          ["offset_y", "component_offset_y"],
          ["original_width", "original_width"],
          ["original_height", "original_height"],
          ["current_width", "current_width"],
          ["current_height", "current_height"],
          ["attributes", "component_attributes"],
          ["rotation_angle", "rotation_angle"],
          ["matrix_pairs", "matrix_pairs"],
          ["extra_bytes", "component_extra_bytes"]
        ]) {
          if (row[key] !== root.source[sourceKey])
            throw new Error("Hwp5DrawingComponentSourceMismatch");
        }
      }
      content.hwp5DrawingComponents.push(...rows.map((row) => ({ ...row, section })));
    } catch (error) {
      content.hwp5DrawingComponentErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// js/hwp5-counted-point-layout.mjs
function countedPointLayoutArg(layout, error) {
  if (layout === "specified_i16_axes")
    return 0;
  if (layout === "observed_i32_points")
    return 1;
  throw new Error(error);
}

// js/hwp5-drawing-polygon-points.mjs
function polygonLayoutArg(layout) {
  return countedPointLayoutArg(layout, "InvalidPolygonLayout");
}
function validateHwp5DrawingPolygonPoints(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const pair = (value, valid) => Array.isArray(value) && value.length === 2 && Array.from(value).every(valid);
  const components = new Set, polygons = new Set;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5DrawingPolygonPoints");
  for (const row of rows) {
    if (!row || !uint(row.component_node) || !uint(row.polygon_node) || row.component_node >= row.polygon_node || !uint(row.extra_bytes) || components.has(row.component_node) || polygons.has(row.polygon_node) || !Array.isArray(row.raw_points) || !Array.isArray(row.points) || row.raw_points.length !== row.points.length || !Array.from(row.raw_points).every((p) => pair(p, (n) => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647)) || !Array.from(row.points).every((p) => pair(p, Number.isFinite)))
      throw new Error("InvalidHwp5DrawingPolygonPoints");
    components.add(row.component_node);
    polygons.add(row.polygon_node);
  }
  return rows;
}
function decodeHwp5DrawingPolygonPoints(bytes) {
  return validateHwp5DrawingPolygonPoints(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/hwp5-shape-point-content.mjs
function attachHwp5ShapePoints(editor, content, contract) {
  content[contract.rows] = [];
  content[contract.errors] = [];
  if (!editor)
    return content;
  const components = content.hwp5DrawingComponents ?? [], layout = "observed_i32_points";
  for (const section of new Set(components.filter((r) => r.kind_id === contract.kind).map((r) => r.section))) {
    try {
      if ([
        ...content.hwp5DrawingComponentErrors ?? [],
        ...content.hwp5DrawingLocalErrors ?? []
      ].some((r) => r.section === section))
        throw new Error(contract.incomplete);
      const expected = components.filter((r) => r.section === section && r.kind_id === contract.kind);
      const points = contract.validate(contract.read(editor, section, layout));
      if (points.length !== expected.length || new Set(expected.map((r) => r.component_node)).size !== expected.length)
        throw new Error(contract.inventory);
      for (const row of points) {
        const matches = expected.filter((source) => source.component_node === row.component_node);
        const local = (content.hwp5DrawingLocalTransforms ?? []).filter((source) => source.section === section && source.component_node === row.component_node);
        if (matches.length !== 1 || local.length !== 1 || local[0].owner_node !== matches[0].owner_node)
          throw new Error(contract.owner);
      }
      content[contract.rows].push(...points.map((row) => ({ ...row, section, layout })));
    } catch (error) {
      content[contract.errors].push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/hwp5-polygon-point-content.mjs
function attachHwp5PolygonPoints(editor, content) {
  return attachHwp5ShapePoints(editor, content, {
    kind: 611348332,
    rows: "hwp5PolygonPoints",
    errors: "hwp5PolygonPointErrors",
    validate: validateHwp5DrawingPolygonPoints,
    read: (e, section, layout) => e.drawingPolygonPoints(section, layout),
    incomplete: "IncompleteHwp5PolygonSources",
    inventory: "Hwp5PolygonInventoryMismatch",
    owner: "Hwp5PolygonTransformOwnerMismatch"
  });
}

// js/hwp5-drawing-curve-points.mjs
var curveLayoutArg = (layout) => countedPointLayoutArg(layout, "InvalidCurvePointLayout");
function validateHwp5DrawingCurvePoints(rows) {
  const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
  const signed = (v) => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
  const fail = () => {
    throw new Error("InvalidHwp5DrawingCurvePoints");
  };
  if (!Array.isArray(rows) || rows.length > 1e6)
    fail();
  const owners = new Set;
  for (const [i, r] of rows.entries()) {
    if (!r || !uint(r.component_node) || !uint(r.curve_node) || r.component_node >= r.curve_node || owners.has(r.component_node) || i > 0 && r.curve_node <= rows[i - 1].curve_node || !uint(r.extra_bytes) || !Array.isArray(r.raw_points) || r.raw_points.length > 1e6 || !Array.from(r.raw_points).every((p) => Array.isArray(p) && p.length === 2 && Array.from(p).every(signed)) || !Array.isArray(r.segments) || r.segments.length !== Math.max(0, r.raw_points.length - 1) || !Array.from(r.segments).every((v) => uint(v) && v <= 255))
      fail();
    owners.add(r.component_node);
  }
  return rows;
}
function decodeHwp5DrawingCurvePoints(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 64 * 1024 * 1024)
    throw new Error("InvalidHwp5DrawingCurvePoints");
  return validateHwp5DrawingCurvePoints(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/hwp5-curve-point-content.mjs
function attachHwp5CurvePoints(editor, content) {
  return attachHwp5ShapePoints(editor, content, {
    kind: 610497906,
    rows: "hwp5CurvePoints",
    errors: "hwp5CurvePointErrors",
    validate: validateHwp5DrawingCurvePoints,
    read: (e, section, layout) => e.drawingCurvePoints(section, layout),
    incomplete: "IncompleteHwp5CurveSources",
    inventory: "Hwp5CurveInventoryMismatch",
    owner: "Hwp5CurveTransformOwnerMismatch"
  });
}

// web/preview/hwp5-drawing-content.mjs
function attachHwp5Drawings(editor, content) {
  content.hwp5Drawings = [];
  content.hwp5DrawingErrors = [];
  content.hwp5DrawingObjectExtraErrors = [];
  attachHwp5PolygonPoints(null, content);
  attachHwp5CurvePoints(null, content);
  attachHwp5DrawingComponents(null, content);
  if (!editor)
    return attachHwp5DrawingStyles(editor, attachHwp5DrawingGeometry(attachHwp5DrawingCorners(editor, attachHwp5DrawingLocalTransforms(editor, attachHwp5DrawingMatrices(editor, attachHwp5DrawingBodies(editor, content))))));
  for (const section of new Set((content.paragraphs ?? []).map((row) => row.section))) {
    try {
      let sources = validateHwp5DrawingSources(editor.drawingSources(section));
      try {
        sources = withObservedDrawingObjectExtensions(editor, sources, section);
      } catch (error) {
        content.hwp5DrawingObjectExtraErrors.push({ section, error: error.message });
      }
      const anchors = validateHwp5DrawingAnchors(editor.drawingAnchors(section)), prepared = [];
      if (sources.length !== anchors.length)
        throw new Error("IncompleteHwp5DrawingAnchors");
      const paragraphsInSection = content.paragraphs.filter((row) => row.section === section);
      const flowsInSection = (content.currentParagraphFlows ?? []).filter((row) => row.section === section);
      if (new Set(paragraphsInSection.map((row) => row.paragraph)).size !== paragraphsInSection.length || new Set(flowsInSection.map((row) => row.paragraph)).size !== flowsInSection.length)
        throw new Error("AmbiguousHwp5DrawingOwner");
      for (const source of sources) {
        const anchor = anchors.find((row) => row.control_node === source.control_node && row.component_node === source.component_node);
        if (!anchor)
          throw new Error("MissingHwp5DrawingAnchor");
        const paragraphs = content.paragraphs.filter((row) => row.section === section && row.paragraph === anchor.paragraph);
        if (paragraphs.length !== 1 || paragraphs[0].clipped)
          throw new Error("MissingHwp5DrawingParagraph");
        const paragraph = paragraphs[0], flow = content.currentParagraphFlows?.find((row) => row.section === section && row.paragraph === anchor.paragraph);
        if (flow?.source_node !== source.paragraph_node)
          throw new Error("Hwp5DrawingOwnerMismatch");
        const unit = sourceDisplayPosition(anchor.current_unit, paragraph.sourceOffsets, paragraph.text.length);
        const end = sourceDisplayPosition(anchor.current_unit + 8, paragraph.sourceOffsets, paragraph.text.length);
        if (end !== unit + 1 || paragraph.text[unit] !== "￼")
          throw new Error("Hwp5DrawingDisplayAnchorMismatch");
        if (prepared.some((row) => row.hostParagraph === anchor.paragraph && row.anchorUnit === unit))
          throw new Error("AmbiguousHwp5DrawingAnchor");
        prepared.push({
          section,
          controlNode: source.control_node,
          componentNode: source.component_node,
          hostParagraph: anchor.paragraph,
          anchorUnit: unit,
          source,
          anchor
        });
      }
      content.hwp5Drawings.push(...prepared);
    } catch (error) {
      content.hwp5DrawingErrors.push({ section, error: error.message });
    }
  }
  attachHwp5DrawingComponents(editor, content);
  const prepared = attachHwp5DrawingStyles(editor, attachHwp5DrawingGeometry(attachHwp5DrawingCorners(editor, attachHwp5DrawingLocalTransforms(editor, attachHwp5DrawingMatrices(editor, attachHwp5DrawingBodies(editor, content))))));
  return attachHwp5CurvePoints(editor, attachHwp5PolygonPoints(editor, prepared));
}

// web/preview/hwp5-memo-content.mjs
function attachHwp5Memos(content) {
  content.hwp5Memos = [];
  content.hwp5MemoErrors = [];
  for (const paragraph of content.paragraphs ?? [])
    if (paragraph.memoSource) {
      const source = paragraph.memoSource;
      if (paragraph.selectionOwner === `section:${paragraph.section}:memo:${source.memoNode}:list:${source.listNode}`)
        paragraph.selectionOwner = null;
      delete paragraph.memoSource;
      delete paragraph.memoLabel;
    }
  const flows = content.currentParagraphFlows ?? [];
  const sections = new Set(flows.filter((row) => row.memo_node != null).map((row) => row.section));
  for (const section of sections) {
    try {
      const paragraphs = new Map;
      for (const row of content.paragraphs ?? []) {
        if (row.section !== section)
          continue;
        if (paragraphs.has(row.paragraph))
          throw new Error("AmbiguousHwp5MemoParagraph");
        paragraphs.set(row.paragraph, row);
      }
      const groups = new Map, seen = new Set;
      for (const row of flows) {
        if (row.section !== section || row.memo_node == null)
          continue;
        if (seen.has(row.paragraph))
          throw new Error("AmbiguousHwp5MemoParagraph");
        seen.add(row.paragraph);
        const paragraph = paragraphs.get(row.paragraph);
        if (!paragraph || paragraph.clipped)
          throw new Error("MissingHwp5MemoParagraph");
        if (!Number.isSafeInteger(row.memo_node) || row.memo_node < 0 || !Number.isSafeInteger(row.parent_node) || row.parent_node < 0 || row.host !== "other" || row.top_level !== false || row.list_node !== row.memo_node + 1 || !Number.isSafeInteger(row.memo_index) || row.memo_index < 0 || row.memo_index > 4294967295)
          throw new Error("InvalidHwp5MemoIdentity");
        let group = groups.get(row.memo_node);
        if (!group) {
          group = {
            section,
            memoNode: row.memo_node,
            memoIndex: row.memo_index,
            listNode: row.list_node,
            parentNode: row.parent_node,
            paragraphs: []
          };
          groups.set(row.memo_node, group);
        }
        if (group.memoIndex !== row.memo_index || group.listNode !== row.list_node || group.parentNode !== row.parent_node)
          throw new Error("ConflictingHwp5MemoIdentity");
        group.paragraphs.push(row.paragraph);
      }
      for (const group of groups.values())
        for (const index of group.paragraphs) {
          const paragraph = paragraphs.get(index);
          paragraph.memoSource = {
            memoNode: group.memoNode,
            memoIndex: group.memoIndex,
            listNode: group.listNode
          };
          paragraph.selectionOwner = `section:${section}:memo:${group.memoNode}:list:${group.listNode}`;
          paragraph.memoLabel = `구역 ${section + 1} · 메모 ${group.memoIndex} · 문단 ${index + 1}`;
        }
      content.hwp5Memos.push(...groups.values());
    } catch (error) {
      content.hwp5MemoErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/hwp5-flow-content.mjs
function attachHwp5FlowSources(editor, content) {
  content.currentParagraphFlows = [];
  content.columnSources = [];
  content.flowSourceErrors = [];
  attachHwp5Memos(content);
  if (!editor)
    return attachHwp5Drawings(editor, attachHwp5Captions(editor, attachHwp5Notes(editor, attachHwp5MasterPages(editor, attachHwp5PageAreas(editor, attachHwp5StructuralAnchors(editor, content))))));
  for (let section = 0;section < editor.sectionCount(); section++) {
    try {
      const flows = editor.paragraphFlow(section), columns = editor.columnSources(section);
      for (const declaration of columns) {
        const owner = flows[declaration.current_paragraph];
        if (!owner || owner.generated || owner.source_node !== declaration.paragraph_node)
          throw new Error("ColumnSourceBindingMismatch");
      }
      content.currentParagraphFlows.push(...flows.map((row) => ({ ...row, section })));
      content.columnSources.push(...columns.map((row) => ({ ...row, section })));
    } catch (error) {
      content.flowSourceErrors.push({ section, error: error.message });
    }
  }
  return attachHwp5Drawings(editor, attachHwp5Captions(editor, attachHwp5Notes(editor, attachHwp5MasterPages(editor, attachHwp5PageAreas(editor, attachHwp5StructuralAnchors(editor, attachHwp5Memos(content)))))));
}

// web/preview/hwp5-column-display.mjs
function attachHwp5ColumnDisplay(content) {
  content.columnDisplaySources = [];
  content.columnDisplayErrors = [];
  const paragraphs = new Map((content.paragraphs ?? []).map((row) => [`${row.section}:${row.paragraph}`, row]));
  for (const source of content.columnSources ?? []) {
    try {
      const paragraph = paragraphs.get(`${source.section}:${source.current_paragraph}`);
      if (!paragraph || paragraph.clipped || !Array.isArray(paragraph.sourceOffsets))
        throw new Error("MissingColumnDisplaySource");
      const unit = sourceDisplayPosition(source.current_unit, paragraph.sourceOffsets, paragraph.text.length);
      const end = sourceDisplayPosition(source.current_unit + 8, paragraph.sourceOffsets, paragraph.text.length);
      if (end !== unit + 1 || paragraph.text[unit] !== "￼")
        throw new Error("ColumnDisplayAnchorMismatch");
      content.columnDisplaySources.push({ ...source, display_unit: unit, display_end: end });
    } catch (error) {
      content.columnDisplayErrors.push({
        section: source.section,
        source_node: source.source_node,
        error: error.message
      });
    }
  }
  return content;
}

// js/hwp5-document-properties.mjs
function validateHwp5DocumentProperties(value) {
  const uint = (number, max) => Number.isInteger(number) && number >= 0 && number <= max;
  if (!value || !["source_record", "caret_list", "caret_paragraph", "caret_character", "extra_bytes"].every((key) => uint(value[key], 4294967295)) || ![
    "section_count",
    "page_start",
    "footnote_start",
    "endnote_start",
    "picture_start",
    "table_start",
    "equation_start"
  ].every((key) => uint(value[key], 65535)) || typeof value.extra_nonzero !== "boolean" || value.extra_bytes === 0 && value.extra_nonzero)
    throw new Error("InvalidHwp5DocumentProperties");
  return value;
}
function decodeHwp5DocumentProperties(bytes) {
  return validateHwp5DocumentProperties(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// js/hwp5-page-control-sources.mjs
function validateHwp5PageControlSources(rows) {
  const fail = () => {
    throw new Error("InvalidHwp5PageControlSources");
  };
  const uint = (value, max = 4294967295) => Number.isInteger(value) && value >= 0 && value <= max;
  if (!Array.isArray(rows))
    fail();
  const ids = new Set, positions = new Set;
  for (const row of rows) {
    if (!row || !["position", "hide", "restart", "parity"].includes(row.kind) || ![
      "control_node",
      "paragraph",
      "source_unit",
      "current_unit",
      "attributes",
      "extra_bytes"
    ].every((key) => uint(row[key])) || row.source_unit > 4294967287 || row.current_unit > 4294967287 || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero || ids.has(row.control_node))
      fail();
    for (const field of ["number", "symbol", "prefix", "suffix", "dash"]) {
      const present = row.kind === "position" ? field !== "number" : row.kind === "restart" && field === "number";
      if (present ? !uint(row[field], 65535) : row[field] !== null)
        fail();
    }
    const position = `${row.paragraph}:${row.current_unit}`;
    if (positions.has(position))
      fail();
    ids.add(row.control_node);
    positions.add(position);
  }
  return rows;
}
function decodeHwp5PageControlSources(bytes) {
  return validateHwp5PageControlSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/hwp5-document-numbering.mjs
function attachHwp5DocumentProperties(editor, content) {
  content.documentPropertySource = null;
  content.documentPropertySourceError = null;
  if (!editor || !(content.pageAreaSources?.length || content.pageControlSources?.length || content.masterPageSources?.length))
    return content;
  try {
    content.documentPropertySource = validateHwp5DocumentProperties(editor.documentProperties());
  } catch (error) {
    content.documentPropertySourceError = error.message;
  }
  return content;
}

// js/hwp5-automatic-number-sources.mjs
function validateHwp5AutomaticNumberSources(rows) {
  const uint = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5AutomaticNumberSources");
  const seen = new Set, positions = new Set;
  for (const row of rows) {
    if (!row || ![
      "control_node",
      "paragraph",
      "source_unit",
      "current_unit",
      "attributes",
      "extra_bytes"
    ].every((key) => uint(row[key], 4294967295)) || row.source_unit > 4294967287 || row.current_unit > 4294967287 || !["number", "symbol", "prefix", "suffix"].every((key) => uint(row[key], 65535)) || row.kind !== (row.attributes & 15) || row.shape !== (row.attributes >>> 4 & 255) || row.superscript !== Boolean(row.attributes & 4096) || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero || seen.has(row.control_node))
      throw new Error("InvalidHwp5AutomaticNumberSources");
    const position = `${row.paragraph}:${row.current_unit}`;
    if (positions.has(position))
      throw new Error("InvalidHwp5AutomaticNumberSources");
    seen.add(row.control_node);
    positions.add(position);
  }
  return rows;
}
function decodeHwp5AutomaticNumberSources(bytes) {
  return validateHwp5AutomaticNumberSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/cardinal-number.mjs
function cardinalNumber(number, language) {
  if (!Number.isInteger(number) || number < 0 || number > 4294967295 || !["hangul", "hanja"].includes(language))
    return null;
  const hangul = language === "hangul", digits = hangul ? "일이삼사오육칠팔구" : "一二三四五六七八九";
  const small = hangul ? ["", "십", "백", "천"] : ["", "十", "百", "千"];
  const large = hangul ? ["", "만", "억"] : ["", "萬", "億"];
  if (number === 0)
    return hangul ? "영" : "零";
  const parts = [];
  for (let groupIndex = 0, remaining = number;remaining > 0; groupIndex++, remaining = Math.floor(remaining / 1e4)) {
    const group = remaining % 1e4;
    if (group === 0)
      continue;
    let text = "";
    for (let position = 3;position >= 0; position--) {
      const digit = Math.floor(group / 10 ** position) % 10;
      if (digit !== 0)
        text += (digit === 1 && position > 0 ? "" : digits[digit - 1]) + small[position];
    }
    parts.unshift(text + large[groupIndex]);
  }
  return parts.join("");
}

// web/preview/number-format.mjs
var binaryNames = Object.freeze([
  "DIGIT",
  "CIRCLED_DIGIT",
  "ROMAN_CAPITAL",
  "ROMAN_SMALL",
  "LATIN_CAPITAL",
  "LATIN_SMALL",
  "CIRCLED_LATIN_CAPITAL",
  "CIRCLED_LATIN_SMALL",
  "HANGUL_SYLLABLE",
  "CIRCLED_HANGUL_SYLLABLE",
  "HANGUL_JAMO",
  "CIRCLED_HANGUL_JAMO",
  "HANGUL_PHONETIC",
  "IDEOGRAPH",
  "CIRCLED_IDEOGRAPH",
  "DECAGON_CIRCLE",
  "DECAGON_CIRCLE_HANJA"
]);
var hwp5NumberFormat = (code) => Number.isInteger(code) && code >= 0 && code <= 255 ? binaryNames[code] ?? (code === 128 ? "SYMBOL" : code === 129 ? "USER_CHAR" : null) : null;
var finite = Object.freeze({
  HANGUL_SYLLABLE: "가나다라마바사아자차카타파하",
  HANGUL_JAMO: "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ",
  DECAGON_CIRCLE: "갑을병정무기경신임계",
  DECAGON_CIRCLE_HANJA: "甲乙丙丁戊己庚辛壬癸"
});
var circles = Object.freeze({
  CIRCLED_DIGIT: [9312, 20],
  CIRCLED_LATIN_CAPITAL: [9398, 26],
  CIRCLED_LATIN_SMALL: [9424, 26],
  CIRCLED_HANGUL_SYLLABLE: [12910, 14],
  CIRCLED_HANGUL_JAMO: [12896, 14],
  CIRCLED_IDEOGRAPH: [12928, 10]
});
function formatNumber(number, kind, symbol = "") {
  if (!Number.isInteger(number) || number < 0 || number > 4294967295 || typeof kind !== "string")
    return null;
  if (kind === "DIGIT")
    return String(number);
  if (kind === "HANGUL_PHONETIC" || kind === "IDEOGRAPH")
    return cardinalNumber(number, kind === "HANGUL_PHONETIC" ? "hangul" : "hanja");
  if (number === 0)
    return null;
  if (kind === "USER_CHAR")
    return typeof symbol === "string" && [...symbol].length === 1 && ![...symbol].some((char) => char.codePointAt(0) >= 55296 && char.codePointAt(0) <= 57343) ? symbol : null;
  if (Object.hasOwn(circles, kind)) {
    const [start, count] = circles[kind];
    return number <= count ? String.fromCodePoint(start + number - 1) : null;
  }
  if (Object.hasOwn(finite, kind))
    return [...finite[kind]][number - 1] ?? null;
  if (["LATIN_CAPITAL", "LATIN_SMALL"].includes(kind)) {
    const base = kind === "LATIN_CAPITAL" ? 65 : 97;
    let result = "", remaining = number;
    while (remaining > 0) {
      remaining--;
      result = String.fromCharCode(base + remaining % 26) + result;
      remaining = Math.floor(remaining / 26);
    }
    return result;
  }
  if (["ROMAN_CAPITAL", "ROMAN_SMALL"].includes(kind)) {
    if (number > 3999)
      return null;
    let result = "", remaining = number;
    for (const [value, text] of [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"]
    ]) {
      while (remaining >= value) {
        result += text;
        remaining -= value;
      }
    }
    return kind === "ROMAN_SMALL" ? result.toLowerCase() : result;
  }
  return null;
}

// web/preview/automatic-number-text.mjs
function storedAutomaticNumberText(source) {
  const { values, format } = source ?? {};
  if (!values?.type_known || !format?.type_known || !Array.isArray(format.raw) || typeof format.supscript !== "boolean" || typeof format.raw[2] !== "string" || typeof format.raw[3] !== "string")
    return null;
  const text = formatNumber(values.num, format.raw[0], format.raw[1]);
  return text === null ? null : format.raw[2] + text + format.raw[3];
}

// web/preview/hwp5-note-reference-display.mjs
function attachHwp5NoteReferenceDisplay(content) {
  const paragraphs = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p]));
  for (const note of content.hwp5Notes ?? []) {
    const host = paragraphs.get(`${note.section}:${note.hostParagraph}`);
    if (!host || host.text[note.anchorUnit] !== "￼" || host.automaticNumbers?.some((row) => row.unit === note.anchorUnit))
      continue;
    const candidates = note.paragraphs.flatMap((id) => paragraphs.get(`${note.section}:${id}`)?.automaticNumbers ?? []);
    if (!candidates.length)
      continue;
    const number = candidates[0], expectedKind = note.kind === "footnote" ? 1 : note.kind === "endnote" ? 2 : null;
    if (expectedKind === null || candidates.some((candidate) => candidate.hwp5Source?.kind !== expectedKind || storedAutomaticNumberText(candidate.source) === null || candidate.source.values.num !== number.source?.values.num || candidate.source.format.supscript !== number.source?.format.supscript || JSON.stringify(candidate.source.format.raw) !== JSON.stringify(number.source?.format.raw)))
      continue;
    host.automaticNumbers ??= [];
    host.automaticNumbers.push({
      unit: note.anchorUnit,
      kind: "hwp5-note-reference",
      noteNode: note.controlNode,
      numberNode: number.numberNode,
      numberNodes: candidates.map((candidate) => candidate.numberNode),
      source: number.source
    });
  }
  return content;
}

// web/preview/hwp5-automatic-number-content.mjs
function ornament(unit) {
  if (unit >= 55296 && unit <= 57343)
    throw new Error("UnsupportedHwp5NumberOrnament");
  return unit === 0 ? "" : String.fromCharCode(unit);
}
function hwp5AutomaticNumberDisplay(row, host) {
  validateHwp5AutomaticNumberSources([row]);
  const format = hwp5NumberFormat(row.shape);
  const known = row.kind <= 5 && format !== null && (!row.superscript || row.kind === 1) && (row.attributes & ~8191) === 0 && row.extra_bytes === 0;
  return {
    values: { type_known: row.kind <= 5, num: row.number },
    format: {
      type_known: known,
      raw: [
        known ? format : "UNKNOWN",
        ornament(row.symbol),
        ornament(row.prefix),
        ornament(row.suffix)
      ],
      supscript: row.superscript
    },
    hwp5PageNumber: known && row.kind === 0 && ["header", "footer"].includes(host)
  };
}
function attachHwp5AutomaticNumbers(editor, content) {
  content.automaticNumberErrors = [];
  for (const paragraph of content.paragraphs) {
    paragraph.automaticNumbers = [];
    paragraph.automaticNumberPrefixes = [];
  }
  if (!editor)
    return content;
  for (let section = 0;section < editor.sectionCount(); section++) {
    try {
      const rows = validateHwp5AutomaticNumberSources(editor.automaticNumberSources(section)), prepared = [];
      for (const row of rows) {
        const paragraph = content.paragraphs.find((p) => p.section === section && p.paragraph === row.paragraph);
        if (!paragraph || paragraph.clipped)
          throw new Error("Hwp5AutomaticNumberOwnerMismatch");
        const unit = sourceDisplayPosition(row.current_unit, paragraph.sourceOffsets, paragraph.text.length);
        const end = sourceDisplayPosition(row.current_unit + 8, paragraph.sourceOffsets, paragraph.text.length);
        if (end !== unit + 1 || paragraph.text[unit] !== "￼")
          throw new Error("Hwp5AutomaticNumberAnchorMismatch");
        const host = content.currentParagraphFlows.find((flow) => flow.section === section && flow.paragraph === row.paragraph)?.host;
        prepared.push({
          paragraph,
          number: {
            unit,
            numberNode: row.control_node,
            hwp5Source: row,
            source: hwp5AutomaticNumberDisplay(row, host)
          }
        });
      }
      for (const { paragraph, number } of prepared)
        paragraph.automaticNumbers.push(number);
    } catch (error) {
      content.automaticNumberErrors.push({ section, error: error.message });
    }
  }
  return attachHwp5NoteReferenceDisplay(content);
}

// web/preview/hwp5-page-control-content.mjs
function attachHwp5PageControls(editor, content) {
  content.pageControlSources = [];
  content.pageControlSourceErrors = [];
  for (const paragraph of content.paragraphs)
    paragraph.pageControls = [];
  if (!editor)
    return content;
  for (let section = 0;section < editor.sectionCount(); section++) {
    try {
      const rows = validateHwp5PageControlSources(editor.pageControlSources(section));
      const projected = rows.map((row) => {
        const owners = content.paragraphs.filter((p) => p.section === section && p.paragraph === row.paragraph);
        if (owners.length !== 1 || owners[0].clipped)
          throw new Error("Hwp5PageControlOwnerMismatch");
        const paragraph = owners[0], unit = sourceDisplayPosition(row.current_unit, paragraph.sourceOffsets, paragraph.text.length);
        const end = sourceDisplayPosition(row.current_unit + 8, paragraph.sourceOffsets, paragraph.text.length);
        if (end !== unit + 1 || paragraph.text[unit] !== "￼")
          throw new Error("Hwp5PageControlAnchorMismatch");
        return { ...row, section, unit };
      });
      content.pageControlSources.push(...projected);
      for (const row of projected)
        content.paragraphs.find((p) => p.section === section && p.paragraph === row.paragraph).pageControls.push(row);
    } catch (error) {
      content.pageControlSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/hwp5-page-declaration-content.mjs
function attachHwp5PageDeclarations(editor, content, selectedSections = null) {
  content.pageSources = [];
  content.pageSourceErrors = [];
  content.sectionSources = [];
  content.sectionSourceErrors = [];
  if (!editor)
    return content;
  const sections = selectedSections ?? Array.from({ length: editor.sectionCount() }, (_, index) => index);
  for (const section of sections) {
    try {
      const setting = editor.sectionSettings(section);
      let fileVersion;
      try {
        fileVersion = editor.fileVersion?.();
      } catch (error) {
        if (error.message !== "Hwp5FileVersionAbiUnavailable")
          throw error;
      }
      content.sectionSources.push({
        section,
        ...setting,
        ...fileVersion === undefined ? {} : { fileVersion }
      });
    } catch (error) {
      content.sectionSourceErrors.push({ section, error: error.message });
    }
    try {
      content.pageSources.push({ section, ...editor.pageSettings(section) });
    } catch (error) {
      content.pageSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// web/preview/hwp5-page-content.mjs
function attachHwp5PageSources(editor, content) {
  attachHwp5PageDeclarations(editor, content);
  if (!editor)
    return attachHwp5PageControls(editor, attachHwp5ColumnDisplay(attachHwp5FlowSources(editor, content)));
  return attachHwp5DocumentProperties(editor, attachHwp5PageControls(editor, attachHwp5AutomaticNumbers(editor, attachHwp5ColumnDisplay(attachHwp5FlowSources(editor, content)))));
}

// web/preview/hwp5-rectangle-geometry-projection.mjs
function projectHwp5RectangleGeometry(content) {
  const fail = (error) => ({ state: "unavailable", error });
  try {
    if (content.hwp5DrawingErrors?.length || content.hwp5DrawingLocalErrors?.length || content.hwp5DrawingCornerErrors?.length)
      throw new Error("IncompleteHwp5RectangleGeometry");
    const drawings = [], seen = new Set;
    for (const drawing of content.hwp5Drawings ?? []) {
      if (drawing.source?.kind_id !== 611476835)
        throw new Error("UnsupportedHwp5RectangleRoot");
      const key = `${drawing.section}:${drawing.componentNode}`;
      if (seen.has(key) || drawing.source.component_node !== drawing.componentNode || drawing.source.control_node !== drawing.controlNode)
        throw new Error("AmbiguousHwp5RectangleGeometry");
      seen.add(key);
      const locals = (content.hwp5DrawingLocalTransforms ?? []).filter((row) => row.section === drawing.section && row.component_node === drawing.componentNode);
      const corners = (content.hwp5DrawingCorners ?? []).filter((row) => row.section === drawing.section && row.component_node === drawing.componentNode);
      if (locals.length !== 1 || corners.length !== 1)
        throw new Error("MissingHwp5RectangleGeometry");
      validateHwp5DrawingLocalTransforms(locals);
      validateHwp5DrawingRectangleCorners(corners);
      if (locals[0].owner_node !== drawing.controlNode)
        throw new Error("UnsupportedHwp5RectangleComponent");
      const source = hwp5DrawingGeometry(drawing.source);
      source.group_context = null;
      source.rendering = {
        matrix: [...locals[0].matrix],
        angle: drawing.source.rotation_angle,
        flip: [
          !!(drawing.source.component_attributes & 1),
          !!(drawing.source.component_attributes & 2)
        ],
        reverse: null,
        unknown_component_attributes: (drawing.source.component_attributes & ~3) >>> 0
      };
      source.rendering_corners = corners[0].points.map((point) => [...point]);
      if (corners[0].raw_points !== undefined)
        source.rectangle = { points: corners[0].raw_points.map((point) => [...point]) };
      source.round_rate = corners[0].round_rate;
      drawings.push({
        section: drawing.section,
        drawingNode: drawing.componentNode,
        controlNode: drawing.controlNode,
        hostParagraph: drawing.hostParagraph,
        anchorUnit: drawing.anchorUnit,
        source
      });
    }
    return { state: "projected", drawings };
  } catch (error) {
    return fail(error.message);
  }
}

// web/preview/projection-pair-index.mjs
var none = Object.freeze({ count: 0, first: undefined });
function createProjectionPairIndex(rows, firstKey, secondKey, { enabled = true } = {}) {
  rows ??= [];
  let built = false, index = null, entryVisits = 0, fallbackEntryVisits = 0, queries = 0;
  function build() {
    built = true;
    if (!enabled || !Array.isArray(rows))
      return;
    const arrayDescriptors = Object.getOwnPropertyDescriptors(rows), length = arrayDescriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0)
      return;
    const groups = new Map;
    for (let position = 0;position < length; position++) {
      const item = arrayDescriptors[String(position)];
      if (!item || !Object.hasOwn(item, "value"))
        return;
      const row = item.value;
      entryVisits++;
      if (!row || ![Object.prototype, null].includes(Object.getPrototypeOf(row)))
        return;
      const descriptors = Object.getOwnPropertyDescriptors(row);
      if (Reflect.ownKeys(descriptors).some((key) => !Object.hasOwn(descriptors[key], "value")))
        return;
      const observed = Object.isFrozen(row) ? row : Object.freeze(Object.defineProperties(Object.create(Object.getPrototypeOf(row)), descriptors));
      const first = descriptors[firstKey], second = descriptors[secondKey];
      if (!first || !second)
        return;
      const a = first.value, b = second.value;
      if (Number.isNaN(a) || Number.isNaN(b))
        continue;
      let group = groups.get(a);
      if (!group) {
        group = new Map;
        groups.set(a, group);
      }
      const old = group.get(b);
      if (old)
        old.count++;
      else
        group.set(b, { count: 1, first: observed });
    }
    index = groups;
  }
  return {
    find(first, second) {
      queries++;
      if (!built) {
        try {
          build();
        } catch {
          built = true;
          index = null;
        }
      }
      if (index)
        return Number.isNaN(first) || Number.isNaN(second) ? none : index.get(first)?.get(second) ?? none;
      const matches = rows.filter((row) => {
        fallbackEntryVisits++;
        return row[firstKey] === first && row[secondKey] === second;
      });
      return matches.length ? { count: matches.length, first: matches[0] } : none;
    },
    stats: () => ({ entryVisits, fallbackEntryVisits, queries, indexed: index !== null })
  };
}
function isProjectionDataOnly(value) {
  const active = new WeakSet, seen = new WeakSet, stack = [{ value, exit: false }];
  try {
    while (stack.length) {
      const item = stack.pop(), node = item.value;
      if (node === null || ["undefined", "string", "number", "boolean"].includes(typeof node))
        continue;
      if (typeof node !== "object")
        return false;
      if (item.exit) {
        active.delete(node);
        seen.add(node);
        continue;
      }
      if (active.has(node))
        return false;
      if (seen.has(node))
        continue;
      const proto = Object.getPrototypeOf(node);
      if (![Object.prototype, Array.prototype, null].includes(proto))
        return false;
      active.add(node);
      stack.push({ value: node, exit: true });
      const descriptors = Object.getOwnPropertyDescriptors(node);
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== "string")
          return false;
        const d = descriptors[key];
        if (!Object.hasOwn(d, "value"))
          return false;
        stack.push({ value: d.value, exit: false });
      }
    }
    return true;
  } catch {
    return false;
  }
}

// web/preview/hwp5-drawing-text-source.mjs
function hwp5DrawingTextSource(source) {
  validateHwp5DrawingListSources([source]);
  if (source.kind !== "body")
    throw new Error("UnsupportedHwp5DrawingTextList");
  if ((source.attributes & ~127) !== 0)
    throw new Error("UnsupportedHwp5DrawingTextAttributes");
  return {
    list_node: source.list_node,
    text_direction: source.attributes & 7,
    line_wrap: source.attributes >>> 3 & 3,
    vertical_alignment: source.attributes >>> 5 & 3,
    margin_present: true,
    margins: [...source.margins],
    extra_bytes: source.body_extra_bytes
  };
}

// web/preview/hwp5-drawing-text-projection.mjs
function projectHwp5DrawingText(content) {
  const fail = (error) => ({ state: "unavailable", error });
  try {
    if (!Array.isArray(content?.paragraphs) || content.hwp5DrawingErrors?.length || content.hwp5DrawingBodyErrors?.length)
      throw new Error("IncompleteHwp5DrawingTextSources");
    const paragraphs = new Map, owners = new Map, bindings = [];
    for (const paragraph of content.paragraphs) {
      const key = `${paragraph.section}:${paragraph.paragraph}`;
      if (paragraphs.has(key))
        throw new Error("AmbiguousHwp5DrawingTextParagraph");
      paragraphs.set(key, paragraph);
    }
    const bodies = content.hwp5DrawingBodies ?? [];
    const rootsData = Object.getOwnPropertyDescriptor(content, "hwp5Drawings");
    const flowsData = Object.getOwnPropertyDescriptor(content, "currentParagraphFlows");
    const stableBodies = Array.isArray(bodies) && bodies.length > 0 && rootsData && Object.hasOwn(rootsData, "value") && flowsData && Object.hasOwn(flowsData, "value") && Array.isArray(rootsData.value ?? []) && Array.isArray(flowsData.value ?? []) && isProjectionDataOnly([bodies, content.paragraphs, rootsData.value, flowsData.value]);
    const rootsByOwner = stableBodies ? createProjectionPairIndex(rootsData.value ?? [], "section", "controlNode") : null;
    const flowsByParagraph = stableBodies ? createProjectionPairIndex(flowsData.value ?? [], "section", "paragraph") : null;
    const lists = new Set;
    for (const body of bodies) {
      validateHwp5DrawingListSources([body.source]);
      const source = body.source, listKey = `${body.section}:${body.listNode}`;
      if (lists.has(listKey) || body.kind !== source.kind || body.ownerNode !== source.owner_node || body.controlNode !== source.control_node || body.listNode !== source.list_node)
        throw new Error("Hwp5DrawingTextSourceMismatch");
      lists.add(listKey);
      const rootMatches = stableBodies ? null : (content.hwp5Drawings ?? []).filter((row) => row.section === body.section && row.controlNode === body.controlNode);
      const roots = !stableBodies ? { count: rootMatches.length, first: rootMatches[0] } : rootsByOwner.find(body.section, body.controlNode);
      if (roots.count !== 1)
        throw new Error("MissingHwp5DrawingTextRoot");
      const drawingNode = body.kind === "body" ? body.ownerNode : roots.first.componentNode;
      const text = body.kind === "body" ? hwp5DrawingTextSource(source) : null;
      const caption = body.kind === "caption" ? hwp5CaptionGeometry({
        ...source.caption,
        attributes: source.attributes,
        list_node: body.listNode
      }) : null;
      if (!Array.isArray(body.paragraphs))
        throw new Error("InvalidHwp5DrawingTextMembers");
      for (const id of body.paragraphs) {
        const key = `${body.section}:${id}`, paragraph = paragraphs.get(key);
        const flowMatches = stableBodies ? null : (content.currentParagraphFlows ?? []).filter((row) => row.section === body.section && row.paragraph === id);
        const flows = !stableBodies ? { count: flowMatches.length, first: flowMatches[0] } : flowsByParagraph.find(body.section, id);
        if (!Number.isInteger(id) || id < 0 || id > 4294967295 || owners.has(key) || !paragraph || paragraph.clipped || paragraph.tableCell || paragraph.tableCaption || flows.count !== 1 || flows.first.host !== "drawing" || flows.first.parent_node !== body.ownerNode || flows.first.list_node !== body.listNode || flows.first.top_level !== false)
          throw new Error("Hwp5DrawingTextMemberMismatch");
        owners.set(key, {
          kind: body.kind,
          drawingNode,
          listNode: body.listNode,
          captionNode: caption?.caption_node
        });
      }
      bindings.push({
        section: body.section,
        kind: body.kind,
        controlNode: body.controlNode,
        drawingNode,
        listNode: body.listNode,
        text,
        caption
      });
    }
    for (const flow of content.currentParagraphFlows ?? [])
      if (flow.host === "drawing" && !owners.has(`${flow.section}:${flow.paragraph}`))
        throw new Error("MissingHwp5DrawingTextMember");
    const projected = content.paragraphs.map((paragraph) => {
      if (Object.isFrozen(paragraph) && [Object.prototype, null].includes(Object.getPrototypeOf(paragraph)) && !("drawingText" in paragraph) && !("drawingCaption" in paragraph) && Reflect.ownKeys(paragraph).every((key) => typeof key === "string" && Object.hasOwn(Object.getOwnPropertyDescriptor(paragraph, key), "value")) && !owners.has(`${paragraph.section}:${paragraph.paragraph}`))
        return paragraph;
      const {
        drawingText: _previousDrawingText,
        drawingCaption: _previousDrawingCaption,
        ...copy
      } = paragraph;
      const owner = owners.get(`${paragraph.section}:${paragraph.paragraph}`);
      if (owner)
        copy[owner.kind === "body" ? "drawingText" : "drawingCaption"] = {
          drawingNode: owner.drawingNode,
          listNode: owner.listNode,
          ...owner.kind === "caption" ? { captionNode: owner.captionNode } : {}
        };
      return copy;
    });
    return { state: "projected", paragraphs: projected, bindings };
  } catch (error) {
    return fail(error.message);
  }
}

// web/preview/gradient-step-stops.mjs
function gradientStepStops(colors, steps, centerPercent) {
  if (!Array.isArray(colors) || colors.length < 2 || colors.length > 256 || !colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)) || !Number.isInteger(steps) || steps < 0 || steps > 255 || !Number.isInteger(centerPercent) || centerPercent < 0 || centerPercent > 100)
    throw new Error("InvalidGradientStepStops");
  if (steps === 0)
    return [];
  if (steps === 1)
    throw new Error("UnsupportedSingleGradientStep");
  const rgb = colors.map((c) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16)));
  const colorAt = (position) => {
    const coordinate = position * (rgb.length - 1), index = Math.min(Math.floor(coordinate), rgb.length - 2), fraction = coordinate - index;
    return "#" + rgb[index].map((channel, axis) => Math.round(channel + (rgb[index + 1][axis] - channel) * fraction).toString(16).padStart(2, "0")).join("");
  };
  const center = centerPercent / 100;
  const inverse = (t) => t <= 0.5 ? t * 2 * center : center + (t - 0.5) * 2 * (1 - center);
  const stops = [{ offset: 0, color: colorAt(0) }];
  for (let i = 0;i < steps - 1; i++) {
    const offset = inverse((i + 0.5) / (steps - 1));
    stops.push({ offset, color: colorAt(i / (steps - 1)) }, { offset, color: colorAt((i + 1) / (steps - 1)) });
  }
  stops.push({ offset: 1, color: colorAt(1) });
  return stops;
}

// web/preview/hwp5-drawing-paint-plan.mjs
var hatches = ["HORIZONTAL", "VERTICAL", "BACK_SLASH", "SLASH", "CROSS", "CROSS_DIAGONAL"];
function hwp5DrawingPaintPlan(style) {
  const fail = (error) => ({ state: "unavailable", error });
  try {
    validateHwp5DrawingStyleSources([style]);
  } catch (error) {
    return fail(error.message);
  }
  const tail = hwp5DrawingPaintTail(style);
  if (tail.state !== "selected")
    return tail;
  const color = colorrefCss;
  const line = style.border.attributes.raw & 63;
  const cap = style.border.attributes.raw >>> 6 & 15;
  const stroke = hwp5StrokeDisplay(style.border);
  if (!stroke || (line === 0 ? cap > 1 : cap !== 1) || (style.border.attributes.raw >>> 10 & 63) !== 0 || (style.border.attributes.raw >>> 16 & 63) !== 0 || style.border.outline !== 0)
    return fail("UnsupportedHwp5DrawingStroke");
  let fill;
  if (style.fill_flags === 0 && style.additional_bytes === 0)
    fill = { state: "none" };
  else if (style.fill_flags === 1 && style.additional_bytes === 0 && style.alpha.pattern === 0) {
    const pattern = style.pattern, background = color(pattern.background), foreground = color(pattern.foreground);
    if (!background || !foreground)
      return fail("UnsupportedHwp5DrawingFillColor");
    if (pattern.kind === -1)
      fill = { state: "solid", color: background };
    else if (hatches[pattern.kind])
      fill = {
        state: "pattern",
        background,
        color: foreground,
        kind: hatches[pattern.kind],
        rasterParity: "unverified"
      };
    else
      return fail("UnsupportedHwp5DrawingHatch");
  } else if (style.fill_flags === 4 && style.additional_bytes === 1 && style.alpha.gradient === 0) {
    const g = style.gradient;
    if (!g || g.kind !== 1 || g.positions.length !== 0 || g.blur_center === null)
      return fail("UnsupportedHwp5DrawingGradient");
    try {
      const stops = gradientStepStops(g.colors.map(color), g.blur, g.blur_center);
      fill = stops.length ? { state: "linear_gradient", angle: g.angle, stops, rasterParity: "unverified" } : { state: "none" };
    } catch (error) {
      return fail(error.message);
    }
  } else
    return fail("UnsupportedHwp5DrawingFill");
  return { state: "planned", stroke, fill, shadowType: tail.shadowType, tailPolicy: tail.policy };
}

// web/preview/hwp5-rectangle-content-projection.mjs
function projectHwp5RectangleContent(content) {
  const geometry = projectHwp5RectangleGeometry(content);
  if (geometry.state !== "projected")
    return geometry;
  const text = projectHwp5DrawingText(content);
  if (text.state !== "projected")
    return text;
  return assembleHwp5RectangleContent(content, geometry, text);
}
function assembleHwp5RectangleContent(content, geometry, text) {
  const fail = (error) => ({ state: "unavailable", error });
  if (geometry?.state !== "projected" || text?.state !== "projected")
    return fail("IncompleteHwp5RectangleProjection");
  if (content.hwp5DrawingStyleErrors?.length)
    return fail("IncompleteHwp5DrawingPaintSources");
  const drawings = [];
  for (const drawing of geometry.drawings) {
    const styles = (content.hwp5DrawingStyles ?? []).filter((row) => row.section === drawing.section && row.component_node === drawing.drawingNode && row.owner_node === drawing.controlNode);
    if (styles.length !== 1)
      return fail("MissingHwp5DrawingPaintSource");
    const paint = hwp5DrawingPaintPlan(styles[0]);
    if (paint.state !== "planned")
      return paint;
    const bindings = text.bindings.filter((row) => row.section === drawing.section && row.drawingNode === drawing.drawingNode);
    const bodies = bindings.filter((row) => row.kind === "body"), captions = bindings.filter((row) => row.kind === "caption");
    if (bodies.length > 1 || captions.length > 1 || drawing.source.has_caption !== (captions.length === 1))
      return fail("AmbiguousHwp5RectangleText");
    drawing.source.text = bodies[0]?.text ?? null;
    drawing.source.caption = captions[0]?.caption ?? null;
    drawing.source.stroke = paint.stroke;
    drawing.source.paint = { shadow_type: paint.shadowType };
    drawing.source.flow.outside_margins = [...drawing.source.out_margin];
    drawings.push({ ...drawing, hwp5Style: structuredClone(styles[0]), fillPlan: paint.fill });
  }
  return {
    state: "projected",
    content: { ...content, paragraphs: text.paragraphs, drawings, containers: [] }
  };
}

// web/preview/hwp5-polygon-path-source.mjs
function hwp5PolygonPathSource(row) {
  try {
    validateHwp5DrawingPolygonPoints([row]);
  } catch (error) {
    return { state: "unavailable", error: error.message };
  }
  if (row.points.length < 2)
    return { state: "unavailable", error: "UnsupportedHwp5PolygonPointCount" };
  const first = row.raw_points[0], last = row.raw_points.at(-1);
  const strokeOnly = row.points.length === 2;
  if (strokeOnly && (first[0] === last[0] && first[1] === last[1] || row.points[0][0] === row.points[1][0] && row.points[0][1] === row.points[1][1]))
    return { state: "unavailable", error: "DegenerateHwp5PolygonSegment" };
  return {
    state: "planned",
    source: {
      rendering_polygon: row.points.map((point) => [...point]),
      polygon_closed: first[0] === last[0] && first[1] === last[1],
      polygon_tail: { extra_bytes: row.extra_bytes, interpreted: false }
    }
  };
}

// web/preview/affine-point-geometry.mjs
var valid = (matrix) => Array.isArray(matrix) && matrix.length === 6 && Array.from(matrix).every(Number.isFinite);
function affinePoint(matrix, point) {
  if (!valid(matrix) || !Array.isArray(point) || point.length !== 2 || !Array.from(point).every(Number.isFinite))
    return null;
  const [a, b, c, d, e, f] = matrix, [x, y] = point;
  const result = [a * x + c * y + e, b * x + d * y + f];
  return result.every(Number.isFinite) ? result : null;
}

// web/preview/hwp5-group-polygon-geometry.mjs
function projectHwp5GroupPolygonGeometry(content, component, local) {
  const fail = (error) => ({ state: "unavailable", error });
  if (!component || !local || component.kind_id !== 611348332 || component.second_id !== null || component.component_node !== local.component_node || component.owner_node !== local.owner_node)
    return fail("Hwp5GroupPolygonOwnerMismatch");
  if (content.hwp5PolygonPointErrors?.some((row) => row.section === component.section))
    return fail("IncompleteHwp5GroupPolygonPoints");
  const points = (content.hwp5PolygonPoints ?? []).filter((row) => row.section === component.section && row.component_node === component.component_node);
  if (points.length !== 1)
    return fail("MissingHwp5GroupPolygonPoints");
  if (points[0].layout !== "observed_i32_points")
    return fail("UnsupportedHwp5GroupPolygonLayout");
  const path = hwp5PolygonPathSource(points[0]);
  if (path.state !== "planned")
    return path;
  const { original_width: width, original_height: height } = component, m = local.matrix;
  if (![width, height].every((value) => Number.isSafeInteger(value) && value > 0 && value <= 4294967295) || !Array.isArray(m) || m.length !== 6 || !Array.from(m).every(Number.isFinite))
    return fail("InvalidHwp5GroupPolygonBounds");
  const matrix = [m[0], m[3], m[1], m[4], m[2], m[5]];
  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height]
  ].map((point) => affinePoint(matrix, point));
  if (corners.some((point) => point === null))
    return fail("InvalidHwp5GroupPolygonBounds");
  return {
    state: "projected",
    source: { ...path.source, rendering_corners: corners, component: structuredClone(component) }
  };
}

// web/preview/hwp5-group-geometry-projection.mjs
var kinds3 = new Map([
  [610496366, "container"],
  [611476835, "rectangle"],
  [611346787, "picture"],
  [611084654, "line"],
  [611348332, "polygon"]
]);
function projectHwp5GroupGeometry(content) {
  try {
    if ([
      "hwp5DrawingErrors",
      "hwp5DrawingComponentErrors",
      "hwp5DrawingLocalErrors",
      "hwp5DrawingCornerErrors"
    ].some((key) => content[key]?.length))
      throw new Error("IncompleteHwp5GroupGeometry");
    const containers = [], rectangles = [], polygons = [], pictureBindings = [], lineBindings = [];
    for (const section of new Set((content.hwp5DrawingComponents ?? []).map((row) => row.section))) {
      const rows = validateHwp5DrawingComponentSources(content.hwp5DrawingComponents.filter((row) => row.section === section));
      const byNode = new Map(rows.map((row) => [row.component_node, row]));
      const rootFor = (row) => {
        let current = row;
        while (current.second_id === null)
          current = byNode.get(current.owner_node);
        return current;
      };
      for (const row of rows) {
        const root = rootFor(row);
        if (root.kind_id !== 610496366)
          continue;
        const kind = kinds3.get(row.kind_id);
        if (!kind)
          throw new Error("UnsupportedHwp5GroupChild");
        const anchors = (content.hwp5Drawings ?? []).filter((item) => item.section === section && item.componentNode === root.component_node);
        if (anchors.length !== 1 || anchors[0].controlNode !== root.owner_node)
          throw new Error("MissingHwp5GroupRootAnchor");
        const anchor = anchors[0];
        const locals = (content.hwp5DrawingLocalTransforms ?? []).filter((item) => item.section === section && item.component_node === row.component_node);
        if (locals.length !== 1 || locals[0].owner_node !== row.owner_node)
          throw new Error("MissingHwp5GroupLocalTransform");
        validateHwp5DrawingLocalTransforms(locals);
        const context = row.second_id !== null ? null : { parent_container: row.owner_node, root_anchor: root.component_node };
        const rendering = {
          matrix: [...locals[0].matrix],
          angle: row.rotation_angle,
          flip: [!!(row.attributes & 1), !!(row.attributes & 2)],
          reverse: null,
          unknown_component_attributes: (row.attributes & ~3) >>> 0
        };
        const binding = {
          section,
          hostParagraph: anchor.hostParagraph,
          anchorUnit: anchor.anchorUnit
        };
        if (kind === "container") {
          const source = row.second_id !== null ? hwp5DrawingGeometry(anchor.source) : {};
          Object.assign(source, {
            container_node: row.component_node,
            group_context: context,
            rendering,
            component: structuredClone(row),
            shape_children: rows.filter((child) => child.owner_node === row.component_node).map((child) => ({
              node: child.component_node,
              kind: kinds3.get(child.kind_id) ?? "unsupported"
            }))
          });
          containers.push({ ...binding, containerNode: row.component_node, source });
        } else if (kind === "rectangle") {
          const corners = (content.hwp5DrawingCorners ?? []).filter((item) => item.section === section && item.component_node === row.component_node);
          if (corners.length !== 1 || !corners[0].raw_points)
            throw new Error("MissingHwp5GroupRectangleCorners");
          validateHwp5DrawingRectangleCorners(corners);
          rectangles.push({
            ...binding,
            drawingNode: row.component_node,
            source: {
              group_context: context,
              rendering,
              rendering_corners: corners[0].points.map((point) => [...point]),
              rectangle: { points: corners[0].raw_points.map((point) => [...point]) },
              round_rate: corners[0].round_rate,
              component: structuredClone(row)
            }
          });
        } else if (kind === "polygon") {
          const polygon = projectHwp5GroupPolygonGeometry(content, row, locals[0]);
          if (polygon.state !== "projected")
            throw new Error(polygon.error);
          polygons.push({
            ...binding,
            drawingNode: row.component_node,
            source: { ...polygon.source, group_context: context, rendering }
          });
        } else if (kind === "line")
          lineBindings.push({
            ...binding,
            lineNode: row.component_node,
            parentContainer: row.owner_node,
            rootAnchor: root.component_node,
            component: structuredClone(row)
          });
        else
          pictureBindings.push({
            ...binding,
            pictureNode: row.component_node,
            parentContainer: row.owner_node,
            rootAnchor: root.component_node,
            component: structuredClone(row)
          });
      }
    }
    const declaredRoots = (content.hwp5Drawings ?? []).filter((row) => row.source?.kind_id === 610496366);
    if (declaredRoots.length !== containers.filter((row) => row.source.group_context === null).length)
      throw new Error("IncompleteHwp5GroupRoots");
    return { state: "projected", containers, rectangles, polygons, pictureBindings, lineBindings };
  } catch (error) {
    return { state: "unavailable", error: error.message };
  }
}

// js/hwp5-picture-sources.mjs
function picturePrefixArg(prefix) {
  const value = ["base73", "with_opacity74", "with_instance78"].indexOf(prefix);
  if (value < 0)
    throw new Error("InvalidPicturePrefix");
  return value;
}
function validateHwp5PictureSources(rows) {
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const uint = (value) => integer(value, 0, 4294967295), signed = (value) => integer(value, -2147483648, 2147483647);
  const array = (value, length, valid) => Array.isArray(value) && value.length === length && Array.from(value).every(valid);
  const optional = (value, valid) => value === null || valid(value);
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5PictureSources");
  const components = new Set, pictures = new Set;
  for (const row of rows) {
    if (!row || ![
      "component_node",
      "owner_node",
      "picture_node",
      "border_color",
      "border_attributes",
      "extra_bytes"
    ].every((key) => uint(row[key])) || row.owner_node >= row.component_node || row.component_node >= row.picture_node || components.has(row.component_node) || pictures.has(row.picture_node) || !signed(row.border_width) || !array(row.points, 4, (point) => array(point, 2, signed)) || !array(row.crop, 4, signed) || !array(row.margins, 4, (value) => integer(value, -32768, 32767)) || !integer(row.contrast, -128, 127) || !integer(row.brightness, -128, 127) || !integer(row.effect, 0, 255) || !integer(row.bin_data_id, 0, 65535) || !optional(row.border_opacity, (value) => integer(value, 0, 255)) || !optional(row.instance_id, uint) || row.instance_id !== null && row.border_opacity === null)
      throw new Error("InvalidHwp5PictureSources");
    components.add(row.component_node);
    pictures.add(row.picture_node);
  }
  return rows;
}
function decodeHwp5PictureSources(bytes) {
  return validateHwp5PictureSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// js/hwp5-picture-shadow-source.mjs
function validateHwp5PictureShadowSource(shadow, flags) {
  if (shadow === undefined)
    return;
  if (shadow === null) {
    if (flags & 1)
      throw Error("InvalidHwp5PictureShadowSource");
    return;
  }
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const signed = (value) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
  const p = shadow.properties;
  if (!(flags & 1) || !p || !["style", "alignment", "rotate_with_shape"].every((key) => signed(p[key])) || ![
    "transparency_bits",
    "blur_bits",
    "direction_bits",
    "distance_bits",
    "skew_x_bits",
    "skew_y_bits",
    "scale_x_bits",
    "scale_y_bits"
  ].every((key) => uint(p[key])) || !signed(shadow.color_type) || !uint(shadow.color_value) || !uint(shadow.color_effect_count))
    throw Error("InvalidHwp5PictureShadowSource");
}

// js/hwp5-picture-tail-sources.mjs
function pictureTailLayoutArg(layout) {
  const value = ["effects_only", "dimensions8", "with_alpha9"].indexOf(layout);
  if (value < 0)
    throw new Error("InvalidPictureTailLayout");
  return value;
}
function validateHwp5PictureTailSources(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5PictureTailSources");
  const components = new Set, pictures = new Set;
  for (const row of rows) {
    if (!row || ![
      "component_node",
      "owner_node",
      "picture_node",
      "instance_id",
      "effects_flags",
      "extra_bytes"
    ].every((key) => uint(row[key])) || row.owner_node >= row.component_node || row.component_node >= row.picture_node || components.has(row.component_node) || pictures.has(row.picture_node) || !Number.isInteger(row.border_opacity) || row.border_opacity < 0 || row.border_opacity > 255 || row.effects_flags & ~15 || row.image_width === null !== (row.image_height === null) || row.image_width !== null && (!uint(row.image_width) || !uint(row.image_height)) || row.image_alpha !== null && (!Number.isInteger(row.image_alpha) || row.image_alpha < -128 || row.image_alpha > 127 || row.image_width === null))
      throw new Error("InvalidHwp5PictureTailSources");
    validateHwp5PictureShadowSource(row.shadow, row.effects_flags);
    components.add(row.component_node);
    pictures.add(row.picture_node);
  }
  return rows;
}
function decodeHwp5PictureTailSources(bytes) {
  return validateHwp5PictureTailSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// web/preview/hwp5-picture-geometry-owner.mjs
function hwp5PictureGeometryOwner(content, item) {
  const roots = (content.hwp5Drawings ?? []).filter((row) => row.section === item.section && row.componentNode === item.pictureNode);
  if (roots.length === 1) {
    const root = roots[0];
    if (root.source.kind_id !== 611346787 || root.controlNode !== item.source.owner_node)
      throw new Error("Hwp5PictureGeometryOwnerMismatch");
    return {
      root,
      grouped: false,
      anchorNode: item.pictureNode,
      attributes: root.source.component_attributes,
      angle: root.source.rotation_angle
    };
  }
  if (roots.length)
    throw new Error("AmbiguousHwp5PictureGeometryOwner");
  const groups = projectHwp5GroupGeometry(content);
  if (groups.state !== "projected")
    throw new Error(groups.error);
  const bindings = groups.pictureBindings.filter((row) => row.section === item.section && row.pictureNode === item.pictureNode);
  if (bindings.length !== 1)
    throw new Error("MissingHwp5GroupedPictureBinding");
  const binding = bindings[0];
  if (binding.parentContainer !== item.source.owner_node)
    throw new Error("Hwp5PictureGeometryOwnerMismatch");
  if (binding.parentContainer !== binding.rootAnchor)
    throw new Error("UnsupportedNestedHwp5Picture");
  const anchors = content.hwp5Drawings.filter((row) => row.section === item.section && row.componentNode === binding.rootAnchor);
  if (anchors.length !== 1)
    throw new Error("MissingHwp5GroupRootAnchor");
  return {
    root: anchors[0],
    grouped: true,
    anchorNode: binding.rootAnchor,
    attributes: binding.component.attributes,
    angle: binding.component.rotation_angle
  };
}

// web/preview/hwp5-picture-resize-geometry.mjs
function hwp5PictureResizeGeometry(corners, rootGeometry) {
  if (rootGeometry?.width_relative !== 4 || rootGeometry?.height_relative !== 2)
    return null;
  if (!Array.isArray(corners) || corners.length !== 4 || corners.some((point) => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)))
    return null;
  const x = corners[1].map((value, i) => value - corners[0][i]);
  const y = corners[3].map((value, i) => value - corners[0][i]);
  const determinant = x[0] * y[1] - x[1] * y[0];
  if (!Number.isFinite(determinant) || determinant === 0)
    return null;
  const [width, height] = [x, y].map((axis) => Math.round(Math.hypot(...axis)));
  if (![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 4294967295))
    return null;
  return { width, height, widthRelative: 4, heightRelative: 2 };
}

// web/preview/hwp5-picture-border-plan.mjs
function hwp5PictureBorderPlan(picture) {
  const source = picture?.source;
  if (!source || source.border_width === undefined)
    return { state: "none" };
  if (source.border_width === 0 && source.border_attributes === 0)
    return { state: "none" };
  const raw = source.border_attributes;
  if (Number.isInteger(raw) && raw >= 0 && raw <= 4294967295 && (raw & 63) === 0 && (raw >>> 6 & 15) <= 1 && (raw >>> 10 & 4095) === 0 && (raw >>> 22 & 15) <= 8 && (raw >>> 26 & 15) <= 8 && Number.isInteger(source.border_width) && source.border_width >= 0 && source.border_width <= 2147483647)
    return { state: "none" };
  const fail = () => ({ state: "unavailable", error: "UnsupportedHwp5PictureBorder" });
  const attributes = source.border_attributes;
  if (!Number.isInteger(attributes) || attributes < 0 || attributes > 4294967295 || (attributes & 63) !== 1 || (attributes >>> 6 & 15) > 1 || (attributes >>> 10 & 4095) !== 0 || (attributes >>> 22 & 15) > 8 || (attributes >>> 26 & 15) > 8 || !Number.isInteger(source.border_width) || source.border_width <= 0 || !Number.isInteger(source.border_color) || source.border_color < 0 || source.border_color > 16777215 || picture.tailSource?.border_opacity !== 0)
    return fail();
  const points = source.points;
  if (!Array.isArray(points) || points.length !== 4 || !points.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)))
    return fail();
  const [[x, y], [right, top], [farRight, bottom], [left, farBottom]] = points;
  if (x !== 0 || y !== 0 || top !== 0 || left !== 0 || right <= 0 || bottom <= 0 || farRight !== right || farBottom !== bottom)
    return fail();
  return {
    state: "solid",
    color: colorrefCss(source.border_color),
    width: source.border_width,
    rectangleWidth: right,
    rectangleHeight: bottom
  };
}

// web/preview/picture-shadow-bounds.mjs
function pictureShadowBounds(plan, borderWidth = 0) {
  if (plan?.state !== "outer" || ![plan.width, plan.height, plan.blur, plan.offsetX, plan.offsetY, borderWidth].every(Number.isFinite) || plan.width <= 0 || plan.height <= 0 || plan.blur < 0 || borderWidth < 0)
    return null;
  const spread = 2 * plan.blur + borderWidth / 2;
  const left = Math.ceil(Math.max(borderWidth / 2, spread - plan.offsetX));
  const right = Math.ceil(Math.max(borderWidth / 2, spread + plan.offsetX));
  const top = Math.ceil(Math.max(borderWidth / 2, spread - plan.offsetY));
  const bottom = Math.ceil(Math.max(borderWidth / 2, spread + plan.offsetY));
  const width = plan.width + left + right, height = plan.height + top + bottom;
  return [left, right, top, bottom, width, height].every(Number.isFinite) ? { left, right, top, bottom, width, height } : null;
}

// web/preview/picture-shadow-raster-budget.mjs
function pictureShadowRasterSize(bounds, scale) {
  if (!bounds || ![bounds.width, bounds.height, scale].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0 || !Number.isSafeInteger(scale) || scale < 1 || scale > 16)
    return null;
  const width = Math.ceil(bounds.width * scale), height = Math.ceil(bounds.height * scale);
  if (width > 8192 || height > 8192 || width * height * 8 > 64 * 1024 * 1024)
    return null;
  return { width, height };
}

// web/preview/hwp5-picture-shadow-plan.mjs
function hwp5PictureShadowPlan(picture) {
  const tail = picture?.tailSource;
  if (!tail || tail.effects_flags === 0)
    return { state: "none" };
  const fail = () => ({ state: "unavailable", error: "UnsupportedHwp5PictureShadow" });
  if (tail.effects_flags !== 1 || !tail.shadow)
    return fail();
  try {
    validateHwp5PictureShadowSource(tail.shadow, tail.effects_flags);
  } catch {
    return fail();
  }
  const shadow = tail.shadow, p = shadow.properties;
  const bits = new DataView(new ArrayBuffer(4));
  const float = (value) => {
    bits.setUint32(0, value, true);
    return bits.getFloat32(0, true);
  };
  const alpha = float(p.transparency_bits), blur = float(p.blur_bits), direction = float(p.direction_bits), distance = float(p.distance_bits);
  if (p.style !== 0 || p.alignment !== 0 || p.rotate_with_shape !== 0 || float(p.skew_x_bits) !== 0 || float(p.skew_y_bits) !== 0 || float(p.scale_x_bits) !== 1 || float(p.scale_y_bits) !== 1 || shadow.color_type !== 0 || shadow.color_effect_count !== 0 || shadow.color_value > 16777215 || ![alpha, blur, direction, distance].every(Number.isFinite) || alpha < 0 || alpha > 1 || blur < 0 || distance < 0 || direction < 0 || direction > 360 || picture.transform?.angle !== 0 || !Array.isArray(picture.transform?.flip) || picture.transform.flip.length !== 2 || !Array.from(picture.transform.flip).every((value) => value === false))
    return fail();
  const points = picture.source?.points;
  if (!Array.isArray(points) || points.length !== 4 || !Array.from(points).every((point) => Array.isArray(point) && point.length === 2 && Array.from(point).every(Number.isFinite)))
    return fail();
  const [[x, y], [right, top], [farRight, bottom], [left, farBottom]] = points;
  if (x !== 0 || y !== 0 || top !== 0 || left !== 0 || right <= 0 || bottom <= 0 || farRight !== right || farBottom !== bottom)
    return fail();
  const corners = picture.renderingCorners;
  if (corners !== undefined && (!Array.isArray(corners) || corners.length !== 4 || !Array.from(corners).every((point) => Array.isArray(point) && point.length === 2 && Array.from(point).every(Number.isFinite)) || corners[0][1] !== corners[1][1] || corners[1][0] !== corners[2][0] || corners[2][1] !== corners[3][1] || corners[3][0] !== corners[0][0] || corners[1][0] <= corners[0][0] || corners[3][1] <= corners[0][1]))
    return fail();
  const radians = direction * Math.PI / 180;
  const plan = {
    state: "outer",
    opacity: 1 - alpha,
    blur: blur / 75,
    offsetX: Math.cos(radians) * distance / 75,
    offsetY: Math.sin(radians) * distance / 75,
    color: shadow.color_value,
    width: right / 75,
    height: bottom / 75,
    rasterParity: "unverified"
  };
  if (!pictureShadowRasterSize(pictureShadowBounds(plan, Math.max(0, (picture.source.border_width ?? 0) / 75)), 1))
    return fail();
  return plan;
}

// web/preview/hwp5-picture-absent-tail-profile.mjs
var profiles = Object.freeze([
  Object.freeze({
    version: 83886343,
    baseExtra: 0,
    prefix: "base73",
    layout: "absent_base73",
    opacity: false,
    instance: false
  }),
  Object.freeze({
    version: 83886596,
    baseExtra: 1,
    prefix: "with_opacity74",
    layout: "absent_opacity74",
    opacity: true,
    instance: false
  }),
  Object.freeze({
    version: 83886596,
    baseExtra: 5,
    prefix: "with_instance78",
    layout: "absent_instance78",
    opacity: true,
    instance: true
  })
]);
var uint20 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
function selectedSourceMatches(profile, source) {
  return source?.extra_bytes === 0 && (profile.opacity ? uint20(source.border_opacity) && source.border_opacity <= 255 : source.border_opacity === null) && (profile.instance ? uint20(source.instance_id) : source.instance_id === null);
}
function hwp5PictureAbsentVersion(version) {
  return profiles.some((profile) => profile.version === version);
}
function hwp5PictureAbsentProfile(version, source) {
  return profiles.find((profile) => profile.version === version && (selectedSourceMatches(profile, source) || source?.border_opacity === null && source.instance_id === null && source.extra_bytes === profile.baseExtra)) ?? null;
}
function hwp5PictureAbsentSourceMatches(proof, source) {
  const profile = profiles.find((profile) => profile.version === proof?.fileVersion && profile.layout === proof.layout);
  return Boolean(profile && selectedSourceMatches(profile, source));
}
var baseFields = [
  "component_node",
  "owner_node",
  "picture_node",
  "border_color",
  "border_width",
  "border_attributes",
  "points",
  "crop",
  "margins",
  "contrast",
  "brightness",
  "effect",
  "bin_data_id"
];
function hwp5PictureBaseMatches(base, selected) {
  return baseFields.every((field) => JSON.stringify(base[field]) === JSON.stringify(selected[field]));
}

// web/preview/hwp5-picture-tail-profile.mjs
function hwp5PictureTailLayout(version) {
  return version === 83951617 || version === 83951872 ? "with_alpha9" : version === 83887360 || version === 83886852 ? "dimensions8" : version === 83886848 ? "effects_only" : null;
}
function hwp5PictureTailAlphaSupported(tail) {
  if (tail?.image_alpha === 0)
    return true;
  const layout = hwp5PictureTailLayout(tail?.fileVersion);
  if (layout === null || tail.layout !== layout)
    return false;
  return ["dimensions8", "effects_only"].includes(layout) && tail.image_alpha === null;
}

// web/preview/hwp5-picture-geometry.mjs
function projectHwp5PictureGeometry(content) {
  const fail = (error) => ({ state: "unavailable", error });
  try {
    if (content.hwp5PictureErrors?.length || content.hwp5DrawingErrors?.length || content.hwp5DrawingLocalErrors?.length)
      throw new Error("IncompleteHwp5PictureGeometry");
    const pictures = [], seen = new Set;
    for (const item of content.hwp5Pictures ?? []) {
      const raw = item.source;
      validateHwp5PictureSources([raw]);
      if (raw.component_node !== item.pictureNode || raw.picture_node !== item.recordNode)
        throw new Error("Hwp5PictureIdentityMismatch");
      const key = `${item.section}:${item.pictureNode}`;
      if (seen.has(key))
        throw new Error("AmbiguousHwp5PictureGeometry");
      seen.add(key);
      const owner = hwp5PictureGeometryOwner(content, item), root = owner.root;
      const locals = (content.hwp5DrawingLocalTransforms ?? []).filter((row) => row.section === item.section && row.component_node === item.pictureNode);
      if (locals.length !== 1)
        throw new Error("MissingHwp5PictureTransform");
      validateHwp5DrawingLocalTransforms(locals);
      if (locals[0].owner_node !== raw.owner_node)
        throw new Error("Hwp5PictureTransformOwnerMismatch");
      const source = hwp5DrawingGeometry(root.source), g = source.geometry, m = locals[0].matrix;
      const tails = (content.hwp5PictureTails ?? []).filter((row) => row.section === item.section && row.component_node === item.pictureNode);
      if (tails.length > 1)
        throw new Error("AmbiguousHwp5PictureTail");
      const tail = tails[0] ?? null;
      const absentRows = (content.hwp5PictureAbsentTails ?? []).filter((row) => row.section === item.section && row.component_node === item.pictureNode);
      if (absentRows.length > 1 || tail && absentRows.length)
        throw new Error("AmbiguousHwp5PictureTail");
      const absent = absentRows[0] ?? null;
      if (absent && (!hwp5PictureAbsentSourceMatches(absent, raw) || absent.picture_node !== item.recordNode || absent.owner_node !== raw.owner_node))
        throw new Error("InvalidHwp5PictureAbsentTail");
      if (tail) {
        validateHwp5PictureTailSources([tail]);
        if (tail.picture_node !== item.recordNode || tail.owner_node !== raw.owner_node)
          throw new Error("Hwp5PictureTailOwnerMismatch");
      }
      const zeroSizePolicy = tail?.fileVersion === 83951617 && tail.image_width === 0 && tail.image_height === 0 && owner.attributes === 536870912;
      const canvasMatrix = [m[0], m[3], m[1], m[4], m[2], m[5]];
      const corners = raw.points.map((point) => affinePoint(canvasMatrix, point));
      if (corners.some((point) => point === null))
        throw new Error("InvalidHwp5PictureTransform");
      const flip = [!!(owner.attributes & 1), !!(owner.attributes & 2)];
      const identity = owner.angle === 0 && flip.every((value) => value === false) && m.every((value, index) => value === [1, 0, 0, 0, 1, 0][index]);
      const borderPlan = hwp5PictureBorderPlan({ source: raw, tailSource: tail });
      const shadowPlan = hwp5PictureShadowPlan({
        source: raw,
        tailSource: tail,
        transform: { angle: owner.angle, flip },
        renderingCorners: corners
      });
      pictures.push({
        section: item.section,
        pictureNode: item.pictureNode,
        recordNode: item.recordNode,
        resizeRecordNode: item.recordNode,
        resizeGeometry: owner.grouped ? hwp5PictureResizeGeometry(corners, g) : null,
        sizeProtected: source.size_protected,
        state: "located",
        paragraph: root.hostParagraph,
        anchorUnit: root.anchorUnit,
        owner: {
          anchorNode: owner.anchorNode,
          paragraph: root.hostParagraph,
          anchorUnit: root.anchorUnit
        },
        geometry: owner.grouped ? null : {
          width: g.width,
          height: g.height,
          widthRelative: g.width_relative,
          heightRelative: g.height_relative,
          treatAsCharacter: g.treat_as_character,
          horizontalOffset: g.horizontal_offset,
          verticalOffset: g.vertical_offset
        },
        position: source.position,
        flow: {
          textWrap: source.text_wrap,
          textFlow: source.text_flow,
          zOrder: source.z_order,
          outsideMargins: [...source.out_margin]
        },
        crop: {
          clip: [raw.crop[0], raw.crop[2], raw.crop[1], raw.crop[3]],
          imageDimensions: [tail?.image_width ?? null, tail?.image_height ?? null],
          zeroSizeUnitsPerPixel: zeroSizePolicy ? 75 : null
        },
        transform: {
          identity,
          angle: owner.angle,
          flip,
          reverse: null,
          reverseApplicable: false,
          unknownMatrixNodes: 0,
          unknownComponentAttributes: (owner.attributes & ~3) >>> 0
        },
        renderingCorners: corners,
        paintError: raw.contrast !== 0 || raw.brightness !== 0 || raw.effect !== 0 ? "UnsupportedHwp5PictureAdjustment" : absent && (raw.border_width !== 0 || raw.border_attributes !== 0) ? "UnsupportedHwp5PictureBorder" : !tail && !absent || content.hwp5PictureTailErrors?.some((row) => row.section === item.section) ? "UnselectedHwp5PictureTail" : tail && (shadowPlan.state === "unavailable" || !hwp5PictureTailAlphaSupported(tail) || tail.border_opacity !== 0 && borderPlan.state !== "none" || tail.extra_bytes !== 0) ? "UnsupportedHwp5PictureTail" : borderPlan.state === "unavailable" ? borderPlan.error : tail && !zeroSizePolicy && (tail.image_width === 0 || tail.image_height === 0) ? "UnsupportedHwp5ZeroImageDimensions" : null,
        unselectedPictureTail: tail ? tail.extra_bytes : raw.extra_bytes,
        source: structuredClone(raw),
        tailSource: tail ? structuredClone(tail) : null,
        tailPolicy: absent ? `observed-${absent.layout.replaceAll("_", "-")}` : "selected-tail"
      });
    }
    return { state: "projected", pictures };
  } catch (error) {
    return fail(error.message);
  }
}

// web/preview/hwp5-picture-caption-bindings.mjs
function bindHwp5RootPictureCaptions(content, pictures, bindings) {
  const fail = (error) => ({ state: "unavailable", error });
  const projected = new Map;
  for (const root of (content.hwp5Drawings ?? []).filter((row) => row.source.kind_id === 611346787)) {
    const matches = pictures.filter((row) => row.section === root.section && row.pictureNode === root.componentNode);
    const owned = bindings.filter((row) => row.section === root.section && row.drawingNode === root.componentNode);
    const captions = owned.filter((row) => row.kind === "caption"), key = `${root.section}:${root.componentNode}`;
    if (matches.length !== 1 || owned.some((row) => row.kind !== "caption") || captions.length > 1 || projected.has(key))
      return fail("AmbiguousHwp5MixedPictureOwnership");
    if (hwp5ObjectFlags(root.source.flags).has_caption !== (captions.length === 1))
      return fail("Hwp5MixedPictureCaptionMismatch");
    projected.set(key, { ...matches[0], caption: captions[0]?.caption ?? null });
  }
  return {
    state: "projected",
    rootCount: projected.size,
    pictures: pictures.map((row) => projected.get(`${row.section}:${row.pictureNode}`) ?? row)
  };
}

// web/preview/hwp5-group-caption-bindings.mjs
function bindHwp5RootGroupCaptions(content, containers, bindings) {
  const fail = (error) => ({ state: "unavailable", error });
  if (!Array.isArray(containers) || !Array.isArray(bindings))
    return fail("InvalidHwp5GroupCaptionInputs");
  try {
    const projected = new Map, lists = new Set;
    const roots = (content.hwp5Drawings ?? []).filter((root) => root.source.kind_id === 610496366);
    for (const root of roots) {
      const key = `${root.section}:${root.componentNode}`;
      const matches = containers.filter((row) => row.section === root.section && row.containerNode === root.componentNode && row.source.group_context === null);
      const owned = bindings.filter((row) => row.section === root.section && (row.drawingNode === root.componentNode || row.kind === "caption" && row.controlNode === root.controlNode));
      if (projected.has(key) || matches.length !== 1 || owned.length > 1 || owned.some((row) => row.kind !== "caption" || row.drawingNode !== root.componentNode || row.controlNode !== root.controlNode) || matches[0].source.component?.owner_node !== root.controlNode)
        return fail("AmbiguousHwp5GroupCaptionOwnership");
      const present = owned.length === 1;
      if (hwp5ObjectFlags(root.source.flags).has_caption !== present || matches[0].source.has_caption !== present)
        return fail("Hwp5GroupCaptionPresenceMismatch");
      let caption = null;
      if (present) {
        const binding = owned[0], listKey = `${root.section}:${binding.listNode}`;
        const bodies = (content.hwp5DrawingBodies ?? []).filter((body) => body.section === root.section && body.listNode === binding.listNode);
        if (lists.has(listKey) || bodies.length !== 1 || bodies[0].kind !== "caption" || bodies[0].controlNode !== root.controlNode || bodies[0].source.control_node !== root.controlNode || bodies[0].source.list_node !== binding.listNode)
          return fail("Hwp5GroupCaptionSourceMismatch");
        const body = bodies[0];
        caption = hwp5CaptionGeometry({
          ...body.source.caption,
          attributes: body.source.attributes,
          list_node: body.listNode
        });
        if (!binding.caption || Object.keys(caption).some((key) => caption[key] !== binding.caption[key]))
          return fail("Hwp5GroupCaptionSourceMismatch");
        lists.add(listKey);
      }
      projected.set(key, { ...matches[0], source: { ...matches[0].source, caption } });
    }
    if (containers.filter((row) => row.source.group_context === null).length !== projected.size)
      return fail("MissingHwp5GroupCaptionRoot");
    return {
      state: "projected",
      rootCount: projected.size,
      captionCount: lists.size,
      containers: containers.map((row) => row.source.group_context === null ? projected.get(`${row.section}:${row.containerNode}`) : row)
    };
  } catch (error) {
    return fail(error.message);
  }
}

// web/preview/hwp5-group-content-projection.mjs
function projectHwp5GroupContent(content) {
  if ((content.hwp5Drawings ?? []).some((row) => row.source.kind_id !== 610496366))
    return { state: "unavailable", error: "UnsupportedMixedHwp5GroupRoots" };
  return assembleHwp5GroupContent(content);
}
function assembleHwp5GroupContent(content) {
  const fail = (error) => ({ state: "unavailable", error });
  const geometry = projectHwp5GroupGeometry(content);
  if (geometry.state !== "projected")
    return geometry;
  for (const binding of geometry.lineBindings) {
    const lines = (content.lines ?? []).filter((row) => row.section === binding.section && row.anchorNode === binding.lineNode && row.groupContext?.rootAnchor === binding.rootAnchor && row.groupContext?.parentContainer === binding.parentContainer);
    if (lines.length !== 1 || content.lineErrors?.some((row) => row.section === binding.section))
      return fail("IncompleteHwp5GroupedLineSources");
  }
  const text = projectHwp5DrawingText(content);
  if (text.state !== "projected")
    return text;
  const rectangleRoots = (content.hwp5Drawings ?? []).filter((row) => row.source.kind_id === 611476835);
  let rootDrawings = [];
  if (rectangleRoots.length) {
    const rootGeometry = projectHwp5RectangleGeometry({ ...content, hwp5Drawings: rectangleRoots });
    if (rootGeometry.state !== "projected")
      return rootGeometry;
    const rootContent = assembleHwp5RectangleContent(content, rootGeometry, text);
    if (rootContent.state !== "projected")
      return rootContent;
    rootDrawings = rootContent.content.drawings;
  }
  const captionedGroups = bindHwp5RootGroupCaptions(content, geometry.containers, text.bindings);
  if (captionedGroups.state !== "projected")
    return captionedGroups;
  const pictureRoots = new Set((content.hwp5Drawings ?? []).filter((row) => row.source.kind_id === 611346787).map((row) => `${row.section}:${row.componentNode}`));
  const groupRoots = new Set(captionedGroups.containers.filter((row) => row.source.group_context === null).map((row) => `${row.section}:${row.containerNode}`));
  const rectangleKeys = new Set(rootDrawings.map((row) => `${row.section}:${row.drawingNode}`));
  if (text.bindings.some((row) => row.kind === "caption" && !pictureRoots.has(`${row.section}:${row.drawingNode}`) && !groupRoots.has(`${row.section}:${row.drawingNode}`) && !rectangleKeys.has(`${row.section}:${row.drawingNode}`)))
    return fail("UnsupportedHwp5GroupCaption");
  if (content.hwp5DrawingStyleErrors?.length)
    return fail("IncompleteHwp5GroupPaintSources");
  const pictures = projectHwp5PictureGeometry(content);
  if (pictures.state !== "projected")
    return pictures;
  if (pictures.pictures.some((row) => row.paintError))
    return fail("UnsupportedHwp5GroupPicturePaint");
  const captionedPictures = bindHwp5RootPictureCaptions(content, pictures.pictures, text.bindings);
  if (captionedPictures.state !== "projected")
    return captionedPictures;
  const rectangles = [...rootDrawings], polygons = [], drawings = [...rootDrawings];
  for (const shape of [...geometry.rectangles, ...geometry.polygons]) {
    const styles = (content.hwp5DrawingStyles ?? []).filter((row) => row.section === shape.section && row.component_node === shape.drawingNode && row.owner_node === shape.source.component.owner_node);
    if (styles.length !== 1)
      return fail("MissingHwp5GroupPaintSource");
    const paint = hwp5DrawingPaintPlan(styles[0]);
    if (paint.state !== "planned")
      return paint;
    const bindings = text.bindings.filter((row) => row.section === shape.section && row.drawingNode === shape.drawingNode);
    if (bindings.length > 1)
      return fail("AmbiguousHwp5GroupText");
    const polygon = shape.source.rendering_polygon !== undefined;
    if (polygon && bindings.length)
      return fail("UnsupportedHwp5GroupPolygonText");
    if (shape.source.rendering_polygon?.length === 2 && paint.fill.state !== "none")
      return fail("UnsupportedHwp5PolylineFill");
    const source = {
      ...shape.source,
      text: bindings[0]?.text ?? null,
      caption: null,
      stroke: paint.stroke,
      paint: { shadow_type: paint.shadowType }
    };
    const current = {
      ...shape,
      source,
      hwp5Style: structuredClone(styles[0]),
      fillPlan: paint.fill
    };
    (polygon ? polygons : rectangles).push(current);
    if (bindings.length)
      drawings.push(current);
  }
  if (text.bindings.some((binding) => !drawings.some((row) => row.section === binding.section && row.drawingNode === binding.drawingNode) && !captionedPictures.pictures.some((row) => binding.kind === "caption" && row.section === binding.section && row.pictureNode === binding.drawingNode && row.caption?.caption_node === binding.caption?.caption_node) && !captionedGroups.containers.some((row) => binding.kind === "caption" && row.section === binding.section && row.containerNode === binding.drawingNode && row.source.caption?.caption_node === binding.caption?.caption_node)))
    return fail("MissingHwp5GroupTextGeometry");
  return {
    state: "projected",
    content: {
      ...content,
      paragraphs: text.paragraphs,
      containers: captionedGroups.containers,
      rectangles,
      polygons,
      drawings,
      pictures: captionedPictures.pictures
    }
  };
}

// web/preview/hwp5-mixed-root-content-projection.mjs
function projectHwp5MixedRootContent(content) {
  const fail = (error) => ({ state: "unavailable", error });
  const roots = content.hwp5Drawings ?? [];
  if (!roots.length || roots.some((row) => ![611476835, 611346787].includes(row.source?.kind_id)))
    return fail("UnsupportedHwp5MixedRootKind");
  const text = projectHwp5DrawingText(content);
  if (text.state !== "projected")
    return text;
  const geometry = projectHwp5RectangleGeometry({
    ...content,
    hwp5Drawings: roots.filter((row) => row.source.kind_id === 611476835)
  });
  if (geometry.state !== "projected")
    return geometry;
  const pictures = projectHwp5PictureGeometry(content);
  if (pictures.state !== "projected")
    return pictures;
  const projected = bindHwp5RootPictureCaptions(content, pictures.pictures, text.bindings);
  if (projected.state !== "projected")
    return projected;
  if (projected.rootCount !== pictures.pictures.length)
    return fail("UnsupportedHwp5MixedPictureChildren");
  const rectangles = assembleHwp5RectangleContent(content, geometry, text);
  if (rectangles.state !== "projected")
    return rectangles;
  return { state: "projected", content: { ...rectangles.content, pictures: projected.pictures } };
}

// web/preview/hwp5-grouped-mixed-content.mjs
function projectHwp5GroupedMixedContent(content) {
  const fail = (error) => ({ state: "unavailable", error });
  try {
    const roots = content.hwp5Drawings ?? [];
    if (!roots.some((row) => row.source?.kind_id === 610496366) || roots.some((row) => ![610496366, 611476835, 611346787, 611348332].includes(row.source?.kind_id)))
      return fail("UnsupportedHwp5GroupedMixedRoots");
    if (["hwp5PolygonPointErrors", "hwp5DrawingStyleErrors"].some((key) => content[key]?.length))
      return fail("IncompleteHwp5GroupedPolygonSources");
    const groups = assembleHwp5GroupContent(content);
    if (groups.state !== "projected")
      return groups;
    const polygons = [...groups.content.polygons ?? []];
    for (const root of roots.filter((row) => row.source.kind_id === 611348332)) {
      const rows = (content.hwp5PolygonPoints ?? []).filter((row) => row.section === root.section && row.component_node === root.componentNode);
      const locals = (content.hwp5DrawingLocalTransforms ?? []).filter((row) => row.section === root.section && row.component_node === root.componentNode);
      const styles = (content.hwp5DrawingStyles ?? []).filter((row) => row.section === root.section && row.component_node === root.componentNode && row.owner_node === root.controlNode);
      if (rows.length !== 1 || locals.length !== 1 || locals[0].owner_node !== root.controlNode || styles.length !== 1)
        return fail("MissingHwp5GroupedPolygonSource");
      const path = hwp5PolygonPathSource(rows[0]);
      if (path.state !== "planned")
        return path;
      if (root.source.rotation_angle !== 0 || root.source.component_attributes !== 0 || !Array.isArray(locals[0].matrix) || locals[0].matrix.length !== 6 || !Array.from(locals[0].matrix).every((value, i) => value === [1, 0, 0, 0, 1, 0][i]))
        return fail("UnsupportedHwp5GroupedPolygonTransform");
      const source = hwp5DrawingGeometry(root.source), { width, height } = source.geometry;
      if (source.has_caption || ![2, 3].includes(source.text_wrap) || rows[0].points.some(([x, y]) => x < 0 || y < 0 || x > width || y > height))
        return fail("UnsupportedHwp5GroupedPolygonFlow");
      const paint = hwp5DrawingPaintPlan(styles[0]);
      if (paint.state !== "planned")
        return paint;
      if (path.source.rendering_polygon.length === 2 && paint.fill.state !== "none")
        return fail("UnsupportedHwp5PolylineFill");
      Object.assign(source, path.source, {
        group_context: null,
        text: null,
        caption: null,
        rendering: {
          matrix: [...locals[0].matrix],
          angle: 0,
          flip: [false, false],
          reverse: null,
          unknown_component_attributes: 0
        },
        rendering_corners: [
          [0, 0],
          [width, 0],
          [width, height],
          [0, height]
        ],
        stroke: paint.stroke,
        paint: { shadow_type: paint.shadowType }
      });
      polygons.push({
        section: root.section,
        drawingNode: root.componentNode,
        controlNode: root.controlNode,
        hostParagraph: root.hostParagraph,
        anchorUnit: root.anchorUnit,
        source,
        hwp5Style: structuredClone(styles[0])
      });
    }
    return { state: "projected", content: { ...groups.content, polygons } };
  } catch (error) {
    return fail(error.message);
  }
}

// web/preview/hwp5-root-content-projection.mjs
function projectHwp5RootContent(content) {
  const roots = content.hwp5Drawings ?? [];
  if (!roots.length)
    return content.currentParagraphFlows?.some((row) => row.host === "drawing") ? { state: "unavailable", error: "IncompleteHwp5RootSources" } : { state: "projected", content };
  const lines = roots.filter((row) => row.source?.kind_id === 611084654);
  const nonLines = roots.filter((row) => row.source?.kind_id !== 611084654);
  if (lines.length && nonLines.length && roots.every((row) => [611084654, 610496366, 611476835, 611346787, 611348332].includes(row.source?.kind_id))) {
    if ((content.hwp5DrawingBodies ?? []).some((body) => lines.some((line) => line.section === body.section && line.controlNode === body.controlNode)))
      return { state: "unavailable", error: "UnsupportedHwp5LineTextRoot" };
    const projected = projectHwp5RootContent({ ...content, hwp5Drawings: nonLines });
    return projected.state === "projected" ? { ...projected, content: { ...projected.content, hwp5Drawings: roots } } : projected;
  }
  if (roots.some((row) => row.source?.kind_id === 610496366) && roots.some((row) => [611476835, 611346787, 611348332].includes(row.source?.kind_id)) && roots.every((row) => [610496366, 611476835, 611346787, 611348332].includes(row.source?.kind_id)))
    return projectHwp5GroupedMixedContent(content);
  if (roots.every((row) => row.source?.kind_id === 611476835))
    return projectHwp5RectangleContent(content);
  if (roots.every((row) => row.source?.kind_id === 610496366))
    return projectHwp5GroupContent(content);
  if (roots.every((row) => [611476835, 611346787].includes(row.source?.kind_id)))
    return projectHwp5MixedRootContent(content);
  return {
    state: content.currentParagraphFlows?.some((row) => row.host === "drawing") ? "unavailable" : "unhandled",
    error: "UnsupportedHwp5RectangleRoot"
  };
}

// web/preview/hwp5-picture-content.mjs
function attachHwp5Pictures(editor, content) {
  content.hwp5Pictures = [];
  content.hwp5PictureErrors = [];
  if (!editor)
    return content;
  for (const section of new Set((content.hwp5Drawings ?? []).map((row) => row.section))) {
    try {
      if (content.hwp5DrawingErrors?.some((row) => row.section === section) || content.hwp5DrawingMatrixErrors?.some((row) => row.section === section))
        throw new Error("IncompleteHwp5PictureOwners");
      const sources = validateHwp5PictureSources(editor.pictureSources(section, "base73"));
      const components = (content.hwp5DrawingMatrices ?? []).filter((row) => row.section === section && row.kind === "translation");
      const owners = new Map(components.map((row) => [row.component_node, row.owner_node]));
      if (owners.size !== components.length)
        throw new Error("AmbiguousHwp5PictureOwners");
      for (const source of sources)
        if (!owners.has(source.component_node) || owners.get(source.component_node) !== source.owner_node)
          throw new Error("Hwp5PictureOwnerMismatch");
      for (const root of content.hwp5Drawings.filter((row) => row.section === section && row.source.kind_id === 611346787)) {
        if (!sources.some((row) => row.component_node === root.componentNode && row.owner_node === root.controlNode))
          throw new Error("MissingHwp5PictureSource");
      }
      content.hwp5Pictures.push(...sources.map((source) => ({
        section,
        pictureNode: source.component_node,
        recordNode: source.picture_node,
        source
      })));
    } catch (error) {
      content.hwp5PictureErrors.push({ section, error: error.message });
    }
  }
  return content;
}
function readHwp5PictureBytes(editor, section, pictureNode) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!uint(section) || !uint(pictureNode))
    throw new Error("InvalidHwp5PictureRequest");
  const sources = validateHwp5PictureSources(editor.pictureSources(section, "base73"));
  const selected = sources.filter((row) => row.component_node === pictureNode);
  if (selected.length !== 1)
    throw new Error("MissingHwp5PictureSource");
  return editor.binaryResource(selected[0].bin_data_id, { maxBytes: 32 * 1024 * 1024 });
}

// web/preview/hwp5-picture-tail-content.mjs
function attachHwp5PictureTails(editor, content) {
  content.hwp5PictureTails = [];
  content.hwp5PictureTailErrors = [];
  content.hwp5PictureAbsentTails = [];
  if (!editor)
    return content;
  for (const section of new Set((content.hwp5Pictures ?? []).map((row) => row.section))) {
    try {
      if (content.hwp5PictureErrors?.some((row) => row.section === section))
        throw new Error("IncompleteHwp5PictureSources");
      const version = editor.fileVersion();
      const raw = content.hwp5Pictures.filter((row) => row.section === section);
      if (hwp5PictureAbsentVersion(version)) {
        validateHwp5PictureSources(raw.map((row) => row.source));
        const selectedProfiles = raw.map((row) => hwp5PictureAbsentProfile(version, row.source)), profile = selectedProfiles[0];
        if (!profile || selectedProfiles.some((row) => row?.prefix !== profile.prefix) || new Set(raw.map((row) => row.pictureNode)).size !== raw.length || raw.some((row) => row.pictureNode !== row.source.component_node || row.recordNode !== row.source.picture_node))
          throw new Error("UnsupportedHwp5PictureAbsentTail");
        const selected = profile.prefix === "base73" ? raw.map((row) => row.source) : validateHwp5PictureSources(editor.pictureSources(section, profile.prefix));
        const byComponent = new Map(selected.map((row) => [row.component_node, row]));
        if (selected.length !== raw.length || byComponent.size !== raw.length)
          throw new Error("Hwp5PictureTailInventoryMismatch");
        const proofs = raw.map((row) => ({
          section,
          component_node: row.pictureNode,
          picture_node: row.recordNode,
          owner_node: row.source.owner_node,
          fileVersion: version,
          layout: profile.layout
        }));
        for (const [index, row] of raw.entries()) {
          const source = byComponent.get(row.pictureNode);
          if (!source || !hwp5PictureBaseMatches(row.source, source) || !hwp5PictureAbsentSourceMatches(proofs[index], source))
            throw new Error("UnsupportedHwp5PictureAbsentTail");
        }
        for (const row of raw)
          row.source = byComponent.get(row.pictureNode);
        content.hwp5PictureAbsentTails.push(...proofs);
        continue;
      }
      const layout = hwp5PictureTailLayout(version);
      if (layout === null)
        throw new Error("UnselectedHwp5PictureTailVersion");
      const tails = validateHwp5PictureTailSources(editor.pictureTailSources(section, layout));
      if (tails.some((row) => layout === "effects_only" ? row.image_width !== null || row.image_height !== null || row.image_alpha !== null || row.extra_bytes !== 0 : row.image_width === null || (layout === "dimensions8" ? row.image_alpha !== null : row.image_alpha === null)))
        throw new Error("Hwp5PictureTailLayoutMismatch");
      if (raw.length !== tails.length || new Set(raw.map((row) => row.pictureNode)).size !== raw.length)
        throw new Error("Hwp5PictureTailInventoryMismatch");
      for (const tail of tails) {
        if (!raw.some((row) => row.pictureNode === tail.component_node && row.recordNode === tail.picture_node && row.source.owner_node === tail.owner_node))
          throw new Error("Hwp5PictureTailOwnerMismatch");
      }
      content.hwp5PictureTails.push(...tails.map((row) => ({ ...row, section, fileVersion: version, layout })));
    } catch (error) {
      content.hwp5PictureTailErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// js/hwp5-drawing-object-extras.mjs
function decodeHwp5DrawingObjectExtras(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(rows) || rows.length > 1e6)
    throw new Error("InvalidHwp5DrawingObjectExtras");
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  let previous = -1;
  for (const row of rows) {
    if (!row || ![row.control_node, row.paragraph_node, row.extra_bytes].every(uint) || row.paragraph_node >= row.control_node || row.control_node <= previous || typeof row.extra_hex !== "string" || row.extra_hex.length !== row.extra_bytes * 2 || !/^[0-9a-f]*$/.test(row.extra_hex))
      throw new Error("InvalidHwp5DrawingObjectExtras");
    previous = row.control_node;
  }
  return rows;
}

// js/font-face-metadata.mjs
function decodeFontFaceMetadata(bytes) {
  const fail = () => {
    throw new Error("InvalidFontFaceMetadata");
  };
  const rows = decodeMetadataWire(bytes, "InvalidFontFaceMetadata");
  for (const row of rows) {
    if (!metadataKeys(row, ["language", "id", "attributes", "substitute", "typeInfo", "defaultName"]))
      return fail();
    if (!Number.isInteger(row.attributes) || row.attributes < 0 || row.attributes > 255)
      return fail();
    if (row.attributes & 128) {
      if (!metadataKeys(row.substitute, ["kind", "name"]) || !Number.isInteger(row.substitute.kind) || row.substitute.kind < 0 || row.substitute.kind > 255 || !metadataText(row.substitute.name))
        return fail();
    } else if (row.substitute !== null)
      return fail();
    if (row.attributes & 64) {
      if (!Array.isArray(row.typeInfo) || row.typeInfo.length !== 10 || row.typeInfo.some((value) => !Number.isInteger(value) || value < 0 || value > 255))
        return fail();
    } else if (row.typeInfo !== null)
      return fail();
    if (!metadataText(row.defaultName) || !(row.attributes & 32) && row.defaultName !== null)
      return fail();
  }
  return rows;
}

// js/paragraph-shapes-wire.mjs
function decodeParagraphShapes(bytes) {
  const fail = () => {
    throw new Error("InvalidParagraphShapes");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length < 8)
    return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  const magic = view.getUint32(0, true);
  const stride = magic === 827543624 ? 48 : magic === 844320840 ? 72 : 0;
  if (!stride || count > 1e5 || bytes.length !== 8 + count * stride)
    return fail();
  return Array.from({ length: count }, (_, index) => {
    const at = 8 + index * stride, uint = (offset) => view.getUint32(at + offset, true), int = (offset) => view.getInt32(at + offset, true);
    if (uint(0) !== index || uint(4) > 7 || uint(28) > 3 || uint(36) > 1 || !uint(36) && (uint(40) !== 0 || int(44) !== 0))
      return fail();
    const shape = {
      id: index,
      alignment: uint(4),
      left: int(8),
      right: int(12),
      indent: int(16),
      before: int(20),
      after: int(24),
      legacySpacingKind: uint(28),
      legacySpacing: int(32),
      modernSpacing: uint(36) ? { attributes: uint(40), value: int(44) } : null
    };
    if (stride === 72) {
      if (uint(48) > 3 || uint(52) > 65535 || uint(56) > 7 || uint(60) > 1 || !uint(60) && uint(64) !== 0 || uint(68) !== (uint(60) ? uint(64) : uint(56)))
        return fail();
      Object.assign(shape, {
        headingKind: uint(48),
        headingId: uint(52),
        packedHeadingLevel: uint(56),
        extendedHeadingLevel: uint(60) ? uint(64) : null,
        headingLevel: uint(68)
      });
    }
    return shape;
  });
}

// js/hwp5-page-settings.mjs
function decodeHwp5PageSettings(bytes) {
  const row = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  return validateHwp5PageSettings(row);
}
function validateHwp5PageSettings(row) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!row || ![
    "source_node",
    "width",
    "height",
    "left",
    "right",
    "top",
    "bottom",
    "header",
    "footer",
    "gutter",
    "flags",
    "extra_bytes"
  ].every((name) => uint(row[name])) || !["narrowly", "widely"].includes(row.orientation) || !["one_side", "facing", "top"].includes(row.binding))
    throw new Error("InvalidHwp5PageSettings");
  if (row.orientation !== (row.flags & 1 ? "widely" : "narrowly") || row.binding !== ["one_side", "facing", "top"][row.flags >>> 1 & 3])
    throw new Error("InvalidHwp5PageSettings");
  return row;
}

// js/hwp5-section-settings.mjs
function decodeHwp5SectionSettings(bytes) {
  const row = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (value, max = 4294967295) => Number.isInteger(value) && value >= 0 && value <= max;
  if (!row || !["source_node", "flags", "tab_spacing", "extra_bytes"].every((key) => uint(row[key])) || !["column_gap", "vertical_grid", "horizontal_grid"].every((key) => Number.isInteger(row[key]) && row[key] >= -32768 && row[key] <= 32767) || !["numbering_id", "page_start", "picture_start", "table_start", "equation_start"].every((key) => uint(row[key], 65535)) || !(row.language === null || uint(row.language, 65535)) || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero)
    throw new Error("InvalidHwp5SectionSettings");
  if (Object.hasOwn(row, "extra_raw") && (!Array.isArray(row.extra_raw) || row.extra_raw.length !== row.extra_bytes || !Array.from(row.extra_raw).every((byte) => uint(byte, 255)) || row.extra_raw.some((byte) => byte !== 0) !== row.extra_nonzero))
    throw new Error("InvalidHwp5SectionSettings");
  if (Object.hasOwn(row, "memo_shape_count") && row.memo_shape_count !== null && !uint(row.memo_shape_count))
    throw new Error("InvalidHwp5SectionSettings");
  if (Object.hasOwn(row, "memo_list_count") && !uint(row.memo_list_count))
    throw new Error("InvalidHwp5SectionSettings");
  if (Object.hasOwn(row, "observed_extension") && row.observed_extension !== null) {
    const extension = row.observed_extension;
    if (!extension || typeof extension !== "object" || Array.isArray(extension) || row.language === null || row.extra_bytes !== 17 || !Array.isArray(row.extra_raw))
      throw new Error("InvalidHwp5SectionSettings");
    const view = new DataView(Uint8Array.from(row.extra_raw).buffer);
    for (const [key, offset, method] of [
      ["leading_count_raw", 0, "getUint32"],
      ["memo_shape_id_ref", 4, "getUint16"],
      ["flags_raw", 6, "getUint16"],
      ["line_number_restart_raw", 8, "getUint8"],
      ["line_number_count_by", 9, "getUint16"],
      ["line_number_distance_raw", 11, "getUint32"],
      ["line_number_start", 15, "getUint16"]
    ]) {
      if (extension[key] !== view[method](offset, true))
        throw new Error("InvalidHwp5SectionSettings");
    }
    const direction = extension.flags_raw >>> 1 & 7;
    const hasDirection = [
      "text_direction_raw",
      "text_direction",
      "text_vertical_width_head",
      "unknown_flags"
    ].some((key) => Object.hasOwn(extension, key));
    if (hasDirection && (extension.text_direction_raw !== direction || extension.text_direction !== (["HORIZONTAL", "VERTICAL", "VERTICALALL"][direction] ?? null) || extension.text_vertical_width_head !== Boolean(extension.flags_raw & 16) || extension.unknown_flags !== (extension.flags_raw & 65505)))
      throw new Error("InvalidHwp5SectionSettings");
    if (!Array.isArray(extension.trailing_raw) || extension.trailing_raw.length !== 11 || Array.from(extension.trailing_raw).some((byte, index) => byte !== row.extra_raw[index + 6]))
      throw new Error("InvalidHwp5SectionSettings");
  }
  return row;
}

// js/hwp5-cell-layout-sources.mjs
function decodeHwp5CellLayoutSources(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (value, max = 4294967295) => Number.isInteger(value) && value >= 0 && value <= max;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5CellLayoutSources");
  const lists = new Set;
  for (const row of rows) {
    if (!row || !["table_record_node", "list_node", "attributes", "extra_bytes"].every((key) => uint(row[key])) || !uint(row.border_fill_id, 65535) || !(row.unknown === null || uint(row.unknown, 65535)) || !Array.isArray(row.margins) || row.margins.length !== 4 || !row.margins.every((value) => Number.isInteger(value) && value >= -32768 && value <= 32767) || row.text_direction !== (row.attributes & 7) || row.line_wrap !== (row.attributes >>> 3 & 3) || row.vertical_alignment !== (row.attributes >>> 5 & 3))
      throw new Error("InvalidHwp5CellLayoutSources");
    for (const [field, bit] of [
      ["has_margin", 16],
      ["protected", 17],
      ["header", 18],
      ["editable", 19]
    ])
      if (row[field] !== Boolean(row.attributes & 1 << bit))
        throw new Error("InvalidHwp5CellLayoutSources");
    if (lists.has(row.list_node))
      throw new Error("InvalidHwp5CellLayoutSources");
    lists.add(row.list_node);
  }
  return rows;
}

// js/hwp5-border-fill-sources.mjs
function decodeHwp5BorderFillSources(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 64 * 1024 * 1024)
    throw new Error("InvalidHwp5BorderFillSources");
  return validateHwp5BorderFillSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function validateHwp5BorderFillSources(rows) {
  const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const uint = (v) => integer(v, 0, 4294967295), byte = (v) => integer(v, 0, 255), signed = (v) => integer(v, -2147483648, 2147483647);
  const optional = (v, check) => v === null || check(v), fail = () => {
    throw new Error("InvalidHwp5BorderFillSources");
  };
  if (!Array.isArray(rows) || rows.length > 1e6)
    fail();
  for (const [i, r] of rows.entries()) {
    if (!r || r.id !== i + 1 || !uint(r.record_index) || r.record_index < i || i > 0 && r.record_index <= rows[i - 1].record_index || !integer(r.attributes, 0, 65535) || !Array.isArray(r.borders) || r.borders.length !== 5 || !Array.from(r.borders).every((b) => b && byte(b.kind) && byte(b.width) && uint(b.color)) || !uint(r.fill_flags) || typeof r.fill_known !== "boolean" || r.fill_known !== ((r.fill_flags & ~7) === 0))
      fail();
    if (!r.fill_known) {
      if (!uint(r.unknown_fill_bytes) || [
        r.pattern,
        r.gradient,
        r.image,
        r.alpha,
        r.additional_present,
        r.additional_bytes,
        r.extra_bytes
      ].some((v) => v !== null))
        fail();
      continue;
    }
    if (r.unknown_fill_bytes !== null || typeof r.additional_present !== "boolean" || !uint(r.additional_bytes) || !uint(r.extra_bytes) || !r.additional_present && (r.additional_bytes !== 0 || r.fill_flags > 1) || r.pattern !== null !== !!(r.fill_flags & 1) || r.gradient !== null !== !!(r.fill_flags & 4) || r.image !== null !== !!(r.fill_flags & 2))
      fail();
    const { pattern: p, gradient: g, image } = r;
    if (p !== null && (!p || !uint(p.background) || !uint(p.foreground) || !signed(p.kind)))
      fail();
    if (g !== null && (!g || !byte(g.kind) || !["angle", "center_x", "center_y", "blur"].every((k) => uint(g[k])) || !optional(g.blur_center, byte) || !Array.isArray(g.colors) || g.colors.length > 1e6 || !Array.from(g.colors).every(uint) || !Array.isArray(g.positions) || g.positions.length !== (g.colors.length > 2 ? g.colors.length : 0) || !Array.from(g.positions).every(signed)))
      fail();
    if (g !== null && g.blur_center !== null !== (r.additional_bytes === 1))
      fail();
    if (image !== null && (!image || !byte(image.mode) || !image.picture || !integer(image.picture.contrast, -128, 127) || !integer(image.picture.brightness, -128, 127) || !byte(image.picture.effect) || !integer(image.picture.bin_data_id, 0, 65535)))
      fail();
    if (r.alpha !== null && (!r.alpha || r.extra_bytes !== 0 || r.fill_flags === 0 || ![
      ["pattern", 1],
      ["gradient", 4],
      ["image", 2]
    ].every(([k, flag]) => r.fill_flags & flag ? byte(r.alpha[k]) : r.alpha[k] === null)))
      fail();
  }
  return rows;
}

// js/hwp5-table-anchors.mjs
function decodeHwp5TableAnchors(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5TableAnchors");
  const seen = new Set;
  for (const row of rows) {
    if (!row || !["table_record_node", "control_node", "paragraph", "source_unit", "current_unit"].every((key) => uint(row[key])) || row.control_node >= row.table_record_node || row.source_unit > 4294967287 || row.current_unit > 4294967287 || seen.has(row.table_record_node))
      throw new Error("InvalidHwp5TableAnchors");
    seen.add(row.table_record_node);
  }
  return rows;
}

// js/hwp5-flow-sources.mjs
var uint21 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var parse3 = (bytes) => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
function decodeHwp5ParagraphFlow(bytes) {
  const rows = parse3(bytes);
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5ParagraphFlow");
  for (const [index, row] of rows.entries()) {
    if (row?.empty_line_eligible !== undefined && (typeof row.empty_line_eligible !== "boolean" || row.empty_line_eligible && row.top_level !== true))
      throw new Error("InvalidHwp5ParagraphFlow");
    if (row && (Object.hasOwn(row, "memo_index") || Object.hasOwn(row, "memo_node"))) {
      if (!(row.memo_index === null && row.memo_node === null) && !(uint21(row.memo_index) && uint21(row.memo_node) && row.host === "other" && row.top_level === false && uint21(row.list_node) && row.memo_node + 1 === row.list_node))
        throw new Error("InvalidHwp5ParagraphFlow");
    }
    if (row?.host !== undefined) {
      if (![
        "body",
        "table_cell",
        "table_caption",
        "header",
        "footer",
        "footnote",
        "endnote",
        "master_page",
        "drawing",
        "other"
      ].includes(row.host) || !(row.list_node === null || uint21(row.list_node)) || row.top_level !== (row.host === "body") || row.host === "body" !== (row.list_node === null))
        throw new Error("InvalidHwp5ParagraphFlow");
    }
    if (!row || row.paragraph !== index || !uint21(row.template_node) || !(row.source_node === null || uint21(row.source_node)) || !(row.parent_node === null || uint21(row.parent_node)) || !Number.isInteger(row.break_flags) || row.break_flags < 0 || row.break_flags > 255 || typeof row.generated !== "boolean" || row.generated !== (row.source_node === null) || row.top_level !== (row.parent_node === null) || row.generated && (![0, 4, 8].includes(row.break_flags) || row.break_flags !== 0 && !row.top_level) || !row.generated && row.source_node !== row.template_node)
      throw new Error("InvalidHwp5ParagraphFlow");
    for (const [name, mask] of [
      ["section_break", 1],
      ["multicolumn_break", 2],
      ["page_break", 4],
      ["column_break", 8]
    ])
      if (row[name] !== Boolean(row.break_flags & mask))
        throw new Error("InvalidHwp5ParagraphFlow");
  }
  return rows;
}
function decodeHwp5ColumnSources(bytes) {
  const rows = parse3(bytes);
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5ColumnSources");
  for (const row of rows) {
    if (!row || !uint21(row.current_paragraph) || !uint21(row.current_unit))
      throw new Error("InvalidHwp5ColumnSources");
    if (!row || !["source_node", "paragraph_node", "flags", "color", "extra_bytes"].every((name) => uint21(row[name])) || !Number.isInteger(row.count) || row.count < 1 || row.count > 255 || ![0, 1, 2, 3].includes(row.kind) || ![0, 1, 2, 3].includes(row.direction) || typeof row.same_width !== "boolean" || !(row.spacing === null || Number.isInteger(row.spacing) && row.spacing >= -32768 && row.spacing <= 32767) || ![row.line_type, row.line_width].every((value) => Number.isInteger(value) && value >= 0 && value <= 255) || !Array.isArray(row.columns))
      throw new Error("InvalidHwp5ColumnSources");
    if ((row.flags >>> 2 & 255) !== row.count || (row.flags & 3) !== row.kind || (row.flags >>> 10 & 3) !== row.direction || Boolean(row.flags & 4096) !== row.same_width || row.columns.length !== (row.count < 2 || row.same_width ? 0 : row.count) || row.columns.length > 0 !== (row.spacing === null))
      throw new Error("InvalidHwp5ColumnSources");
    for (const value of row.columns)
      if (!value || ![value.width, value.gap].every((number) => Number.isInteger(number) && number >= 0 && number <= 65535))
        throw new Error("InvalidHwp5ColumnSources");
  }
  return rows;
}

// js/hwp5-formula-sources.mjs
var decoder4 = new TextDecoder("utf-8", { fatal: true });
var uint22 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
function decodeHwp5FormulaSources(bytes) {
  const rows = JSON.parse(decoder4.decode(bytes));
  if (!Array.isArray(rows) || rows.length > 1e6)
    throw new Error("InvalidHwp5FormulaSources");
  const seen = new Set;
  for (const row of rows) {
    if (!row || !uint22(row.source_node) || row.source_node === 0 || !uint22(row.paragraph) || seen.has(row.source_node) || typeof row.formula !== "string" || !row.formula.startsWith("=") || row.formula.length < 2 || typeof row.last_result !== "string" || typeof row.derived !== "boolean" || !row.formula.isWellFormed() || !row.last_result.isWellFormed())
      throw new Error("InvalidHwp5FormulaSources");
    seen.add(row.source_node);
  }
  return rows;
}

// js/hwp5-field-spans.mjs
function validateHwp5FieldSpans(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const sources = new Set;
  if (!Array.isArray(rows))
    throw new Error("InvalidHwp5FieldSpans");
  for (const row of rows) {
    if (!row || ![row.source_node, row.field_id, row.ordinal].every(uint) || ![row.begin, row.end].every((position) => position && uint(position.paragraph) && uint(position.unit)) || row.begin.paragraph > row.end.paragraph || row.begin.paragraph === row.end.paragraph && row.begin.unit > row.end.unit || sources.has(row.source_node))
      throw new Error("InvalidHwp5FieldSpans");
    sources.add(row.source_node);
  }
  return rows;
}
function decodeHwp5FieldSpans(bytes) {
  return validateHwp5FieldSpans(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// js/hwp5-field-topology.mjs
var uint23 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var position = (value) => value && uint23(value.paragraph) && uint23(value.unit);
var before = (lhs, rhs) => lhs.paragraph < rhs.paragraph || lhs.paragraph === rhs.paragraph && lhs.unit < rhs.unit;
function validateHwp5FieldTopology(value) {
  const fail = () => {
    throw new Error("InvalidHwp5FieldTopology");
  };
  if (!value || !Array.isArray(value.spans) || !Array.isArray(value.unresolved))
    fail();
  const starts = new Set;
  for (const row of value.spans) {
    if (!row || !uint23(row.field_id) || !uint23(row.ordinal) || !position(row.begin) || !position(row.end) || before(row.end, row.begin))
      fail();
    const key = row.begin.paragraph + ":" + row.ordinal;
    if (starts.has(key))
      fail();
    starts.add(key);
  }
  let previous = null;
  for (const row of value.unresolved) {
    if (!row || !position(row.position) || !uint23(row.marker_id) || !(row.list_node === null || uint23(row.list_node)))
      fail();
    if (previous && !before(previous, row.position))
      fail();
    previous = row.position;
    if (row.kind === "unclosed_start") {
      if (!uint23(row.ordinal))
        fail();
      const key = row.position.paragraph + ":" + row.ordinal;
      if (starts.has(key))
        fail();
      starts.add(key);
    } else if (row.kind === "orphan_end") {
      if (row.ordinal !== null)
        fail();
    } else
      fail();
  }
  return { spans: value.spans, unresolved: value.unresolved };
}
function decodeHwp5FieldTopology(bytes) {
  return validateHwp5FieldTopology(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

// js/hwp5-normalization-info.mjs
var decoder5 = new TextDecoder("utf-8", { fatal: true });
var counts = [
  "zero_fat_tail_slots",
  "off_by_one_fat_markers",
  "zero_unclaimed_fat_slots",
  "orphan_end_fat_slots",
  "zero_mini_tail_slots",
  "zero_unclaimed_mini_slots",
  "zero_unused_entries",
  "stale_unused_entries"
];
function decodeHwp5NormalizationInfo(bytes) {
  const value = JSON.parse(decoder5.decode(bytes));
  if (value === null)
    return { normalized: false, historyBaseline: "original", deviations: null };
  const invalid = () => {
    throw new Error("InvalidHwp5NormalizationInfo");
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid();
  for (const key of counts)
    if (!Number.isSafeInteger(value[key]) || value[key] < 0)
      invalid();
  const root = value.original_root_created;
  if (!(typeof root === "string" && /^(0|[1-9][0-9]*)$/.test(root)) && !(Number.isSafeInteger(root) && root >= 0))
    invalid();
  if (BigInt(root) > 0xffffffffffffffffn)
    invalid();
  return {
    normalized: true,
    historyBaseline: "normalized",
    deviations: { ...value, original_root_created: String(root) }
  };
}

// js/hwp5-observed-docinfo.mjs
function validateObservedDocInfoOption(value, distribution, availableSectionCopy) {
  if (typeof value !== "boolean")
    throw new TypeError("Invalid observed DocInfo option");
  if (value && (distribution || availableSectionCopy))
    throw new TypeError("Unsupported observed DocInfo option combination");
}
function decodeObservedDocInfoDiagnostics(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (value === null)
    return null;
  const fields = [
    "absent_carets",
    "unresolved_font_types",
    "unresolved_style_characters",
    "unresolved_character_tails",
    "absent_fill_additionals"
  ];
  if (!value || typeof value !== "object" || fields.some((key) => !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 4294967295) || typeof value.resource_count_mismatch !== "boolean")
    throw new Error("InvalidObservedDocInfoDiagnostics");
  return value;
}

// js/hwp5-exclusive-text-delta.mjs
var uint24 = (x) => Number.isSafeInteger(x) && x >= 0 && x < 4294967295;
var epoch = (x) => typeof x === "string" && /^[1-9][0-9]{0,19}$/.test(x) && BigInt(x) <= 0xffffffffffffffffn;
var bad = () => {
  throw Error("InvalidExclusiveTextDelta");
};
function decodeHwp5TextWindow(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 48)
    bad();
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = (i) => v.getUint32(4 + i * 4, true);
  const e = (BigInt(n(2)) << 32n | BigInt(n(1))).toString();
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "H5W1" || n(0) !== 1 || !epoch(e) || !uint24(n(3)) || !uint24(n(4)) || n(7) > n(8) || n(8) > n(6) || n(8) - n(7) > 4096 || n(9) !== 1 || n(10) !== (n(8) - n(7)) * 2 || bytes.length !== 48 + n(10))
    bad();
  const text = new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true }).decode(bytes.slice(48));
  return {
    epoch: e,
    section: n(3),
    sourceNode: n(4),
    parentNode: n(5) === 4294967295 ? null : n(5),
    totalUnits: n(6),
    startUnit: n(7),
    endUnit: n(8),
    text
  };
}
function decodeHwp5TextDelta(bytes) {
  const r = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!r || Object.keys(r).sort().join() !== [
    "version",
    "exclusive",
    "beforeEpoch",
    "epoch",
    "beforeRevision",
    "revision",
    "section",
    "paragraph",
    "sourceNode",
    "parentNode",
    "startUnit",
    "removed",
    "inserted",
    "totalUnits",
    "runs"
  ].sort().join() || r.version !== 1 || r.exclusive !== true || !epoch(r.beforeEpoch) || !epoch(r.epoch) || BigInt(r.epoch) <= BigInt(r.beforeEpoch))
    bad();
  for (const k of [
    "beforeRevision",
    "revision",
    "section",
    "paragraph",
    "sourceNode",
    "startUnit",
    "totalUnits"
  ])
    if (!uint24(r[k]))
      bad();
  if (r.parentNode !== null && !uint24(r.parentNode))
    bad();
  for (const k of ["removed", "inserted"])
    if (!Array.isArray(r[k]) || r[k].length > 4096 || r[k].some((x) => !Number.isInteger(x) || x < 0 || x > 65535))
      bad();
  if (!Array.isArray(r.runs) || !r.runs.length || r.runs.length > 4096)
    bad();
  let prev = -1;
  for (const run of r.runs) {
    if (Object.keys(run).sort().join() !== "char_shape_id,start_unit" || !uint24(run.start_unit) || !uint24(run.char_shape_id) || run.start_unit <= prev || run.start_unit > r.totalUnits)
      bad();
    prev = run.start_unit;
  }
  if (r.runs[0].start_unit !== 0 || r.totalUnits < 1 || r.totalUnits > 4096)
    bad();
  return r;
}
function createHwp5ExclusiveTextApi({
  wasm,
  output,
  check,
  encode,
  currentSourceReferences
}) {
  const window = (reference, start, end) => output((ptr, size) => wasm.hwp5_edit_copy_current_text_window(ptr, size, start, end), encode(reference));
  return {
    captureExclusiveTextOwner(section, paragraph) {
      check();
      if (typeof wasm.hwp5_edit_last_text_delta_receipt !== "function" || typeof wasm.hwp5_edit_copy_current_text_window !== "function")
        return null;
      const references = currentSourceReferences(section, { first: paragraph, count: 1 });
      const reference = references.references[0];
      if (reference?.kind !== "original")
        return null;
      const w = decodeHwp5TextWindow(window(reference, 0, 0));
      return { section, paragraph, reference, window: w };
    },
    readCurrentOwnerWindow(section, paragraph) {
      check();
      if (typeof wasm.hwp5_edit_copy_current_text_window !== "function" || typeof wasm.hwp5_edit_character_ranges !== "function")
        return null;
      const captured = this.captureExclusiveTextOwner(section, paragraph);
      if (!captured || captured.window.totalUnits < 2 || captured.window.totalUnits > 4096)
        return null;
      const reference = captured.reference;
      const w = decodeHwp5TextWindow(window(reference, 0, captured.window.totalUnits));
      if (w.epoch !== captured.window.epoch || w.sourceNode !== captured.window.sourceNode || w.parentNode !== captured.window.parentNode || w.section !== section || w.totalUnits !== captured.window.totalUnits || w.startUnit !== 0 || w.endUnit !== w.totalUnits || w.text.length !== w.totalUnits || w.text.at(-1) !== "\r" || !w.text.isWellFormed() || Array.from(w.text.slice(0, -1)).some((c) => c.charCodeAt(0) < 32 || c === "￼"))
        bad();
      const raw = decodeCharacterRanges(output(() => wasm.hwp5_edit_character_ranges(section, paragraph)));
      if (!raw.length || raw.length > 4096)
        bad();
      const characterRanges = [];
      const length = w.text.length - 1;
      let cursor = 0;
      for (const range of raw) {
        if (range.start !== cursor || range.end < range.start || range.end > w.totalUnits || !uint24(range.charShapeId))
          bad();
        cursor = range.end;
        const start = Math.min(length, range.start), end = Math.min(length, range.end), charShapeId = range.charShapeId;
        if (start === end) {
          if (start === length)
            characterRanges.push({ start, end, charShapeId });
          continue;
        }
        const last = characterRanges.at(-1);
        if (last?.charShapeId === charShapeId)
          last.end = end;
        else
          characterRanges.push({ start, end, charShapeId });
      }
      if (cursor !== w.totalUnits)
        bad();
      const final = currentSourceReferences(section, { first: paragraph, count: 1 }).references[0];
      if (!final || Object.keys(reference).some((k) => final[k] !== reference[k]) || Object.keys(final).length !== Object.keys(reference).length)
        bad();
      return { reference, window: w, characterRanges };
    },
    readExclusiveTextDelta(before) {
      check();
      if (!before)
        return null;
      const r = decodeHwp5TextDelta(output(() => wasm.hwp5_edit_last_text_delta_receipt()));
      const q = currentSourceReferences(r.section, { first: r.paragraph, count: 1 });
      const reference = q.references[0];
      if (r.section !== before.section || r.paragraph !== before.paragraph || r.beforeEpoch !== before.window.epoch || r.sourceNode !== before.window.sourceNode || r.parentNode !== before.window.parentNode || reference?.kind !== "original" || reference.epoch !== r.epoch || reference.id !== String(r.sourceNode) || r.startUnit + r.removed.length > before.window.totalUnits - 1 || r.totalUnits !== before.window.totalUnits - r.removed.length + r.inserted.length)
        bad();
      const after = decodeHwp5TextWindow(window(reference, 0, r.totalUnits));
      if (after.epoch !== r.epoch || after.sourceNode !== r.sourceNode || after.parentNode !== r.parentNode || after.section !== r.section || after.totalUnits !== r.totalUnits || after.text.at(-1) !== "\r" || Array.from(after.text.slice(0, -1)).some((c) => c.charCodeAt(0) < 32))
        bad();
      return { receipt: r, before: before.window, window: after, reference };
    }
  };
}

// js/hwp5-current-references.mjs
var utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
var utf16 = new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true });
var encoder = new TextEncoder;
var fields3 = ["epoch", "kind", "section", "id", "row", "column"];
var scopeSequence = 0n;
var invalid = () => {
  throw new Error("InvalidHwp5CurrentReference");
};
var uint25 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
var decimal = (value) => typeof value === "string" && /^(0|[1-9][0-9]{0,19})$/.test(value) && BigInt(value) <= 0xffffffffffffffffn;
function validate(reference) {
  if (!reference || typeof reference !== "object" || Array.isArray(reference))
    invalid();
  if (Object.keys(reference).length !== fields3.length || fields3.some((key) => !Object.hasOwn(reference, key)))
    invalid();
  const { epoch, kind, section, id, row, column } = reference;
  if (!decimal(epoch) || epoch === "0" || !decimal(id) || !uint25(section) || !uint25(row) || !uint25(column))
    invalid();
  if (!["original", "generated", "cell"].includes(kind))
    invalid();
  if (kind !== "cell" && (row !== 0 || column !== 0 || BigInt(id) > 0xffffffffn))
    invalid();
  if (kind !== "original" && id === "0")
    invalid();
  return reference;
}
function decodeHwp5CurrentReferences(bytes) {
  const value = JSON.parse(utf8.decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== "first,references,total,version")
    invalid();
  if (value.version !== 1 || !uint25(value.total) || !uint25(value.first) || value.first > value.total || !Array.isArray(value.references) || value.references.length > 1024 || value.first + value.references.length > value.total)
    invalid();
  for (const reference of value.references)
    validate(reference);
  if (value.references.some((reference) => reference.epoch !== value.references[0].epoch))
    invalid();
  return value;
}
function createHwp5CurrentReferenceApi({
  wasm,
  memory,
  check,
  output,
  success,
  u32,
  referenceScope
}) {
  const scope = referenceScope === undefined ? String(++scopeSequence) : `${referenceScope}:${++scopeSequence}`;
  const available = () => [
    "hwp5_edit_current_references",
    "hwp5_edit_copy_current_text",
    "hwp5_edit_splice_current"
  ].every((name) => typeof wasm[name] === "function");
  const ready = () => {
    check();
    if (!available())
      throw new Error("Hwp5CurrentReferenceAbiUnavailable");
  };
  const encode = (reference) => {
    if (!reference || reference.scope !== scope || Object.keys(reference).length !== fields3.length + 1)
      throw new Error("InvalidCurrentReferenceScope");
    const wire = Object.fromEntries(fields3.map((key) => [key, reference[key]]));
    validate(wire);
    return encoder.encode(JSON.stringify(wire));
  };
  const copyCurrentText = (reference) => {
    ready();
    return memory.withBytes(encode(reference), (ptr, size) => output(() => wasm.hwp5_edit_copy_current_text(ptr, size)).bytes);
  };
  const windowQuery = (name, section, options = {}) => {
    ready();
    if (typeof wasm[name] !== "function")
      throw new Error("Hwp5CurrentSourceReferenceAbiUnavailable");
    if (!options || typeof options !== "object" || Array.isArray(options))
      throw new TypeError("InvalidCurrentWindow");
    const { first = 0, count = 256 } = options;
    const args = [u32(section, "section"), u32(first, "first"), u32(count, "count")];
    if (count > 1024)
      throw new RangeError("LimitExceeded");
    const window = decodeHwp5CurrentReferences(output(() => wasm[name](...args)).bytes);
    if (window.first !== args[1] || window.references.length !== Math.min(args[2], window.total - args[1]) || window.references.some((ref) => ref.section !== args[0]))
      invalid();
    return {
      ...window,
      references: window.references.map((reference) => Object.freeze({ ...reference, scope }))
    };
  };
  const exclusive = createHwp5ExclusiveTextApi({
    wasm,
    check,
    encode,
    currentSourceReferences: (section, options) => windowQuery("hwp5_edit_current_source_references", section, options),
    output: (action, bytes) => bytes === undefined ? output(action).bytes : memory.withBytes(bytes, (ptr, size) => output(() => action(ptr, size)).bytes)
  });
  return {
    ...exclusive,
    supportsCurrentReferences() {
      check();
      return available();
    },
    supportsCurrentSourceReferences() {
      check();
      return available() && typeof wasm.hwp5_edit_current_source_references === "function";
    },
    currentSourceReferences(section, options) {
      const window = windowQuery("hwp5_edit_current_source_references", section, options);
      if (window.references.some((ref) => ref.kind === "cell"))
        invalid();
      return window;
    },
    currentReferences(section, options = {}) {
      return windowQuery("hwp5_edit_current_references", section, options);
    },
    copyCurrentText,
    currentText(reference) {
      return utf16.decode(copyCurrentText(reference));
    },
    spliceCurrent(options) {
      ready();
      if (!options || typeof options !== "object" || Array.isArray(options))
        throw new TypeError("InvalidCurrentEdit");
      const { reference, startUnit, endUnit, text } = options;
      const range = [u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (startUnit > endUnit)
        throw new RangeError("InvalidTextPosition");
      if (typeof text !== "string")
        throw new TypeError("Text must be a string");
      if (!text.isWellFormed())
        throw new Error("InvalidUnicodeEncoding");
      if (text.length > 4 * 1024 * 1024)
        throw new RangeError("LimitExceeded");
      const bytes = encoder.encode(text);
      if (bytes.length > 4 * 1024 * 1024)
        throw new RangeError("LimitExceeded");
      memory.withBytes(encode(reference), (ptr, size) => memory.withBytes(bytes, (textPtr, textSize) => success(wasm.hwp5_edit_splice_current(ptr, size, ...range, textPtr, textSize))));
    }
  };
}

// js/hwp5-created-tables.mjs
var decoder6 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
var keys = (v, names) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === names.length && names.every((k) => Object.hasOwn(v, k));
var integer2 = (v, low, high) => Number.isInteger(v) && v >= low && v <= high;
var margins = (v) => Array.isArray(v) && v.length === 4 && v.every((n) => integer2(n, -32768, 32767));
function decodeHwp5CreatedTables(bytes) {
  const fail = () => {
    throw new Error("InvalidHwp5CreatedTables");
  };
  const rows = JSON.parse(decoder6.decode(bytes));
  if (!Array.isArray(rows) || rows.length > 1e5 || rows.some((r) => !keys(r, ["table", "options"])))
    fail();
  validateCreatedTables(rows.map((row) => row.table), { hostBase: 0 });
  for (const row of rows) {
    const o = row.options;
    if (!keys(o, ["common", "table", "cell"]))
      fail();
    const { common: c, table: t, cell: l } = o;
    if (!keys(c, [
      "flags",
      "offset_y",
      "offset_x",
      "z_order",
      "margins",
      "prevent_page_break",
      "description"
    ]) || !integer2(c.flags, 0, 4294967295) || ![c.offset_y, c.offset_x, c.z_order].every((n) => integer2(n, -2147483648, 2147483647)) || !margins(c.margins) || typeof c.prevent_page_break !== "boolean" || typeof c.description !== "string" || !c.description.isWellFormed())
      fail();
    if (!keys(t, ["page_break", "repeat_header", "cell_spacing", "margins"]) || !integer2(t.page_break, 0, 2) || typeof t.repeat_header !== "boolean" || !integer2(t.cell_spacing, -32768, 32767) || !margins(t.margins))
      fail();
    if (!keys(l, ["layout", "unknown", "attributes", "margins"]) || !integer2(l.attributes, 0, 4294967295) || !margins(l.margins) || !(l.layout === "spec6" && l.unknown === null || l.layout === "observed8" && integer2(l.unknown, 0, 65535)))
      fail();
  }
  return rows;
}

// js/hwp5-table-creation.mjs
var encoder2 = new TextEncoder;
var decoder7 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
function createHwp5TableCreationApi({ wasm, memory, check, output, u32 }) {
  return {
    supportsTableCreation() {
      check();
      return typeof wasm.hwp5_edit_insert_table === "function";
    },
    tableCreationResources() {
      check();
      if (typeof wasm.hwp5_edit_table_creation_resources !== "function")
        throw new Error("Hwp5TableCreationResourcesAbiUnavailable");
      return decodeTableCreationResources(output(() => wasm.hwp5_edit_table_creation_resources()).bytes);
    },
    createdTables(section) {
      check();
      if (typeof wasm.hwp5_edit_created_tables !== "function")
        throw new Error("Hwp5CreatedTablesAbiUnavailable");
      return decodeHwp5CreatedTables(output(() => wasm.hwp5_edit_created_tables(u32(section, "section"))).bytes);
    },
    insertTable(request) {
      check();
      if (typeof wasm.hwp5_edit_insert_table !== "function")
        throw new Error("Hwp5TableCreationAbiUnavailable");
      if (!request || typeof request !== "object" || Array.isArray(request))
        throw new TypeError("InvalidTableCreationRequest");
      const json = JSON.stringify(request);
      if (json.length > 1024 * 1024)
        throw new RangeError("LimitExceeded");
      const bytes = encoder2.encode(json);
      if (bytes.length > 1024 * 1024)
        throw new RangeError("LimitExceeded");
      const response = memory.withBytes(bytes, (ptr, size) => output(() => wasm.hwp5_edit_insert_table(ptr, size)).bytes);
      const value = JSON.parse(decoder7.decode(response));
      if (!value || Object.keys(value).join() !== "identity" || typeof value.identity !== "string" || !/^[1-9][0-9]{0,19}$/.test(value.identity) || BigInt(value.identity) > 0xffffffffffffffffn)
        throw new Error("InvalidCreatedTableIdentity");
      return value.identity;
    }
  };
}

// js/hwp5-editor.mjs
var encoder3 = new TextEncoder;
var decoder8 = new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true });
var u32 = (value, name) => {
  if (!Number.isInteger(value) || value < 0 || value > 4294967295)
    throw new RangeError(`Invalid ${name}`);
  return value;
};
async function createExperimentalHwp5Editor(source, input, {
  distribution = false,
  normalizeObservedCfb = false,
  availableSectionCopy = false,
  retainObservedDocInfo = false,
  referenceScope
} = {}) {
  validateObservedDocInfoOption(retainObservedDocInfo, distribution, availableSectionCopy);
  if (typeof distribution !== "boolean")
    throw new TypeError("Invalid distribution option");
  if (referenceScope !== undefined && (typeof referenceScope !== "string" || !referenceScope.length))
    throw new TypeError("InvalidCurrentReferenceScope");
  if (typeof normalizeObservedCfb !== "boolean")
    throw new TypeError("Invalid normalization option");
  validateAvailableSectionCopyOption(availableSectionCopy, distribution, normalizeObservedCfb);
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  for (const name of EXPERIMENTAL_EDITOR_FUNCTIONS)
    if (typeof wasm[name] !== "function")
      throw new Error(`Missing experimental editor export: ${name}`);
  const memory = createMemory(wasm);
  let closed = false;
  const check = () => {
    if (closed)
      throw new Error("EditorClosed");
  };
  const success = (value) => {
    if (!value)
      throw memory.error();
  };
  const count = (value) => {
    if (value >>> 0 === 4294967295)
      throw memory.error();
    return value >>> 0;
  };
  const output = (action) => {
    try {
      success(action());
      return {
        bytes: memory.copy(wasm.hwp5_edit_output_ptr(), wasm.hwp5_edit_output_len()),
        layoutRequiresReflow: Boolean(wasm.hwp5_edit_reflow())
      };
    } finally {
      wasm.hwp5_edit_output_free();
    }
  };
  const bytes = inputBytes(input);
  if (bytes.length > 64 * 1024 * 1024)
    throw new RangeError("LimitExceeded");
  const open = retainObservedDocInfo ? wasm.hwp5_edit_open_observed_docinfo : availableSectionCopy ? wasm.hwp5_edit_open_available_section_copy : normalizeObservedCfb ? distribution ? wasm.hwp5_edit_open_normalized_distribution : wasm.hwp5_edit_open_normalized : distribution ? wasm.hwp5_edit_open_distribution : wasm.hwp5_edit_open;
  if (normalizeObservedCfb && distribution && typeof open !== "function")
    throw new Error("Hwp5NormalizedDistributionAbiUnavailable");
  if (retainObservedDocInfo && (typeof open !== "function" || typeof wasm.hwp5_edit_observed_docinfo_diagnostics !== "function"))
    throw new Error("Hwp5ObservedDocInfoAbiUnavailable");
  if (normalizeObservedCfb && typeof open !== "function")
    throw new Error("Hwp5NormalizationAbiUnavailable");
  if (availableSectionCopy && (typeof open !== "function" || typeof wasm.hwp5_edit_available_section_copy_info !== "function"))
    throw new Error("Hwp5AvailableSectionCopyAbiUnavailable");
  if (typeof open !== "function")
    throw new Error("Hwp5DistributionEditorAbiUnavailable");
  memory.withBytes(bytes, (ptr, size) => success(retainObservedDocInfo ? open(ptr, size, normalizeObservedCfb ? 1 : 0) : open(ptr, size)));
  const copyText = (section, paragraph) => {
    check();
    return output(() => wasm.hwp5_edit_copy_text(u32(section, "section"), u32(paragraph, "paragraph"))).bytes;
  };
  return {
    ...createAtomicFormattingApi({ wasm, memory, check, prefix: "hwp5_edit" }),
    observedDocInfoDiagnostics() {
      check();
      if (typeof wasm.hwp5_edit_observed_docinfo_diagnostics !== "function")
        throw new Error("Hwp5ObservedDocInfoAbiUnavailable");
      return decodeObservedDocInfoDiagnostics(output(() => wasm.hwp5_edit_observed_docinfo_diagnostics()).bytes);
    },
    ...createParagraphBreakApi({
      wasm,
      memory,
      check,
      uint: u32,
      prefix: "hwp5_edit",
      endAsCount: false,
      unavailable: "Hwp5ParagraphBreakAbiUnavailable"
    }),
    supportsNormalizationInfo() {
      check();
      return typeof wasm[availableSectionCopy ? "hwp5_edit_available_section_copy_info" : "hwp5_edit_normalization_info"] === "function";
    },
    normalizationInfo() {
      check();
      if (availableSectionCopy) {
        const info = decodeAvailableSectionCopyInfo(output(() => wasm.hwp5_edit_available_section_copy_info()).bytes);
        if (!info)
          throw new Error("InvalidAvailableSectionCopyInfo");
        return info;
      }
      if (typeof wasm.hwp5_edit_normalization_info !== "function")
        throw new Error("Hwp5NormalizationAbiUnavailable");
      return decodeHwp5NormalizationInfo(output(() => wasm.hwp5_edit_normalization_info()).bytes);
    },
    supportsTextSourcePolicy() {
      check();
      return typeof wasm.hwp5_edit_validate_text_source_policy === "function";
    },
    supportsTextSourceProtection() {
      check();
      return typeof wasm.hwp5_edit_text_source_protection === "function";
    },
    textSourceProtection(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_text_source_protection !== "function")
        throw new Error("Hwp5TextSourceProtectionAbiUnavailable");
      const bytes = output(() => wasm.hwp5_edit_text_source_protection(index)).bytes;
      return decodeHwp5TextSourceProtection(bytes, wasm.hwp5_edit_paragraph_count(index));
    },
    validateTextSourcePolicy(section) {
      check();
      u32(section, "section");
      if (typeof wasm.hwp5_edit_validate_text_source_policy !== "function")
        throw new Error("Hwp5TextSourcePolicyAbiUnavailable");
      success(wasm.hwp5_edit_validate_text_source_policy(section));
    },
    ...createHistoryApi({
      wasm,
      memory,
      check,
      uint: u32,
      prefix: "hwp5_edit",
      unavailable: "Hwp5HistoryAbiUnavailable"
    }),
    ...createHwp5CurrentReferenceApi({ wasm, memory, check, output, success, u32, referenceScope }),
    ...createHwp5TableCreationApi({ wasm, memory, check, output, u32 }),
    supportsCurrentTextPreview() {
      check();
      return typeof wasm.hwp5_edit_current_text_preview === "function";
    },
    currentTextPreview() {
      check();
      if (typeof wasm.hwp5_edit_current_text_preview !== "function")
        throw new Error("Hwp5CurrentTextPreviewAbiUnavailable");
      return decodeHwp5Text(output(() => wasm.hwp5_edit_current_text_preview()).bytes, {
        allowGenerated: true
      });
    },
    sectionCount() {
      check();
      return count(wasm.hwp5_edit_section_count());
    },
    paragraphCount(section) {
      check();
      return count(wasm.hwp5_edit_paragraph_count(u32(section, "section")));
    },
    characterShapeCount() {
      check();
      return count(wasm.hwp5_edit_char_shape_count());
    },
    paragraphShapeCount() {
      check();
      if (typeof wasm.hwp5_edit_para_shape_count !== "function")
        throw new Error("Hwp5ParagraphFormatAbiUnavailable");
      return count(wasm.hwp5_edit_para_shape_count());
    },
    paragraphShapeId(section, paragraph) {
      check();
      if (typeof wasm.hwp5_edit_para_shape_id !== "function")
        throw new Error("Hwp5ParagraphFormatAbiUnavailable");
      return count(wasm.hwp5_edit_para_shape_id(u32(section, "section"), u32(paragraph, "paragraph")));
    },
    setParagraphFormat({ section, paragraph, paraShapeId }) {
      check();
      const values = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        u32(paraShapeId, "paraShapeId")
      ];
      if (typeof wasm.hwp5_edit_set_paragraph_format !== "function")
        throw new Error("Hwp5ParagraphFormatAbiUnavailable");
      success(wasm.hwp5_edit_set_paragraph_format(...values));
    },
    setParagraphAlignment({ section, paragraph, alignment }) {
      check();
      const value = [
        "JUSTIFY",
        "LEFT",
        "RIGHT",
        "CENTER",
        "DISTRIBUTE",
        "DISTRIBUTE_SPACE"
      ].indexOf(alignment);
      if (value < 0)
        throw new RangeError("InvalidParagraphAlignment");
      const values = [u32(section, "section"), u32(paragraph, "paragraph"), value];
      if (typeof wasm.hwp5_edit_set_paragraph_alignment !== "function")
        throw new Error("Hwp5ParagraphAlignmentAbiUnavailable");
      success(wasm.hwp5_edit_set_paragraph_alignment(...values));
    },
    setParagraphMargins({ section, paragraph, margins }) {
      check();
      const args = [u32(section, "section"), u32(paragraph, "paragraph")];
      const [mask, ...values] = paragraphMarginArgs(margins);
      if (typeof wasm.hwp5_edit_set_paragraph_margins !== "function")
        throw new Error("Hwp5ParagraphMarginsAbiUnavailable");
      success(wasm.hwp5_edit_set_paragraph_margins(...args, mask, ...values));
    },
    setParagraphSpacing({ section, paragraph, type, value }) {
      check();
      const args = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        ...paragraphSpacingArgs(type, value)
      ];
      if (typeof wasm.hwp5_edit_set_paragraph_spacing !== "function")
        throw new Error("Hwp5ParagraphSpacingAbiUnavailable");
      success(wasm.hwp5_edit_set_paragraph_spacing(...args));
    },
    paragraphShapes() {
      check();
      if (typeof wasm.hwp5_edit_paragraph_shapes !== "function")
        throw new Error("Hwp5ParagraphShapesAbiUnavailable");
      return decodeParagraphShapes(output(() => wasm.hwp5_edit_paragraph_shapes()).bytes);
    },
    characterShapes() {
      check();
      if (typeof wasm.hwp5_edit_character_shapes !== "function")
        throw new Error("Hwp5CharacterShapesAbiUnavailable");
      return decodeCharacterShapes(output(() => wasm.hwp5_edit_character_shapes()).bytes);
    },
    fontFaces() {
      check();
      if (typeof wasm.hwp5_edit_font_faces !== "function")
        throw new Error("Hwp5FontFacesAbiUnavailable");
      return decodeFontFaces(output(() => wasm.hwp5_edit_font_faces()).bytes);
    },
    fontFaceMetadata() {
      check();
      if (typeof wasm.hwp5_edit_font_face_metadata !== "function")
        throw new Error("Hwp5FontFaceMetadataAbiUnavailable");
      return decodeFontFaceMetadata(output(() => wasm.hwp5_edit_font_face_metadata()).bytes);
    },
    characterFontReferences() {
      check();
      if (typeof wasm.hwp5_edit_character_font_references !== "function")
        throw new Error("Hwp5CharacterFontReferencesAbiUnavailable");
      return decodeCharacterFontReferences(output(() => wasm.hwp5_edit_character_font_references()).bytes);
    },
    characterFontMetrics() {
      check();
      if (typeof wasm.hwp5_edit_character_font_metrics !== "function")
        throw new Error("Hwp5CharacterFontMetricsAbiUnavailable");
      return decodeCharacterFontMetrics(output(() => wasm.hwp5_edit_character_font_metrics()).bytes, "hwp5");
    },
    characterTextColors() {
      check();
      if (typeof wasm.hwp5_edit_character_text_colors !== "function")
        throw new Error("Hwp5CharacterTextColorsAbiUnavailable");
      return decodeCharacterTextColors(output(() => wasm.hwp5_edit_character_text_colors()).bytes);
    },
    characterShades() {
      check();
      if (typeof wasm.hwp5_edit_character_shades !== "function")
        throw new Error("Hwp5CharacterShadesAbiUnavailable");
      return decodeCharacterShades(output(() => wasm.hwp5_edit_character_shades()).bytes);
    },
    characterEffects() {
      check();
      if (typeof wasm.hwp5_edit_character_effects !== "function")
        throw new Error("Hwp5CharacterEffectsAbiUnavailable");
      return decodeCharacterEffects(output(() => wasm.hwp5_edit_character_effects()).bytes);
    },
    characterOutlines() {
      check();
      if (typeof wasm.hwp5_edit_character_outlines !== "function")
        throw new Error("Hwp5CharacterOutlinesAbiUnavailable");
      return decodeCharacterOutlines(output(() => wasm.hwp5_edit_character_outlines()).bytes);
    },
    characterStrikeStyles() {
      check();
      if (typeof wasm.hwp5_edit_character_strike_styles !== "function")
        throw new Error("Hwp5CharacterStrikeStylesAbiUnavailable");
      return decodeCharacterStrikeStyles(output(() => wasm.hwp5_edit_character_strike_styles()).bytes);
    },
    characterStrikes() {
      check();
      if (typeof wasm.hwp5_edit_character_strikes !== "function")
        throw new Error("Hwp5CharacterStrikesAbiUnavailable");
      return decodeCharacterStrikes(output(() => wasm.hwp5_edit_character_strikes()).bytes);
    },
    characterUnderlines() {
      check();
      if (typeof wasm.hwp5_edit_character_underlines !== "function")
        throw new Error("Hwp5CharacterUnderlinesAbiUnavailable");
      return decodeCharacterUnderlines(output(() => wasm.hwp5_edit_character_underlines()).bytes);
    },
    characterUnderlineStyles() {
      check();
      if (typeof wasm.hwp5_edit_character_underline_styles !== "function")
        throw new Error("Hwp5CharacterUnderlineStylesAbiUnavailable");
      return decodeCharacterUnderlineStyles(output(() => wasm.hwp5_edit_character_underline_styles()).bytes);
    },
    characterRanges(section, paragraph) {
      check();
      if (typeof wasm.hwp5_edit_character_ranges !== "function")
        throw new Error("Hwp5CharacterRangesAbiUnavailable");
      return decodeCharacterRanges(output(() => wasm.hwp5_edit_character_ranges(u32(section, "section"), u32(paragraph, "paragraph"))).bytes);
    },
    tableBindings(section) {
      check();
      if (typeof wasm.hwp5_edit_table_bindings !== "function")
        throw new Error("Hwp5TableBindingsAbiUnavailable");
      return decodeTableBindings(output(() => wasm.hwp5_edit_table_bindings(u32(section, "section"))).bytes);
    },
    setCellSize({ section, listNode, width, height }) {
      check();
      const values = [
        u32(section, "section"),
        u32(listNode, "listNode"),
        u32(width, "width"),
        u32(height, "height")
      ];
      if (typeof wasm.hwp5_edit_set_cell_size !== "function")
        throw new Error("Hwp5CellSizeAbiUnavailable");
      success(wasm.hwp5_edit_set_cell_size(...values));
    },
    setCellSizes(cells) {
      check();
      const bytes = encodeCellSizes(cells);
      if (typeof wasm.hwp5_edit_set_cell_sizes !== "function")
        throw new Error("Hwp5CellSizeBatchAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_cell_sizes(ptr, size)));
    },
    setPictureCurrentSize({ section, pictureNode, width, height }) {
      check();
      const values = [
        u32(section, "section"),
        u32(pictureNode, "pictureNode"),
        u32(width, "width"),
        u32(height, "height")
      ];
      if (typeof wasm.hwp5_edit_set_picture_current_size !== "function")
        throw new Error("Hwp5PictureCurrentSizeAbiUnavailable");
      success(wasm.hwp5_edit_set_picture_current_size(...values));
    },
    resizePicture({ section, pictureNode, width, height }) {
      check();
      const values = [
        u32(section, "section"),
        u32(pictureNode, "pictureNode"),
        u32(width, "width"),
        u32(height, "height")
      ];
      if (typeof wasm.hwp5_edit_resize_picture !== "function")
        throw new Error("Hwp5PictureResizeAbiUnavailable");
      success(wasm.hwp5_edit_resize_picture(...values));
    },
    tablePlacements(section) {
      check();
      if (typeof wasm.hwp5_edit_table_placements !== "function")
        throw new Error("Hwp5TablePlacementsAbiUnavailable");
      return decodeTablePlacements(output(() => wasm.hwp5_edit_table_placements(u32(section, "section"))).bytes, "hwp5");
    },
    tableLayoutSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_table_layout_sources !== "function")
        throw new Error("Hwp5TableLayoutSourcesAbiUnavailable");
      return decodeHwp5TableLayoutSources(output(() => wasm.hwp5_edit_table_layout_sources(index)).bytes);
    },
    cellLayoutSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_cell_layout_sources !== "function")
        throw new Error("Hwp5CellLayoutSourcesAbiUnavailable");
      return decodeHwp5CellLayoutSources(output(() => wasm.hwp5_edit_cell_layout_sources(index)).bytes);
    },
    borderFillSources() {
      check();
      if (typeof wasm.hwp5_edit_border_fill_sources !== "function")
        throw new Error("Hwp5BorderFillSourcesAbiUnavailable");
      return decodeHwp5BorderFillSources(output(() => wasm.hwp5_edit_border_fill_sources()).bytes);
    },
    tableAnchors(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_table_anchors !== "function")
        throw new Error("Hwp5TableAnchorsAbiUnavailable");
      return decodeHwp5TableAnchors(output(() => wasm.hwp5_edit_table_anchors(index)).bytes);
    },
    structuralAnchors(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_structural_anchors !== "function")
        throw new Error("Hwp5StructuralAnchorsAbiUnavailable");
      return decodeHwp5StructuralAnchors(output(() => wasm.hwp5_edit_structural_anchors(index)).bytes);
    },
    noteShapeSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_note_shape_sources !== "function")
        throw new Error("Hwp5NoteShapeSourcesAbiUnavailable");
      return decodeHwp5NoteShapeSources(output(() => wasm.hwp5_edit_note_shape_sources(index)).bytes);
    },
    captionSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_caption_sources !== "function")
        throw new Error("Hwp5CaptionSourcesAbiUnavailable");
      return decodeHwp5CaptionSources(output(() => wasm.hwp5_edit_caption_sources(index)).bytes);
    },
    supportsFormSources() {
      check();
      return ["hwp5_edit_form_sources", "hwp5_edit_form_anchors"].every((name) => typeof wasm[name] === "function");
    },
    supportsFormProperties() {
      check();
      return typeof wasm.hwp5_edit_form_properties === "function";
    },
    supportsFormTextEdit() {
      check();
      return typeof wasm.hwp5_edit_set_form_text === "function";
    },
    supportsFormTextLayoutRetention() {
      check();
      return typeof wasm.hwp5_edit_set_form_text === "function" && typeof wasm.hwp5_edit_form_text_retains_layout_flags === "function" && wasm.hwp5_edit_form_text_retains_layout_flags() === 1;
    },
    supportsRadioButtonSelect() {
      check();
      return typeof wasm.hwp5_edit_select_form_radio === "function";
    },
    supportsUnnamedRadioSelect() {
      check();
      return typeof wasm.hwp5_edit_select_form_radio === "function" && typeof wasm.hwp5_edit_radio_unnamed_singleton === "function" && wasm.hwp5_edit_radio_unnamed_singleton() === 1;
    },
    selectRadioButton(section, formNode) {
      check();
      const positions = [u32(section, "section"), u32(formNode, "formNode")];
      if (typeof wasm.hwp5_edit_select_form_radio !== "function")
        throw new Error("Hwp5RadioSelectAbiUnavailable");
      success(wasm.hwp5_edit_select_form_radio(...positions));
    },
    supportsCheckBoxStateEdit() {
      check();
      return typeof wasm.hwp5_edit_set_form_choice === "function";
    },
    setCheckBoxState(section, formNode, state) {
      check();
      const positions = [u32(section, "section"), u32(formNode, "formNode")];
      if (typeof wasm.hwp5_edit_set_form_choice !== "function")
        throw new Error("Hwp5FormChoiceEditAbiUnavailable");
      const states = ["UNCHECKED", "CHECKED", "INDETERMINATE"], value = states.indexOf(state);
      if (value < 0)
        throw new TypeError("InvalidFormChoiceState");
      success(wasm.hwp5_edit_set_form_choice(...positions, value));
    },
    setFormText({ section, formNode, text }) {
      check();
      const positions = [u32(section, "section"), u32(formNode, "formNode")];
      if (typeof wasm.hwp5_edit_set_form_text !== "function")
        throw new Error("Hwp5FormTextEditAbiUnavailable");
      if (typeof text !== "string")
        throw new TypeError("Form text must be a string");
      if (!text.isWellFormed())
        throw new Error("InvalidUnicodeEncoding");
      if (text.length > 65535)
        throw new RangeError("LimitExceeded");
      const bytes = encoder3.encode(text);
      if (bytes.length > 196605)
        throw new RangeError("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_form_text(...positions, ptr, size)));
    },
    formProperties(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_form_properties !== "function")
        throw new Error("Hwp5FormPropertiesAbiUnavailable");
      return decodeHwp5FormProperties(output(() => wasm.hwp5_edit_form_properties(index)).bytes);
    },
    formSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_form_sources !== "function")
        throw new Error("Hwp5FormSourcesAbiUnavailable");
      return decodeHwp5FormSources(output(() => wasm.hwp5_edit_form_sources(index)).bytes);
    },
    formAnchors(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_form_anchors !== "function")
        throw new Error("Hwp5FormSourcesAbiUnavailable");
      return decodeHwp5FormAnchors(output(() => wasm.hwp5_edit_form_anchors(index)).bytes);
    },
    drawingSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_sources !== "function")
        throw new Error("Hwp5DrawingSourcesAbiUnavailable");
      return decodeHwp5DrawingSources(output(() => wasm.hwp5_edit_drawing_sources(index)).bytes);
    },
    drawingObjectExtras(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_object_extras !== "function")
        throw new Error("Hwp5DrawingObjectExtrasAbiUnavailable");
      return decodeHwp5DrawingObjectExtras(output(() => wasm.hwp5_edit_drawing_object_extras(index)).bytes);
    },
    drawingComponentSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_component_sources !== "function")
        throw new Error("Hwp5DrawingComponentSourcesAbiUnavailable");
      return decodeHwp5DrawingComponentSources(output(() => wasm.hwp5_edit_drawing_component_sources(index)).bytes);
    },
    drawingAnchors(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_anchors !== "function")
        throw new Error("Hwp5DrawingAnchorsAbiUnavailable");
      return decodeHwp5DrawingAnchors(output(() => wasm.hwp5_edit_drawing_anchors(index)).bytes);
    },
    drawingListSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_list_sources !== "function")
        throw new Error("Hwp5DrawingListSourcesAbiUnavailable");
      return decodeHwp5DrawingListSources(output(() => wasm.hwp5_edit_drawing_list_sources(index)).bytes);
    },
    drawingMatrixSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_matrix_sources !== "function")
        throw new Error("Hwp5DrawingMatrixSourcesAbiUnavailable");
      return decodeHwp5DrawingMatrixSources(output(() => wasm.hwp5_edit_drawing_matrix_sources(index)).bytes);
    },
    drawingLocalTransforms(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_local_transforms !== "function")
        throw new Error("Hwp5DrawingLocalTransformsAbiUnavailable");
      return decodeHwp5DrawingLocalTransforms(output(() => wasm.hwp5_edit_drawing_local_transforms(index)).bytes);
    },
    drawingRectangleCorners(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_rectangle_corners !== "function")
        throw new Error("Hwp5DrawingRectangleCornersAbiUnavailable");
      return decodeHwp5DrawingRectangleCorners(output(() => wasm.hwp5_edit_drawing_rectangle_corners(index)).bytes);
    },
    drawingCurvePoints(section, layout) {
      check();
      const index = u32(section, "section"), selected = curveLayoutArg(layout);
      if (typeof wasm.hwp5_edit_drawing_curve_points !== "function")
        throw new Error("Hwp5DrawingCurvePointsAbiUnavailable");
      return decodeHwp5DrawingCurvePoints(output(() => wasm.hwp5_edit_drawing_curve_points(index, selected)).bytes);
    },
    drawingPolygonPoints(section, layout) {
      check();
      const index = u32(section, "section"), layoutId = polygonLayoutArg(layout);
      if (typeof wasm.hwp5_edit_drawing_polygon_points !== "function")
        throw new Error("Hwp5DrawingPolygonPointsAbiUnavailable");
      return decodeHwp5DrawingPolygonPoints(output(() => wasm.hwp5_edit_drawing_polygon_points(index, layoutId)).bytes);
    },
    drawingLineEndpoints(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_drawing_line_endpoints !== "function")
        throw new Error("Hwp5DrawingLineEndpointsAbiUnavailable");
      return decodeHwp5DrawingLineEndpoints(output(() => wasm.hwp5_edit_drawing_line_endpoints(index)).bytes);
    },
    noteSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_note_sources !== "function")
        throw new Error("Hwp5NoteSourcesAbiUnavailable");
      return decodeHwp5NoteSources(output(() => wasm.hwp5_edit_note_sources(index)).bytes);
    },
    drawingStyleSources(section, options) {
      check();
      const index = u32(section, "section"), [border, tail] = drawingStyleLayoutArgs(options);
      if (typeof wasm.hwp5_edit_drawing_style_sources !== "function")
        throw new Error("Hwp5DrawingStyleSourcesAbiUnavailable");
      return decodeHwp5DrawingStyleSources(output(() => wasm.hwp5_edit_drawing_style_sources(index, border, tail)).bytes);
    },
    fileVersion() {
      check();
      if (typeof wasm.hwp5_edit_file_version !== "function")
        throw new Error("Hwp5FileVersionAbiUnavailable");
      const version = wasm.hwp5_edit_file_version();
      if (version === 0)
        throw memory.error();
      return version;
    },
    pictureSources(section, prefix) {
      check();
      const index = u32(section, "section"), selection = picturePrefixArg(prefix);
      if (typeof wasm.hwp5_edit_picture_sources !== "function")
        throw new Error("Hwp5PictureSourcesAbiUnavailable");
      return decodeHwp5PictureSources(output(() => wasm.hwp5_edit_picture_sources(index, selection)).bytes);
    },
    pictureTailSources(section, layout) {
      check();
      const index = u32(section, "section"), selection = pictureTailLayoutArg(layout);
      if (typeof wasm.hwp5_edit_picture_tail_sources !== "function")
        throw new Error("Hwp5PictureTailSourcesAbiUnavailable");
      return decodeHwp5PictureTailSources(output(() => wasm.hwp5_edit_picture_tail_sources(index, selection)).bytes);
    },
    binaryResource(ordinal, options = {}) {
      check();
      if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => key !== "maxBytes"))
        throw new Error("Invalid binary options");
      const { maxBytes = 32 * 1024 * 1024 } = options;
      const id = u32(ordinal, "binary ordinal"), limit = u32(maxBytes, "binary limit");
      if (id > 65535)
        throw new RangeError("Invalid binary ordinal");
      if (limit > 32 * 1024 * 1024)
        throw new RangeError("Invalid binary limit");
      if (typeof wasm.hwp5_edit_binary_resource !== "function")
        throw new Error("Hwp5BinaryResourceAbiUnavailable");
      return output(() => wasm.hwp5_edit_binary_resource(id, limit)).bytes;
    },
    automaticNumberSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_automatic_number_sources !== "function")
        throw new Error("Hwp5AutomaticNumberSourcesAbiUnavailable");
      return decodeHwp5AutomaticNumberSources(output(() => wasm.hwp5_edit_automatic_number_sources(index)).bytes);
    },
    pageControlSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_page_control_sources !== "function")
        throw new Error("Hwp5PageControlSourcesAbiUnavailable");
      return decodeHwp5PageControlSources(output(() => wasm.hwp5_edit_page_control_sources(index)).bytes);
    },
    documentProperties() {
      check();
      if (typeof wasm.hwp5_edit_document_properties !== "function")
        throw new Error("Hwp5DocumentPropertiesAbiUnavailable");
      return decodeHwp5DocumentProperties(output(() => wasm.hwp5_edit_document_properties()).bytes);
    },
    masterPageSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_master_page_sources !== "function")
        throw new Error("Hwp5MasterPageSourcesAbiUnavailable");
      return decodeHwp5MasterPageSources(output(() => wasm.hwp5_edit_master_page_sources(index)).bytes);
    },
    pageAreaSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_page_area_sources !== "function")
        throw new Error("Hwp5PageAreaSourcesAbiUnavailable");
      return decodeHwp5PageAreaSources(output(() => wasm.hwp5_edit_page_area_sources(index)).bytes);
    },
    pageSettings(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_page_settings !== "function")
        throw new Error("Hwp5PageSettingsAbiUnavailable");
      return decodeHwp5PageSettings(output(() => wasm.hwp5_edit_page_settings(index)).bytes);
    },
    sectionSettings(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_section_settings !== "function")
        throw new Error("Hwp5SectionSettingsAbiUnavailable");
      return decodeHwp5SectionSettings(output(() => wasm.hwp5_edit_section_settings(index)).bytes);
    },
    paragraphFlow(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_paragraph_flow !== "function")
        throw new Error("Hwp5ParagraphFlowAbiUnavailable");
      return decodeHwp5ParagraphFlow(output(() => wasm.hwp5_edit_paragraph_flow(index)).bytes);
    },
    columnSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_column_sources !== "function")
        throw new Error("Hwp5ColumnSourcesAbiUnavailable");
      return decodeHwp5ColumnSources(output(() => wasm.hwp5_edit_column_sources(index)).bytes);
    },
    copyText,
    fieldSpans(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_field_spans !== "function")
        throw new Error("Hwp5FieldSpansAbiUnavailable");
      return decodeHwp5FieldSpans(output(() => wasm.hwp5_edit_field_spans(index)).bytes);
    },
    supportsFieldTopology() {
      check();
      return typeof wasm.hwp5_edit_field_topology === "function";
    },
    fieldTopology(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_field_topology !== "function")
        throw new Error("Hwp5FieldTopologyAbiUnavailable");
      return decodeHwp5FieldTopology(output(() => wasm.hwp5_edit_field_topology(index)).bytes);
    },
    formulaSources(section) {
      check();
      const index = u32(section, "section");
      if (typeof wasm.hwp5_edit_formula_sources !== "function")
        throw new Error("Hwp5FormulaSourcesAbiUnavailable");
      return decodeHwp5FormulaSources(output(() => wasm.hwp5_edit_formula_sources(index)).bytes);
    },
    setFormulaDefinition({ section, sourceNode, formula }) {
      check();
      const positions = [u32(section, "section"), u32(sourceNode, "sourceNode")];
      if (typeof wasm.hwp5_edit_set_formula_definition !== "function")
        throw new Error("Hwp5FormulaDefinitionAbiUnavailable");
      if (typeof formula !== "string")
        throw new TypeError("Formula must be a string");
      if (!formula.isWellFormed())
        throw new Error("InvalidUnicodeEncoding");
      if (formula.length > 4096)
        throw new RangeError("LimitExceeded");
      const bytes = encoder3.encode(formula);
      if (bytes.length > 4096)
        throw new RangeError("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_formula_definition(...positions, ptr, size)));
    },
    text(section, paragraph) {
      check();
      return decoder8.decode(copyText(section, paragraph));
    },
    splice({ section, paragraph, startUnit, endUnit, text, rangePolicy = "reject" }) {
      check();
      const values = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        u32(startUnit, "startUnit"),
        u32(endUnit, "endUnit")
      ];
      if (typeof text !== "string")
        throw new TypeError("Text must be a string");
      if (!text.isWellFormed())
        throw new Error("InvalidUnicodeEncoding");
      if (rangePolicy !== "reject" && rangePolicy !== "half-open")
        throw new Error("InvalidRangePolicy");
      if (text.length > 4 * 1024 * 1024)
        throw new RangeError("LimitExceeded");
      const bytes = encoder3.encode(text);
      if (bytes.length > 4 * 1024 * 1024)
        throw new RangeError("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_splice(...values, ptr, size, rangePolicy === "half-open" ? 1 : 0)));
    },
    splitParagraph({ section, paragraph, atUnit, endUnit = atUnit }) {
      check();
      const values = [u32(section, "section"), u32(paragraph, "paragraph"), u32(atUnit, "atUnit")];
      u32(endUnit, "endUnit");
      if (endUnit < atUnit)
        throw new RangeError("InvalidTextPosition");
      if (endUnit !== atUnit) {
        if (typeof wasm.hwp5_edit_split_range !== "function")
          throw new Error("Hwp5StructureAbiUnavailable");
        success(wasm.hwp5_edit_split_range(...values, endUnit));
        return;
      }
      if (typeof wasm.hwp5_edit_split !== "function")
        throw new Error("Hwp5StructureAbiUnavailable");
      success(wasm.hwp5_edit_split(...values));
    },
    mergeParagraph({ section, paragraph }) {
      check();
      const values = [u32(section, "section"), u32(paragraph, "paragraph")];
      if (typeof wasm.hwp5_edit_merge !== "function")
        throw new Error("Hwp5StructureAbiUnavailable");
      success(wasm.hwp5_edit_merge(...values));
    },
    setCharacterFormat({ section, paragraph, startUnit, endUnit, charShapeId }) {
      check();
      success(wasm.hwp5_edit_format(u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit"), u32(charShapeId, "charShapeId")));
    },
    setCharacterProperties({ section, paragraph, startUnit, endUnit, properties }) {
      check();
      const positions = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        u32(startUnit, "startUnit"),
        u32(endUnit, "endUnit")
      ];
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const args = characterPropertyArgs(properties);
      if (typeof wasm.hwp5_edit_set_character_properties !== "function")
        throw new Error("Hwp5CharacterPropertiesAbiUnavailable");
      success(wasm.hwp5_edit_set_character_properties(...positions, ...args));
    },
    replaceParagraphRangesWithFontName({ ranges, text, language, name, properties }) {
      check();
      const bytes = encodeCharacterRanges(ranges), inserted = encodeParagraphReplacement(text), font = characterFontNameArgs(language, name);
      const args = properties === undefined ? null : characterPropertyArgs(properties);
      const action = args ? wasm.hwp5_edit_replace_paragraph_ranges_font_name_properties : wasm.hwp5_edit_replace_paragraph_ranges_font_name;
      if (typeof action !== "function")
        throw new Error(args ? "Hwp5NamedFontPropertyReplacementAbiUnavailable" : "Hwp5NamedFontReplacementAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(inserted, (tp, ts) => memory.withBytes(font.bytes, (np, ns) => success(action(ptr, size, tp, ts, font.language, np, ns, ...args ?? [])))));
    },
    replaceParagraphRanges({ ranges, text, properties }) {
      check();
      const bytes = encodeCharacterRanges(ranges), inserted = encodeParagraphReplacement(text);
      const args = properties === undefined ? null : characterPropertyArgs(properties);
      const action = args ? wasm.hwp5_edit_replace_paragraph_ranges_properties : wasm.hwp5_edit_replace_paragraph_ranges;
      if (typeof action !== "function")
        throw new Error(args ? "Hwp5PropertyReplacementAbiUnavailable" : "Hwp5ParagraphReplacementAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(inserted, (tp, ts) => success(action(ptr, size, tp, ts, ...args ?? []))));
    },
    setCharacterStrikeRanges({ ranges, enabled }) {
      check();
      const bytes = encodeCharacterRanges(ranges);
      if (typeof enabled !== "boolean")
        throw new TypeError("InvalidCharacterProperties");
      if (typeof wasm.hwp5_edit_set_character_strike_ranges !== "function")
        throw new Error("Hwp5CharacterStrikeRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_strike_ranges(ptr, size, Number(enabled))));
    },
    setCharacterUnderlineRanges({ ranges, kind }) {
      check();
      const bytes = encodeCharacterRanges(ranges), value = characterUnderlineArg(kind);
      if (typeof wasm.hwp5_edit_set_character_underline_ranges !== "function")
        throw new Error("Hwp5CharacterUnderlineRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwp5_edit_set_character_underline_ranges(ptr, size, value))
          throw memory.error();
      });
    },
    setCharacterPropertiesRanges({ ranges, properties }) {
      check();
      const bytes = encodeCharacterRanges(ranges);
      const args = characterPropertyArgs(properties);
      if (typeof wasm.hwp5_edit_set_character_properties_ranges !== "function")
        throw new Error("Hwp5CharacterPropertiesRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_properties_ranges(ptr, size, ...args)));
    },
    setCharacterFontNameRanges({ ranges, language, name }) {
      check();
      const bytes = encodeCharacterRanges(ranges), args = characterFontNameArgs(language, name);
      if (typeof wasm.hwp5_edit_set_character_font_name_ranges !== "function")
        throw new Error("Hwp5CharacterFontNameRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(args.bytes, (namePtr, nameSize) => {
        if (!wasm.hwp5_edit_set_character_font_name_ranges(ptr, size, args.language, namePtr, nameSize))
          throw memory.error();
      }));
    },
    setCharacterFontRanges({ ranges, language, fontId }) {
      check();
      const bytes = encodeCharacterRanges(ranges), args = characterFontArgs(language, fontId);
      if (fontId > 65535)
        throw new RangeError("InvalidFontId");
      if (typeof wasm.hwp5_edit_set_character_font_ranges !== "function")
        throw new Error("Hwp5CharacterFontRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_font_ranges(ptr, size, ...args)));
    },
    setCharacterTextColorRanges({ ranges, color }) {
      check();
      const bytes = encodeCharacterRanges(ranges), value = characterColorArg(color);
      if (typeof wasm.hwp5_edit_set_character_text_color_ranges !== "function")
        throw new Error("Hwp5CharacterTextColorRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_text_color_ranges(ptr, size, value)));
    },
    setCharacterShadeRanges({ ranges, color }) {
      check();
      const bytes = encodeCharacterRanges(ranges), args = characterShadeArgs(color);
      if (typeof wasm.hwp5_edit_set_character_shade_ranges !== "function")
        throw new Error("Hwp5CharacterShadeRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_shade_ranges(ptr, size, ...args)));
    },
    setCharacterEffectRanges({ ranges, effect, enabled, exclusive = false }) {
      check();
      const bytes = encodeCharacterRanges(ranges), args = characterEffectArgs(effect, enabled);
      const method = characterEffectMode(exclusive) ? wasm.hwp5_edit_set_character_effect_ranges_exclusive : wasm.hwp5_edit_set_character_effect_ranges;
      if (typeof method !== "function")
        throw new Error(exclusive ? "Hwp5CharacterEffectRangesExclusiveAbiUnavailable" : "Hwp5CharacterEffectRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(method(ptr, size, ...args)));
    },
    setCharacterOutlineRanges({ ranges, kind }) {
      check();
      const bytes = encodeCharacterRanges(ranges), value = hwp5CharacterOutlineArg(kind);
      const action = value > 1 ? wasm.hwp5_edit_set_character_outline_ranges_extended : wasm.hwp5_edit_set_character_outline_ranges;
      if (typeof action !== "function")
        throw new Error(value > 1 ? "Hwp5CharacterOutlineRangesExtendedAbiUnavailable" : "Hwp5CharacterOutlineRangesAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(action(ptr, size, value)));
    },
    setCharacterStrike({ section, paragraph, startUnit, endUnit, enabled }) {
      check();
      const positions = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        u32(startUnit, "startUnit"),
        u32(endUnit, "endUnit")
      ];
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      if (typeof enabled !== "boolean")
        throw new TypeError("InvalidCharacterProperties");
      if (typeof wasm.hwp5_edit_set_character_strike !== "function")
        throw new Error("Hwp5CharacterStrikeAbiUnavailable");
      success(wasm.hwp5_edit_set_character_strike(...positions, Number(enabled)));
    },
    setCharacterUnderline({ section, paragraph, startUnit, endUnit, kind }) {
      check();
      const positions = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        u32(startUnit, "startUnit"),
        u32(endUnit, "endUnit")
      ];
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const value = characterUnderlineArg(kind);
      if (typeof wasm.hwp5_edit_set_character_underline !== "function")
        throw new Error("Hwp5CharacterUnderlineAbiUnavailable");
      success(wasm.hwp5_edit_set_character_underline(...positions, value));
    },
    setCharacterStrikeColor({ section, paragraph, startUnit, endUnit, color }) {
      check();
      const positions = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        u32(startUnit, "startUnit"),
        u32(endUnit, "endUnit")
      ];
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const value = characterColorArg(color);
      if (typeof wasm.hwp5_edit_set_character_strike_color !== "function")
        throw new Error("Hwp5CharacterStrikeColorAbiUnavailable");
      success(wasm.hwp5_edit_set_character_strike_color(...positions, value));
    },
    setCharacterUnderlineColor({ section, paragraph, startUnit, endUnit, color }) {
      check();
      const positions = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        u32(startUnit, "startUnit"),
        u32(endUnit, "endUnit")
      ];
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const value = characterColorArg(color);
      if (typeof wasm.hwp5_edit_set_character_underline_color !== "function")
        throw new Error("Hwp5CharacterUnderlineColorAbiUnavailable");
      success(wasm.hwp5_edit_set_character_underline_color(...positions, value));
    },
    setCharacterFont({ section, paragraph, startUnit, endUnit, language, fontId }) {
      check();
      const positions = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        u32(startUnit, "startUnit"),
        u32(endUnit, "endUnit")
      ];
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const args = characterFontArgs(language, fontId);
      if (fontId > 65535)
        throw new RangeError("InvalidFontId");
      if (typeof wasm.hwp5_edit_set_character_font !== "function")
        throw new Error("Hwp5CharacterFontAbiUnavailable");
      success(wasm.hwp5_edit_set_character_font(...positions, ...args));
    },
    setCharacterFontName({ section, paragraph, startUnit, endUnit, language, name }) {
      check();
      const positions = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        u32(startUnit, "startUnit"),
        u32(endUnit, "endUnit")
      ];
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const args = characterFontNameArgs(language, name);
      if (typeof wasm.hwp5_edit_set_character_font_name !== "function")
        throw new Error("Hwp5CharacterFontNameAbiUnavailable");
      memory.withBytes(args.bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_font_name(...positions, args.language, ptr, size)));
    },
    spliceWithCharacterProperties(input) {
      check();
      const { positions, bytes } = textTransactionArgs(input);
      const properties = characterPropertyArgs(input.properties);
      const action = wasm.hwp5_edit_splice_character_properties;
      if (typeof action !== "function")
        throw new Error("Hwp5CharacterPropertyTextAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => success(action(...positions, ptr, size, ...properties)));
    },
    spliceWithFontName(input) {
      check();
      const { positions, bytes, font } = namedFontTextArgs(input);
      const properties = input.properties === undefined ? null : characterPropertyArgs(input.properties);
      const action = properties ? wasm.hwp5_edit_splice_font_name_properties : wasm.hwp5_edit_splice_font_name;
      if (typeof action !== "function")
        throw new Error(properties ? "Hwp5NamedFontPropertyTextAbiUnavailable" : "Hwp5NamedFontTextAbiUnavailable");
      memory.withBytes(bytes, (ptr, size) => memory.withBytes(font.bytes, (namePtr, nameSize) => success(action(...positions, ptr, size, font.language, namePtr, nameSize, ...properties ?? []))));
    },
    setCharacterTextColor({ section, paragraph, startUnit, endUnit, color }) {
      check();
      const positions = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        u32(startUnit, "startUnit"),
        u32(endUnit, "endUnit")
      ];
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const value = characterColorArg(color);
      if (typeof wasm.hwp5_edit_set_character_text_color !== "function")
        throw new Error("Hwp5CharacterTextColorAbiUnavailable");
      success(wasm.hwp5_edit_set_character_text_color(...positions, value));
    },
    setCharacterShade({ section, paragraph, startUnit, endUnit, color }) {
      check();
      const positions = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        u32(startUnit, "startUnit"),
        u32(endUnit, "endUnit")
      ];
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const args = characterShadeArgs(color);
      if (typeof wasm.hwp5_edit_set_character_shade !== "function")
        throw new Error("Hwp5CharacterShadeAbiUnavailable");
      success(wasm.hwp5_edit_set_character_shade(...positions, ...args));
    },
    setCharacterEffect({
      section,
      paragraph,
      startUnit,
      endUnit,
      effect,
      enabled,
      exclusive = false
    }) {
      check();
      const positions = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        u32(startUnit, "startUnit"),
        u32(endUnit, "endUnit")
      ];
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const args = characterEffectArgs(effect, enabled);
      const method = characterEffectMode(exclusive) ? wasm.hwp5_edit_set_character_effect_exclusive : wasm.hwp5_edit_set_character_effect;
      if (typeof method !== "function")
        throw new Error(exclusive ? "Hwp5CharacterEffectExclusiveAbiUnavailable" : "Hwp5CharacterEffectAbiUnavailable");
      success(method(...positions, ...args));
    },
    setCharacterOutline({ section, paragraph, startUnit, endUnit, kind }) {
      check();
      const positions = [
        u32(section, "section"),
        u32(paragraph, "paragraph"),
        u32(startUnit, "startUnit"),
        u32(endUnit, "endUnit")
      ];
      if (endUnit < startUnit)
        throw new RangeError("InvalidTextPosition");
      const value = hwp5CharacterOutlineArg(kind);
      const action = value > 1 ? wasm.hwp5_edit_set_character_outline_extended : wasm.hwp5_edit_set_character_outline;
      if (typeof action !== "function")
        throw new Error(value > 1 ? "Hwp5CharacterOutlineExtendedAbiUnavailable" : "Hwp5CharacterOutlineAbiUnavailable");
      success(action(...positions, value));
    },
    save({ allowStaleLayout = false } = {}) {
      check();
      if (typeof allowStaleLayout !== "boolean")
        throw new TypeError("allowStaleLayout must be boolean");
      return output(() => wasm.hwp5_edit_save(allowStaleLayout ? 1 : 0));
    },
    close() {
      if (!closed)
        wasm.hwp5_edit_close();
      closed = true;
    }
  };
}

// web/preview/document-save.mjs
function saveDocument(editor, format, allowStaleLayout = false) {
  if (!editor)
    throw new Error("EditorNotOpen");
  if (typeof allowStaleLayout !== "boolean")
    throw new TypeError("InvalidStaleLayoutPolicy");
  if (format === "hwpx")
    return { bytes: editor.save(), format, layoutRequiresReflow: true };
  if (format === "hwp5")
    return { ...editor.save({ allowStaleLayout }), format };
  throw new Error("UnknownDocumentFormat");
}

// web/preview/field-link-display-guard.mjs
function createFieldLinkDisplayGuard() {
  const failures = new Map;
  const reasons = new Map;
  return {
    read(section, query, fallback, scope = "links") {
      if (failures.get(section)?.has(scope))
        return fallback;
      try {
        return query();
      } catch (error) {
        if (error.message !== "InvalidFieldLinks")
          throw error;
        if (!failures.has(section))
          failures.set(section, new Set);
        failures.get(section).add(scope);
        reasons.set(section, error.message);
        return fallback;
      }
    },
    reason(section) {
      return reasons.get(section) ?? null;
    }
  };
}

// web/preview/paragraph-dependency-plan.mjs
function planParagraphDependencies({ total, offset, count, dependencies, maxParagraphs }) {
  if (![total, offset, count, maxParagraphs].every((value) => Number.isSafeInteger(value) && value >= 0) || offset > total || count > total - offset || !(dependencies instanceof Map))
    throw new RangeError("InvalidParagraphWindow");
  const valid = (ordinal) => Number.isSafeInteger(ordinal) && ordinal >= 0 && ordinal < total;
  for (const [ordinal, required] of dependencies) {
    if (!valid(ordinal) || !Array.isArray(required) || required.some((value) => !valid(value)) || new Set(required).size !== required.length)
      throw new RangeError("InvalidParagraphDependencies");
  }
  if (count > maxParagraphs)
    throw new RangeError("ParagraphWindowBudgetExceeded");
  const selected = new Set, queue = [];
  const add = (ordinal) => {
    if (selected.has(ordinal))
      return;
    if (selected.size >= maxParagraphs)
      throw new RangeError("ParagraphWindowBudgetExceeded");
    selected.add(ordinal);
    queue.push(ordinal);
  };
  for (let ordinal = offset;ordinal < offset + count; ordinal++)
    add(ordinal);
  for (let index = 0;index < queue.length; index++)
    for (const ordinal of dependencies.get(queue[index]) ?? [])
      add(ordinal);
  return {
    requestedOffset: offset,
    requestedCount: count,
    ordinals: [...selected].sort((a, b) => a - b)
  };
}

// web/preview/hwp5-window-identities.mjs
function hwp5WindowIdentities(projection) {
  const ordinals = new Map;
  for (const [index, section] of projection.sections.entries()) {
    if (section.index !== index)
      throw new Error("WindowDependencyBindingMismatch");
    for (let paragraph = 0;paragraph < section.paragraphs.length; paragraph++)
      ordinals.set(`${index}:${paragraph}`, ordinals.size);
  }
  const resolve = (section, paragraph) => {
    if (!Number.isSafeInteger(section) || !Number.isSafeInteger(paragraph) || section < 0 || paragraph < 0)
      throw new Error("WindowDependencyBindingMismatch");
    const ordinal = ordinals.get(`${section}:${paragraph}`);
    if (ordinal === undefined)
      throw new Error("WindowDependencyBindingMismatch");
    return ordinal;
  };
  return { total: ordinals.size, ordinals, resolve };
}

// web/preview/hwp5-table-window-dependencies.mjs
function hwp5TableWindowDependencies(editor, projection) {
  const { ordinals, resolve } = hwp5WindowIdentities(projection), dependencies = new Map;
  const link = (child, parent) => {
    if (child === parent)
      return;
    if (!dependencies.has(child))
      dependencies.set(child, []);
    const values = dependencies.get(child);
    if (!values.includes(parent))
      values.push(parent);
  };
  for (const { index: section } of projection.sections) {
    const placements = new Map, owners = new Map, represented = new Set;
    for (const row of editor.tablePlacements(section)) {
      if (placements.has(row.tableNode))
        throw new Error("WindowDependencyBindingMismatch");
      resolve(section, row.paragraph);
      placements.set(row.tableNode, row);
    }
    for (const row of editor.tableBindings(section)) {
      const placement = placements.get(row.tableNode);
      if (!placement || owners.has(row.paragraph))
        throw new Error("WindowDependencyBindingMismatch");
      owners.set(row.paragraph, row);
      const child = resolve(section, row.paragraph), host = resolve(section, placement.paragraph);
      link(child, host);
      if (!represented.has(row.tableNode)) {
        represented.add(row.tableNode);
        link(host, child);
      }
    }
    for (const row of placements.values()) {
      if (row.parentTableNode == null) {
        if (row.parentListNode != null || owners.has(row.paragraph))
          throw new Error("WindowDependencyBindingMismatch");
      } else {
        const parent = placements.get(row.parentTableNode), owner = owners.get(row.paragraph);
        if (!parent || parent === row || owner?.tableNode !== parent.tableNode || owner.listNode !== row.parentListNode)
          throw new Error("WindowDependencyBindingMismatch");
      }
      const seen = new Set;
      let current = row;
      while (current) {
        if (seen.has(current.tableNode))
          throw new Error("WindowDependencyOwnershipCycle");
        seen.add(current.tableNode);
        current = current.parentTableNode == null ? null : placements.get(current.parentTableNode);
      }
    }
  }
  return { total: ordinals.size, ordinals, dependencies };
}

// web/preview/hwp5-list-window-dependencies.mjs
function hwp5ListWindowDependencies(editor, projection) {
  const { total, ordinals, resolve } = hwp5WindowIdentities(projection), dependencies = new Map;
  const link = (child, parent) => {
    if (child === parent)
      return;
    if (!dependencies.has(child))
      dependencies.set(child, []);
    const values = dependencies.get(child);
    if (!values.includes(parent))
      values.push(parent);
  };
  for (const section of projection.sections) {
    const flows = editor.paragraphFlow(section.index), claimed = new Set, lists = new Set;
    if (flows.length !== section.paragraphs.length || flows.some((row, index) => row.paragraph !== index))
      throw new Error("WindowDependencyBindingMismatch");
    const attach = (source, host, kind) => {
      if (lists.has(source.list_node))
        throw new Error("WindowDependencyBindingMismatch");
      lists.add(source.list_node);
      const hostOrdinal = resolve(section.index, host);
      const members = flows.filter((row) => row.host === kind && row.list_node === source.list_node && row.parent_node === source.control_node);
      if (!members.length && source.paragraph_count !== 0)
        throw new Error("MissingWindowListBody");
      for (const row of members) {
        if (claimed.has(row.paragraph))
          throw new Error("WindowDependencyBindingMismatch");
        claimed.add(row.paragraph);
        const child = resolve(section.index, row.paragraph);
        if (child === hostOrdinal)
          throw new Error("WindowDependencyBindingMismatch");
        link(child, hostOrdinal);
        link(hostOrdinal, child);
      }
    };
    const placements = new Map;
    for (const row of editor.tablePlacements(section.index)) {
      if (placements.has(row.tableNode))
        throw new Error("WindowDependencyBindingMismatch");
      placements.set(row.tableNode, row);
    }
    const captions = editor.captionSources(section.index), layouts = new Map;
    if (captions.length)
      for (const row of editor.tableLayoutSources(section.index)) {
        if (layouts.has(row.table_record_node))
          throw new Error("WindowDependencyBindingMismatch");
        layouts.set(row.table_record_node, row);
      }
    for (const caption of captions) {
      const placement = placements.get(caption.table_record_node);
      if (!placement || layouts.get(caption.table_record_node)?.table_node !== caption.control_node)
        throw new Error("WindowDependencyBindingMismatch");
      attach(caption, placement.paragraph, "table_caption");
    }
    for (const note of editor.noteSources(section.index)) {
      if (!["footnote", "endnote"].includes(note.kind))
        throw new Error("WindowDependencyBindingMismatch");
      attach(note, note.paragraph, note.kind);
    }
    if (flows.some((row) => ["table_caption", "footnote", "endnote"].includes(row.host) && !claimed.has(row.paragraph)))
      throw new Error("WindowDependencyBindingMismatch");
  }
  return { total, ordinals, dependencies };
}

// web/preview/hwp5-drawing-window-dependencies.mjs
function hwp5DrawingWindowDependencies(editor, projection) {
  const { total, ordinals, resolve } = hwp5WindowIdentities(projection), dependencies = new Map;
  const link = (child, parent) => {
    if (child === parent)
      throw new Error("WindowDependencyBindingMismatch");
    if (!dependencies.has(child))
      dependencies.set(child, []);
    const values = dependencies.get(child);
    if (!values.includes(parent))
      values.push(parent);
  };
  for (const section of projection.sections) {
    const flows = editor.paragraphFlow(section.index), claimed = new Set;
    if (flows.length !== section.paragraphs.length || flows.some((row, index) => row.paragraph !== index))
      throw new Error("WindowDependencyBindingMismatch");
    const drawingMembers = new Map;
    for (const row of flows) {
      if (row.host !== "drawing")
        continue;
      if (![row.parent_node, row.list_node].every((value) => Number.isInteger(value) && value >= 0 && value <= 4294967295))
        throw new Error("WindowDependencyBindingMismatch");
      const key = `${row.parent_node}:${row.list_node}`;
      if (!drawingMembers.has(key))
        drawingMembers.set(key, []);
      drawingMembers.get(key).push(row);
    }
    const lists = validateHwp5DrawingListSources(editor.drawingListSources(section.index));
    const anchors = new Map(validateHwp5DrawingAnchors(editor.drawingAnchors(section.index)).map((row) => [
      row.control_node,
      row
    ]));
    const components = lists.some((row) => row.kind === "body") ? new Map(validateHwp5DrawingComponentSources(editor.drawingComponentSources(section.index)).map((row) => [row.component_node, row])) : new Map;
    const root = (node) => {
      const seen = new Set;
      while (true) {
        if (seen.has(node))
          throw new Error("WindowDependencyOwnershipCycle");
        seen.add(node);
        const component = components.get(node);
        if (!component)
          throw new Error("WindowDependencyBindingMismatch");
        const anchor = anchors.get(component.owner_node);
        if (anchor) {
          if (anchor.component_node !== component.component_node)
            throw new Error("WindowDependencyBindingMismatch");
          return anchor.control_node;
        }
        node = component.owner_node;
      }
    };
    for (const source of lists) {
      const anchor = anchors.get(source.control_node);
      if (!anchor || source.kind === "body" && root(source.owner_node) !== source.control_node)
        throw new Error("WindowDependencyBindingMismatch");
      const host = resolve(section.index, anchor.paragraph);
      const members = drawingMembers.get(`${source.owner_node}:${source.list_node}`) ?? [];
      if (!members.length && source.paragraph_count !== 0)
        throw new Error("MissingWindowDrawingBody");
      for (const row of members) {
        if (claimed.has(row.paragraph))
          throw new Error("WindowDependencyBindingMismatch");
        claimed.add(row.paragraph);
        const child = resolve(section.index, row.paragraph);
        link(child, host);
        link(host, child);
      }
    }
    if (flows.some((row) => row.host === "drawing" && !claimed.has(row.paragraph)))
      throw new Error("WindowDependencyBindingMismatch");
  }
  return { total, ordinals, dependencies };
}

// web/preview/hwp5-field-window-topology.mjs
function readHwp5WindowFields(editor, section) {
  try {
    return { spans: validateHwp5FieldSpans(editor.fieldSpans(section)), unresolved: [] };
  } catch (error) {
    if (error?.message !== "UnsupportedCrossParagraphField" || editor.supportsFieldTopology?.() !== true)
      throw error;
    const report = validateHwp5FieldTopology(editor.fieldTopology(section));
    if (report.unresolved.length === 0)
      throw error;
    return report;
  }
}

// web/preview/hwp5-unresolved-field-dependencies.mjs
var key = (row) => JSON.stringify([row.host, row.parent_node, row.list_node]);
function linkHwp5UnresolvedFieldOwners(section, flows, markers, resolve, link) {
  if (markers.length === 0)
    return;
  const groups = new Map, linked = new Set;
  for (const row of flows) {
    const owner = key(row);
    if (!groups.has(owner))
      groups.set(owner, []);
    groups.get(owner).push(row.paragraph);
  }
  for (const marker of markers) {
    const anchor = resolve(section.index, marker.position.paragraph), owner = flows[marker.position.paragraph];
    const units = section.paragraphs[marker.position.paragraph].declaredUnits;
    if (!Number.isSafeInteger(units) || units < 0 || owner.list_node !== marker.list_node || marker.position.unit > units)
      throw new Error("WindowDependencyBindingMismatch");
    const identity = key(owner);
    if (linked.has(identity))
      continue;
    linked.add(identity);
    for (const paragraph of groups.get(identity)) {
      const member = resolve(section.index, paragraph);
      link(member, anchor);
      link(anchor, member);
    }
  }
}

// web/preview/hwp5-field-window-dependencies.mjs
function hwp5FieldWindowDependencies(editor, projection) {
  const { total, ordinals, resolve } = hwp5WindowIdentities(projection), dependencies = new Map;
  const fieldTopologyDiagnostics = new Map;
  const link = (child, parent) => {
    if (child === parent)
      return;
    if (!dependencies.has(child))
      dependencies.set(child, []);
    const values = dependencies.get(child);
    if (!values.includes(parent))
      values.push(parent);
  };
  const sameOwner = (a, b) => a.host === b.host && a.parent_node === b.parent_node && a.list_node === b.list_node;
  for (const section of projection.sections) {
    const flows = editor.paragraphFlow(section.index);
    if (flows.length !== section.paragraphs.length || flows.some((row, index) => row.paragraph !== index))
      throw new Error("WindowDependencyBindingMismatch");
    const report = readHwp5WindowFields(editor, section.index);
    linkHwp5UnresolvedFieldOwners(section, flows, report.unresolved, resolve, link);
    if (report.unresolved.length)
      fieldTopologyDiagnostics.set(section.index, report.unresolved);
    for (const span of report.spans) {
      const first = resolve(section.index, span.begin.paragraph);
      resolve(section.index, span.end.paragraph);
      const owner = flows[span.begin.paragraph];
      if (!sameOwner(owner, flows[span.end.paragraph]))
        throw new Error("WindowDependencyBindingMismatch");
      for (let paragraph = span.begin.paragraph;paragraph <= span.end.paragraph; paragraph++) {
        if (!sameOwner(owner, flows[paragraph]))
          continue;
        const member = resolve(section.index, paragraph);
        link(member, first);
        link(first, member);
      }
    }
  }
  return { total, ordinals, dependencies, fieldTopologyDiagnostics };
}

// web/preview/hwp5-column-window-dependencies.mjs
function boundHwp5ColumnSources(editor, section, flows) {
  const declarations = new Map;
  for (const source of editor.columnSources(section)) {
    const owner = flows[source.current_paragraph];
    if (!owner || owner.generated || owner.source_node !== source.paragraph_node || declarations.has(source.current_paragraph))
      throw new Error("WindowDependencyBindingMismatch");
    declarations.set(source.current_paragraph, source);
  }
  return declarations;
}
function hwp5ColumnWindowDependencies(editor, projection) {
  const { total, ordinals, resolve } = hwp5WindowIdentities(projection), dependencies = new Map;
  for (const section of projection.sections) {
    const flows = editor.paragraphFlow(section.index), active = new Map;
    if (flows.length !== section.paragraphs.length || flows.some((row, index) => row.paragraph !== index))
      throw new Error("WindowDependencyBindingMismatch");
    const declarations = boundHwp5ColumnSources(editor, section.index, flows);
    for (const flow of flows) {
      const scope = `${flow.host}:${flow.parent_node}:${flow.list_node}`;
      const previous = active.get(scope);
      if (declarations.has(flow.paragraph) && previous !== undefined && previous !== flow.paragraph) {
        dependencies.set(resolve(section.index, flow.paragraph), [
          resolve(section.index, previous)
        ]);
      }
      if (declarations.has(flow.paragraph))
        active.set(scope, flow.paragraph);
      const owner = active.get(scope);
      if (owner === undefined || owner === flow.paragraph)
        continue;
      dependencies.set(resolve(section.index, flow.paragraph), [resolve(section.index, owner)]);
    }
  }
  return { total, ordinals, dependencies };
}

// web/preview/hwp5-repeated-window-dependencies.mjs
function hwp5RepeatedWindowDependencies(editor, projection) {
  const { total, ordinals, resolve } = hwp5WindowIdentities(projection), dependencies = new Map;
  const link = (child, parent) => {
    if (child === parent)
      return;
    if (!dependencies.has(child))
      dependencies.set(child, []);
    const values = dependencies.get(child);
    if (!values.includes(parent))
      values.push(parent);
  };
  for (const section of projection.sections) {
    const flows = editor.paragraphFlow(section.index), claimed = new Set;
    if (flows.length !== section.paragraphs.length || flows.some((row, index) => row.paragraph !== index))
      throw new Error("WindowDependencyBindingMismatch");
    const anchors = new Map(editor.structuralAnchors(section.index).map((row) => [row.control_node, row]));
    const sources = [
      ...validateHwp5PageAreaSources(editor.pageAreaSources(section.index)).map((row) => ({
        ...row,
        anchorKind: row.kind
      })),
      ...validateHwp5MasterPageSources(editor.masterPageSources(section.index)).map((row) => ({
        ...row,
        kind: "master_page",
        anchorKind: "section"
      }))
    ];
    for (const source of sources) {
      const anchor = anchors.get(source.owner_node);
      if (!anchor || anchor.kind !== source.anchorKind)
        throw new Error("WindowDependencyBindingMismatch");
      const host = resolve(section.index, anchor.paragraph);
      const members = flows.filter((row) => row.host === source.kind && row.parent_node === source.owner_node && row.list_node === source.list_node);
      if (!members.length && source.paragraph_count !== 0)
        throw new Error("MissingWindowRepeatedBody");
      for (const row of members) {
        if (claimed.has(row.paragraph))
          throw new Error("WindowDependencyBindingMismatch");
        claimed.add(row.paragraph);
        const child = resolve(section.index, row.paragraph);
        link(child, host);
        link(host, child);
      }
      for (const row of flows)
        if (row.host === "body")
          link(resolve(section.index, row.paragraph), host);
    }
    if (flows.some((row) => ["header", "footer", "master_page"].includes(row.host) && !claimed.has(row.paragraph)))
      throw new Error("WindowDependencyBindingMismatch");
  }
  return { total, ordinals, dependencies };
}

// web/preview/hwp5-page-control-window-dependencies.mjs
function hwp5PageControlWindowDependencies(editor, projection) {
  const { total, ordinals, resolve } = hwp5WindowIdentities(projection), dependencies = new Map;
  for (const section of projection.sections) {
    const flows = editor.paragraphFlow(section.index);
    if (flows.length !== section.paragraphs.length || flows.some((row, index) => row.paragraph !== index))
      throw new Error("WindowDependencyBindingMismatch");
    const hosts = [
      ...new Set(validateHwp5PageControlSources(editor.pageControlSources(section.index)).map((row) => resolve(section.index, row.paragraph)))
    ];
    for (const row of flows)
      if (row.host === "body") {
        const child = resolve(section.index, row.paragraph), parents = hosts.filter((host) => host !== child);
        if (parents.length)
          dependencies.set(child, parents);
      }
  }
  return { total, ordinals, dependencies };
}

// web/preview/hwp5-window-flows.mjs
function memoHwp5WindowFlows(editor) {
  const scoped = Object.create(editor), flows = new Map;
  scoped.paragraphFlow = (section) => {
    if (!flows.has(section))
      flows.set(section, editor.paragraphFlow(section));
    return flows.get(section);
  };
  return scoped;
}
function hwp5WindowFlows(editor, content) {
  if (!content.window)
    throw new Error("MissingParagraphWindow");
  const displayed = new Set(content.paragraphs.map((row) => `${row.section}:${row.paragraph}`));
  if (displayed.size !== content.paragraphs.length)
    throw new Error("WindowDependencyBindingMismatch");
  const completeFlows = new Map, selectedFlows = [];
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    const flows = editor.paragraphFlow(section);
    if (flows.length !== editor.paragraphCount(section) || flows.some((row, index) => row.paragraph !== index))
      throw new Error("WindowDependencyBindingMismatch");
    completeFlows.set(section, flows);
    selectedFlows.push(...flows.filter((row) => displayed.has(`${section}:${row.paragraph}`)).map((row) => ({ ...row, section })));
  }
  if (selectedFlows.length !== displayed.size)
    throw new Error("WindowDependencyBindingMismatch");
  return { displayed, completeFlows, selectedFlows };
}

// web/preview/hwp5-owned-window-dependencies.mjs
function compose([first, ...rest]) {
  for (const found of rest)
    if (first.total !== found.total || first.ordinals.size !== found.ordinals.size || [...first.ordinals].some(([key, ordinal]) => found.ordinals.get(key) !== ordinal))
      throw new Error("WindowDependencyBindingMismatch");
  const dependencies = new Map;
  for (const source of [first, ...rest])
    for (const [child, required] of source.dependencies) {
      if (!dependencies.has(child))
        dependencies.set(child, []);
      const values = dependencies.get(child);
      for (const parent of required)
        if (!values.includes(parent))
          values.push(parent);
    }
  return { total: first.total, ordinals: first.ordinals, dependencies };
}
function hwp5OwnedWindowDependencies(editor, projection) {
  return compose([
    hwp5TableWindowDependencies(editor, projection),
    hwp5ListWindowDependencies(editor, projection),
    hwp5DrawingWindowDependencies(editor, projection)
  ]);
}
function hwp5FieldOwnedWindowDependencies(editor, projection) {
  editor = memoHwp5WindowFlows(editor);
  const fields = hwp5FieldWindowDependencies(editor, projection);
  return {
    ...compose([
      hwp5OwnedWindowDependencies(editor, projection),
      fields,
      hwp5ColumnWindowDependencies(editor, projection),
      hwp5RepeatedWindowDependencies(editor, projection),
      hwp5PageControlWindowDependencies(editor, projection)
    ]),
    fieldTopologyDiagnostics: fields.fieldTopologyDiagnostics
  };
}

// web/preview/hwp5-window-projection.mjs
function projectHwp5DependencyWindow(editor, projection, { offset, count, maxParagraphs = 20000, maxUnits = 200000 }, discover) {
  if (!Number.isSafeInteger(maxUnits) || maxUnits < 0)
    throw new RangeError("InvalidDisplayBounds");
  const total = projection.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
  planParagraphDependencies({ total, offset, count, maxParagraphs, dependencies: new Map });
  const found = discover(editor, projection);
  const plan = planParagraphDependencies({ ...found, offset, count, maxParagraphs });
  const content = displayContent(projection, {
    paragraphOrdinals: plan.ordinals,
    maxParagraphs,
    maxUnits
  });
  if (content.paragraphs.some((row) => row.clipped))
    throw new RangeError("ParagraphWindowTextBudgetExceeded");
  for (const paragraph of content.paragraphs) {
    const ordinal = found.ordinals.get(`${paragraph.section}:${paragraph.paragraph}`);
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= total)
      throw new Error("WindowDependencyBindingMismatch");
    paragraph.windowOrdinal = ordinal;
    paragraph.windowContext = ordinal < offset || ordinal >= offset + count;
    if (found.fieldTopologyDiagnostics?.has(paragraph.section)) {
      paragraph.fieldTopologyEditableCandidate = paragraph.editable === true;
      paragraph.selectable = !paragraph.windowContext && (paragraph.selectable === true || paragraph.editable === true);
      paragraph.editable = false;
      paragraph.fieldTopologyError = "UnresolvedFieldMarkers";
    }
    if (paragraph.windowContext) {
      paragraph.editable = false;
      paragraph.selectable = false;
    }
  }
  const diagnostics = [...found.fieldTopologyDiagnostics ?? []].filter(([section]) => content.paragraphs.some((row) => row.section === section)).map(([section, unresolved]) => ({ section, unresolved }));
  if (diagnostics.length) {
    content.fieldTopologyDiagnostics = diagnostics;
    content.readOnly = !content.paragraphs.some((row) => row.editable === true);
  }
  return {
    ...content,
    window: {
      requestedOffset: offset,
      requestedCount: count,
      paragraphOffset: offset,
      paragraphCount: count,
      contextCount: plan.ordinals.length - count
    }
  };
}
function projectHwp5FieldOwnedWindow(editor, projection, options) {
  return projectHwp5DependencyWindow(editor, projection, options, hwp5FieldOwnedWindowDependencies);
}

// web/preview/hwp5-window-note-content.mjs
function attachHwp5WindowNotes(editor, content) {
  const { displayed, completeFlows, selectedFlows } = hwp5WindowFlows(editor, content);
  content.currentParagraphFlows = selectedFlows;
  const scoped = Object.create(editor);
  scoped.noteSources = (section) => {
    const rows = validateHwp5NoteSources(editor.noteSources(section)).filter((row) => displayed.has(`${section}:${row.paragraph}`));
    for (const source of rows) {
      const members = completeFlows.get(section).filter((row) => row.host === source.kind && row.parent_node === source.control_node && row.list_node === source.list_node);
      if (members.some((row) => !displayed.has(`${section}:${row.paragraph}`)))
        throw new Error("MissingHwp5NoteBody");
    }
    return rows;
  };
  for (const section of completeFlows.keys())
    scoped.noteSources(section);
  return attachHwp5Notes(scoped, content);
}

// web/preview/hwp5-window-caption-content.mjs
function attachHwp5WindowCaptions(editor, content) {
  const { displayed, completeFlows, selectedFlows } = hwp5WindowFlows(editor, content);
  content.currentParagraphFlows = selectedFlows;
  const scoped = Object.create(editor);
  scoped.captionSources = (section) => {
    const selected = new Set((content.tables ?? []).filter((row) => row.section === section).map((row) => row.tableNode));
    const rows = validateHwp5CaptionSources(editor.captionSources(section)).filter((row) => selected.has(row.table_record_node));
    for (const source of rows) {
      const members = completeFlows.get(section).filter((row) => row.host === "table_caption" && row.parent_node === source.control_node && row.list_node === source.list_node);
      if (members.some((row) => !displayed.has(`${section}:${row.paragraph}`)))
        throw new Error("MissingHwp5CaptionBody");
    }
    return rows;
  };
  for (const section of completeFlows.keys())
    scoped.captionSources(section);
  return attachHwp5Captions(scoped, content);
}

// web/preview/hwp5-window-drawing-content.mjs
function attachHwp5WindowDrawings(editor, content) {
  const { displayed, completeFlows, selectedFlows } = hwp5WindowFlows(editor, content);
  content.currentParagraphFlows = selectedFlows;
  const sections = new Map, scoped = Object.create(editor);
  const selected = (section) => {
    if (sections.has(section))
      return sections.get(section);
    const anchors = editor.drawingAnchors(section).filter((row) => displayed.has(`${section}:${row.paragraph}`));
    const controls = new Set(anchors.map((row) => row.control_node)), components = new Set;
    const rows = editor.drawingComponentSources(section);
    for (const row of rows) {
      if (row.second_id !== null ? controls.has(row.owner_node) : components.has(row.owner_node))
        components.add(row.component_node);
    }
    const result = { anchors, controls, components, rows };
    sections.set(section, result);
    return result;
  };
  scoped.drawingAnchors = (section) => selected(section).anchors;
  scoped.drawingSources = (section) => editor.drawingSources(section).filter((row) => selected(section).controls.has(row.control_node));
  scoped.drawingComponentSources = (section) => selected(section).rows.filter((row) => selected(section).components.has(row.component_node));
  scoped.drawingListSources = (section) => {
    const rows = editor.drawingListSources(section).filter((row) => selected(section).controls.has(row.control_node));
    for (const source of rows) {
      const members = completeFlows.get(section).filter((row) => row.host === "drawing" && row.parent_node === source.owner_node && row.list_node === source.list_node);
      if (members.some((row) => !displayed.has(`${section}:${row.paragraph}`)))
        throw new Error("MissingHwp5DrawingBodyParagraph");
    }
    return rows;
  };
  for (const name of [
    "drawingMatrixSources",
    "drawingLocalTransforms",
    "drawingRectangleCorners",
    "drawingStyleSources"
  ]) {
    scoped[name] = (section, ...options) => editor[name](section, ...options).filter((row) => selected(section).components.has(row.component_node));
  }
  return attachHwp5Drawings(scoped, content);
}

// web/preview/hwp5-window-picture-content.mjs
function attachHwp5WindowPictures(editor, content) {
  if (!content.window)
    throw new Error("MissingParagraphWindow");
  const scoped = Object.create(editor);
  const selected = (section) => new Set((content.hwp5DrawingComponents ?? []).filter((row) => row.section === section).map((row) => row.component_node));
  for (const name of ["pictureSources", "pictureTailSources"]) {
    scoped[name] = (section, ...options) => editor[name](section, ...options).filter((row) => selected(section).has(row.component_node));
  }
  return attachHwp5PictureTails(scoped, attachHwp5Pictures(scoped, content));
}

// web/preview/hwp5-window-object-content.mjs
function attachHwp5WindowObjects(editor, preview, content) {
  if (!content.window)
    throw new Error("MissingParagraphWindow");
  const scoped = memoHwp5WindowFlows(editor);
  attachHwp5Tables(scoped, preview, content);
  attachHwp5WindowNotes(scoped, content);
  attachHwp5WindowCaptions(scoped, content);
  attachHwp5WindowDrawings(scoped, content);
  return attachHwp5WindowPictures(scoped, content);
}

// web/preview/hwp5-window-column-content.mjs
function attachHwp5WindowColumns(editor, content) {
  const { displayed, completeFlows } = hwp5WindowFlows(editor, content);
  content.columnSources = [];
  for (const [section, flows] of completeFlows) {
    const sources = boundHwp5ColumnSources(editor, section, flows);
    for (const source of sources.values())
      if (displayed.has(`${section}:${source.current_paragraph}`))
        content.columnSources.push({ ...source, section });
  }
  return attachHwp5ColumnDisplay(content);
}

// web/preview/hwp5-window-selection.mjs
function validateHwp5WindowSelection(content) {
  const window = content.window, uint = (value) => Number.isSafeInteger(value) && value >= 0;
  if (!window || !Array.isArray(content.paragraphs) || ![
    content.totalParagraphs,
    window.requestedOffset,
    window.requestedCount,
    window.contextCount
  ].every(uint) || window.requestedOffset > content.totalParagraphs || window.requestedCount > content.totalParagraphs - window.requestedOffset || window.paragraphOffset !== window.requestedOffset || window.paragraphCount !== window.requestedCount || content.paragraphs.length !== window.requestedCount + window.contextCount)
    throw new Error("InvalidHwp5WindowSelection");
  const identities = new Set;
  let previous = -1, selected = 0;
  for (const row of content.paragraphs) {
    if (!row || ![row.section, row.paragraph, row.windowOrdinal].every(uint) || row.windowOrdinal >= content.totalParagraphs || row.windowOrdinal <= previous || row.clipped || typeof row.text !== "string")
      throw new Error("InvalidHwp5WindowSelection");
    previous = row.windowOrdinal;
    const key = `${row.section}:${row.paragraph}`;
    if (identities.has(key))
      throw new Error("InvalidHwp5WindowSelection");
    identities.add(key);
    const context = row.windowOrdinal < window.requestedOffset || row.windowOrdinal >= window.requestedOffset + window.requestedCount;
    if (row.windowContext !== context || context && (row.editable !== false || row.selectable !== false) || content.readOnly && row.editable !== false)
      throw new Error("InvalidHwp5WindowSelection");
    if (!context) {
      if (row.windowOrdinal !== window.requestedOffset + selected)
        throw new Error("InvalidHwp5WindowSelection");
      selected++;
    }
  }
  if (selected !== window.requestedCount)
    throw new Error("InvalidHwp5WindowSelection");
  return {
    offset: window.requestedOffset,
    count: selected,
    contextCount: window.contextCount,
    completeDocument: content.paragraphs.length === content.totalParagraphs
  };
}

// web/preview/hwp5-window-structural-content.mjs
function attachHwp5WindowStructuralAnchors(editor, content) {
  const { displayed, completeFlows } = hwp5WindowFlows(editor, content), scoped = Object.create(editor);
  scoped.structuralAnchors = (section) => {
    if (!completeFlows.has(section))
      return [];
    const rows = editor.structuralAnchors(section), controls = new Set;
    for (const row of rows) {
      if (controls.has(row.control_node))
        throw new Error("StructuralDisplayAnchorBindingMismatch");
      controls.add(row.control_node);
    }
    return rows.filter((row) => displayed.has(`${section}:${row.paragraph}`));
  };
  return attachHwp5StructuralAnchors(scoped, content);
}

// web/preview/hwp5-window-repeated-content.mjs
function attachHwp5WindowRepeatedAreas(editor, content) {
  const { displayed, completeFlows, selectedFlows } = hwp5WindowFlows(editor, content);
  const areas = new Map, masters = new Map, scoped = Object.create(editor);
  for (const [section, flows] of completeFlows) {
    const pageAreas = validateHwp5PageAreaSources(editor.pageAreaSources(section));
    const masterPages = validateHwp5MasterPageSources(editor.masterPageSources(section));
    for (const source of [
      ...pageAreas,
      ...masterPages.map((row) => ({ ...row, kind: "master_page" }))
    ]) {
      const members = flows.filter((row) => row.host === source.kind && row.parent_node === source.owner_node && row.list_node === source.list_node);
      if (source.paragraph_count !== 0 && !members.length || members.some((row) => !displayed.has(`${section}:${row.paragraph}`)))
        throw new Error("MissingHwp5WindowRepeatedBody");
    }
    areas.set(section, pageAreas);
    masters.set(section, masterPages);
  }
  content.currentParagraphFlows = selectedFlows;
  scoped.pageAreaSources = (section) => areas.get(section) ?? [];
  scoped.masterPageSources = (section) => masters.get(section) ?? [];
  return attachHwp5MasterPages(scoped, attachHwp5PageAreas(scoped, content));
}

// web/preview/hwp5-window-numbering-content.mjs
function attachHwp5WindowNumbering(editor, content) {
  const { displayed, completeFlows } = hwp5WindowFlows(editor, content), scoped = Object.create(editor);
  scoped.automaticNumberSources = (section) => completeFlows.has(section) ? validateHwp5AutomaticNumberSources(editor.automaticNumberSources(section)).filter((row) => displayed.has(`${section}:${row.paragraph}`)) : [];
  scoped.pageControlSources = (section) => {
    if (!completeFlows.has(section))
      return [];
    const rows = validateHwp5PageControlSources(editor.pageControlSources(section));
    if (rows.some((row) => !displayed.has(`${section}:${row.paragraph}`)))
      throw new Error("MissingHwp5WindowPageControl");
    return rows;
  };
  for (const section of completeFlows.keys())
    scoped.pageControlSources(section);
  return attachHwp5DocumentProperties(scoped, attachHwp5PageControls(scoped, attachHwp5AutomaticNumbers(scoped, content)));
}

// web/preview/hwp5-window-query-content.mjs
function queryHwp5WindowContent(editor, preview, options, paragraphFormatsAvailable) {
  editor = memoHwp5WindowFlows(editor);
  const content = projectHwp5FieldOwnedWindow(editor, preview, options);
  content.documentWindowAvailable = true;
  attachHwp5Styles(editor, preview, content);
  attachHwp5ParagraphFormats(editor, content, paragraphFormatsAvailable);
  attachHwp5PageDeclarations(editor, content, new Set(content.paragraphs.map((row) => row.section)));
  attachHwp5WindowObjects(editor, preview, content);
  attachHwp5WindowRepeatedAreas(editor, content);
  attachHwp5WindowStructuralAnchors(editor, content);
  attachHwp5WindowNumbering(editor, content);
  attachHwp5WindowColumns(editor, content);
  content.hwp5GroupGeometry = projectHwp5GroupGeometry(content);
  if (content.hwp5Pictures?.length) {
    const projected = projectHwp5PictureGeometry(content);
    if (projected.state === "projected")
      content.pictures = projected.pictures;
    else
      content.hwp5PictureGeometryError = projected.error;
  }
  const roots = projectHwp5RootContent(content);
  if (roots.state === "projected") {
    validateHwp5WindowSelection(roots.content);
    return roots.content;
  }
  content.hwp5WindowRootError = roots.error;
  validateHwp5WindowSelection(content);
  return content;
}

// web/preview/hwp5-current-reference-command.mjs
function currentReferenceCommand(editor, format, enabled, message) {
  if (!editor || !enabled)
    throw new Error("EditorNotOpen");
  if (format !== "hwp5")
    throw new Error("UnsupportedCurrentReferenceFormat");
  if (message.kind === "query-created-tables")
    return { tables: editor.createdTables(message.section) };
  if (message.kind === "query-current-references")
    return {
      window: editor.currentReferences(message.section, {
        first: message.first,
        count: message.count
      })
    };
  if (message.kind === "query-current-source-references")
    return {
      window: editor.currentSourceReferences(message.section, {
        first: message.first,
        count: message.count
      })
    };
  if (message.kind === "query-current-text")
    return { text: editor.currentText(message.reference) };
  if (message.kind !== "splice-current")
    throw new Error("UnknownCurrentReferenceCommand");
  editor.spliceCurrent(message);
  return null;
}

// web/preview/hwp5-current-reference-content.mjs
function attachHwp5CurrentReferences(editor, preview, content) {
  for (const row of content.paragraphs)
    delete row.currentReference;
  if (!editor?.supportsCurrentReferences?.())
    return content;
  const errors = [];
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    try {
      const total = editor.paragraphCount(section);
      if (total !== preview.sections[section]?.paragraphs.length)
        throw new Error("CurrentReferenceDisplayMismatch");
      const rows = content.paragraphs.filter((row) => row.section === section);
      const bindings = new Map;
      for (const first of new Set(rows.map((row) => Math.floor(row.paragraph / 1024) * 1024))) {
        const query = editor.supportsCurrentSourceReferences?.() ? "currentSourceReferences" : "currentReferences";
        const window = editor[query](section, { first, count: Math.min(1024, total - first) });
        if (window.total !== total || window.first !== first || window.references.length !== Math.min(1024, total - first) || window.references.some((ref) => ref.kind === "cell" || ref.section !== section))
          throw new Error("CurrentReferenceDisplayMismatch");
        window.references.forEach((ref, index) => bindings.set(first + index, ref));
      }
      for (const row of rows) {
        const ref = bindings.get(row.paragraph);
        if (!ref)
          throw new Error("CurrentReferenceDisplayMismatch");
      }
      for (const row of rows)
        row.currentReference = bindings.get(row.paragraph);
    } catch (error) {
      errors.push({ section, error: error.message });
    }
  }
  content.currentReferenceErrors = errors;
  return content;
}

// web/preview/hwp5-created-cell-display.mjs
function hwp5CreatedCellDisplay(table, options, shapes) {
  const shape = shapes?.find((shape) => shape.id === table.resources.paragraph);
  if (!shape || options.cell.attributes !== 0)
    return {};
  const insets = sourceTableCellInsets({ sourceGeometry: { in_margin: options.table.margins } }, { sourceMargin: { has_margin: false } });
  if (!insets)
    return {};
  return {
    displayFormat: "hwp5",
    displayParagraphShape: hwp5ParagraphGeometry(shape),
    displayInsets: insets
  };
}

// web/preview/hwp5-created-table-content.mjs
function attachHwp5CreatedTables(editor, content, available, sectionCount, maxUnits = 200000) {
  content.tableCreationAvailable = available;
  content.tableCreationResources = available ? editor.tableCreationResources() : null;
  const tables = [];
  let units = 0;
  let paragraphShapes;
  const visible = new Map(content.paragraphs.map((row) => [`${row.section}:${row.paragraph}`, row]));
  if (available)
    for (let section = 0;section < sectionCount; section++) {
      const snapshots = editor.createdTables(section);
      if (!snapshots.length)
        continue;
      if (paragraphShapes === undefined) {
        try {
          paragraphShapes = typeof editor.paragraphShapes === "function" ? editor.paragraphShapes() : null;
        } catch (error) {
          paragraphShapes = null;
          content.createdTableParagraphDisplayError = error.message;
        }
      }
      const first = editor.currentSourceReferences(section, { first: 0, count: 1 }).references[0];
      if (!first)
        throw new Error("MissingCreatedTableHost");
      for (const { table, options } of snapshots) {
        const host = visible.get(`${section}:${table.host_paragraph}`);
        if (!host)
          continue;
        const cells = table.cells.map((cell) => {
          units += cell.text.length;
          if (units > maxUnits)
            throw new Error("CreatedTableDisplayTextBudgetExceeded");
          const currentReference = Object.freeze({
            epoch: first.epoch,
            scope: first.scope,
            kind: "cell",
            section,
            id: table.identity,
            row: cell.row,
            column: cell.column
          });
          return { ...cell, currentReference, softLineBreakAvailable: true };
        });
        const anchorUnit = sourceDisplayPosition(table.anchor_unit, host.sourceOffsets ?? [{ at: 0, source: 0 }], host.text.length);
        tables.push({
          ...table,
          ...hwp5CreatedCellDisplay(table, options, paragraphShapes),
          cells,
          hwp5Policy: options,
          section,
          hostParagraph: table.host_paragraph,
          anchorUnit
        });
      }
    }
  content.createdTables = tables;
  return content;
}

// web/preview/hwp5-table-creation-command.mjs
function hwp5TableCreationRequest(message) {
  const o = message.options;
  if (!o || typeof o !== "object" || Array.isArray(o) || Object.keys(o).some((key) => !["rows", "columns", "width", "rowHeight", "resources"].includes(key)))
    throw new Error("InvalidTableCreationOptions");
  return {
    version: 1,
    section: message.section,
    paragraph: message.paragraph,
    unit: message.unit,
    rows: o.rows,
    columns: o.columns,
    width: o.width,
    row_height: o.rowHeight,
    resources: o.resources,
    options: {
      common: {
        flags: 6955537,
        offset_x: 0,
        offset_y: 0,
        z_order: 0,
        margins: [0, 0, 0, 0],
        prevent_page_break: false,
        description: "표"
      },
      table: { page_break: 1, repeat_header: false, cell_spacing: 0, margins: [0, 0, 0, 0] },
      cell: { layout: "observed8", unknown: 0, attributes: 0, margins: [0, 0, 0, 0] }
    }
  };
}
function setHwp5CreatedCellText(editor, message) {
  const r = message.reference;
  if (!r || r.kind !== "cell" || r.section !== message.section || r.id !== message.identity || r.row !== message.row || r.column !== message.column)
    throw new Error("InvalidCurrentReferenceScope");
  const before = editor.currentText(r);
  if (!before.endsWith("\r"))
    throw new Error("UnsupportedParagraphTerminator");
  editor.spliceCurrent({
    reference: r,
    startUnit: 0,
    endUnit: before.length - 1,
    text: message.text
  });
}

// web/preview/selection-edit-query.mjs
function selectionEditQuery(message, { active, format, canEdit }) {
  return selectionQuery(message, { active, format, query: canEdit, kind: "query-edit-range" });
}
function selectionSplitQuery(message, { active, format, canSplit, canSplitAnchored }) {
  if (message.kind !== "query-split-range")
    throw new Error("InvalidEditPermissionRange");
  if (message.anchored !== undefined && typeof message.anchored !== "boolean")
    throw new Error("InvalidEditPermissionRange");
  const query = message.anchored && typeof canSplitAnchored === "function" ? canSplitAnchored : canSplit;
  return selectionQuery(message, { active, format, query, kind: "query-split-range" });
}
function selectionQuery(message, { active, format, query, kind }) {
  if (!Number.isSafeInteger(message.requestId) || message.requestId < 1 || !["section", "paragraph", "startUnit", "endUnit"].every((key) => Number.isInteger(message[key]) && message[key] >= 0 && message[key] <= 4294967295) || message.paragraph === 4294967295 || message.endUnit < message.startUnit)
    throw new Error("InvalidEditPermissionRange");
  if (!active)
    throw new Error("EditorNotOpen");
  const allowed = format === "hwpx" ? query(message.section, message.paragraph + 1, message.startUnit, message.endUnit) : false;
  if (typeof allowed !== "boolean")
    throw new Error("InvalidEditPermissionResponse");
  return {
    kind,
    requestId: message.requestId,
    section: message.section,
    paragraph: message.paragraph,
    startUnit: message.startUnit,
    endUnit: message.endUnit,
    allowed
  };
}

// web/preview/reader-runtime.mjs
function copyRuntimeMessage(message) {
  const ancestors = new Set;
  function validate(value) {
    if (value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value))
      return;
    if (typeof value !== "object")
      throw new TypeError("InvalidRuntimePayload");
    if (typeof SharedArrayBuffer !== "undefined" && (value instanceof SharedArrayBuffer || ArrayBuffer.isView(value) && value.buffer instanceof SharedArrayBuffer))
      throw new TypeError("SharedRuntimePayloadUnsupported");
    if (value instanceof WebAssembly.Module || value instanceof ArrayBuffer || ArrayBuffer.isView(value))
      return;
    if (ancestors.has(value))
      throw new TypeError("CyclicRuntimePayload");
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      throw new TypeError("InvalidRuntimePayload");
    ancestors.add(value);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if (descriptor.get || descriptor.set)
        throw new TypeError("InvalidRuntimePayload");
      validate(descriptor.value);
    }
    ancestors.delete(value);
  }
  validate(message);
  if (!message || typeof message.kind !== "string")
    throw new TypeError("InvalidRuntimeMessage");
  return structuredClone(message);
}
function createReaderRuntime({
  wasmModule,
  loadWasmModule,
  allowReload = false,
  referenceScope
} = {}) {
  if (referenceScope !== undefined && (typeof referenceScope !== "string" || !referenceScope.length))
    throw new TypeError("InvalidCurrentReferenceScope");
  const createExperimentalHwp5Editor2 = (module, input, options = {}) => createExperimentalHwp5Editor(module, input, { ...options, referenceScope });
  let module, bytes, preview, editor, format;
  const displayResources = createDisplayResourceCache();
  let historyEnabled = false;
  let historyPoisoned = false;
  let hwpxChartOlePolicy = false;
  let protectionRemoved = false;
  let hwp5StyleOpenError = null;
  let documentWindow = null;
  let hwp5PreviewDirty = false;
  let hwpxCreatedTablesPending = false;
  function normalizationMetadataAvailable() {
    return WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_normalization_info" && entry.kind === "function");
  }
  function outsideFieldRange(section, paragraph, start, end) {
    if (hwpxCreatedTablesPending && !editor.createdTableHostMode(section))
      return false;
    return WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_can_edit_outside_field" && entry.kind === "function") && editor.canEditOutsideField(section, paragraph, start, end);
  }
  function hwp5DisplayProjection() {
    if (hwp5PreviewDirty)
      refreshCurrentHwp5Preview();
    return editor && historyEnabled && preview.primarySource === "distribution_viewtext" ? { ...preview, readOnly: false } : preview;
  }
  function hwp5ParagraphFormatsAvailable() {
    return [
      "hwp5_edit_para_shape_count",
      "hwp5_edit_para_shape_id",
      "hwp5_edit_set_paragraph_format"
    ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
  }
  async function refreshHwp5PreviewFallback() {
    if (historyEnabled && editor?.supportsCurrentTextPreview?.())
      return;
    const fallback = await createHwp5Reader(module);
    try {
      preview = fallback.readText(editor.save({ allowStaleLayout: true }).bytes);
    } finally {
      fallback.close();
    }
  }
  function hwp5TableCreationAvailable() {
    return Boolean(editor) && [
      "hwp5_edit_insert_table",
      "hwp5_edit_created_tables",
      "hwp5_edit_table_creation_resources",
      "hwp5_edit_current_text_preview",
      "hwp5_edit_current_source_references",
      "hwp5_edit_current_references",
      "hwp5_edit_copy_current_text",
      "hwp5_edit_splice_current"
    ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
  }
  function refreshCurrentHwp5Preview() {
    if (historyEnabled && editor?.supportsCurrentTextPreview?.()) {
      preview = { ...preview, ...editor.currentTextPreview() };
      hwp5PreviewDirty = false;
    }
  }
  function hwp5Display(projected = null) {
    refreshCurrentHwp5Preview();
    if (typeof projected === "function")
      projected = projected();
    if (!projected && documentWindow) {
      const total = preview.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
      const offset = Math.min(documentWindow.offset, Math.max(0, total - 1));
      projected = queryHwp5WindowContent(editor, hwp5DisplayProjection(), { offset, count: Math.min(documentWindow.count, total - offset) }, hwp5ParagraphFormatsAvailable());
    }
    const content = projected ?? displayContent(hwp5DisplayProjection());
    content.editorSessionAvailable = Boolean(editor);
    const observedDocInfoAvailable = [
      "hwp5_edit_open_observed_docinfo",
      "hwp5_edit_observed_docinfo_diagnostics"
    ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.kind === "function" && entry.name === name));
    if (observedDocInfoAvailable) {
      content.observedDocInfoEditingAvailable = !editor && preview.primarySource !== "distribution_viewtext" && ["UnexpectedEnd", "RepairedSourceUnsupported", "ResourceCountMismatch"].includes(hwp5StyleOpenError);
      content.observedDocInfoDiagnostics = editor?.observedDocInfoDiagnostics() ?? null;
    }
    if (historyEnabled || editor?.supportsAtomicFormatting?.())
      attachHwp5CurrentReferences(editor, preview, content);
    attachHwp5CreatedTables(editor, content, hwp5TableCreationAvailable(), preview.sections.length);
    const normalizationExport = preview.primarySource === "distribution_viewtext" ? "hwp5_edit_open_normalized_distribution" : "hwp5_edit_open_normalized";
    content.normalizationEditingAvailable = normalizationMetadataAvailable() && hwp5StyleOpenError === "RepairedSourceUnsupported" && WebAssembly.Module.exports(module).some((entry) => entry.name === normalizationExport && entry.kind === "function");
    if (editor?.supportsNormalizationInfo())
      content.normalizationInfo = editor.normalizationInfo();
    content.documentWindowAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_field_spans" && entry.kind === "function");
    if (preview.primarySource === "distribution_viewtext")
      content.primarySource = preview.primarySource;
    content.distributionEditingAvailable = preview.primarySource === "distribution_viewtext" && WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_open_distribution" && entry.kind === "function") && (hwp5StyleOpenError !== "RepairedSourceUnsupported" || content.normalizationEditingAvailable);
    content.paragraphAlignmentAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_paragraph_alignment" && entry.kind === "function");
    content.paragraphMarginsAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_paragraph_margins" && entry.kind === "function");
    content.paragraphSpacingAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_paragraph_spacing" && entry.kind === "function");
    content.characterPropertiesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_properties" && entry.kind === "function");
    content.characterPropertiesRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_properties_ranges" && entry.kind === "function");
    content.paragraphReplacementAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_replace_paragraph_ranges" && entry.kind === "function");
    content.characterUnderlineAvailable = [
      "hwp5_edit_set_character_underline",
      "hwp5_edit_character_underlines"
    ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
    content.characterStrikeAvailable = [
      "hwp5_edit_set_character_strike",
      "hwp5_edit_character_strikes"
    ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
    content.characterStrikeRangesAvailable = content.characterStrikeAvailable && WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_strike_ranges" && entry.kind === "function");
    content.characterUnderlineRangesAvailable = content.characterUnderlineAvailable && WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_underline_ranges" && entry.kind === "function");
    content.characterUnderlineColorAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_underline_color" && entry.kind === "function");
    content.characterStrikeColorAvailable = content.characterStrikeAvailable && ["hwp5_edit_set_character_strike_color", "hwp5_edit_character_strike_styles"].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
    content.characterTextColorAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_text_color" && entry.kind === "function");
    content.characterShadeAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_shade" && entry.kind === "function");
    content.characterEffectAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_effect" && entry.kind === "function");
    content.characterEffectExclusiveAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_effect_exclusive" && entry.kind === "function");
    content.characterEffectRangesExclusiveAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_effect_ranges_exclusive" && entry.kind === "function");
    content.characterOutlineAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_outline" && entry.kind === "function");
    content.characterOutlineRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_outline_ranges" && entry.kind === "function");
    content.characterOutlineExtendedAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_outline_extended" && entry.kind === "function");
    content.characterOutlineRangesExtendedAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_outline_ranges_extended" && entry.kind === "function");
    content.characterEffectRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_effect_ranges" && entry.kind === "function");
    content.characterFontAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_font" && entry.kind === "function");
    content.characterFontNameAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_font_name" && entry.kind === "function");
    content.namedFontTextAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_splice_font_name" && entry.kind === "function");
    content.characterPropertyTextAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_splice_character_properties" && entry.kind === "function");
    content.namedFontPropertyTextAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_splice_font_name_properties" && entry.kind === "function");
    content.namedFontReplacementAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_replace_paragraph_ranges_font_name" && entry.kind === "function");
    content.characterPropertyReplacementAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_replace_paragraph_ranges_properties" && entry.kind === "function");
    content.namedFontPropertyReplacementAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_replace_paragraph_ranges_font_name_properties" && entry.kind === "function");
    content.characterFontNameRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_font_name_ranges" && entry.kind === "function");
    content.characterFontRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_font_ranges" && entry.kind === "function");
    content.characterTextColorRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_text_color_ranges" && entry.kind === "function");
    content.characterShadeRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_character_shade_ranges" && entry.kind === "function");
    if (protectionRemoved)
      content.passwordProtectionRemoved = true;
    attachHwp5TextSourcePolicy(editor, content);
    if (content.window)
      return content;
    const paragraphFormatAvailable = hwp5ParagraphFormatsAvailable();
    const prepared = attachHwp5PictureTails(editor, attachHwp5Pictures(editor, attachHwp5PageSources(editor, attachHwp5ParagraphFormats(editor, attachHwp5Tables(editor, preview, attachHwp5Styles(editor, preview, content, hwp5StyleOpenError)), paragraphFormatAvailable))));
    prepared.hwp5GroupGeometry = projectHwp5GroupGeometry(prepared);
    attachHwp5Forms(editor, prepared);
    attachHwp5FormProperties(editor, prepared);
    prepared.hwp5FormTextEditAvailable = historyEnabled && editor?.supportsFormTextEdit?.() === true;
    prepared.hwp5FormTextLayoutRetentionAvailable = prepared.hwp5FormTextEditAvailable && editor?.supportsFormTextLayoutRetention?.() === true;
    prepared.hwp5CheckBoxStateEditAvailable = historyEnabled && editor?.supportsCheckBoxStateEdit?.() === true;
    prepared.hwp5RadioSelectAvailable = historyEnabled && editor?.supportsRadioButtonSelect?.() === true;
    prepared.hwp5UnnamedRadioSelectAvailable = prepared.hwp5RadioSelectAvailable && editor?.supportsUnnamedRadioSelect?.() === true;
    attachHwp5Lines(editor, prepared);
    if (prepared.hwp5Pictures?.length) {
      const pictures = projectHwp5PictureGeometry(prepared);
      if (pictures.state === "projected")
        prepared.pictures = pictures.pictures;
      else
        prepared.hwp5PictureGeometryError = pictures.error;
    }
    attachHwp5Formulas(editor, prepared, ["hwp5_edit_formula_sources", "hwp5_edit_set_formula_definition"].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function")));
    const roots = projectHwp5RootContent(prepared);
    if (roots.state === "projected")
      return roots.content;
    if (prepared.hwp5Drawings?.length && prepared.hwp5Drawings.every((row) => row.source.kind_id === 610496366))
      prepared.hwp5GroupPageModelError = roots.error;
    else
      prepared.hwp5DrawingPageModelError = roots.error;
    return prepared;
  }
  function anchorView(section, paragraph) {
    try {
      return editor.anchorText(section, paragraph);
    } catch (error) {
      if ([
        "MissingTextSite",
        "UnsupportedParagraphControl",
        "UnsupportedInlineControl",
        "SourceBindingMismatch",
        "UnsupportedTextPositionProjection",
        "HwpxAnchorEditAbiUnavailable",
        "UnsupportedStructuralAnchorEdit",
        "UnsupportedStructuralFieldEdit"
      ].includes(error.message))
        return null;
      throw error;
    }
  }
  function hwpxDisplay(projected) {
    const resources = displayResources.view(editor);
    if (!projected && documentWindow) {
      const offset = Math.min(documentWindow.offset, Math.max(0, preview.paragraphCount - 1));
      const count = Math.min(documentWindow.count, preview.paragraphCount - offset);
      projected = projectHwpxWindow(editor, preview, { offset, count });
    }
    const content = projected ?? displayHwpxContent(preview);
    if (!content.window)
      attachHwpxFormulas(editor, content);
    content.formulaDefinitionAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_formula_definition" && entry.kind === "function");
    const formulaExports = new Set(WebAssembly.Module.exports(module).filter((entry) => entry.kind === "function").map((entry) => entry.name));
    attachHwpxCharts(editor, content, formulaExports, hwpxChartOlePolicy);
    content.manualFormulaResultAvailable = typeof editor.setManualFormulaResult === "function" && ["hwpx_edit_set_manual_formula_result", "hwpx_edit_manual_formula_result_max_bytes"].every((name) => formulaExports.has(name));
    content.manualFormulaResultTextAvailable = formulaResultTextAvailable(editor, module);
    const formulaResultContext = content.manualFormulaResultTextAvailable && content.window ? attachHwpxFormulas(editor, { paragraphs: content.paragraphs }) : content;
    const formulaResultSections = new Set((formulaResultContext.formulas ?? []).map((row) => row.section));
    const formulaResultParagraph = createFormulaResultParagraphFilter(editor, formulaExports);
    const formulaDisplay = createFormulaResultDisplayLookup(editor, formulaExports);
    content.paragraphAlignmentAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_paragraph_alignment" && entry.kind === "function");
    content.paragraphMarginsAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_paragraph_margins" && entry.kind === "function");
    content.paragraphSpacingAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_paragraph_spacing" && entry.kind === "function");
    content.characterPropertiesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_properties" && entry.kind === "function");
    content.characterPropertiesRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_properties_ranges" && entry.kind === "function");
    content.paragraphReplacementAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_replace_paragraph_ranges" && entry.kind === "function");
    content.characterUnderlineAvailable = [
      "hwpx_edit_set_character_underline",
      "hwpx_edit_character_underlines"
    ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
    content.characterStrikeAvailable = [
      "hwpx_edit_set_character_strike",
      "hwpx_edit_character_strikes"
    ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
    content.characterStrikeRangesAvailable = content.characterStrikeAvailable && WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_strike_ranges" && entry.kind === "function");
    content.characterUnderlineRangesAvailable = content.characterUnderlineAvailable && WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_underline_ranges" && entry.kind === "function");
    content.characterUnderlineColorAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_underline_color" && entry.kind === "function");
    content.characterStrikeColorAvailable = content.characterStrikeAvailable && ["hwpx_edit_set_character_strike_color", "hwpx_edit_character_strike_styles"].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
    content.characterTextColorAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_text_color" && entry.kind === "function");
    content.characterShadeAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_shade" && entry.kind === "function");
    content.characterEffectAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_effect" && entry.kind === "function");
    content.characterEffectExclusiveAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_effect_exclusive" && entry.kind === "function");
    content.characterEffectRangesExclusiveAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_effect_ranges_exclusive" && entry.kind === "function");
    content.characterOutlineAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_outline" && entry.kind === "function");
    content.characterOutlineRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_outline_ranges" && entry.kind === "function");
    content.characterOutlineExtendedAvailable = false;
    content.characterOutlineRangesExtendedAvailable = false;
    content.characterEffectRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_effect_ranges" && entry.kind === "function");
    content.characterFontAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_font" && entry.kind === "function");
    content.characterFontNameAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_font_name" && entry.kind === "function");
    content.namedFontTextAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_splice_font_name" && entry.kind === "function");
    content.characterPropertyTextAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_splice_character_properties" && entry.kind === "function");
    content.namedFontPropertyTextAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_splice_font_name_properties" && entry.kind === "function");
    content.namedFontReplacementAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_replace_paragraph_ranges_font_name" && entry.kind === "function");
    content.characterPropertyReplacementAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_replace_paragraph_ranges_properties" && entry.kind === "function");
    content.namedFontPropertyReplacementAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_replace_paragraph_ranges_font_name_properties" && entry.kind === "function");
    content.characterFontNameRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_font_name_ranges" && entry.kind === "function");
    content.characterFontRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_font_ranges" && entry.kind === "function");
    content.characterTextColorRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_text_color_ranges" && entry.kind === "function");
    content.characterShadeRangesAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_character_shade_ranges" && entry.kind === "function");
    let units = 0;
    const fieldLinkGuard = createFieldLinkDisplayGuard();
    const currentText = new Map;
    const automaticNumberSnapshot = createAutomaticNumberDisplaySnapshot(editor);
    const nextMerge = new Map, previousMerge = new Map;
    const neighborAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_paragraph_neighbors" && entry.kind === "function");
    for (const section of new Set(content.paragraphs.map((p) => p.section))) {
      for (const row of editor.paragraphTextSnapshot(section))
        currentText.set(`${section}:${row.paragraph - 1}`, row);
      if (neighborAvailable) {
        const neighbors = editor.paragraphNeighbors(section);
        for (const [index, value] of neighbors.next.entries()) {
          const paragraph = neighbors.firstParagraph + index - 1;
          nextMerge.set(`${section}:${paragraph}`, value === null ? null : value - 1);
          if (value !== null) {
            const key = `${section}:${value - 1}`;
            if (previousMerge.has(key))
              throw new Error("DuplicateParagraphNeighbor");
            previousMerge.set(key, paragraph);
          }
        }
      }
    }
    for (const paragraph of content.paragraphs) {
      const current = currentText.get(`${paragraph.section}:${paragraph.paragraph}`);
      if (!current)
        throw new Error("MissingCurrentParagraphText");
      paragraph.selectionOwner = current.nested ? null : `section:${paragraph.section}:body`;
      if (neighborAvailable) {
        paragraph.nextMergeParagraph = nextMerge.get(`${paragraph.section}:${paragraph.paragraph}`) ?? null;
        paragraph.previousMergeParagraph = previousMerge.get(`${paragraph.section}:${paragraph.paragraph}`) ?? null;
      }
      paragraph.label = `구역 ${paragraph.section + 1} · 문단 ${paragraph.paragraph + 1}${current.nested ? " · 중첩" : ""} · HWPX 읽기 전용`;
      paragraph.plainEditable = !paragraph.clipped && fieldLinkGuard.read(paragraph.section, () => editor.canEdit(paragraph.section, paragraph.paragraph + 1), false, "plain");
      if (paragraph.plainEditable) {
        const anchored = editor.anchorText(paragraph.section, paragraph.paragraph + 1);
        paragraph.text = current.nested ? retainedAutomaticNumberPlainText(editor, paragraph.section, paragraph.paragraph + 1, current.text, anchored, automaticNumberSnapshot) : anchored;
      }
      paragraph.fieldLabels = [];
      paragraph.manualFormulaResults = [];
      paragraph.anchorEditable = false;
      if (!paragraph.clipped && !paragraph.plainEditable) {
        const anchored = fieldLinkGuard.read(paragraph.section, () => anchorView(paragraph.section, paragraph.paragraph + 1), null, "anchor");
        if (anchored !== null) {
          paragraph.text = anchored;
          paragraph.anchorEditable = true;
        }
      }
      const clipped = clipText(paragraph.text, Math.max(0, HWPX_DISPLAY_BOUNDS.maxUnits - units));
      if (clipped !== paragraph.text) {
        paragraph.clipped = true;
        content.limited = true;
        paragraph.text = clipped;
      }
      units += paragraph.text.length;
      if (paragraph.clipped) {
        paragraph.plainEditable = false;
        paragraph.anchorEditable = false;
      }
      paragraph.anchoredSplitAvailable = !paragraph.clipped && (paragraph.anchorEditable || paragraph.plainEditable && /[\t\r\n]/.test(paragraph.text)) && WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_split_anchored" && entry.kind === "function");
      if (!paragraph.clipped && !paragraph.plainEditable && !paragraph.anchorEditable) {
        try {
          paragraph.fieldLabels = fieldLinkGuard.read(paragraph.section, () => editor.fieldLabels(paragraph.section, paragraph.paragraph + 1), [], "labels");
        } catch (error) {
          if (![
            "SourceBindingMismatch",
            "UnsupportedTextPositionProjection",
            "HwpxFieldEditAbiUnavailable",
            "UnsupportedStructuralFieldEdit"
          ].includes(error.message))
            throw error;
          paragraph.fieldReadOnlyReason = error.message;
        }
      }
      if (paragraph.fieldLabels.length && WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_field_label_display_text" && entry.kind === "function"))
        units += projectFieldLabelDisplay(editor, paragraph, HWPX_DISPLAY_BOUNDS.maxUnits - units + paragraph.text.length);
      units += fieldLinkGuard.read(paragraph.section, () => {
        const eligible = content.manualFormulaResultTextAvailable && !paragraph.clipped && !paragraph.plainEditable && formulaResultSections.has(paragraph.section);
        const snapshot = eligible && formulaDisplay.available ? formulaDisplay.get(paragraph.section, paragraph.paragraph + 1) : undefined;
        const available = eligible && (snapshot !== undefined ? snapshot !== null : formulaResultParagraph(paragraph.section, paragraph.paragraph + 1));
        return projectFormulaResultText(editor, paragraph, available, HWPX_DISPLAY_BOUNDS.maxUnits - units + paragraph.text.length, snapshot ?? undefined);
      }, 0, "formula-results");
      if (paragraph.clipped)
        content.limited = true;
      const wholeFormulaResult = paragraph.manualFormulaResults.length === 1 && paragraph.manualFormulaResults[0].start === 0 && paragraph.manualFormulaResults[0].end === paragraph.text.length;
      paragraph.editable = paragraph.plainEditable || paragraph.anchorEditable || paragraph.fieldLabels.length > 0 || wholeFormulaResult;
      if (!paragraph.editable && fieldLinkGuard.reason(paragraph.section))
        paragraph.fieldReadOnlyReason = fieldLinkGuard.reason(paragraph.section);
      if (paragraph.editable)
        paragraph.label = paragraph.label.replace("읽기 전용", paragraph.plainEditable ? "일반 텍스트 편집" : paragraph.anchorEditable ? "보호 개체 텍스트 편집" : paragraph.manualFormulaResults.length ? "계산 결과 편집" : "필드 라벨만 편집");
      else if (paragraph.manualFormulaResults.length)
        paragraph.label = paragraph.label.replace("읽기 전용", "계산 결과 범위만 편집");
    }
    content.readOnly = !content.paragraphs.some((paragraph) => paragraph.editable);
    attachAutomaticNumbers(editor, content, automaticNumberSnapshot);
    attachDutmal(editor, content, [
      "hwpx_edit_inline_string_sources",
      "hwpx_edit_dutmal_sites",
      "hwpx_edit_dutmal_text",
      "hwpx_edit_dutmal_display_text"
    ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function")));
    attachEquations(editor, content, WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_equation_sites" && entry.kind === "function"));
    attachEquationRendering(editor, content, content.equationAvailable && WebAssembly.Module.exports(module).some((entry) => entry.name === "equation_process" && entry.kind === "function"), undefined, WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_equation_styles" && entry.kind === "function"));
    attachNoteReferences(editor, content);
    attachDrawingTextBindings(editor, content);
    attachCheckBoxes(editor, content, [
      "hwpx_edit_form_sites",
      "hwpx_edit_form_source_attributes",
      "hwpx_edit_checkbox_state",
      "hwpx_edit_set_checkbox_state"
    ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function")));
    if (protectionRemoved)
      content.passwordProtectionRemoved = true;
    const styleAvailable = ["hwpx_edit_character_shapes", "hwpx_edit_character_ranges"].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
    const paragraphAvailable = [
      "hwpx_edit_paragraph_shape_ids",
      "hwpx_edit_paragraph_shape_refs",
      "hwpx_edit_set_paragraph_format"
    ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
    const tableContent = attachHwpxTables(editor, attachHwpxStyles(resources, content, styleAvailable));
    attachHwpxTableBorders(editor, tableContent, formulaExports.has("hwpx_edit_table_border_sources"));
    if (content.window)
      attachHwpxFormulas(editor, tableContent);
    const sourced = attachHwpxConnectors(editor, attachHwpxLines(editor, attachHwpxPictures(editor, attachHwpxParagraphFormats(resources, tableContent, paragraphAvailable))));
    attachTabDefinitions(resources, sourced);
    attachSectionTabSources(editor, sourced);
    attachEllipses(editor, sourced, formulaExports.has("hwpx_edit_ellipse_sources"));
    const displayed = attachHwpxPageSettings(editor, sourced);
    attachHwpxPictureCaptions(editor, displayed, ["hwpx_edit_picture_caption", "hwpx_edit_picture_caption_bindings"].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function")));
    attachHwpxPageAreaDeclarations(editor, displayed, formulaExports.has("hwpx_edit_page_area_declarations"));
    attachHwpxOleSources(editor, displayed, ["hwpx_edit_ole_sites", "hwpx_edit_ole_source"].every((name) => formulaExports.has(name)));
    displayed.lines.push(...displayed.connectors.flatMap((row) => row.referenceLine ? [row.referenceLine] : []));
    if (content.window && content.paragraphs.some((row) => row.clipped))
      throw new Error("ParagraphWindowTextBudgetExceeded");
    const creationAvailable = [
      "hwpx_edit_created_tables",
      "hwpx_edit_insert_table",
      "hwpx_edit_set_created_cell_text",
      "hwpx_edit_save_for_display"
    ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
    displayed.tableCreationResources = creationAvailable && WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_table_creation_resources" && entry.kind === "function") ? resources.tableCreationResources() : null;
    const result = attachCreatedTables(editor, displayed, creationAvailable, HWPX_DISPLAY_BOUNDS.maxUnits, preview.sectionCount);
    hwpxCreatedTablesPending = result.createdTableHostPending;
    return result;
  }
  const outcomes = new WeakMap;
  let lastHistoryRevision;
  let loadProjection = null;
  let requestSequence = 0;
  async function execute(message, requestTicket, reusableLoad, ownerWindowProjection = false) {
    let reader;
    let response;
    const minimalError = (error) => ({
      origin: message.origin,
      kind: message.kind,
      applied,
      ...historyPoisoned ? { historyPoisoned: true } : {},
      ...message.requestId === undefined ? {} : { requestId: message.requestId },
      error: error?.message || String(error)
    });
    const reply = (value) => {
      if (response !== undefined)
        throw new Error("DuplicateRuntimeReply");
      try {
        let historyRevision, historyRevisions, historyStats;
        if (historyEnabled && editor && WebAssembly.Module.exports(module).some((entry) => entry.name === `${format}_edit_history_revision`))
          historyRevision = editor.historyRevision();
        if (historyEnabled && editor && ["count", "at"].every((suffix) => WebAssembly.Module.exports(module).some((entry) => entry.name === `${format}_edit_history_revision_${suffix}`)))
          historyRevisions = editor.historyRevisions();
        if (historyEnabled && editor)
          historyStats = editor.historyStats();
        response = {
          origin: message.origin,
          ...value,
          ...historyPoisoned ? { historyPoisoned: true } : {},
          ...historyStats === undefined ? {} : { historyStats },
          ...historyRevision === undefined ? {} : { historyRevision },
          ...historyRevisions === undefined ? {} : { historyRevisions }
        };
      } catch (error) {
        response = minimalError(error);
      }
    };
    let applied = false;
    let mutationUncertain = false;
    let atomicOutcome;
    let nativeTextDelta;
    let beforeTextOwner = null;
    if (format === "hwp5" && historyEnabled && message.kind === "splice") {
      try {
        beforeTextOwner = editor?.captureExclusiveTextOwner(message.section, message.paragraph);
      } catch {}
    }
    const projectedOwner = () => {
      if (ownerWindowProjection === true && nativeTextDelta && !documentWindow && preview.sections.every((s) => s.paragraphs.every((p) => p.tokens.every((t) => t.type !== "control" || [2, 11, 13, 21].includes(t.code))))) {
        hwp5PreviewDirty = true;
        return { viewKind: "owner-window-patch", ...nativeTextDelta };
      }
      return null;
    };
    const captureTextDelta = () => {
      try {
        nativeTextDelta = editor.readExclusiveTextDelta(beforeTextOwner);
      } catch {
        nativeTextDelta = undefined;
      }
    };
    displayResources.beginRequest(message, { format, editor, historyEnabled });
    try {
      if (message.kind === "formatting-capabilities") {
        if (!editor)
          throw Error("EditorNotOpen");
        reply({ kind: message.kind, formattingCapabilities: formattingCapabilities(editor) });
        return;
      }
      if (message.kind === "query-formatting") {
        if (!editor)
          throw Error("EditorNotOpen");
        reply({ kind: message.kind, formatting: queryAtomicFormatting(editor, format, message) });
        return;
      }
      if (message.kind === "formatting-patch") {
        if (!editor || !historyEnabled)
          throw Error("HistoryNotEnabled");
        atomicOutcome = editor.applyFormattingPatch(message.request);
        applied = atomicOutcome.application === "applied";
        mutationUncertain = atomicOutcome.application === "unknown";
        if (mutationUncertain)
          historyPoisoned = true;
        if (atomicOutcome.error || atomicOutcome.cleanupError)
          throw Error(atomicOutcome.error || atomicOutcome.cleanupError);
        if (atomicOutcome.nativeCode === 2) {
          reply({ kind: message.kind, changed: false });
          return;
        }
        reply({ kind: message.kind, content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
        return;
      }
      if (format === "hwp5" && preview?.sectionInventory && message.kind !== "load")
        throw new Error("AvailableSectionsReadOnly");
      if ([
        "query-current-references",
        "query-current-source-references",
        "query-current-text",
        "query-created-tables",
        "splice-current"
      ].includes(message.kind)) {
        const result = currentReferenceCommand(editor, format, historyEnabled, message);
        if (result) {
          reply({ kind: message.kind, requestId: message.requestId, ...result });
        } else {
          applied = true;
          await refreshHwp5PreviewFallback();
          reply({ kind: message.kind, requestId: message.requestId, content: hwp5Display() });
        }
        return;
      }
      if (message.kind === "insert-table" || message.kind === "created-cell-text") {
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        if (format === "hwp5") {
          if (!hwp5TableCreationAvailable())
            throw new Error("Hwp5TableCreationAbiUnavailable");
          const identity = message.kind === "insert-table" ? editor.insertTable(hwp5TableCreationRequest(message)) : message.identity;
          if (message.kind === "created-cell-text")
            setHwp5CreatedCellText(editor, message);
          applied = true;
          reply({ kind: message.kind, identity, content: hwp5Display() });
          return;
        }
        if (format !== "hwpx")
          throw new Error("UnsupportedTableCreationFormat");
        let identity = message.identity;
        if (message.kind === "insert-table")
          identity = editor.insertTable(message.section, message.paragraph + 1, message.unit, message.options);
        else
          editor.setCreatedCellText(message.section, identity, message.row, message.column, message.text);
        applied = true;
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.saveForDisplay());
        reply({ kind: message.kind, identity, content: hwpxDisplay() });
        return;
      }
      if (message.kind === "set-edit-window") {
        if (!editor || !preview || !historyEnabled)
          throw new Error("EditorNotOpen");
        const full = message.offset === null && message.count === null;
        if (format === "hwp5") {
          const projected = () => full ? displayContent(hwp5DisplayProjection()) : queryHwp5WindowContent(editor, hwp5DisplayProjection(), { offset: message.offset, count: message.count }, hwp5ParagraphFormatsAvailable());
          const content = hwp5Display(projected);
          documentWindow = full ? null : { offset: message.offset, count: message.count };
          reply({ kind: "set-edit-window", content });
          return;
        }
        if (format !== "hwpx")
          throw new Error("UnsupportedDocumentWindowFormat");
        const projected = full ? displayHwpxContent(preview) : projectHwpxWindow(editor, preview, { offset: message.offset, count: message.count });
        const content = hwpxDisplay(projected);
        documentWindow = full ? null : { offset: message.offset, count: message.count };
        reply({ kind: "set-edit-window", content });
        return;
      }
      if (message.kind === "query-window" || message.kind === "query-edit-window") {
        if (!editor || !preview)
          throw new Error("EditorNotOpen");
        if (message.kind === "query-edit-window" && !historyEnabled)
          throw new Error("EditorNotOpen");
        if (format === "hwp5") {
          const content = hwp5Display(() => queryHwp5WindowContent(editor, hwp5DisplayProjection(), { offset: message.offset, count: message.count }, hwp5ParagraphFormatsAvailable()));
          reply({ kind: message.kind, content });
          return;
        }
        if (format !== "hwpx")
          throw new Error("UnsupportedDocumentWindowFormat");
        let content = projectHwpxWindow(editor, preview, {
          offset: message.offset,
          count: message.count
        });
        if (message.kind === "query-edit-window") {
          content = hwpxDisplay(content);
          if (content.paragraphs.some((row) => row.clipped))
            throw new Error("ParagraphWindowTextBudgetExceeded");
        }
        reply({ kind: message.kind, content });
        return;
      }
      if (message.kind === "query-edit-range") {
        reply(selectionEditQuery(message, {
          active: Boolean(editor) && historyEnabled,
          format,
          canEdit: (section, paragraph, start, end) => formulaResultTextRangeAllowed(editor, module, section, paragraph, start, end) || hwpxFieldRangeTarget(editor, hwpxCreatedTablesPending, section, paragraph, start, end) !== null || outsideFieldRange(section, paragraph, start, end)
        }));
        return;
      }
      if (message.kind === "query-split-range") {
        reply(selectionSplitQuery(message, {
          active: Boolean(editor) && historyEnabled,
          format,
          canSplit: (section, paragraph, atUnit, endUnit) => editor.canSplitParagraph({ section, paragraph, atUnit, endUnit }),
          canSplitAnchored: editor?.supportsAnchoredSplitQuery?.() ? (section, paragraph, atUnit, endUnit) => editor.canSplitParagraphAnchored({ section, paragraph, atUnit, endUnit }) : undefined
        }));
        return;
      }
      if (format === "hwp5" && !historyEnabled && ["save", "undo", "redo", "split", "merge", "splice", "format"].includes(message.kind))
        throw new Error("EditorNotOpen");
      if (message.kind === "refresh") {
        if (!editor || !preview)
          throw new Error("EditorNotOpen");
        if (format === "hwp5")
          await refreshHwp5PreviewFallback();
        else {
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
        }
        reply({ kind: "refresh", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
        return;
      }
      if (message.kind === "load") {
        const availableSectionsOnly = availableSectionsRequest(message);
        const availableSectionCopy = availableSectionCopyRequest(message);
        const requestedPolicy = message.allowObservedChartOleDeviations === undefined ? false : message.allowObservedChartOleDeviations;
        if (typeof requestedPolicy !== "boolean")
          throw new Error("InvalidChartOlePolicy");
        if (requestedPolicy && message.format !== "hwpx")
          throw new Error("UnsupportedChartOlePolicyFormat");
        editor?.close();
        editor = undefined;
        preview = undefined;
        if (protectionRemoved)
          bytes?.fill(0);
        protectionRemoved = false;
        bytes = undefined;
        module = undefined;
        historyEnabled = false;
        historyPoisoned = false;
        hwp5StyleOpenError = null;
        documentWindow = null;
        hwpxCreatedTablesPending = false;
        format = message.format ?? "hwp5";
        hwpxChartOlePolicy = format === "hwpx" && requestedPolicy;
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnknownDocumentFormat");
        if (message.wasmModule !== undefined) {
          if (!(message.wasmModule instanceof WebAssembly.Module))
            throw new Error("InvalidPreviewWasmModule");
          module = message.wasmModule;
        } else {
          module = wasmModule ?? await loadWasmModule?.();
          if (!(module instanceof WebAssembly.Module))
            throw new Error("PreviewWasmModuleRequired");
        }
        bytes = new Uint8Array(message.bytes);
        if (format === "hwpx") {
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(bytes);
          const next = await createHwpxEditor(module);
          try {
            next.open(bytes, { allowObservedChartOleDeviations: hwpxChartOlePolicy });
          } catch (error) {
            next.close();
            throw error;
          }
          editor = next;
          reply({ kind: "load", content: hwpxDisplay() });
          return;
        }
        reader = await createHwp5Reader(module);
        if (availableSectionCopy) {
          const next = await createExperimentalHwp5Editor2(module, bytes, {
            availableSectionCopy: true
          });
          try {
            preview = reader.readText(next.save().bytes);
          } catch (error) {
            next.close();
            throw error;
          }
          editor = next;
          reply({ kind: "load", content: hwp5Display() });
          return;
        }
        preview = availableSectionsOnly ? reader.readAvailableText(bytes) : reader.readText(bytes);
        if (availableSectionsOnly) {
          reply({ kind: "load", content: availableSectionsContent(preview) });
          return;
        }
        if (!preview.readOnly) {
          try {
            editor = await createExperimentalHwp5Editor2(module, bytes);
          } catch (error) {
            hwp5StyleOpenError = error.message;
          }
        }
        if (!editor && preview.primarySource === "distribution_viewtext" && WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_open_distribution" && entry.kind === "function")) {
          try {
            const probe = await createExperimentalHwp5Editor2(module, bytes, { distribution: true });
            probe.close();
          } catch (error) {
            hwp5StyleOpenError = error.message;
          }
        }
        reply({ kind: "load", content: hwp5Display() });
      } else if (message.kind === "table-background-bytes") {
        if (!editor || format !== "hwpx")
          throw new Error("TableBackgroundReadUnavailable");
        const backgroundBytes = editor.tableBackgroundBytes(message.section, message.listNode);
        reply({
          kind: "table-background-bytes",
          section: message.section,
          listNode: message.listNode,
          bytes: backgroundBytes
        });
      } else if (message.kind === "picture-bytes") {
        if (!editor || !["hwpx", "hwp5"].includes(format))
          throw new Error("PictureReadUnavailable");
        const pictureBytes = format === "hwp5" ? readHwp5PictureBytes(editor, message.section, message.pictureNode) : editor.pictureBytes(message.section, message.pictureNode);
        reply({
          kind: "picture-bytes",
          section: message.section,
          pictureNode: message.pictureNode,
          bytes: pictureBytes
        });
      } else if (message.kind === "unlock") {
        if (!bytes || !module)
          throw new Error("PasswordDocumentNotLoaded");
        const decoder = await (format === "hwpx" ? createHwpxPasswordDecoder(module) : createHwp5PasswordDecoder(module));
        let plaintext;
        try {
          plaintext = decoder.decryptToPlaintext(bytes, message.password);
        } finally {
          decoder.close();
          delete message.password;
        }
        if (!plaintext)
          throw new Error("DocumentNotEncrypted");
        let next;
        try {
          reader = await (format === "hwpx" ? createHwpxReader(module) : createHwp5Reader(module));
          const current = format === "hwpx" ? reader.readTextEvents(plaintext) : reader.readText(plaintext);
          if (format === "hwpx") {
            next = await createHwpxEditor(module);
            next.open(plaintext, { allowObservedChartOleDeviations: hwpxChartOlePolicy });
          } else
            next = await createExperimentalHwp5Editor2(module, plaintext);
          editor?.close();
          editor = next;
          next = undefined;
          bytes = plaintext;
          preview = current;
          protectionRemoved = true;
          historyEnabled = false;
          historyPoisoned = false;
          reply({ kind: "unlock", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
        } catch (error) {
          next?.close();
          if (bytes !== plaintext)
            plaintext.fill(0);
          throw error;
        }
      } else if (message.kind === "save") {
        requirePasswordRemovalConsent(protectionRemoved, message.allowUnprotectedOutput);
        const saved = saveDocument(editor, format, message.allowStaleLayout === undefined ? false : message.allowStaleLayout);
        reply({
          kind: "save",
          ...saved,
          ...protectionRemoved ? { passwordProtectionRemoved: true } : {}
        });
      } else if (message.kind === "splice-font-name" || message.kind === "splice-character-properties") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error(message.kind === "splice-font-name" ? "UnsupportedNamedFontTextEditing" : "UnsupportedCharacterPropertyTextEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        if (message.rangePolicy !== undefined && message.rangePolicy !== "reject")
          throw new Error("InvalidRangePolicy");
        if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 4294967294 : 4294967295))
          throw new RangeError("Invalid paragraph");
        const paragraph = message.paragraph + (format === "hwpx" ? 1 : 0);
        let textMode = "plain", beginElement = 0;
        if (format === "hwpx" && !editor.canEdit(message.section, paragraph)) {
          const target = hwpxFieldRangeTarget(editor, hwpxCreatedTablesPending, message.section, paragraph, message.startUnit, message.endUnit);
          if (target !== null) {
            textMode = "field";
            beginElement = target.beginElement;
          } else if (outsideFieldRange(message.section, paragraph, message.startUnit, message.endUnit))
            textMode = "plain";
          else if (anchorView(message.section, paragraph) !== null)
            textMode = "anchored";
          else
            throw new Error("UnsupportedFieldLabelRange");
        }
        if (message.kind === "splice-font-name")
          editor.spliceWithFontName({ ...message, paragraph, textMode, beginElement });
        else
          editor.spliceWithCharacterProperties({ ...message, paragraph, textMode, beginElement });
        applied = true;
        if (format === "hwpx") {
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
        } else {
          await refreshHwp5PreviewFallback();
        }
        reply({ kind: message.kind, content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
      } else if (message.kind === "character-font-name") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterFontNameEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 4294967294 : 4294967295))
          throw new RangeError("Invalid paragraph");
        editor.setCharacterFontName({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          language: message.language,
          name: message.name
        });
        applied = true;
        reply({
          kind: "character-font-name",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-font") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterFontEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 4294967294 : 4294967295))
          throw new RangeError("Invalid paragraph");
        editor.setCharacterFont({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          language: message.language,
          fontId: message.fontId
        });
        applied = true;
        reply({
          kind: "character-font",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-outline") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterOutlineEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 4294967294 : 4294967295))
          throw new RangeError("Invalid paragraph");
        editor.setCharacterOutline({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          kind: message.outlineKind
        });
        applied = true;
        reply({
          kind: "character-outline",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-effect") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterEffectEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 4294967294 : 4294967295))
          throw new RangeError("Invalid paragraph");
        editor.setCharacterEffect({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          effect: message.effect,
          enabled: message.enabled,
          exclusive: message.exclusive
        });
        applied = true;
        reply({
          kind: "character-effect",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-shade") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterShadeEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 4294967294 : 4294967295))
          throw new RangeError("Invalid paragraph");
        editor.setCharacterShade({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          color: message.color
        });
        applied = true;
        reply({
          kind: "character-shade",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-text-color") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterTextColorEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.setCharacterTextColor({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          color: message.color
        });
        applied = true;
        reply({
          kind: "character-text-color",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-strike-color") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterStrikeColorEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 4294967294 : 4294967295))
          throw new RangeError("InvalidTextPosition");
        editor.setCharacterStrikeColor({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          color: message.color
        });
        applied = true;
        reply({
          kind: "character-strike-color",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-underline-color") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterUnderlineColorEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.setCharacterUnderlineColor({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          color: message.color
        });
        applied = true;
        reply({
          kind: "character-underline-color",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-strike") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterStrikeEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > (format === "hwpx" ? 4294967294 : 4294967295))
          throw new RangeError("InvalidTextPosition");
        editor.setCharacterStrike({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          enabled: message.enabled
        });
        applied = true;
        reply({
          kind: "character-strike",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-underline") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterUnderlineEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.setCharacterUnderline({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          kind: message.underlineKind
        });
        applied = true;
        reply({
          kind: "character-underline",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "replace-paragraph-ranges") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedParagraphReplacement");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        encodeCharacterRanges(message.ranges);
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === "hwpx" ? 1 : 0)
        }));
        if (Object.hasOwn(message, "language") || Object.hasOwn(message, "name")) {
          editor.replaceParagraphRangesWithFontName({
            ranges,
            text: message.text,
            language: message.language,
            name: message.name,
            properties: message.properties
          });
        } else
          editor.replaceParagraphRanges({
            ranges,
            text: message.text,
            properties: message.properties
          });
        applied = true;
        if (format === "hwpx") {
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
        } else {
          await refreshHwp5PreviewFallback();
        }
        reply({
          kind: "replace-paragraph-ranges",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-font-name-ranges") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterFontNameEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        encodeCharacterRanges(message.ranges);
        if (format === "hwpx" && message.ranges.some((range) => range.paragraph === 4294967295))
          throw new RangeError("Invalid paragraph");
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === "hwpx" ? 1 : 0)
        }));
        editor.setCharacterFontNameRanges({
          ranges,
          language: message.language,
          name: message.name
        });
        applied = true;
        reply({ kind: message.kind, content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
      } else if (message.kind === "character-font-ranges") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterFontEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        encodeCharacterRanges(message.ranges);
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === "hwpx" ? 1 : 0)
        }));
        editor.setCharacterFontRanges({
          ranges,
          language: message.language,
          fontId: message.fontId
        });
        applied = true;
        reply({
          kind: "character-font-ranges",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-outline-ranges") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterOutlineEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        encodeCharacterRanges(message.ranges);
        if (format === "hwpx" && message.ranges.some((range) => range.paragraph === 4294967295))
          throw new RangeError("InvalidTextPosition");
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === "hwpx" ? 1 : 0)
        }));
        editor.setCharacterOutlineRanges({ ranges, kind: message.outlineKind });
        applied = true;
        reply({
          kind: "character-outline-ranges",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-effect-ranges") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterEffectEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        encodeCharacterRanges(message.ranges);
        if (format === "hwpx" && message.ranges.some((range) => range.paragraph === 4294967295))
          throw new RangeError("InvalidTextPosition");
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === "hwpx" ? 1 : 0)
        }));
        editor.setCharacterEffectRanges({
          ranges,
          effect: message.effect,
          enabled: message.enabled,
          exclusive: message.exclusive
        });
        applied = true;
        reply({
          kind: "character-effect-ranges",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-shade-ranges") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterShadeEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        encodeCharacterRanges(message.ranges);
        if (format === "hwpx" && message.ranges.some((range) => range.paragraph === 4294967295))
          throw new RangeError("InvalidTextPosition");
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === "hwpx" ? 1 : 0)
        }));
        editor.setCharacterShadeRanges({ ranges, color: message.color });
        applied = true;
        reply({
          kind: "character-shade-ranges",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-text-color-ranges") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterTextColorEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        encodeCharacterRanges(message.ranges);
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === "hwpx" ? 1 : 0)
        }));
        editor.setCharacterTextColorRanges({ ranges, color: message.color });
        applied = true;
        reply({
          kind: "character-text-color-ranges",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-strike-ranges") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterStrikeEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        encodeCharacterRanges(message.ranges);
        if (format === "hwpx" && message.ranges.some((range) => range.paragraph === 4294967295))
          throw new RangeError("InvalidTextPosition");
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === "hwpx" ? 1 : 0)
        }));
        editor.setCharacterStrikeRanges({ ranges, enabled: message.enabled });
        applied = true;
        reply({
          kind: "character-strike-ranges",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-underline-ranges") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterUnderlineEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        encodeCharacterRanges(message.ranges);
        if (format === "hwpx" && message.ranges.some((range) => range.paragraph === 4294967295))
          throw new RangeError("Invalid paragraph");
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === "hwpx" ? 1 : 0)
        }));
        editor.setCharacterUnderlineRanges({ ranges, kind: message.underlineKind });
        applied = true;
        reply({
          kind: "character-underline-ranges",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-properties-ranges") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterPropertiesEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        encodeCharacterRanges(message.ranges);
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === "hwpx" ? 1 : 0)
        }));
        editor.setCharacterPropertiesRanges({ ranges, properties: message.properties });
        applied = true;
        reply({
          kind: "character-properties-ranges",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "character-properties") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedCharacterPropertiesEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.setCharacterProperties({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          properties: message.properties
        });
        applied = true;
        reply({
          kind: "character-properties",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "paragraph-spacing") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedParagraphSpacingEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.setParagraphSpacing({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          type: message.type,
          value: message.value
        });
        applied = true;
        reply({
          kind: "paragraph-spacing",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "paragraph-margins") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedParagraphMarginsEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.setParagraphMargins({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          margins: message.margins
        });
        applied = true;
        reply({
          kind: "paragraph-margins",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "paragraph-alignment") {
        if (format !== "hwpx" && format !== "hwp5")
          throw new Error("UnsupportedParagraphAlignmentEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.setParagraphAlignment({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          alignment: message.alignment
        });
        applied = true;
        reply({
          kind: "paragraph-alignment",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "paragraph-format") {
        if (format !== "hwp5" && format !== "hwpx")
          throw new Error("UnsupportedParagraphFormatEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.setParagraphFormat({
          section: message.section,
          paragraph: message.paragraph + (format === "hwpx" ? 1 : 0),
          paraShapeId: message.paraShapeId
        });
        applied = true;
        reply({
          kind: "paragraph-format",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "formula-definition") {
        if (format !== "hwpx" && format !== "hwp5")
          throw new Error("UnsupportedFormulaDefinitionEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        if (format === "hwp5")
          editor.setFormulaDefinition({
            section: message.section,
            sourceNode: message.beginElement,
            formula: message.formula
          });
        else
          editor.setFormulaDefinition(message.section, message.beginElement, message.formula);
        applied = true;
        if (format === "hwp5") {
          await refreshHwp5PreviewFallback();
          reply({ kind: "formula-definition", content: hwp5Display() });
        } else {
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
          reply({ kind: "formula-definition", content: hwpxDisplay() });
        }
      } else if (message.kind === "chart-display") {
        if (format !== "hwpx")
          throw new Error("UnsupportedChartEditing");
        if (!editor)
          throw new Error("EditorNotOpen");
        const chart = editor.chartDisplay(message.section, message.wrapper);
        reply({
          kind: message.kind,
          requestId: message.requestId,
          section: message.section,
          wrapper: message.wrapper,
          chart
        });
      } else if (message.kind === "chart-points" || message.kind === "chart-series-text" || message.kind === "chart-rich-text") {
        if (format !== "hwpx")
          throw new Error("UnsupportedChartEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        const chart = message.kind === "chart-rich-text" ? editor.chartRichText(message.section, message.wrapper) : message.kind === "chart-series-text" ? editor.chartSeriesText(message.section, message.wrapper) : editor.chartPoints(message.section, message.wrapper);
        reply({
          kind: message.kind,
          requestId: message.requestId,
          section: message.section,
          wrapper: message.wrapper,
          chart
        });
      } else if (message.kind === "chart-points-set" || message.kind === "chart-numeric-point" || message.kind === "chart-point" || message.kind === "chart-series-text-set" || message.kind === "chart-rich-text-set") {
        if (format !== "hwpx")
          throw new Error("UnsupportedChartEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        if (message.kind === "chart-points-set")
          applyChartPointBatchCommand(editor, message);
        else if (message.kind === "chart-rich-text-set")
          editor.setChartRichText(message.section, message.wrapper, message.ordinal, message.value);
        else if (message.kind === "chart-series-text-set")
          editor.setChartSeriesText(message.section, message.wrapper, message.ordinal, message.value);
        else if (message.kind === "chart-point")
          editor.setChartPoint(message.section, message.wrapper, message.point, message.value);
        else
          editor.setChartNumericPoint(message.section, message.wrapper, message.point, message.value);
        applied = true;
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.saveForDisplay());
        const chart = message.kind === "chart-rich-text-set" ? editor.chartRichText(message.section, message.wrapper) : message.kind === "chart-series-text-set" ? editor.chartSeriesText(message.section, message.wrapper) : editor.chartPoints(message.section, message.wrapper);
        reply({ kind: message.kind, content: hwpxDisplay(), chart });
      } else if (message.kind === "manual-formula-result") {
        if (format !== "hwpx")
          throw new Error("UnsupportedManualFormulaResultEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        if (typeof editor.setManualFormulaResult !== "function")
          throw new Error("HwpxManualFormulaResultAbiUnavailable");
        editor.setManualFormulaResult(message.section, message.beginElement, message.display);
        applied = true;
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.saveForDisplay());
        reply({ kind: "manual-formula-result", content: hwpxDisplay() });
      } else if (message.kind === "inline-string-sources") {
        if (format !== "hwpx")
          throw new Error("UnsupportedInlineStringSources");
        if (!editor)
          throw new Error("EditorNotOpen");
        reply({
          kind: message.kind,
          requestId: message.requestId,
          sources: editor.inlineStringSources()
        });
      } else if (message.kind === "equation-sources") {
        if (format !== "hwpx")
          throw new Error("UnsupportedEquationScriptEditing");
        if (!editor)
          throw new Error("EditorNotOpen");
        reply({
          kind: message.kind,
          ...equationQueryIdentity(message),
          sources: editor.equationSources(message.section)
        });
      } else if (message.kind === "equation-script-query") {
        if (format !== "hwpx")
          throw new Error("UnsupportedEquationScriptEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        reply({
          kind: message.kind,
          ...equationQueryIdentity(message),
          equation: readEquationScript(editor, message)
        });
      } else if (message.kind === "equation-script-set") {
        if (format !== "hwpx")
          throw new Error("UnsupportedEquationScriptEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        writeEquationScript(editor, message);
        applied = true;
        const equation = readEquationScript(editor, message);
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.saveForDisplay());
        reply({
          kind: message.kind,
          ...equationQueryIdentity(message),
          equation,
          content: hwpxDisplay()
        });
      } else if (message.kind === "dutmal-text-query") {
        if (format !== "hwpx")
          throw new Error("UnsupportedDutmalTextEditing");
        if (!editor)
          throw new Error("EditorNotOpen");
        reply({
          kind: message.kind,
          requestId: message.requestId,
          dutmal: readDutmalText(editor, message)
        });
      } else if (message.kind === "dutmal-text") {
        if (format !== "hwpx")
          throw new Error("UnsupportedDutmalTextEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        const dutmal = writeDutmalText(editor, message);
        applied = true;
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.saveForDisplay());
        reply({ kind: message.kind, requestId: message.requestId, dutmal, content: hwpxDisplay() });
      } else if (message.kind === "radio-select") {
        if (format !== "hwp5")
          throw new Error("UnsupportedRadioSelectEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.selectRadioButton(message.section, message.formNode);
        applied = true;
        reply({ kind: message.kind, content: hwp5Display() });
      } else if (message.kind === "checkbox-state") {
        if (format !== "hwpx" && format !== "hwp5")
          throw new Error("UnsupportedCheckBoxStateEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.setCheckBoxState(message.section, message.formNode, message.state);
        applied = true;
        reply({
          kind: "checkbox-state",
          content: format === "hwp5" ? hwp5Display() : hwpxDisplay()
        });
      } else if (message.kind === "form-text") {
        if (format !== "hwp5")
          throw new Error("UnsupportedFormTextEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.setFormText({
          section: message.section,
          formNode: message.formNode,
          text: message.text
        });
        applied = true;
        reply({ kind: message.kind, content: hwp5Display() });
      } else if (message.kind === "picture-resize") {
        if (format !== "hwpx" && format !== "hwp5")
          throw new Error("UnsupportedPictureResizeEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.resizePicture({
          section: message.section,
          pictureNode: message.pictureNode,
          width: message.width,
          height: message.height
        });
        applied = true;
        reply({
          kind: "picture-resize",
          content: format === "hwp5" ? hwp5Display() : hwpxDisplay()
        });
      } else if (message.kind === "picture-current-size") {
        if (format !== "hwp5")
          throw new Error("UnsupportedPictureCurrentSizeEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.setPictureCurrentSize({
          section: message.section,
          pictureNode: message.pictureNode,
          width: message.width,
          height: message.height
        });
        applied = true;
        reply({ kind: "picture-current-size", content: hwp5Display() });
      } else if (message.kind === "picture-dimensions") {
        if (format !== "hwpx")
          throw new Error("UnsupportedPictureDimensionEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.setPictureDimensions({
          section: message.section,
          pictureNode: message.pictureNode,
          display: message.display,
          original: message.original,
          current: message.current
        });
        applied = true;
        reply({ kind: "picture-dimensions", content: hwpxDisplay() });
      } else if (message.kind === "table-column-width") {
        if (format !== "hwpx" && format !== "hwp5")
          throw new Error("UnsupportedCellSizeEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        const content = format === "hwpx" ? hwpxDisplay() : hwp5Display();
        const table = content.tables?.find((row) => row.section === message.section && row.tableNode === message.tableNode);
        const plan = tableColumnWidthPlan(table, message);
        if (plan.state !== "planned")
          throw new Error(plan.error);
        editor.setCellSizes(plan.cells);
        applied = plan.cells.length !== 0;
        reply({
          kind: "table-column-width",
          content: format === "hwpx" ? hwpxDisplay() : hwp5Display()
        });
      } else if (message.kind === "cell-size") {
        if (format !== "hwpx" && format !== "hwp5")
          throw new Error("UnsupportedCellSizeEditing");
        if (!editor || !historyEnabled)
          throw new Error("EditorNotOpen");
        editor.setCellSize({
          section: message.section,
          listNode: message.listNode,
          width: message.width,
          height: message.height
        });
        applied = true;
        reply({ kind: "cell-size", content: format === "hwpx" ? hwpxDisplay() : hwp5Display() });
      } else if (message.kind === "enable") {
        if (format === "hwpx") {
          if (message.normalizeObservedCfb !== undefined)
            throw new Error("UnsupportedNormalizationFormat");
          if (message.retainObservedDocInfo !== undefined)
            throw new Error("UnsupportedObservedDocInfoFormat");
          if (!editor) {
            const next = await createHwpxEditor(module);
            try {
              next.open(bytes);
            } catch (error) {
              next.close();
              throw error;
            }
            editor = next;
          }
          if (!historyEnabled) {
            editor.enableHistoryDefault(message.history);
            historyEnabled = true;
          }
          const structureAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_split" && entry.kind === "function");
          const splitQueryAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_can_split" && entry.kind === "function");
          const mergeAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_merge" && entry.kind === "function");
          const formattingAvailable = [
            "hwpx_edit_set_character_format",
            "hwpx_edit_character_shape_ids"
          ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
          const charShapeIds = formattingAvailable ? editor.characterShapeIds() : [];
          const displayAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_character_shapes" && entry.kind === "function");
          let characterShapes = null, characterShapesError = null;
          if (displayAvailable) {
            try {
              characterShapes = editor.characterShapes();
            } catch (error) {
              characterShapesError = error.message;
            }
          }
          const cellSizeAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_cell_size" && entry.kind === "function");
          const cellSizeBatchAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_cell_sizes" && entry.kind === "function");
          const pictureDimensionsAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_set_picture_dimensions" && entry.kind === "function");
          const pictureResizeAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwpx_edit_resize_picture" && entry.kind === "function");
          const dutmalTextAvailable = [
            "hwpx_edit_inline_string_sources",
            "hwpx_edit_dutmal_text",
            "hwpx_edit_set_dutmal_text",
            "hwpx_edit_dutmal_text_max_bytes"
          ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
          const equationScriptAvailable = [
            "hwpx_edit_equation_sources",
            "hwpx_edit_equation_script",
            "hwpx_edit_set_equation_script",
            "hwpx_edit_equation_script_max_bytes",
            "hwpx_edit_history_revision"
          ].every((name) => WebAssembly.Module.exports(module).some((entry) => entry.name === name && entry.kind === "function"));
          reply({
            kind: "enable",
            paragraphBreakAvailable: editor.supportsParagraphBreaks(),
            dutmalTextAvailable,
            equationScriptAvailable,
            equationSectionCount: equationScriptAvailable ? preview.sectionCount : 0,
            charShapeCount: charShapeIds.length,
            charShapeIds,
            characterShapes,
            characterShapesError,
            historyAvailable: true,
            structureAvailable,
            splitQueryAvailable,
            mergeAvailable,
            cellSizeAvailable,
            cellSizeBatchAvailable,
            pictureDimensionsAvailable,
            pictureResizeAvailable,
            content: reusableLoad && requestSequence === requestTicket && reusableLoad.ticket === requestTicket - 1 && reusableLoad.editor === editor && reusableLoad.preview === preview && reusableLoad.bytes === bytes && reusableLoad.module === module && reusableLoad.window === documentWindow && reusableLoad.chartOlePolicy === hwpxChartOlePolicy && reusableLoad.protectionRemoved === protectionRemoved && reusableLoad.createdTablesPending === hwpxCreatedTablesPending && Object.keys(message).every((key) => ["kind", "origin", "requestId"].includes(key)) ? reusableLoad.content : hwpxDisplay()
          });
          return;
        }
        if (message.distribution !== undefined && typeof message.distribution !== "boolean")
          throw new Error("InvalidDistributionPolicy");
        if (message.normalizeObservedCfb !== undefined && typeof message.normalizeObservedCfb !== "boolean")
          throw new Error("InvalidNormalizationPolicy");
        if (message.retainObservedDocInfo !== undefined && typeof message.retainObservedDocInfo !== "boolean")
          throw new Error("InvalidObservedDocInfoPolicy");
        if (message.retainObservedDocInfo === true && editor)
          throw new Error("ObservedDocInfoRequiresFreshSession");
        if (message.normalizeObservedCfb === true && !normalizationMetadataAvailable())
          throw new Error("Hwp5NormalizationAbiUnavailable");
        editor ??= await createExperimentalHwp5Editor2(module, bytes, {
          distribution: message.distribution ?? false,
          normalizeObservedCfb: message.normalizeObservedCfb ?? false,
          retainObservedDocInfo: message.retainObservedDocInfo ?? false
        });
        if (!historyEnabled) {
          editor.enableHistoryDefault(message.history);
          historyEnabled = true;
        }
        const structureAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_split" && entry.kind === "function");
        const mergeAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_merge" && entry.kind === "function");
        let characterShapes = null, characterShapesError = null;
        try {
          characterShapes = editor.characterShapes();
        } catch (error) {
          characterShapesError = error.message;
        }
        const cellSizeAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_cell_size" && entry.kind === "function");
        const cellSizeBatchAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_cell_sizes" && entry.kind === "function");
        const pictureCurrentSizeAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_set_picture_current_size" && entry.kind === "function");
        const pictureResizeAvailable = WebAssembly.Module.exports(module).some((entry) => entry.name === "hwp5_edit_resize_picture" && entry.kind === "function");
        reply({
          kind: "enable",
          formTextAvailable: editor.supportsFormTextEdit(),
          paragraphBreakAvailable: editor.supportsParagraphBreaks(),
          charShapeCount: editor.characterShapeCount(),
          characterShapes,
          characterShapesError,
          historyAvailable: true,
          structureAvailable,
          mergeAvailable,
          cellSizeAvailable,
          cellSizeBatchAvailable,
          pictureCurrentSizeAvailable,
          pictureResizeAvailable,
          content: hwp5Display()
        });
      } else if (message.kind === "undo" || message.kind === "redo") {
        if (!editor)
          throw new Error("EditorNotOpen");
        let historyHint = null, beforeOwner = null, beforeRevision;
        if (format === "hwp5" && historyEnabled && ownerWindowProjection && typeof ownerWindowProjection === "object") {
          try {
            const h = ownerWindowProjection, o = h.owner;
            const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n < 4294967295;
            if (h.kind === "history-window-v1" && h.operation === message.kind && uint(h.beforeRevision) && uint(h.expectedRevision) && typeof h.beforeEpoch === "string" && /^[1-9][0-9]{0,19}$/.test(h.beforeEpoch) && o && [o.section, o.paragraph, o.sourceNode].every(uint) && (o.parentNode === null || uint(o.parentNode))) {
              const actual = editor.historyRevision();
              const captured = editor.captureExclusiveTextOwner(o.section, o.paragraph);
              if (actual === h.beforeRevision && captured?.window.epoch === h.beforeEpoch && captured.window.sourceNode === o.sourceNode && captured.window.parentNode === o.parentNode) {
                historyHint = h;
                beforeOwner = captured;
                beforeRevision = actual;
              }
            }
          } catch {}
        }
        const changed = message.kind === "undo" ? editor.undo() : editor.redo();
        applied = changed;
        if (changed && historyHint) {
          try {
            const o = historyHint.owner, revision = editor.historyRevision();
            const fresh = revision === historyHint.expectedRevision ? editor.readCurrentOwnerWindow(o.section, o.paragraph) : null;
            if (fresh && fresh.window.sourceNode === o.sourceNode && fresh.window.parentNode === o.parentNode && BigInt(fresh.window.epoch) > BigInt(beforeOwner.window.epoch)) {
              hwp5PreviewDirty = true;
              reply({
                kind: message.kind,
                changed,
                content: {
                  viewKind: "history-owner-window",
                  version: 1,
                  operation: message.kind,
                  beforeRevision,
                  revision,
                  beforeEpoch: beforeOwner.window.epoch,
                  epoch: fresh.window.epoch,
                  owner: { ...o },
                  ...fresh
                }
              });
              return;
            }
          } catch {}
        }
        if (format === "hwpx") {
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
          reply({ kind: message.kind, changed, content: hwpxDisplay() });
        } else {
          await refreshHwp5PreviewFallback();
          reply({ kind: message.kind, changed, content: hwp5Display() });
        }
      } else if (message.kind === "split" || message.kind === "merge") {
        if (!editor)
          throw new Error("EditorNotOpen");
        paragraphBreakIntent(message);
        if (format === "hwpx") {
          if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph >= 4294967295)
            throw new Error("InvalidParagraphIndex");
          const target = { ...message, paragraph: message.paragraph + 1 };
          if (message.kind === "split") {
            if (message.anchored !== undefined && typeof message.anchored !== "boolean")
              throw new Error("InvalidAnchorMode");
            applyParagraphSplit(editor, target, message, true);
          } else if (message.rightParagraph !== undefined) {
            if (!Number.isInteger(message.rightParagraph) || message.rightParagraph < 0 || message.rightParagraph >= 4294967295)
              throw new Error("InvalidParagraphIndex");
            editor.mergeParagraphPair({ ...target, rightParagraph: message.rightParagraph + 1 });
          } else
            editor.mergeParagraph(target);
          applied = true;
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
          const content = hwpxDisplay();
          const splitParagraph = message.kind === "split" ? content.paragraphs.find((row) => row.section === message.section && row.paragraph === message.paragraph)?.nextMergeParagraph : undefined;
          reply({
            kind: message.kind,
            content,
            ...message.kind === "split" ? {
              splitTarget: Number.isInteger(splitParagraph) ? { section: message.section, paragraph: splitParagraph } : null
            } : {}
          });
          return;
        }
        if (message.kind === "merge" && message.rightParagraph !== undefined)
          throw new Error("UnsupportedMergeTarget");
        if (message.kind === "split")
          applyParagraphSplit(editor, message, message);
        else
          editor.mergeParagraph(message);
        applied = true;
        await refreshHwp5PreviewFallback();
        const content = hwp5Display();
        const right = message.kind === "split" ? content.paragraphs.find((row) => row.section === message.section && row.paragraph === message.paragraph + 1 && row.editable) : null;
        reply({
          kind: message.kind,
          content,
          ...message.kind === "split" ? { splitTarget: right ? { section: right.section, paragraph: right.paragraph } : null } : {}
        });
      } else if (message.kind === "splice" || message.kind === "format") {
        if (!editor)
          throw new Error("EditorNotOpen");
        if (format === "hwpx") {
          if (message.rangePolicy && message.rangePolicy !== "reject")
            throw new Error("InvalidRangePolicy");
          if (!Number.isInteger(message.startUnit) || !Number.isInteger(message.endUnit) || message.endUnit < message.startUnit)
            throw new Error("InvalidTextPosition");
          const plainTextSplice = message.kind === "splice" && editor.canEdit(message.section, message.paragraph + 1);
          if (!plainTextSplice)
            displayResources.invalidate();
          if (message.kind === "format") {
            editor.setCharacterFormat({ ...message, paragraph: message.paragraph + 1 });
          } else if (plainTextSplice) {
            editor.splice(message.section, message.paragraph + 1, message.startUnit, message.endUnit - message.startUnit, message.text);
          } else if (spliceFormulaResultText(editor, module, message)) {} else {
            const target = hwpxFieldRangeTarget(editor, hwpxCreatedTablesPending, message.section, message.paragraph + 1, message.startUnit, message.endUnit);
            if (target) {
              editor.spliceFieldLabel(message.section, message.paragraph + 1, target.beginElement, message.startUnit, message.endUnit - message.startUnit, message.text);
            } else if (outsideFieldRange(message.section, message.paragraph + 1, message.startUnit, message.endUnit)) {
              editor.splice(message.section, message.paragraph + 1, message.startUnit, message.endUnit - message.startUnit, message.text);
            } else if (anchorView(message.section, message.paragraph + 1) !== null) {
              editor.spliceAnchored(message.section, message.paragraph + 1, message.startUnit, message.endUnit - message.startUnit, message.text);
            } else {
              const targets = editor.fieldLabels(message.section, message.paragraph + 1);
              if (targets.length === 0) {
                editor.splice(message.section, message.paragraph + 1, message.startUnit, message.endUnit - message.startUnit, message.text);
              } else {
                throw new Error("UnsupportedFieldLabelRange");
              }
            }
          }
          applied = true;
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
          reply({ kind: message.kind, content: hwpxDisplay() });
          return;
        }
        if (message.kind === "splice" && message.reference !== undefined) {
          editor.spliceCurrent(message);
          applied = true;
          captureTextDelta();
          if (projectedOwner()) {
            reply({ kind: message.kind, content: projectedOwner() });
            return;
          }
          await refreshHwp5PreviewFallback();
          reply({ kind: message.kind, content: hwp5Display() });
          return;
        }
        if (message.kind === "splice") {
          editor.splice(message);
          captureTextDelta();
        } else
          editor.setCharacterFormat(message);
        applied = true;
        if (historyEnabled && editor.supportsCurrentTextPreview?.()) {
          reply({ kind: message.kind, content: projectedOwner() ?? hwp5Display() });
          return;
        }
        const raw = editor.copyText(message.section, message.paragraph);
        const p = preview.sections[message.section].paragraphs[message.paragraph];
        const sectionHasFields = preview.sections[message.section].paragraphs.some((paragraph) => paragraph.tokens.some((t) => t.type === "control" && t.code === 3));
        if (sectionHasFields || p.tokens.some((t) => t.type === "control" && t.code !== 13)) {
          await refreshHwp5PreviewFallback();
        } else {
          const text = new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true }).decode(raw.subarray(0, -2));
          preview.sections[message.section].paragraphs[message.paragraph] = raw.length === 0 ? p : {
            ...p,
            text,
            textPresent: true,
            declaredUnits: raw.length / 2,
            tokens: [
              { type: "text", startUnit: 0, text, raw: raw.subarray(0, -2) },
              {
                type: "control",
                startUnit: raw.length / 2 - 1,
                code: 13,
                raw: raw.subarray(-2)
              }
            ]
          };
        }
        reply({ kind: message.kind, content: hwp5Display() });
      } else
        throw new Error("UnknownPreviewCommand");
    } catch (error) {
      mutationUncertain = mutationUncertain || ["MutationUncertain", "HistoryMutationUncertain"].includes(error?.message);
      if (mutationUncertain)
        historyPoisoned = true;
      delete message.password;
      const availableSectionsPreviewAvailable = message.kind === "load" && message.availableSectionsOnly !== true && format === "hwp5" && error.message === "SectionCountMismatch" && availableSectionsCapability(module);
      const availableSectionCopyAvailable = message.kind === "load" && message.availableSectionsOnly !== true && message.availableSectionCopy !== true && format === "hwp5" && error.message === "SectionCountMismatch" && availableSectionCopyCapability(module);
      const passwordRequired = message.kind === "load" && (format === "hwpx" && error.message === "EncryptedDocument" || format === "hwp5" && error.message === "UnsupportedEncryption");
      const queryIdentity = [
        "chart-points",
        "chart-series-text",
        "chart-rich-text",
        "chart-display"
      ].includes(message.kind) ? { requestId: message.requestId, section: message.section, wrapper: message.wrapper } : ["query-edit-range", "query-split-range"].includes(message.kind) ? {
        requestId: message.requestId,
        section: message.section,
        paragraph: message.paragraph,
        startUnit: message.startUnit,
        endUnit: message.endUnit
      } : {};
      const currentIdentity = [
        "query-current-references",
        "query-current-source-references",
        "query-current-text",
        "query-created-tables",
        "splice-current"
      ].includes(message.kind) ? { requestId: message.requestId } : {};
      reply({
        kind: message.kind,
        applied,
        ...availableSectionsPreviewAvailable ? { availableSectionsPreviewAvailable: true } : {},
        ...availableSectionCopyAvailable ? { availableSectionCopyAvailable: true } : {},
        error: error.message || String(error),
        ...queryIdentity,
        ...currentIdentity,
        ...dutmalQueryIdentity(message),
        ...equationQueryIdentity(message),
        ...passwordRequired ? { passwordRequired: true } : {}
      });
    } finally {
      try {
        reader?.close();
      } catch (error) {
        response = minimalError(error);
      }
      response ??= minimalError(new Error("MissingRuntimeReply"));
      if (nativeTextDelta && !response.error)
        response = { ...response, nativeTextDelta };
      try {
        response = structuredClone(response);
      } catch (error) {
        response = minimalError(error);
      }
      if (message.kind === "load" && format === "hwpx" && !response.error && response.content && !historyEnabled && editor && message.password === undefined && requestSequence === requestTicket) {
        try {
          loadProjection = {
            ticket: requestTicket,
            editor,
            preview,
            bytes,
            module,
            window: documentWindow,
            chartOlePolicy: hwpxChartOlePolicy,
            protectionRemoved,
            createdTablesPending: hwpxCreatedTablesPending,
            content: structuredClone(response.content)
          };
        } catch {
          loadProjection = null;
        }
      }
      if (atomicOutcome)
        response = {
          ...response,
          formattingNativeCode: atomicOutcome.nativeCode,
          formattingRefreshRequired: atomicOutcome.refreshRequired === true,
          changed: atomicOutcome.changed
        };
      const revision = response.historyRevision;
      const changed = typeof response.changed === "boolean" ? response.changed : typeof revision === "number" && typeof lastHistoryRevision === "number" ? revision !== lastHistoryRevision : applied ? null : false;
      displayResources.finishRequest(Boolean(response.error), response);
      outcomes.set(response, atomicOutcome ? { application: atomicOutcome.application, changed: atomicOutcome.changed } : {
        application: historyPoisoned || mutationUncertain || ["MutationUncertain", "HistoryMutationUncertain"].includes(response.error) ? "unknown" : applied && changed !== false ? "applied" : "unapplied",
        changed
      });
      if (typeof revision === "number")
        lastHistoryRevision = revision;
      return response;
    }
  }
  let tail = Promise.resolve();
  let terminal = false;
  let loaded = false;
  let disposal;
  function clear() {
    hwp5PreviewDirty = false;
    displayResources.reset();
    try {
      editor?.close();
    } finally {
      if (protectionRemoved)
        bytes?.fill(0);
      module = bytes = preview = editor = format = undefined;
      lastHistoryRevision = undefined;
      historyPoisoned = historyEnabled = hwpxChartOlePolicy = protectionRemoved = hwpxCreatedTablesPending = false;
      hwp5StyleOpenError = documentWindow = null;
    }
  }
  return {
    outcome(reply) {
      return { ...outcomes.get(reply) };
    },
    request(input, admission, ownerWindowProjection = false) {
      if (admission !== undefined && typeof admission !== "function")
        return Promise.reject(Error("InvalidRuntimeAdmission"));
      const requestTicket = ++requestSequence;
      const reusableLoad = loadProjection;
      loadProjection = null;
      if (terminal)
        return Promise.reject(new Error("RuntimeDisposed"));
      let message;
      try {
        message = copyRuntimeMessage(input);
      } catch (error) {
        displayResources.invalidate();
        return Promise.reject(error);
      }
      const secret = message.password;
      const task = tail.then(async () => {
        if (terminal)
          throw new Error("RuntimeDisposed");
        if (message.kind === "load") {
          if (loaded && !allowReload)
            throw new Error("RuntimeDocumentAlreadyLoaded");
          hwp5PreviewDirty = false;
          loaded = true;
          lastHistoryRevision = undefined;
        }
        admission?.();
        return execute(message, requestTicket, reusableLoad, ownerWindowProjection);
      });
      const settled = task.finally(() => {
        if (ArrayBuffer.isView(secret))
          new Uint8Array(secret.buffer, secret.byteOffset, secret.byteLength).fill(0);
        else if (secret instanceof ArrayBuffer)
          new Uint8Array(secret).fill(0);
        delete message.password;
      });
      tail = settled.then(() => {
        return;
      }, () => {
        return;
      });
      return settled;
    },
    dispose() {
      if (!disposal) {
        terminal = true;
        requestSequence++;
        loadProjection = null;
        disposal = tail.then(clear);
      }
      return disposal;
    }
  };
}

// packages/core/src/state/owned.ts
function copyOwned(value, observation = false, seen = new Set) {
  if (observation && value !== null && typeof value === "object" && immutableObservations.has(value))
    return value;
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "undefined")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("InvalidNumber");
    return value;
  }
  if (typeof value !== "object")
    throw new TypeError("UnsupportedPayload");
  if (typeof SharedArrayBuffer !== "undefined" && (value instanceof SharedArrayBuffer || ArrayBuffer.isView(value) && value.buffer instanceof SharedArrayBuffer))
    throw new TypeError("SharedBufferUnsupported");
  if (value instanceof Uint8Array)
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  if (value instanceof ArrayBuffer)
    return value.slice(0);
  if (seen.has(value))
    throw new TypeError("CyclicPayload");
  seen.add(value);
  try {
    if (observation && value instanceof Map)
      return new Map([...value].map(([k, v]) => [copyOwned(k, true, seen), copyOwned(v, true, seen)]));
    if (observation && value instanceof Set)
      return new Set([...value].map((v) => copyOwned(v, true, seen)));
    if (Array.isArray(value))
      return value.map((v) => copyOwned(v, observation, seen));
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null)
      throw new TypeError("UnsupportedPayload");
    const result = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string")
        throw new TypeError("UnsupportedPayload");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!("value" in descriptor))
        throw new TypeError("AccessorPayloadUnsupported");
      if (observation && /^(password|plaintext|decryptedBytes)$/i.test(key))
        continue;
      result[key] = copyOwned(descriptor.value, observation, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}
function freezeDTO(value) {
  if (value && typeof value === "object" && !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value) && !(value instanceof Map) && !(value instanceof Set)) {
    if (immutableObservations.has(value)) {
      return value;
    }
    for (const child of Object.values(value))
      freezeDTO(child);
    Object.freeze(value);
  }
  return value;
}
var immutableObservations = new WeakSet;
function isOwnedImmutableObservation(value) {
  return value !== null && typeof value === "object" && immutableObservations.has(value);
}
function ownObservation(value) {
  if (value && typeof value === "object" && immutableObservations.has(value))
    return () => value;
  const owned = copyOwned(value, true);
  const mutable = (item) => item instanceof ArrayBuffer || ArrayBuffer.isView(item) || item instanceof Map || item instanceof Set;
  const build = (item) => {
    if (item === null || typeof item !== "object")
      return item;
    if (immutableObservations.has(item))
      return item;
    const node = Array.isArray(item) ? new Array(item.length) : Object.create(null);
    for (const [key, child] of Object.entries(item)) {
      if (mutable(child)) {
        Object.defineProperty(node, key, {
          enumerable: true,
          get: () => freezeDTO(copyOwned(child, true))
        });
      } else
        Object.defineProperty(node, key, { enumerable: true, value: build(child) });
    }
    Object.freeze(node);
    immutableObservations.add(node);
    return node;
  };
  if (mutable(owned))
    return () => freezeDTO(copyOwned(owned, true));
  const stable = build(owned);
  return () => stable;
}

// packages/core/src/internal/worker-reader-data-runtime.ts
function createWorkerReaderDataRuntime(options) {
  const backend = createReaderRuntime(options);
  return {
    async request(message, ownerWindowProjection = false) {
      const raw = await backend.request(message, undefined, ownerWindowProjection);
      return ownObservation({ ...raw, meta: backend.outcome(raw) })();
    },
    dispose() {
      return backend.dispose();
    }
  };
}

// packages/core/src/internal/worker-resource-reply.ts
function workerResourceReply(id, requestKind, reply) {
  if (!isOwnedImmutableObservation(reply) || reply.kind !== requestKind || !["picture-bytes", "table-background-bytes"].includes(reply.kind) || reply.error !== undefined || typeof Object.getOwnPropertyDescriptor(reply, "bytes")?.get !== "function")
    return { envelope: { id, reply } };
  const wire = { ...reply };
  const bytes = wire.bytes;
  if (bytes instanceof Uint8Array && bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength)
    return { envelope: { id, reply: wire }, transfer: [bytes.buffer] };
  return { envelope: { id, reply: wire } };
}

// packages/core/src/worker.ts
var scope = globalThis;
var runtime;
var queue = Promise.resolve();
scope.onmessage = (event) => {
  const { id, message, viewProjection } = event.data ?? {};
  queue = queue.then(async () => {
    try {
      if (!Number.isSafeInteger(id) || !message || typeof message.kind !== "string")
        throw Error("InvalidRuntimeEnvelope");
      if (message.kind === "initialize-runtime") {
        if (runtime)
          throw Error("RuntimeAlreadyInitialized");
        if (!(message.wasmModule instanceof WebAssembly.Module))
          throw Error("InvalidWasmModule");
        runtime = createWorkerReaderDataRuntime({
          wasmModule: message.wasmModule,
          referenceScope: message.referenceScope
        });
        scope.postMessage({ id, reply: { kind: message.kind } });
      } else {
        if (!runtime)
          throw Error("RuntimeNotInitialized");
        const outgoing = workerResourceReply(id, message.kind, await runtime.request(message, viewProjection === "owner-window-v1" ? true : typeof viewProjection === "object" && viewProjection?.kind === "history-window-v1" ? viewProjection : false));
        if (outgoing.transfer)
          scope.postMessage(outgoing.envelope, outgoing.transfer);
        else
          scope.postMessage(outgoing.envelope);
      }
    } catch (error) {
      scope.postMessage({
        id,
        transportError: error instanceof Error ? error.message : String(error)
      });
    }
  });
};
