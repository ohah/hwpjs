// ../final-source-r2/packages/core/src/internal/native-runtime-origin.ts
function allowsOwnerWindowProjection(contract) {
  return contract?.contract === "hwp5-exclusive-text-delta-v1" && (contract.sha256 === "d849a4b22357e62d2425c3f1632edc07f2948ac18ce6d97009aede9d2b6cb1eb" || contract.sha256 === "bd095cdf56892d5b5708a567ca91ae271846a3949bfc41c3a717bdee6513684f" || contract.sha256 === "ede6256ef063765cfb1f4489d2bece3a971aa715041c993fec87d4eb374855fa");
}
var uint = (n) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) < 4294967295;
var epoch = (s) => typeof s === "string" && /^[1-9][0-9]{0,19}$/.test(s) && BigInt(s) <= 0xffffffffffffffffn;
function canonicalRuntimeDescriptors(runtime, request, dispose, prototype) {
  const a = Object.getOwnPropertyDescriptor(runtime, "request"), b = Object.getOwnPropertyDescriptor(runtime, "dispose");
  return Object.getPrototypeOf(runtime) === prototype && !!a && !!b && "value" in a && "value" in b && a.value === request && b.value === dispose;
}
function nativeOrigin(kind, reply, context, sequence, contract, authority) {
  if (!contract || !context || !authority() || reply.error || !uint(reply.historyRevision))
    return;
  const ctx = Object.freeze({ ...context });
  const content = reply.content;
  if (content?.viewKind === "history-owner-window") {
    const p = content, { window: w, reference: r, owner: o } = p;
    if (!allowsOwnerWindowProjection(contract) || !["undo", "redo"].includes(kind) || p.version !== 1 || p.operation !== kind || reply.changed !== true || reply.meta?.application !== "applied" || reply.meta?.changed !== true || !uint(p.beforeRevision) || p.beforeRevision === p.revision || p.revision !== reply.historyRevision || !epoch(p.beforeEpoch) || !epoch(p.epoch) || BigInt(p.epoch) <= BigInt(p.beforeEpoch) || !o || !uint(o.section) || !uint(o.paragraph) || !uint(o.sourceNode) || o.parentNode !== null && !uint(o.parentNode) || !r || r.kind !== "original" || typeof r.scope !== "string" || !r.scope || r.epoch !== p.epoch || r.section !== o.section || r.id !== String(o.sourceNode) || w?.epoch !== p.epoch || w.section !== o.section || w.sourceNode !== o.sourceNode || w.parentNode !== o.parentNode)
      return;
    return Object.freeze({
      kind: "history-window",
      context: ctx,
      sequence,
      referenceScope: r.scope,
      nativeEpoch: p.epoch,
      nativeRevision: p.revision,
      beforeEpoch: p.beforeEpoch,
      beforeRevision: p.beforeRevision,
      owner: Object.freeze({ ...o }),
      historyWindowDelta: content,
      authority
    });
  }
  if (content?.viewKind === "owner-window-patch") {
    const { receipt: r, window: w, reference: ref } = content;
    if (!["splice", "splice-current"].includes(kind) || reply.meta?.application !== "applied" || reply.meta?.changed !== true || r?.exclusive !== true || r.version !== 1 || !epoch(r.beforeEpoch) || !epoch(r.epoch) || BigInt(r.epoch) <= BigInt(r.beforeEpoch) || !uint(r.beforeRevision) || r.revision !== reply.historyRevision || !ref || ref.kind !== "original" || typeof ref.scope !== "string" || ref.epoch !== r.epoch || ref.id !== String(r.sourceNode) || ref.section !== r.section || w?.epoch !== r.epoch || w.sourceNode !== r.sourceNode || w.parentNode !== r.parentNode || w.section !== r.section)
      return;
    const owner = Object.freeze({
      section: r.section,
      paragraph: r.paragraph,
      sourceNode: r.sourceNode,
      parentNode: r.parentNode
    });
    return Object.freeze({
      kind: "exclusive-text",
      context: ctx,
      sequence,
      referenceScope: ref.scope,
      nativeEpoch: r.epoch,
      nativeRevision: r.revision,
      beforeEpoch: r.beforeEpoch,
      beforeRevision: r.beforeRevision,
      owner,
      ownerWindowDelta: content,
      authority
    });
  }
  if (content?.format !== "hwp5" || content.window || content.viewKind || !Array.isArray(content.paragraphs))
    return;
  if (reply.meta?.changed === false && !["load", "enable", "refresh"].includes(kind))
    return;
  const refs = content.paragraphs.map((p) => p.currentReference).filter(Boolean);
  const ref = refs[0];
  if (!ref || !epoch(ref.epoch) || typeof ref.scope !== "string" || !ref.scope || refs.some((r) => r.scope !== ref.scope || r.epoch !== ref.epoch))
    return;
  const packet = reply.nativeTextDelta, r = packet?.receipt, w = packet?.window, b = packet?.before;
  if (packet && ["splice", "splice-current"].includes(kind) && reply.meta?.application === "applied" && reply.meta?.changed === true && r?.version === 1 && r.exclusive === true && epoch(r.beforeEpoch) && epoch(r.epoch) && BigInt(r.epoch) > BigInt(r.beforeEpoch) && uint(r.beforeRevision) && r.revision === reply.historyRevision && w?.epoch === r.epoch && b?.epoch === r.beforeEpoch && w.sourceNode === r.sourceNode && b.sourceNode === r.sourceNode && w.parentNode === r.parentNode && b.parentNode === r.parentNode && packet.reference?.scope === ref.scope && packet.reference?.epoch === r.epoch && packet.reference?.id === String(r.sourceNode)) {
    return Object.freeze({
      kind: "exclusive-text",
      context: ctx,
      sequence,
      referenceScope: ref.scope,
      nativeEpoch: r.epoch,
      nativeRevision: r.revision,
      beforeEpoch: r.beforeEpoch,
      beforeRevision: r.beforeRevision,
      owner: Object.freeze({
        section: r.section,
        paragraph: r.paragraph,
        sourceNode: r.sourceNode,
        parentNode: r.parentNode
      }),
      fullSnapshotDelta: packet,
      authority
    });
  }
  return Object.freeze({
    kind: "full-baseline",
    context: ctx,
    sequence,
    referenceScope: ref.scope,
    nativeEpoch: ref.epoch,
    nativeRevision: reply.historyRevision,
    owner: null,
    authority
  });
}
function sameRequestContext(a, b) {
  return !!b && ["editorId", "documentId", "generation", "requestId", "operationRevision"].every((k) => a[k] === b[k]);
}
var runtimeOrigins = new WeakMap;
function bindNativeRuntimeOrigin(runtime, read) {
  runtimeOrigins.set(runtime, read);
}
function consumeNativeRuntimeOrigin(runtime, reply, context) {
  return runtimeOrigins.get(runtime)?.(reply, context);
}

