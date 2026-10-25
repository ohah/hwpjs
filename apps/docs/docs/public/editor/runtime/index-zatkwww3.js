
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

var availableSectionExports = Object.freeze(["hwp5_text_read_available", "hwp5_text_declared_sections", "hwp5_text_distribution"]);
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

var availableSectionCopyExports = Object.freeze(["hwp5_edit_open_available_section_copy", "hwp5_edit_available_section_copy_info"]);
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
  return { normalized: true, historyBaseline: "available-sections-copy", deviations: null, sectionInventory: inventory, missingContentRecovered: false };
}

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

function characterUnderlineArg(kind) {
  const values = ["none", "bottom", "center", "top"];
  const value = values.indexOf(kind);
  if (value < 0)
    throw new TypeError("InvalidCharacterUnderlineKind");
  return value;
}

export { retainedTextView, sourceTextChange, sourceDisplayPosition, availableSectionExports, sectionInventory, checkedSectionInventory, validateAvailableSectionCopyOption, decodeAvailableSectionCopyInfo, availableSectionCopyCapability, availableSectionCopyRequest, characterPropertyArgs, paragraphAlignmentKey, paragraphAlignmentValue, paragraphAlignmentLabel, characterUnderlineArg };