// ../final-source-r2/packages/core/src/internal/runtime-admission.ts
var ports = new WeakMap;

class RuntimeAdmissionRejected extends Error {
  constructor(error) {
    super(error instanceof Error ? error.message : String(error));
    this.name = "RuntimeAdmissionRejected";
  }
}
function bindRuntimeAdmission(runtime, request, transportValid) {
  const { request: originalRequest, dispose: originalDispose } = runtime;
  let tainted = false;
  const valid = () => {
    if (!canonicalRuntimeDescriptors(runtime, originalRequest, originalDispose, Object.prototype))
      tainted = true;
    return !tainted && transportValid();
  };
  ports.set(runtime, { valid, request });
}
function hasRuntimeAdmission(runtime) {
  try {
    return !!runtime && ports.get(runtime)?.valid() === true;
  } catch {
    return false;
  }
}
function requestAtRuntimeAdmission(runtime, message, context, guard, projection = false) {
  const port = ports.get(runtime);
  const admission = () => {
    try {
      if (!port?.valid())
        throw Error("UnsupportedAtomicRuntime");
      guard();
    } catch (error) {
      throw new RuntimeAdmissionRejected(error);
    }
  };
  admission();
  return port.request(message, context, admission, projection);
}

// ../final-source-r2/js/font-face-identity.mjs
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

// ../final-source-r2/js/font-faces.mjs
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

// ../final-source-r2/js/character-font-args.mjs
function characterFontArgs(language, fontId) {
  const index = FONT_LANGUAGES.indexOf(language);
  if (index < 0)
    throw new RangeError("InvalidCharacterFontLanguage");
  if (!Number.isInteger(fontId) || fontId < 0 || fontId > 4294967295)
    throw new RangeError("InvalidFontId");
  return [index, fontId];
}

// ../final-source-r2/js/character-font-name-args.mjs
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

// ../final-source-r2/web/preview/text-offsets.mjs
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
function sourceTextChange(change, offsets) {
  if (!offsets)
    return change;
  const map = (unit) => {
    const row = offsets.findLast((r) => r.at <= unit);
    if (!row)
      throw new RangeError("InvalidDisplayPosition");
    return row.source + unit - row.at;
  };
  return { ...change, startUnit: map(change.startUnit), endUnit: map(change.endUnit) };
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

// ../final-source-r2/js/paragraph-margin-args.mjs
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

// ../final-source-r2/js/paragraph-spacing-args.mjs
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

// ../final-source-r2/web/preview/paragraph-alignments.mjs
var paragraphAlignments = Object.freeze([
  { value: 0, key: "JUSTIFY", label: "양쪽 정렬" },
  { value: 1, key: "LEFT", label: "왼쪽 정렬" },
  { value: 2, key: "RIGHT", label: "오른쪽 정렬" },
  { value: 3, key: "CENTER", label: "가운데 정렬" },
  { value: 4, key: "DISTRIBUTE", label: "배분 정렬" },
  { value: 5, key: "DISTRIBUTE_SPACE", label: "공백 배분" }
].map(Object.freeze));
var paragraphAlignmentKey = (value) => paragraphAlignments.find((entry) => entry.value === value)?.key ?? null;
var paragraphAlignmentValue = (key) => paragraphAlignments.find((entry) => entry.key === key)?.value;
var paragraphAlignmentLabel = (value) => paragraphAlignments.find((entry) => entry.value === value)?.label;

// ../final-source-r2/js/hwp5-section-inventory.mjs
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

// ../final-source-r2/js/hwp5-available-section-copy.mjs
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

// ../final-source-r2/web/preview/hwp5-available-copy-preview.mjs
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

// ../final-source-r2/js/character-property-args.mjs
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

// ../final-source-r2/js/character-underline-args.mjs
function characterUnderlineArg(kind) {
  const values = ["none", "bottom", "center", "top"];
  const value = values.indexOf(kind);
  if (value < 0)
    throw new TypeError("InvalidCharacterUnderlineKind");
  return value;
}

// ../final-source-r2/js/character-color-args.mjs
function characterColorArg(color) {
  const value = parseCharacterColor(color);
  if (value === null)
    throw new TypeError("InvalidCharacterColor");
  return value;
}
function parseCharacterColor(color) {
  return typeof color === "string" && color.length === 7 && /^#[0-9a-f]{6}$/i.test(color) ? Number.parseInt(color.slice(1), 16) : null;
}

export { allowsOwnerWindowProjection, canonicalRuntimeDescriptors, nativeOrigin, sameRequestContext, bindNativeRuntimeOrigin, consumeNativeRuntimeOrigin, RuntimeAdmissionRejected, bindRuntimeAdmission, hasRuntimeAdmission, requestAtRuntimeAdmission, FONT_LANGUAGES, validFontFaceOrder, decodeFontFaces, characterFontArgs, characterFontNameArgs, retainedTextView, sourceTextChange, sourceDisplayPosition, paragraphMarginArgs, paragraphSpacingTypes, paragraphSpacingArgs, paragraphAlignmentKey, paragraphAlignmentValue, paragraphAlignmentLabel, availableSectionExports, sectionInventory, checkedSectionInventory, validateAvailableSectionCopyOption, decodeAvailableSectionCopyInfo, availableSectionCopyCapability, availableSectionCopyRequest, characterPropertyArgs, characterUnderlineArg, characterColorArg };

//# debugId=AC594DE2AD2EF15A64756E2164756E21
