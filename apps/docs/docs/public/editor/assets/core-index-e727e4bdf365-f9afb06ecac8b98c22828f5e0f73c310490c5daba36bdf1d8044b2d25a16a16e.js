import {
  consumeNativeRuntimeOrigin,
  RuntimeAdmissionRejected,
  hasRuntimeAdmission,
  requestAtRuntimeAdmission,
  BORDER_LINE_STYLES2,
  BORDER_WIDTHS_HUNDREDTH_MM2,
  FONT_LANGUAGES,
  validFontFaceOrder,
  characterFontNameArgs,
  sourceTextChange,
  paragraphMarginArgs,
  paragraphSpacingArgs,
  paragraphAlignmentKey,
  paragraphAlignmentValue,
  availableSectionCopyRequest,
  characterPropertyArgs,
  characterUnderlineArg,
  characterColorArg
} from "./core-index-xd463d00-6f802b2f98b4-f9afb06ecac8b98c22828f5e0f73c310490c5daba36bdf1d8044b2d25a16a16e.js";
import {
  isPlainOwnerBaseline,
  mergeExclusiveOwnerWindow,
  bindGeometryProjectionPort,
  createGeometryEvidenceController
} from "./core-index-xj4z0gra-631959d43c92-f9afb06ecac8b98c22828f5e0f73c310490c5daba36bdf1d8044b2d25a16a16e.js";
import {
  copyOwned,
  freezeDTO,
  isPromiseLike,
  discardPromise,
  isOwnedImmutableObservation,
  ownObservation
} from "./core-index-09xbv2b9-d6497b28f901-f9afb06ecac8b98c22828f5e0f73c310490c5daba36bdf1d8044b2d25a16a16e.js";

// packages/core/src/commands/formatting-resource-intent.ts
var styles = new Set(BORDER_LINE_STYLES2);
var widths = new Set(BORDER_WIDTHS_HUNDREDTH_MM2);
var hatch = new Set(["HORIZONTAL", "VERTICAL", "BACK_SLASH", "SLASH", "CROSS", "CROSS_DIAGONAL"]);
function object(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw Error("InvalidFormattingResource");
  return value;
}
function keys(value, allowed) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      throw Error(`UnknownFormattingField:${key}`);
}
function integer(value, minimum, maximum) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum)
    throw Error("InvalidFormattingResourceValue");
}
function rgb(value) {
  integer(value, 0, 16777215);
}
function validateBorderPatch(value) {
  const border = object(value);
  keys(border, ["left", "right", "top", "bottom"]);
  let present = false;
  for (const edge of Object.values(border)) {
    if (edge === undefined)
      continue;
    const row = object(edge);
    keys(row, ["style", "widthHundredthMm", "color"]);
    if (row.style !== undefined) {
      if (!styles.has(row.style))
        throw Error("UnsupportedBorderLineStyle");
      present = true;
    }
    if (row.widthHundredthMm !== undefined) {
      if (!widths.has(row.widthHundredthMm))
        throw Error("UnsupportedBorderWidth");
      present = true;
    }
    if (row.color !== undefined) {
      rgb(row.color);
      present = true;
    }
  }
  return present;
}
function validateBackgroundPatch(value) {
  const row = object(value);
  switch (row.kind) {
    case "none":
      keys(row, ["kind"]);
      return;
    case "solid":
      keys(row, ["kind", "color", "hatchColor"]);
      rgb(row.color);
      if (row.hatchColor !== undefined)
        rgb(row.hatchColor);
      return;
    case "hatch":
      keys(row, ["kind", "faceColor", "hatchColor", "style"]);
      rgb(row.faceColor);
      rgb(row.hatchColor);
      if (!hatch.has(row.style))
        throw Error("UnsupportedBackgroundHatch");
      return;
    case "linear":
      keys(row, ["kind", "colors", "angle", "centerX", "centerY", "step", "stepCenter"]);
      if (!Array.isArray(row.colors) || row.colors.length !== 2)
        throw Error("UnsupportedBackgroundStops");
      for (const color of row.colors)
        rgb(color);
      integer(row.angle, 0, 359);
      for (const name of ["centerX", "centerY", "step", "stepCenter"])
        integer(row[name], 0, 100);
      return;
    default:
      throw Error("UnsupportedBackgroundKind");
  }
}
var BORDER_LINE_STYLES = Object.freeze([...styles]);
var BORDER_WIDTHS_HUNDREDTH_MM = Object.freeze([...widths]);
var BACKGROUND_HATCH_STYLES = Object.freeze([...hatch]);

// packages/core/src/commands/character-formatting-patch.ts
var characterLineStyles = [
  "SOLID",
  "DASH",
  "DOT",
  "DASH_DOT",
  "DASH_DOT_DOT",
  "LONG_DASH",
  "CIRCLE",
  "DOUBLE_SLIM",
  "SLIM_THICK",
  "THICK_SLIM",
  "SLIM_THICK_SLIM",
  "WAVE",
  "DOUBLEWAVE",
  "THICK3D",
  "THICKREV3D",
  "3D",
  "REV3D"
];
var lineStyles = new Set(characterLineStyles);
function record(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    throw Error("InvalidFormattingPatch");
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key))
      throw Error("UnknownFormattingField");
    if (!("value" in Object.getOwnPropertyDescriptor(value, key)))
      throw Error("InvalidFormattingPatch");
  }
  return value;
}
function integer2(value, lo, hi) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < lo || value > hi)
    throw Error("InvalidCharacterFormattingValue");
}
function rgb2(value) {
  integer2(value, 0, 16777215);
}
function choice(value, values) {
  if (typeof value !== "string" || !values.includes(value))
    throw Error("UnsupportedCharacterFormattingValue");
}
function boolean(value) {
  if (typeof value !== "boolean")
    throw Error("InvalidCharacterFormattingValue");
}
function validateCharacterFormattingPatch(value) {
  const c = record(value, [
    "size",
    "bold",
    "italic",
    "textColor",
    "fonts",
    "ratio",
    "charSpacing",
    "relativeSize",
    "offset",
    "underline",
    "strike",
    "shade",
    "outlineKind",
    "effects",
    "shadow",
    "border",
    "background"
  ]);
  if (c.size !== undefined)
    integer2(c.size, 0, 409600);
  for (const key of ["bold", "italic"])
    if (c[key] !== undefined)
      boolean(c[key]);
  if (c.textColor !== undefined)
    rgb2(c.textColor);
  if (c.fonts !== undefined) {
    const fonts = record(c.fonts, FONT_LANGUAGES);
    for (const language of FONT_LANGUAGES) {
      if (fonts[language] === undefined)
        continue;
      const f = record(fonts[language], ["id", "name"]);
      if (f.id !== undefined === (f.name !== undefined))
        throw Error("InvalidCharacterFontIntent");
      if (f.id !== undefined)
        integer2(f.id, 0, 4294967295);
      else
        characterFontNameArgs(language, f.name);
    }
  }
  for (const [key, lo, hi] of [
    ["ratio", 50, 200],
    ["charSpacing", -50, 50],
    ["relativeSize", 10, 250],
    ["offset", -100, 100]
  ]) {
    if (c[key] === undefined)
      continue;
    const metrics = record(c[key], FONT_LANGUAGES);
    for (const v of Object.values(metrics))
      if (v !== undefined)
        integer2(v, lo, hi);
  }
  for (const key of ["underline", "strike"]) {
    if (c[key] === undefined)
      continue;
    const d = record(c[key], key === "underline" ? ["kind", "style", "color"] : ["enabled", "style", "color"]);
    if (d.color !== undefined)
      rgb2(d.color);
    if (d.style !== undefined && !lineStyles.has(d.style))
      throw Error("UnsupportedCharacterLineStyle");
    if (key === "underline" && d.kind !== undefined)
      choice(d.kind, ["none", "bottom", "center", "top"]);
    if (key === "strike" && d.enabled !== undefined)
      boolean(d.enabled);
  }
  if (c.shade !== undefined) {
    const s = record(c.shade, ["kind", "color"]);
    choice(s.kind, ["none", "color"]);
    if (s.kind === "none") {
      if (s.color !== undefined)
        throw Error("InvalidCharacterShade");
    } else
      rgb2(s.color);
  }
  if (c.outlineKind !== undefined)
    choice(c.outlineKind, ["none", "solid", "dot", "thick", "dash", "dash_dot", "dash_dot_dot"]);
  if (c.effects !== undefined) {
    const e = record(c.effects, ["relief", "script"]);
    if (e.relief !== undefined)
      choice(e.relief, ["none", "emboss", "engrave"]);
    if (e.script !== undefined)
      choice(e.script, ["normal", "superscript", "subscript"]);
  }
  if (c.shadow !== undefined) {
    const s = record(c.shadow, ["kind", "offsetX", "offsetY", "color"]);
    if (s.kind !== undefined)
      choice(s.kind, ["none", "drop", "continuous"]);
    for (const k of ["offsetX", "offsetY"])
      if (s[k] !== undefined)
        integer2(s[k], -100, 100);
    if (s.color !== undefined)
      rgb2(s.color);
  }
  if (c.border !== undefined)
    validateBorderPatch(c.border);
  if (c.background !== undefined)
    validateBackgroundPatch(c.background);
}
function hasCharacterFormattingPatch(c) {
  if (!c)
    return false;
  if (c.border && validateBorderPatch(c.border))
    return true;
  if (c.background !== undefined || c.shade !== undefined)
    return true;
  for (const key of ["size", "bold", "italic", "textColor", "outlineKind"])
    if (c[key] !== undefined)
      return true;
  for (const key of [
    "fonts",
    "ratio",
    "charSpacing",
    "relativeSize",
    "offset",
    "underline",
    "strike",
    "effects",
    "shadow"
  ])
    if (c[key] && Object.values(c[key]).some((v) => v !== undefined))
      return true;
  return false;
}
function validateFormattingReset(value) {
  const r = record(value, ["basis", "scope"]);
  if (r.basis !== "paragraph-style")
    throw Error("UnsupportedFormattingReset");
  choice(r.scope, ["character", "paragraph", "all"]);
}

// packages/core/src/commands/original-paragraph-reference.ts
function validateOriginalParagraphReference(target, row, errorName) {
  if (target.format !== "hwp5")
    return;
  const ref = row.currentReference;
  if (ref?.kind !== "original" || ref.section !== target.section || typeof ref.id !== "string" || !/^(0|[1-9][0-9]*)$/.test(ref.id) || BigInt(ref.id) > 0xffffffffn) {
    throw Error(errorName);
  }
}

// packages/core/src/internal/paragraph-index.ts
var duplicate = Symbol("DuplicateParagraphCoordinate");
var fallback = Symbol("ParagraphIndexFallback");
function createParagraphRowLookup(visit) {
  const indexes = new WeakMap;
  return function uniqueParagraphRow(paragraphs, section, paragraph) {
    const scan = () => {
      const matches = paragraphs?.filter((row) => {
        visit?.("fallback");
        return row.section === section && row.paragraph === paragraph;
      });
      return matches?.length === 1 ? matches[0] : undefined;
    };
    if (!isOwnedImmutableObservation(paragraphs) || !Array.isArray(paragraphs))
      return scan();
    let index = indexes.get(paragraphs);
    if (index === undefined) {
      const built = new Map;
      let eligible = true;
      for (let i = 0;i < paragraphs.length; i++) {
        visit?.("index");
        const slot = Object.getOwnPropertyDescriptor(paragraphs, String(i));
        const row = slot && "value" in slot ? slot.value : undefined;
        if (!isOwnedImmutableObservation(row)) {
          eligible = false;
          break;
        }
        const s = Object.getOwnPropertyDescriptor(row, "section");
        const p = Object.getOwnPropertyDescriptor(row, "paragraph");
        if (!s || !p || !("value" in s) || !("value" in p) || !Number.isSafeInteger(s.value) || s.value < 0 || !Number.isSafeInteger(p.value) || p.value < 0) {
          eligible = false;
          break;
        }
        let sectionRows = built.get(s.value);
        if (!sectionRows)
          built.set(s.value, sectionRows = new Map);
        sectionRows.set(p.value, sectionRows.has(p.value) ? duplicate : row);
      }
      index = eligible ? built : fallback;
      indexes.set(paragraphs, index);
    }
    if (index === fallback)
      return scan();
    const row = index.get(section)?.get(paragraph);
    return row === duplicate ? undefined : row;
  };
}
var uniqueParagraphRow = createParagraphRowLookup();

// web/preview/paragraph-selection.mjs
function paragraphSelectionOwner(paragraph) {
  const cell = paragraph?.tableCell;
  const drawing = paragraph?.drawingText ?? paragraph?.drawingCaption;
  if (cell && drawing || paragraph?.drawingText && paragraph?.drawingCaption)
    return null;
  if (drawing) {
    if (![paragraph.section, drawing.drawingNode, drawing.listNode].every((value) => Number.isInteger(value) && value >= 0 && value <= 4294967295))
      return null;
    const kind = paragraph.drawingText ? "text" : "caption";
    return `section:${paragraph.section}:drawing:${drawing.drawingNode}:${kind}:list:${drawing.listNode}`;
  }
  if (cell) {
    if (![paragraph.section, cell.tableNode, cell.listNode].every((value) => Number.isInteger(value) && value >= 0))
      return null;
    return `section:${paragraph.section}:table:${cell.tableNode}:list:${cell.listNode}`;
  }
  return paragraph?.selectionOwner ?? null;
}

// packages/core/src/commands/selection.ts
function validateToken(token, state, view = false) {
  if (!token || token.editorId !== state.editorId || token.documentId !== state.documentId || token.generation !== state.generation || token.operationRevision !== state.operationRevision || view && token.viewRevision !== state.viewRevision)
    throw Error("StaleTarget");
}
function validateSelection(target, state, editable = false) {
  validateToken(target, state, true);
  if (target.coordinateSpace !== "display" || !["hwp5", "hwpx"].includes(target.format) || !["forward", "backward"].includes(target.affinity))
    throw Error("InvalidCoordinateSpace");
  const content = state.content;
  if (!content || content.format !== target.format)
    throw Error("InvalidCoordinateSpace");
  if (![target.section, target.paragraph, target.startUnit, target.endUnit].every((x) => Number.isSafeInteger(x) && x >= 0) || target.endUnit < target.startUnit)
    throw Error("InvalidTextPosition");
  const row = uniqueParagraphRow(content.paragraphs, target.section, target.paragraph);
  if (!row || row.clipped || target.owner !== paragraphSelectionOwner(row) || !paragraphSelectionOwner(row))
    throw Error("InvalidSelectionOwner");
  if (editable && !row.editable)
    throw Error("SelectionNotEditable");
  if (typeof row.text !== "string" || target.endUnit > row.text.length)
    throw Error("InvalidTextPosition");
  const insideSurrogate = (at) => at > 0 && at < row.text.length && /[\uD800-\uDBFF]/.test(row.text[at - 1]) && /[\uDC00-\uDFFF]/.test(row.text[at]);
  if (insideSurrogate(target.startUnit) || insideSurrogate(target.endUnit))
    throw Error("InvalidScalarBoundary");
  return row;
}
function selectionMessage(target, state) {
  const row = validateSelection(target, state, true);
  if (row.createdCell)
    throw Error("CreatedCellRequiresSurfacePort");
  const change = {
    section: target.section,
    paragraph: target.paragraph,
    startUnit: target.startUnit,
    endUnit: target.endUnit
  };
  const mapped = target.format === "hwp5" ? sourceTextChange(change, row.sourceOffsets) : change;
  if (mapped.endUnit - mapped.startUnit !== target.endUnit - target.startUnit)
    throw Error("ProtectedAnchorRange");
  return {
    ...mapped,
    ...row.currentReference === undefined ? {} : { reference: row.currentReference }
  };
}

// packages/core/src/commands/atomic-formatting.ts
function object2(v, allowed) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("InvalidFormattingPatch");
  if (Object.keys(v).some((k) => !allowed.includes(k)))
    throw Error("UnknownFormattingField");
  return v;
}
function validateParagraphFormattingPatch(value) {
  const root = object2(value, ["paragraph"]);
  if (!Object.hasOwn(root, "paragraph"))
    throw Error("InvalidFormattingPatch");
  const p = object2(root.paragraph, [
    "alignment",
    "margins",
    "spacing",
    "grid",
    "borderConnect",
    "border",
    "background"
  ]);
  if (p.alignment !== undefined && paragraphAlignmentValue(p.alignment) === undefined)
    throw Error("InvalidParagraphAlignment");
  if (p.margins !== undefined) {
    const m = object2(p.margins, ["left", "right", "indent", "before", "after"]);
    if (Object.values(m).some((v) => v === null))
      throw Error("InvalidParagraphMargins");
    paragraphMarginArgs(m);
  }
  if (p.spacing !== undefined) {
    const v = object2(p.spacing, ["kind", "value"]);
    const kinds = {
      percent: "PERCENT",
      fixed: "FIXED",
      between: "BETWEEN_LINES",
      at_least: "AT_LEAST"
    };
    paragraphSpacingArgs(kinds[v.kind], v.value);
  }
  for (const key of ["grid", "borderConnect"])
    if (p[key] !== undefined && typeof p[key] !== "boolean")
      throw Error("InvalidParagraphFlags");
  if (p.border !== undefined)
    validateBorderPatch(p.border);
  if (p.background !== undefined)
    validateBackgroundPatch(p.background);
}
function validateFormattingPatch(value) {
  const root = object2(value, ["paragraph", "character", "reset"]);
  if (!["paragraph", "character", "reset"].some((key) => Object.hasOwn(root, key)))
    throw Error("InvalidFormattingPatch");
  if (Object.hasOwn(root, "paragraph"))
    validateParagraphFormattingPatch({ paragraph: root.paragraph });
  if (Object.hasOwn(root, "character"))
    validateCharacterFormattingPatch(root.character);
  if (Object.hasOwn(root, "reset")) {
    validateFormattingReset(root.reset);
    const patch = root;
    if (hasCharacterFormattingPatch(patch.character) || hasParagraphFormattingPatch(patch))
      throw Error("ConflictingFormattingReset");
  }
}
function hasParagraphFormattingPatch(patch) {
  const p = patch.paragraph;
  if (!p)
    return false;
  if (p.alignment !== undefined || p.spacing !== undefined || p.grid !== undefined || p.borderConnect !== undefined || p.background !== undefined)
    return true;
  if (p.border && validateBorderPatch(p.border))
    return true;
  return !!p.margins && Object.values(p.margins).some((value) => value !== undefined);
}
function formattingPatchNeedsCharacter(patch) {
  return !!(patch.reset && patch.reset.scope !== "paragraph") || hasCharacterFormattingPatch(patch.character);
}
function atomicSelector(target, state, write, character) {
  const row = validateSelection(target, state, write);
  if (character && target.startUnit === target.endUnit)
    throw Error("EmptyCharacterSelection");
  if (row.createdCell)
    throw Error("CreatedCellRequiresSurfacePort");
  if (!row.tableCell && !row.drawingText && !row.drawingCaption && target.owner !== `section:${target.section}:body`)
    throw Error("UnsupportedFormattingOwner");
  validateOriginalParagraphReference(target, row, "UnsupportedFormattingReference");
  let ranges;
  if (character && target.startUnit !== target.endUnit) {
    const change = {
      section: target.section,
      paragraph: target.paragraph,
      startUnit: target.startUnit,
      endUnit: target.endUnit
    };
    const mapped = target.format === "hwp5" ? sourceTextChange(change, row.sourceOffsets) : change;
    if (mapped.endUnit - mapped.startUnit !== target.endUnit - target.startUnit)
      throw Error("ProtectedAnchorRange");
    ranges = [{ startUnit: mapped.startUnit, endUnit: mapped.endUnit }];
  }
  return {
    kind: "original-paragraph",
    section: target.section,
    paragraph: target.paragraph,
    ...ranges ? { ranges } : {}
  };
}

// packages/core/src/commands/formatting-patch.ts
function assertFormattingAdmission(payload, stateVersion, capability) {
  if (payload.selectionVersion === undefined)
    return;
  if (!Number.isSafeInteger(payload.selectionVersion) || payload.selectionVersion < 0)
    throw Error("InvalidSelectionVersion");
  if (capability?.version !== 1 || capability.epoch !== "stateVersion" || !capability.commands.includes("APPLY_FORMATTING_PATCH"))
    throw Error("SelectionFenceUnavailable");
  if (payload.selectionVersion !== stateVersion)
    throw Error("StaleFormattingSelection");
}

// packages/core/src/editor/write-policy.ts
class EditorWritePolicy {
  editable = false;
  publish(editable, commit) {
    const previous = this.editable;
    this.editable = editable;
    try {
      commit();
    } catch (error) {
      this.editable = previous;
      throw error;
    }
  }
  assertWritable() {
    if (!this.editable)
      throw Error("ReadOnlyDocument");
  }
  observe(content, editable = this.editable) {
    if (editable || !content || typeof content !== "object" || Array.isArray(content))
      return content;
    const observed = content;
    return {
      ...observed,
      readOnly: true,
      ...Array.isArray(observed.paragraphs) ? {
        paragraphs: observed.paragraphs.map((row) => row && typeof row === "object" ? { ...row, editable: false } : row)
      } : {}
    };
  }
  capabilities(value, editable = this.editable) {
    return editable ? value : {
      ...value && typeof value === "object" ? value : {},
      readOnly: true,
      historyAvailable: false
    };
  }
}

// packages/core/src/state/history-state.ts
var unavailable = Object.freeze({
  available: false,
  canUndo: false,
  canRedo: false
});
function getHistoryAvailability(state) {
  if (state.historyRecoveryRequired || state.nativeHistoryStats?.poisoned === true || state.status !== "ready" || state.capabilities?.readOnly === true)
    return unavailable;
  const { nativeHistoryRevision: current, nativeHistoryRevisions: reachable } = state;
  const valid = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 4294967295;
  if (!valid(current) || !Array.isArray(reachable) || reachable.length < 1 || reachable.length > 65536 || reachable[0] !== current || !reachable.every(valid) || new Set(reachable).size !== reachable.length)
    return unavailable;
  return Object.freeze({
    available: true,
    canUndo: reachable.some((revision) => revision < current),
    canRedo: reachable.some((revision) => revision > current)
  });
}

// packages/core/src/state/selection-history.ts
class SelectionHistory {
  #documentId = null;
  #generation = -1;
  #locations = new Map;
  clear() {
    this.#locations.clear();
    this.#documentId = null;
    this.#generation = -1;
  }
  #reachable(state) {
    if (!getHistoryAvailability(state).available)
      return;
    return new Set(state.nativeHistoryRevisions);
  }
  observe(state) {
    if (state.documentId !== this.#documentId || state.generation !== this.#generation) {
      this.clear();
      this.#documentId = state.documentId;
      this.#generation = state.generation;
    }
    if (state.status === "disposed") {
      this.clear();
      return;
    }
    if (state.status !== "ready" || !state.documentId)
      return;
    const reachable = this.#reachable(state);
    if (!reachable) {
      this.#locations.clear();
      return;
    }
    for (const revision of this.#locations.keys())
      if (!reachable.has(revision))
        this.#locations.delete(revision);
    const selected = state.selection;
    if (selected === undefined)
      return;
    const revision = state.nativeHistoryRevision;
    if (selected === null) {
      this.#locations.set(revision, null);
      return;
    }
    try {
      const target = selected;
      validateSelection(target, state);
      this.#locations.set(revision, Object.freeze({
        coordinateSpace: target.coordinateSpace,
        format: target.format,
        owner: target.owner,
        section: target.section,
        paragraph: target.paragraph,
        startUnit: target.startUnit,
        endUnit: target.endUnit,
        affinity: target.affinity
      }));
    } catch {
      this.#locations.delete(revision);
    }
  }
  restore(state) {
    if (state.status !== "ready" || !state.documentId || state.documentId !== this.#documentId || state.generation !== this.#generation)
      return;
    const reachable = this.#reachable(state), revision = state.nativeHistoryRevision;
    if (!reachable || !reachable.has(revision))
      return;
    const location = this.#locations.get(revision);
    if (location === undefined || location === null)
      return location;
    const target = Object.freeze({ ...location, ...state.token });
    try {
      validateSelection(target, state);
      return target;
    } catch {
      return;
    }
  }
}

// packages/core/src/state/paragraph-selection.ts
function createParagraphSelection(state, options) {
  if (!options || typeof options !== "object" || Array.isArray(options) || ![Object.prototype, null].includes(Object.getPrototypeOf(options)))
    throw Error("InvalidParagraphSelectionOptions");
  for (const key of Reflect.ownKeys(options)) {
    if (typeof key !== "string" || !["section", "paragraph", "startUnit", "endUnit", "affinity"].includes(key) || !("value" in Object.getOwnPropertyDescriptor(options, key)))
      throw Error("InvalidParagraphSelectionOptions");
  }
  if (state.status !== "ready")
    throw Error("EditorNotReady");
  const content = state.content;
  if (!content || !["hwp5", "hwpx"].includes(content.format ?? ""))
    throw Error("InvalidCoordinateSpace");
  const row = Array.isArray(content.paragraphs) ? content.paragraphs.find((item) => item.section === options.section && item.paragraph === options.paragraph) : undefined;
  const target = {
    ...state.token,
    coordinateSpace: "display",
    format: content.format,
    owner: paragraphSelectionOwner(row) ?? "",
    section: options.section,
    paragraph: options.paragraph,
    startUnit: options.startUnit,
    endUnit: options.endUnit === undefined ? options.startUnit : options.endUnit,
    affinity: options.affinity === undefined ? "forward" : options.affinity
  };
  validateSelection(target, state);
  return Object.freeze(target);
}

// js/hwp5-structural-edit-boundary.mjs
var uint32 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
function hwp5StructuralEditableStart(row) {
  if (!row || !uint32(row.section) || !uint32(row.paragraph) || row.selectionOwner !== `section:${row.section}:body` || row.clipped || row.tableCell || row.drawingText || row.drawingCaption || row.createdCell || row.textSourcePolicyError != null || typeof row.text !== "string" || row.text.charCodeAt(0) !== 65532 || row.text.charCodeAt(1) !== 65532)
    return 0;
  const ref = row.currentReference;
  if (!ref || ref.kind !== "original" || ref.section !== row.section || typeof ref.id !== "string" || ref.id.length === 0 || typeof ref.epoch !== "string" || ref.epoch.length === 0 || ref.row !== 0 || ref.column !== 0 || typeof ref.scope !== "string" || ref.scope.length === 0)
    return 0;
  const { sourceOffsets: offsets, structuralAnchors: anchors } = row;
  if (!Array.isArray(offsets) || offsets.length < 3 || !Array.isArray(anchors) || anchors.length !== 2)
    return 0;
  for (let i = 0;i < 3; i++)
    if (offsets[i]?.at !== i || offsets[i]?.source !== i * 8)
      return 0;
  for (let i = 0;i < 2; i++) {
    const anchor = anchors[i];
    if (anchor?.kind !== (i === 0 ? "section" : "column") || anchor.paragraph !== row.paragraph || anchor.source_unit !== i * 8 || anchor.current_unit !== i * 8 || anchor.unit !== i || !uint32(anchor.control_node))
      return 0;
  }
  return anchors[0].control_node !== anchors[1].control_node ? 2 : 0;
}

// packages/core/src/editor/new-document-selection.ts
function createNewDocumentSelection(state) {
  const content = state.content;
  if (state.status !== "ready" || !content || content.readOnly === true || !Array.isArray(content.paragraphs) || content.paragraphs.length !== 1)
    return;
  const row = content.paragraphs[0];
  if (!row || row.section !== 0 || row.paragraph !== 0 || row.editable !== true || row.clipped || row.tableCell || row.drawingText || row.drawingCaption || row.createdCell || row.textSourcePolicyError != null || row.selectionOwner !== "section:0:body")
    return;
  let startUnit;
  if (content.format === "hwpx" && row.text === "")
    startUnit = 0;
  else if (content.format === "hwp5" && row.text === "￼￼" && Array.isArray(row.sourceOffsets) && row.sourceOffsets.length === 3 && hwp5StructuralEditableStart(row) === 2)
    startUnit = 2;
  else
    return;
  try {
    const target = createParagraphSelection(state, { section: 0, paragraph: 0, startUnit });
    validateSelection(target, state, true);
    return target;
  } catch {
    return;
  }
}

// packages/core/src/editor/load-source-options.ts
function loadSourceOptions(options) {
  if (options.availableSectionCopy === undefined)
    return {};
  availableSectionCopyRequest({
    format: options.format,
    availableSectionCopy: options.availableSectionCopy,
    distribution: options.enableOptions?.distribution,
    normalizeObservedCfb: options.enableOptions?.normalizeObservedCfb
  });
  return { availableSectionCopy: options.availableSectionCopy };
}

// packages/core/src/state/text-scalar.ts
function isWellFormedText(text) {
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);
}

// packages/core/src/state/editor-state.ts
class EditorState {
  editorId;
  documentId;
  generation;
  operationRevision;
  viewRevision;
  stateVersion;
  historyRecoveryRequired;
  status;
  nativeHistoryRevision;
  savedOperationRevision;
  #historyStats;
  #historyRevisions;
  #content;
  #capabilities;
  #selection;
  #read;
  constructor(data, read = localRead) {
    this.historyRecoveryRequired = data.historyRecoveryRequired === true;
    this.editorId = data.editorId;
    this.documentId = data.documentId;
    this.generation = data.generation;
    this.operationRevision = data.operationRevision;
    this.viewRevision = data.viewRevision;
    this.stateVersion = data.stateVersion;
    this.status = data.status;
    this.#historyStats = ownObservation(data.nativeHistoryStats);
    this.nativeHistoryRevision = data.nativeHistoryRevision;
    this.#historyRevisions = ownObservation(data.nativeHistoryRevisions);
    this.savedOperationRevision = data.savedOperationRevision;
    this.#content = ownObservation(data.content);
    this.#capabilities = ownObservation(data.capabilities);
    this.#selection = ownObservation(data.selection);
    this.#read = read;
    Object.freeze(this);
  }
  get nativeHistoryStats() {
    return this.#historyStats();
  }
  get nativeHistoryRevisions() {
    return this.#historyRevisions();
  }
  get token() {
    return Object.freeze({
      editorId: this.editorId,
      documentId: this.documentId,
      generation: this.generation,
      operationRevision: this.operationRevision,
      viewRevision: this.viewRevision
    });
  }
  get content() {
    return this.#content();
  }
  get capabilities() {
    return this.#capabilities();
  }
  get selection() {
    return this.#selection();
  }
  read(callback) {
    return this.#read(callback, this);
  }
}
function localRead(callback, state) {
  const result = callback(state);
  if (isPromiseLike(result)) {
    discardPromise(result);
    throw Error("AsyncRead");
  }
  return result;
}

// packages/core/src/commands/surface-protocol.ts
var SURFACE_READ_KINDS = Object.freeze([
  "formatting-capabilities",
  "query-formatting",
  "query-window",
  "query-edit-window",
  "query-edit-range",
  "query-split-range",
  "query-current-references",
  "query-current-source-references",
  "query-current-text",
  "query-created-tables",
  "picture-bytes",
  "table-background-bytes",
  "chart-display",
  "chart-points",
  "chart-series-text",
  "chart-rich-text",
  "inline-string-sources",
  "equation-sources",
  "equation-script-query",
  "dutmal-text-query"
]);
var SURFACE_MUTATION_KINDS = Object.freeze([
  "formatting-patch",
  "splice",
  "splice-current",
  "splice-font-name",
  "splice-character-properties",
  "created-cell-text",
  "insert-table",
  "undo",
  "redo",
  "split",
  "merge",
  "format",
  "replace-paragraph-ranges",
  "character-properties",
  "character-properties-ranges",
  "character-font",
  "character-font-ranges",
  "character-font-name",
  "character-font-name-ranges",
  "character-outline",
  "character-outline-ranges",
  "character-effect",
  "character-effect-ranges",
  "character-shade",
  "character-shade-ranges",
  "character-text-color",
  "character-text-color-ranges",
  "character-strike",
  "character-strike-ranges",
  "character-strike-color",
  "character-underline",
  "character-underline-ranges",
  "character-underline-color",
  "paragraph-format",
  "paragraph-alignment",
  "paragraph-spacing",
  "paragraph-margins",
  "formula-definition",
  "manual-formula-result",
  "chart-points-set",
  "chart-numeric-point",
  "chart-point",
  "chart-series-text-set",
  "chart-rich-text-set",
  "equation-script-set",
  "dutmal-text",
  "radio-select",
  "checkbox-state",
  "form-text",
  "picture-resize",
  "picture-current-size",
  "picture-dimensions",
  "table-column-width",
  "cell-size",
  "cell-background",
  "cell-border",
  "cell-borders",
  "cell-appearance",
  "cell-styles"
]);
var SURFACE_VIEW_KINDS = Object.freeze(["enable", "set-edit-window"]);
var reads = new Set(SURFACE_READ_KINDS);
var mutations = new Set(SURFACE_MUTATION_KINDS);
var views = new Set(SURFACE_VIEW_KINDS);
function surfaceOperation(kind) {
  return reads.has(kind) ? "read" : mutations.has(kind) ? "mutation" : views.has(kind) ? "view" : undefined;
}

// packages/core/src/scheduler/cancellation.ts
class CancellationFence {
  #cancelled = false;
  #listeners = new Set;
  get cancelled() {
    return this.#cancelled;
  }
  get subscriberCount() {
    return this.#listeners.size;
  }
  subscribe(listener) {
    if (this.#cancelled) {
      listener();
      return () => {};
    }
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  cancel() {
    if (this.#cancelled)
      return;
    this.#cancelled = true;
    const listeners = [...this.#listeners];
    this.#listeners.clear();
    for (const listener of listeners)
      listener();
  }
}
async function interruptible(task, fences) {
  const already = fences.find(({ fence }) => fence.cancelled);
  if (already) {
    Promise.resolve(task).catch(() => {});
    throw Error(already.error);
  }
  const unsubscribe = [];
  const interrupted = new Promise((_, reject) => {
    for (const { fence, error } of fences)
      unsubscribe.push(fence.subscribe(() => reject(Error(error))));
  });
  try {
    return await Promise.race([task, interrupted]);
  } finally {
    for (const off of unsubscribe)
      off();
  }
}

// packages/core/src/scheduler/fifo.ts
class FifoScheduler {
  #tail = Promise.resolve();
  enqueue(task) {
    const result = this.#tail.then(task);
    this.#tail = result.then(() => {}, () => {});
    return result;
  }
  drain() {
    return this.#tail.then(() => {});
  }
}

// packages/core/src/commands/registry.ts
class CommandRegistry {
  #handlers = new Map;
  #order = 0;
  register(command, callback, priority) {
    if (!Number.isFinite(priority))
      throw Error("InvalidPriority");
    const row = {
      priority,
      order: this.#order++,
      callback
    };
    const rows = this.#handlers.get(command.id) ?? [];
    rows.push(row);
    this.#handlers.set(command.id, rows);
    let active = true;
    return () => {
      if (!active)
        return;
      active = false;
      const next = (this.#handlers.get(command.id) ?? []).filter((x) => x !== row);
      if (next.length)
        this.#handlers.set(command.id, next);
      else
        this.#handlers.delete(command.id);
    };
  }
  capture(command) {
    return [...this.#handlers.get(command.id) ?? []].sort((a, b) => b.priority - a.priority || a.order - b.order);
  }
  run(handlers, payload, copy) {
    for (const handler of handlers) {
      if (Object.prototype.toString.call(handler.callback) === "[object AsyncFunction]")
        throw Error("AsyncCommandHandler");
      const value = handler.callback(copy(payload));
      if (isPromiseLike(value)) {
        discardPromise(value);
        throw Error("AsyncCommandHandler");
      }
      if (typeof value !== "boolean")
        throw Error("InvalidCommandHandlerResult");
      if (value)
        return true;
    }
    return false;
  }
  clear() {
    this.#handlers.clear();
  }
}

// packages/core/src/commands/commands.ts
function createCommand(name) {
  if (!name)
    throw Error("InvalidCommand");
  return Object.freeze({ name, id: Symbol(name) });
}
var SPLICE_TEXT_COMMAND = createCommand("splice-text");
var UNDO_COMMAND = createCommand("undo");
var REDO_COMMAND = createCommand("redo");
var INSERT_TABLE_COMMAND = createCommand("insert-table");
var SET_CHARACTER_PROPERTIES_COMMAND = createCommand("set-character-properties");
var SET_PARAGRAPH_ALIGNMENT_COMMAND = createCommand("set-paragraph-alignment");
var SET_CHARACTER_UNDERLINE_COMMAND = createCommand("set-character-underline");
var SET_CHARACTER_STRIKE_COMMAND = createCommand("set-character-strike");
var SET_CHARACTER_TEXT_COLOR_COMMAND = createCommand("set-character-text-color");
var SET_CHARACTER_FONT_NAME_COMMAND = createCommand("set-character-font-name");
var APPLY_FORMATTING_PATCH_COMMAND = createCommand("apply-formatting-patch");

// packages/core/src/editor/unlock-policy.ts
var passwordErrors = new Set([
  "InvalidPassword",
  "InvalidPasswordUnicode",
  "WrongPasswordOrCorruptPayload"
]);
function retryablePasswordReply(reply) {
  return typeof reply.error === "string" && passwordErrors.has(reply.error) && (reply.applied === false || reply.meta?.application === "unapplied") && reply.applied !== true && reply.meta?.application !== "applied" && reply.meta?.changed !== true && reply.changed !== true;
}

class PasswordAttemptError extends Error {
  retryable = true;
  constructor(message) {
    super(message);
    this.name = "PasswordAttemptError";
  }
}

// packages/core/src/state/formatting-selection.ts
var identity = (reference) => reference && typeof reference === "object" ? Object.fromEntries(Object.entries(reference).filter(([key]) => key !== "epoch")) : reference;
function formattingSelection(previous, patch, revision) {
  const selected = previous.selection;
  if (!selected)
    return;
  try {
    const old = validateSelection(selected, previous);
    const next = new EditorState({
      editorId: previous.editorId,
      documentId: previous.documentId,
      generation: previous.generation,
      operationRevision: revision,
      viewRevision: previous.viewRevision,
      stateVersion: previous.stateVersion,
      status: "ready",
      ...patch
    });
    const target = { ...selected, ...next.token }, row = validateSelection(target, next);
    if (old.text !== row.text || JSON.stringify(identity(old.currentReference)) !== JSON.stringify(identity(row.currentReference)) || JSON.stringify(old.sourceOffsets) !== JSON.stringify(row.sourceOffsets) || JSON.stringify(old.tableCell) !== JSON.stringify(row.tableCell) || JSON.stringify(old.drawingText) !== JSON.stringify(row.drawingText) || JSON.stringify(old.drawingCaption) !== JSON.stringify(row.drawingCaption) || JSON.stringify(old.createdCell) !== JSON.stringify(row.createdCell))
      return;
    return target;
  } catch {
    return;
  }
}

// packages/core/src/commands/formatting.ts
function validateFormattingTarget(target, state, character, capability = character ? "characterPropertiesAvailable" : "paragraphAlignmentAvailable") {
  const row = validateSelection(target, state, true);
  if (row.createdCell)
    throw Error("CreatedCellRequiresSurfacePort");
  const position = character ? selectionMessage(target, state) : {
    section: target.section,
    paragraph: target.paragraph,
    startUnit: target.startUnit,
    endUnit: target.endUnit,
    reference: undefined
  };
  const content = state.content;
  if (content[capability] !== true)
    throw Error("FormattingCapabilityUnavailable");
  if (!row.tableCell && !row.drawingText && !row.drawingCaption && target.owner !== `section:${target.section}:body`)
    throw Error("UnsupportedFormattingOwner");
  validateOriginalParagraphReference(target, row, "UnsupportedFormattingReference");
  const { reference: _, ...range } = position;
  if (character && target.startUnit === target.endUnit)
    throw Error("EmptyCharacterSelection");
  return range;
}
function formattingMessage(payload, state, character) {
  const range = validateFormattingTarget(payload.target, state, character);
  if (character) {
    const properties = payload.properties;
    characterPropertyArgs(properties);
    return { kind: "character-properties", ...range, properties };
  }
  const alignment = payload.alignment;
  if (paragraphAlignmentValue(alignment) === undefined)
    throw Error("InvalidParagraphAlignment");
  return {
    kind: "paragraph-alignment",
    section: range.section,
    paragraph: range.paragraph,
    alignment
  };
}

// packages/core/src/commands/underline.ts
function underlineMessage(payload, state) {
  const range = validateFormattingTarget(payload.target, state, true, "characterUnderlineAvailable");
  characterUnderlineArg(payload.kind);
  return { kind: "character-underline", ...range, underlineKind: payload.kind };
}

// web/preview/observation-structure.mjs
var uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
function observationRows(rows) {
  if (!Array.isArray(rows))
    return null;
  const map = new Map;
  for (const row of rows) {
    if (!row || typeof row !== "object" || !uint(row.id) || map.has(row.id))
      return null;
    map.set(row.id, row);
  }
  return map;
}
function observationSpans(paragraph) {
  const spans = paragraph?.characterRanges;
  if (typeof paragraph?.text !== "string" || !Array.isArray(spans))
    return null;
  let previous = 0;
  for (const span of spans) {
    if (!span || !Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < previous || span.start < 0 || span.start > span.end || span.end > paragraph.text.length)
      return null;
    previous = span.end;
  }
  return spans;
}

// web/preview/text-input.mjs
var segments;
function createSegmenter(granularity) {
  const Segmenter = globalThis.Intl?.Segmenter;
  if (typeof Segmenter !== "function")
    throw Error("IntlSegmenterUnavailable");
  return new Segmenter("ko", { granularity });
}
function graphemeUnits(text) {
  return [...(segments ??= createSegmenter("grapheme")).segment(text)].map((s) => s.index).concat(text.length);
}
function snapUnit(text, unit, forward = false) {
  const bounds = graphemeUnits(text);
  return forward ? bounds.find((b) => b >= unit) ?? text.length : bounds.filter((b) => b <= unit).at(-1) ?? 0;
}

// web/preview/character-range-values.mjs
var graphemeBoundary = (text, unit, end = false) => snapUnit(text, unit, end) === unit;
function characterRangeValues(content, ranges, valueAt, { isBoundary = graphemeBoundary } = {}, paragraphAt = undefined) {
  if (!Array.isArray(content?.paragraphs) || content.paragraphs.some((row) => !row || typeof row !== "object") || !Array.isArray(ranges) || !ranges.length)
    return null;
  const values = [];
  for (const range of ranges) {
    if (!range)
      return null;
    const paragraph = typeof paragraphAt === "function" ? paragraphAt(range.section, range.paragraph) : content.paragraphs.find((row) => row.section === range.section && row.paragraph === range.paragraph);
    const { startUnit: start, endUnit: end } = range;
    if (!paragraph || paragraph.clipped || typeof paragraph.text !== "string" || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || end > paragraph.text.length || !isBoundary(paragraph.text, start) || !isBoundary(paragraph.text, end, true))
      return null;
    const spans = observationSpans(paragraph);
    if (!spans)
      return null;
    let cursor = start;
    for (const span of spans) {
      if (!span || !Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.start > span.end || span.end > paragraph.text.length || !isBoundary(paragraph.text, span.start) || !isBoundary(paragraph.text, span.end, true))
        return null;
      const low = Math.max(start, span.start), high = Math.min(end, span.end);
      if (low >= high)
        continue;
      if (!uint(span.charShapeId))
        return null;
      const value = valueAt(span.charShapeId);
      if (low !== cursor || value === null || value === undefined)
        return null;
      values.push(value);
      cursor = high;
    }
    if (cursor !== end)
      return null;
  }
  return values.length ? values : null;
}

// web/preview/utf16-boundary.mjs
function isUtf16Boundary(text, unit) {
  if (typeof text !== "string" || !Number.isSafeInteger(unit) || unit < 0 || unit > text.length)
    return false;
  const previous = text.charCodeAt(unit - 1), current = text.charCodeAt(unit);
  return !(previous >= 55296 && previous <= 56319 && current >= 56320 && current <= 57343);
}

// packages/core/src/state/font-name-state.ts
var uint2 = (x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 4294967295;
var unknownValue = Object.freeze({ kind: "unknown" });
var unknownObservation = Object.freeze({ value: unknownValue, bindingValid: false });
var unknown = () => Object.freeze(Object.fromEntries(FONT_LANGUAGES.map((language) => [language, unknownObservation])));
function characterFontNameObservations(content, paragraph, start, end) {
  const c = content;
  const row = paragraph;
  if (c?.characterFontNameAvailable !== true || c.fontFacesError || c.characterFontReferencesError || !Array.isArray(c.fontFaces) || !Array.isArray(c.characterFontReferences) || !uint2(row?.section) || !uint2(row?.paragraph) || !Number.isInteger(start) || !Number.isInteger(end) || start >= end)
    return unknown();
  const names = new Map;
  try {
    if (!validFontFaceOrder(c.fontFaces))
      return unknown();
    for (const face of c.fontFaces) {
      if (!face || typeof face !== "object")
        return unknown();
      const f = face;
      if (f.name !== null) {
        if (typeof f.name !== "string")
          return unknown();
        if (f.name.length)
          characterFontNameArgs(f.language, f.name);
      }
      names.set(f.language + ":" + f.id, f.name);
    }
  } catch {
    return unknown();
  }
  const refs = new Map;
  for (const item of c.characterFontReferences) {
    if (!item || typeof item !== "object")
      return unknown();
    const r = item;
    if (!uint2(r.id) || refs.has(r.id) || !Array.isArray(r.fontIds) || r.fontIds.length !== FONT_LANGUAGES.length || !r.fontIds.every(uint2))
      return unknown();
    refs.set(r.id, r.fontIds);
  }
  const spans = characterRangeValues(content, [{ section: row.section, paragraph: row.paragraph, startUnit: start, endUnit: end }], (id) => uint2(id) ? refs.get(id) ?? null : null, { isBoundary: isUtf16Boundary });
  if (!spans)
    return unknown();
  return Object.freeze(Object.fromEntries(FONT_LANGUAGES.map((language, index) => {
    const keys = spans.map((ids) => language + ":" + ids[index]);
    if (keys.some((key) => !names.has(key)))
      return [language, unknownObservation];
    const values = keys.map((key) => names.get(key));
    const first = values[0];
    const value = values.some((name) => name !== first) ? Object.freeze({ kind: "mixed" }) : Object.freeze({ kind: "single", name: first });
    return [language, Object.freeze({ value, bindingValid: true })];
  })));
}

// packages/core/src/commands/font-name.ts
function fontNameMessage(payload, state) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || ["target", "language", "name"].some((key) => !Object.hasOwn(payload, key)) || Object.keys(payload).some((key) => !["target", "language", "name"].includes(key)) || Object.values(Object.getOwnPropertyDescriptors(payload)).some((d) => d.get || d.set)) {
    throw Error("InvalidCharacterFontNamePayload");
  }
  const range = validateFormattingTarget(payload.target, state, true, "characterFontNameAvailable");
  if (typeof globalThis.TextEncoder !== "function")
    throw Error("FontNameEncodingUnavailable");
  characterFontNameArgs(payload.language, payload.name);
  const row = validateSelection(payload.target, state);
  const observed = characterFontNameObservations(state.content, row, payload.target.startUnit, payload.target.endUnit);
  if (!observed[payload.language]?.bindingValid)
    throw Error("UnknownCharacterFontName");
  return { kind: "character-font-name", ...range, language: payload.language, name: payload.name };
}

// packages/core/src/commands/table-insert-options.ts
var resourceKeys = ["paragraph", "character", "style", "border_fill"];
function dataObject(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && own.every((key) => typeof key === "string" && keys.includes(key) && ("value" in Object.getOwnPropertyDescriptor(value, key)));
}
var uint3 = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4294967295;
function validateTableInsertOptions(options, observed) {
  if (!dataObject(options, ["rows", "columns", "width", "rowHeight", "resources"]))
    throw Error("InvalidTableCreationOptions");
  const { rows, columns, width, rowHeight } = options;
  if (![rows, columns, width, rowHeight].every(uint3) || rows === 0 || columns === 0 || width < columns || rowHeight === 0 || !Number.isSafeInteger(rows * columns) || rows * columns > 1e5 || rows * rowHeight > 4294967295)
    throw Error("InvalidTableCreationDimensions");
  if (!dataObject(options.resources, resourceKeys) || !dataObject(observed, resourceKeys))
    throw Error("InvalidTableCreationResources");
  for (const key of resourceKeys) {
    const value = options.resources[key], ids = observed[key];
    if (!uint3(value) || !Array.isArray(ids) || !ids.every((id, index) => uint3(id) && (index === 0 || ids[index - 1] < id)) || !ids.includes(value))
      throw Error("InvalidTableCreationResources");
  }
  return options;
}

// packages/core/src/commands/table-insert.ts
function tableInsertMessage(payload, state) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Reflect.ownKeys(payload).length !== 2 || !["target", "options"].every((key) => Object.hasOwn(payload, key)) || Reflect.ownKeys(payload).some((key) => typeof key !== "string" || !["target", "options"].includes(key) || !("value" in Object.getOwnPropertyDescriptor(payload, key))))
    throw Error("InvalidTableInsertPayload");
  const target = payload.target, row = validateSelection(target, state, true);
  if (target.startUnit !== target.endUnit)
    throw Error("TableInsertionRequiresCaret");
  if (target.owner !== `section:${target.section}:body` || row.tableCell || row.createdCell || row.drawingText || row.drawingCaption)
    throw Error("UnsupportedTableInsertOwner");
  validateOriginalParagraphReference(target, row, "UnsupportedTableInsertReference");
  const content = state.content;
  if (content.tableCreationAvailable !== true)
    throw Error("TableCreationUnavailable");
  const options = validateTableInsertOptions(payload.options, content.tableCreationResources);
  const mapped = selectionMessage(target, state);
  return {
    kind: "insert-table",
    section: mapped.section,
    paragraph: mapped.paragraph,
    unit: mapped.startUnit,
    options
  };
}

// packages/core/src/state/text-color-state.ts
var unavailable2 = () => Object.freeze({ value: null, bindingValid: false });
function characterTextColorObservation(content, paragraph, start, end) {
  const c = content;
  const p = paragraph;
  const uint = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4294967295;
  if (c?.characterTextColorAvailable !== true || !Array.isArray(c.characterTextColors) || !uint(p?.section) || !uint(p?.paragraph) || start >= end)
    return unavailable2();
  const paragraphs = content.paragraphs;
  if (!Array.isArray(paragraphs) || paragraphs.some((row) => !row || typeof row !== "object"))
    return unavailable2();
  const colors = new Map;
  for (const item of c.characterTextColors) {
    if (!item || typeof item !== "object")
      return unavailable2();
    const row = item;
    if (!uint(row.id) || colors.has(row.id))
      return unavailable2();
    if (row.color !== null && (!uint(row.color) || row.color > 16777215))
      return unavailable2();
    colors.set(row.id, { color: row.color });
  }
  const values = characterRangeValues(content, [{ section: p.section, paragraph: p.paragraph, startUnit: start, endUnit: end }], (id) => uint(id) ? colors.get(id) ?? null : null, { isBoundary: isUtf16Boundary });
  if (!values)
    return unavailable2();
  const color = values[0].color;
  if (color === null || values.some((row) => row.color === null))
    return Object.freeze({ value: null, bindingValid: true });
  return Object.freeze({
    value: values.some((row) => row.color !== color) ? "mixed" : `#${color.toString(16).padStart(6, "0")}`,
    bindingValid: true
  });
}

// packages/core/src/commands/text-color.ts
function textColorMessage(payload, state) {
  const range = validateFormattingTarget(payload.target, state, true, "characterTextColorAvailable");
  characterColorArg(payload.color);
  const row = validateSelection(payload.target, state);
  if (!characterTextColorObservation(state.content, row, payload.target.startUnit, payload.target.endUnit).bindingValid)
    throw Error("UnknownCharacterTextColor");
  return { kind: "character-text-color", ...range, color: payload.color };
}

// packages/core/src/commands/strike.ts
function strikeMessage(payload, state) {
  const range = validateFormattingTarget(payload.target, state, true, "characterStrikeAvailable");
  if (typeof payload.enabled !== "boolean")
    throw Error("InvalidCharacterStrikeEnabled");
  return { kind: "character-strike", ...range, enabled: payload.enabled };
}

// packages/core/src/editor/create-editor.ts
var nextEditorId = 0;
var nextEditorInstance = 0;
var usedRuntimes = new WeakSet;
var errorText = (error) => error instanceof Error ? error.message : String(error);
var isWellFormed = isWellFormedText;
var isAsyncFunction = (callback) => Object.prototype.toString.call(callback) === "[object AsyncFunction]";
function createEditor(options) {
  const editorId = options.editorId ?? `hwpjs-editor-${++nextEditorId}`;
  if (nextEditorInstance >= Number.MAX_SAFE_INTEGER)
    throw Error("EditorIdentityExhausted");
  const instanceId = String(++nextEditorInstance);
  const queue = new FifoScheduler, admission = new FifoScheduler, registry = new CommandRegistry;
  const geometry = createGeometryEvidenceController();
  const takeGeometryOrigin = (runtime, reply, ctx) => consumeNativeRuntimeOrigin(runtime, reply, ctx);
  const selectionHistory = new SelectionHistory;
  const writePolicy = new EditorWritePolicy;
  let active, locked;
  let terminal = false, disposePromise, requestId = 0, nextGeneration = 0, revisionClock = 0, stateVersion = 0;
  let readDepth = 0, collecting = false, handling = false;
  const stateListeners = new Set, updateListeners = new Set, errorListeners = new Set;
  const released = new WeakSet;
  const loads = new Set;
  let surfaceEpoch = 0;
  let surface;
  const disposedFence = new CancellationFence;
  const runRead = (callback, snapshot) => {
    if (typeof callback !== "function")
      throw TypeError("InvalidReadCallback");
    if (isAsyncFunction(callback))
      throw Error("AsyncRead");
    readDepth++;
    try {
      const result = callback(snapshot);
      if (isPromiseLike(result)) {
        discardPromise(result);
        throw Error("AsyncRead");
      }
      return result;
    } finally {
      readDepth--;
    }
  };
  let state = new EditorState({
    editorId,
    documentId: null,
    generation: 0,
    operationRevision: 0,
    viewRevision: 0,
    stateVersion: 0,
    status: "empty"
  }, runRead);
  function assertPublicMutation() {
    if (readDepth) {
      geometry.invalidate();
      throw Error("ReadMutation");
    }
    if (collecting) {
      geometry.invalidate();
      throw Error("CollectorOnly");
    }
    if (handling) {
      geometry.invalidate();
      throw Error("CommandHandlerMutation");
    }
  }
  function assertLive() {
    if (terminal)
      throw Error("EditorDisposed");
  }
  function notifyError(error, context, applied = false) {
    geometry.invalidate();
    if (terminal)
      return;
    const event = Object.freeze({
      error,
      context: context ? Object.freeze({ ...context }) : undefined,
      applied
    });
    const final = (cause) => {
      try {
        const value = options.onError?.(Object.freeze({ ...event, error: cause }));
        discardPromise(value);
      } catch {}
    };
    if (!errorListeners.size) {
      final(error);
      return;
    }
    for (const listener of [...errorListeners]) {
      if (terminal)
        break;
      try {
        const result = listener(event);
        if (isPromiseLike(result))
          Promise.resolve(result).catch(final);
      } catch (cause) {
        final(cause);
      }
    }
  }
  function notify(listeners, snapshot, ctx, applied = false) {
    for (const listener of listeners) {
      if (terminal)
        break;
      try {
        const result = listener(snapshot);
        if (isPromiseLike(result))
          Promise.resolve(result).catch((error) => notifyError(error, ctx, applied));
      } catch (error) {
        notifyError(error, ctx, applied);
      }
    }
  }
  function install(patch, mutation = false, ctx, origin, transition) {
    if (terminal)
      return;
    const states = [...stateListeners], updates = mutation ? [...updateListeners] : [];
    const next = {
      editorId,
      documentId: state.documentId,
      generation: state.generation,
      operationRevision: state.operationRevision,
      viewRevision: state.viewRevision,
      stateVersion: ++stateVersion,
      status: state.status,
      content: state.content,
      capabilities: state.capabilities,
      historyRecoveryRequired: state.historyRecoveryRequired,
      nativeHistoryStats: state.nativeHistoryStats,
      nativeHistoryRevision: state.nativeHistoryRevision,
      nativeHistoryRevisions: state.nativeHistoryRevisions,
      savedOperationRevision: state.savedOperationRevision,
      selection: state.selection,
      ...patch
    };
    const previousState = state;
    state = new EditorState(next, runRead);
    if (origin)
      geometry.publish(previousState, state, origin, transition);
    else if (!mutation && Object.keys(patch).length === 1 && Object.hasOwn(patch, "selection"))
      geometry.inherit(previousState, state);
    else
      geometry.invalidate();
    selectionHistory.observe(state);
    const snapshot = state;
    notify(states, snapshot, ctx, mutation);
    notify(updates, snapshot, ctx, mutation);
  }
  function context(token = state.token) {
    return {
      editorId,
      documentId: token.documentId,
      generation: token.generation,
      requestId: ++requestId,
      operationRevision: token.operationRevision
    };
  }
  function verifyReply(reply, ctx) {
    if (!reply || typeof reply !== "object" || typeof reply.kind !== "string")
      throw Error("InvalidRuntimeReply");
    const returned = reply.meta?.context;
    if (returned && ["editorId", "documentId", "generation", "requestId", "operationRevision"].some((key) => returned[key] !== ctx[key]))
      throw Error("MismatchedRuntimeReply");
  }
  async function release(runtime) {
    if (!runtime || released.has(runtime))
      return;
    released.add(runtime);
    await runtime.dispose();
  }
  function enqueue(task) {
    if (terminal)
      return Promise.reject(Error("EditorDisposed"));
    return queue.enqueue(async () => {
      assertLive();
      return task();
    });
  }
  function assertSurface(record) {
    assertLive();
    if (!record.active || surface !== record)
      throw Error("InputSurfaceDetached");
  }
  function cancelComposition(record, reason) {
    try {
      record.hooks.cancelComposition(reason);
    } catch (error) {
      notifyError(error);
      if (reason === "load" || reason === "external-replace")
        throw error;
    }
  }
  function admit(task, settings = {}) {
    if (terminal)
      return Promise.reject(Error("EditorDisposed"));
    return admission.enqueue(async () => {
      assertLive();
      settings.guard?.();
      const record = surface;
      if (record) {
        assertSurface(record);
        const settlement = Promise.resolve().then(() => {
          assertSurface(record);
          return record.hooks.commitComposition();
        });
        const interruptions = [
          { fence: disposedFence, error: "EditorDisposed" },
          { fence: record.fence, error: "InputSurfaceDetached" }
        ];
        if (settings.abort)
          interruptions.push({ fence: settings.abort, error: "LoadCancelled" });
        const outcome = await interruptible(settlement, interruptions);
        assertLive();
        assertSurface(record);
        settings.guard?.();
        if (outcome !== "committed" && outcome !== "unchanged")
          throw Error("CompositionBlocked");
        if (settings.replace)
          cancelComposition(record, settings.replace);
      }
      assertLive();
      settings.guard?.();
      return enqueue(async () => {
        if (record)
          assertSurface(record);
        else if (surface)
          throw Error("InputSurfaceChanged");
        return task();
      });
    });
  }
  async function newRuntime() {
    const runtime = await options.runtimeFactory();
    if (!runtime || typeof runtime.request !== "function" || typeof runtime.dispose !== "function")
      throw Error("InvalidRuntime");
    if (usedRuntimes.has(runtime))
      throw Error("RuntimeAlreadyOwned");
    usedRuntimes.add(runtime);
    return runtime;
  }
  function history(reply) {
    return Number.isSafeInteger(reply.historyRevision) ? reply.historyRevision : undefined;
  }
  function assembleCapabilities(reply, inherit = true) {
    return reply.capabilities ?? {
      ...inherit && state.documentId !== null ? state.capabilities : {},
      ...Object.fromEntries(Object.entries(reply).filter(([key]) => ![
        "content",
        "kind",
        "error",
        "applied",
        "bytes",
        "meta",
        "origin",
        "requestId",
        "historyRevision",
        "historyRevisions",
        "historyStats",
        "nativeTextDelta",
        "historyPoisoned"
      ].includes(key)))
    };
  }
  function observeCapabilities(value, editable, reuseCurrent = false) {
    const projected = writePolicy.capabilities(value, editable);
    const previousValue = reuseCurrent ? state.capabilities : undefined;
    const plainRecord = (value) => {
      if (value === null || typeof value !== "object")
        return false;
      const proto = Object.getPrototypeOf(value);
      return proto === Object.prototype || proto === null;
    };
    if (reuseCurrent && isOwnedImmutableObservation(previousValue) && plainRecord(previousValue) && plainRecord(projected)) {
      const previous = Object.getOwnPropertyDescriptors(previousValue);
      const next = Object.getOwnPropertyDescriptors(projected);
      const keys = Reflect.ownKeys(next);
      if (keys.length === Reflect.ownKeys(previous).length && keys.every((key) => Object.hasOwn(previous, key) && ("value" in previous[key]) && ("value" in next[key]) && Object.is(previous[key].value, next[key].value)))
        return previousValue;
    }
    return ownObservation(projected)();
  }
  function contentPatch(reply, inherit = true, editable) {
    if (reply.content === undefined)
      throw Error("SnapshotMissing");
    const historyRecoveryRequired = inherit && state.historyRecoveryRequired || reply.historyPoisoned === true || reply.historyStats?.poisoned === true;
    const observedEditable = historyRecoveryRequired ? false : editable;
    const capabilities = assembleCapabilities(reply, inherit);
    return {
      content: ownObservation(writePolicy.observe(reply.content, observedEditable))(),
      capabilities: observeCapabilities(capabilities, observedEditable),
      historyRecoveryRequired,
      nativeHistoryStats: reply.historyStats,
      nativeHistoryRevision: history(reply),
      nativeHistoryRevisions: reply.historyRevisions,
      selection: undefined,
      viewRevision: state.viewRevision + 1
    };
  }
  async function finishCandidate(runtime, message, ctx, editable, enableOptions, first, guard = () => {}, initializeNewDocument = false) {
    let publicationContext = ctx;
    let reply = first ?? await runtime.request(message, ctx);
    verifyReply(reply, ctx);
    if (reply.error)
      throw Error(reply.error);
    if (editable) {
      const enableContext = { ...ctx, requestId: ++requestId };
      publicationContext = enableContext;
      reply = await runtime.request({ ...enableOptions, kind: "enable" }, enableContext);
      verifyReply(reply, enableContext);
      if (reply.error)
        throw Error(reply.error);
    }
    if (reply.historyPoisoned === true || reply.historyStats?.poisoned === true)
      throw Error("HistoryReloadRequired");
    const patch = contentPatch(reply, false, editable);
    assertLive();
    guard();
    const nextRevision = ++revisionClock;
    const nextData = {
      ...patch,
      documentId: ctx.documentId,
      generation: ctx.generation,
      operationRevision: nextRevision,
      savedOperationRevision: nextRevision,
      status: "ready"
    };
    const candidateState = new EditorState({
      editorId,
      viewRevision: state.viewRevision + 1,
      stateVersion: stateVersion + 1,
      ...nextData
    }, runRead);
    if (initializeNewDocument && editable)
      nextData.selection = createNewDocumentSelection(candidateState);
    const previous = active;
    writePolicy.publish(editable, () => {
      active = runtime;
      try {
        install(nextData, true, ctx, takeGeometryOrigin(runtime, reply, publicationContext));
      } catch (error) {
        active = previous;
        throw error;
      }
    });
    try {
      await release(previous);
    } catch (error) {
      notifyError(error, ctx);
    }
    return state;
  }
  function load(input, loadOptions) {
    assertPublicMutation();
    return loadSource(copyOwned(input), loadOptions);
  }
  function createDocument(createOptions = {}) {
    assertPublicMutation();
    const owned = copyOwned(createOptions);
    const format = owned.format ?? "hwpx";
    if (!["hwp5", "hwpx"].includes(format))
      throw Error("InvalidDocumentFormat");
    const producer = options.runtimeFactory.createDocumentBytes;
    if (typeof producer !== "function")
      throw Error("NewDocumentUnsupported");
    return loadSource(undefined, { ...owned, format }, () => producer.call(options.runtimeFactory, format));
  }
  function loadSource(input, loadOptions, producer) {
    assertPublicMutation();
    let bytes = input;
    if (!producer && !(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer))
      throw TypeError("InvalidDocumentBytes");
    const clearBytes = () => {
      if (bytes instanceof Uint8Array)
        bytes.fill(0);
      else if (bytes instanceof ArrayBuffer)
        new Uint8Array(bytes).fill(0);
    };
    const owned = copyOwned(loadOptions);
    if (!owned || !["hwp5", "hwpx"].includes(owned.format))
      throw Error("InvalidDocumentFormat");
    if (owned.history !== undefined && Object.hasOwn(owned.enableOptions ?? {}, "history"))
      throw Error("DuplicateHistoryOptions");
    const enableOptions = owned.history === undefined ? owned.enableOptions : { ...owned.enableOptions, history: owned.history };
    const sourceOptions = loadSourceOptions(owned);
    const cancellation = new CancellationFence;
    const job = { cancelled: false, fence: cancellation };
    loads.add(job);
    const guard = () => {
      if (job.cancelled)
        throw Error("LoadCancelled");
    };
    const tokenGeneration = ++nextGeneration, documentId = `${editorId}:instance:${instanceId}:document:${tokenGeneration}`;
    const message = {
      kind: "load",
      bytes,
      format: owned.format,
      ...sourceOptions,
      ...owned.password === undefined ? {} : { password: owned.password },
      ...owned.allowObservedChartOleDeviations === undefined ? {} : { allowObservedChartOleDeviations: owned.allowObservedChartOleDeviations }
    };
    return admit(async () => {
      const previousState = state;
      install({ status: "loading" });
      let candidate, keepLocked = false;
      const ctx = {
        editorId,
        documentId,
        generation: tokenGeneration,
        requestId: ++requestId,
        operationRevision: 0
      };
      try {
        if (locked) {
          const old = locked;
          locked = undefined;
          await release(old.runtime);
        }
        guard();
        if (producer) {
          const producing = Promise.resolve().then(producer).then((result) => {
            if (!(result instanceof Uint8Array))
              throw TypeError("InvalidDocumentBytes");
            bytes = result;
            if (job.cancelled || terminal) {
              result.fill(0);
              throw Error(terminal ? "EditorDisposed" : "LoadCancelled");
            }
            return result;
          });
          bytes = await interruptible(producing, [
            { fence: cancellation, error: "LoadCancelled" },
            { fence: disposedFence, error: "EditorDisposed" }
          ]);
          message.bytes = bytes;
          assertLive();
          guard();
        }
        candidate = await newRuntime();
        assertLive();
        guard();
        const reply = await candidate.request(message, ctx);
        verifyReply(reply, ctx);
        assertLive();
        guard();
        if (reply.error) {
          if (reply.passwordRequired === true) {
            locked = {
              runtime: candidate,
              message: { ...message, password: undefined },
              context: ctx,
              editable: owned.editable !== false,
              enableOptions
            };
            keepLocked = true;
          }
          throw Error(reply.error);
        }
        return await finishCandidate(candidate, message, ctx, owned.editable !== false, enableOptions, reply, guard, producer !== undefined);
      } catch (error) {
        if (!terminal)
          install({ status: previousState.status });
        notifyError(error, ctx);
        throw error;
      } finally {
        if (candidate && candidate !== active && !keepLocked)
          await release(candidate);
        clearBytes();
        delete message.password;
        loads.delete(job);
      }
    }, { replace: "load", abort: cancellation, guard }).finally(() => {
      loads.delete(job);
      clearBytes();
      delete message.password;
    });
  }
  function unlock(password, unlockOptions = {}) {
    assertPublicMutation();
    if (typeof password !== "string")
      throw TypeError("InvalidPassword");
    const owned = copyOwned(unlockOptions);
    return admit(async () => {
      const candidate = locked;
      if (!candidate)
        throw Error("NoLockedCandidate");
      const ctx = { ...candidate.context, requestId: ++requestId };
      let retryable = false;
      try {
        const reply = await candidate.runtime.request({ ...owned, kind: "unlock", password }, ctx);
        verifyReply(reply, ctx);
        if (reply.error) {
          retryable = retryablePasswordReply(reply);
          throw Error(reply.error);
        }
        assertLive();
        const result = await finishCandidate(candidate.runtime, candidate.message, ctx, candidate.editable, candidate.enableOptions, reply, () => {
          if (candidate.cancelled)
            throw Error("LoadCancelled");
        });
        locked = undefined;
        return result;
      } catch (error) {
        if (retryable && locked === candidate && !candidate.cancelled && !terminal) {
          const retry = new PasswordAttemptError(errorText(error));
          notifyError(retry, ctx, false);
          throw retry;
        }
        if (locked === candidate)
          locked = undefined;
        await release(candidate.runtime);
        notifyError(error, ctx);
        throw error;
      }
    }, { replace: "external-replace" });
  }
  function cancelLoad() {
    assertPublicMutation();
    for (const job of loads) {
      job.cancelled = true;
      job.fence.cancel();
    }
    if (locked)
      locked.cancelled = true;
    return enqueue(async () => {
      const candidate = locked;
      locked = undefined;
      await release(candidate?.runtime);
    });
  }
  function result(status, ctx, error, reply) {
    let ownedReply;
    try {
      if (reply !== undefined)
        ownedReply = freezeDTO(copyOwned(reply, true));
    } catch (metadataError) {
      notifyError(metadataError, ctx, status.startsWith("committed"));
    }
    const answer = {
      status,
      context: Object.freeze({ ...ctx }),
      state,
      error: error === undefined ? undefined : errorText(error),
      changed: reply?.meta?.changed ?? null,
      reply: ownedReply
    };
    return Object.freeze(answer);
  }
  function reject(ctx, error) {
    notifyError(error, ctx, false);
    return result("rejected-unapplied", ctx, error);
  }
  function requireReady(token, view = false) {
    assertLive();
    if (state.historyRecoveryRequired || state.nativeHistoryStats?.poisoned === true)
      throw Error("HistoryReloadRequired");
    if (!active || state.status !== "ready")
      throw Error(state.status === "refresh-required" ? "RefreshRequired" : "EditorNotReady");
    validateToken(token, state, view);
  }
  async function mutate(message, token, preserveFormattingSelection = false, admissionGuard) {
    const ctx = context(token);
    let reserved, reply;
    try {
      requireReady(token);
      writePolicy.assertWritable();
      admissionGuard?.();
      reserved = ++revisionClock;
      const historyCapture = geometry.captureHistory(state, message.kind);
      const exclusiveCapture = geometry.captureExclusive(state);
      const priorProjection = exclusiveCapture?.projection;
      const historyProjection = geometry.historyWindowHint(state, historyCapture);
      const projectionPreference = historyProjection && isPlainOwnerBaseline(state.content, historyProjection.owner.section, historyProjection.owner.paragraph) ? historyProjection : undefined;
      const projectionRequested = ["splice", "splice-current"].includes(message.kind) && !!priorProjection && !state.content?.readOnly && !state.content?.window && isPlainOwnerBaseline(state.content, message.section, message.paragraph);
      try {
        reply = admissionGuard || (projectionRequested || projectionPreference) && hasRuntimeAdmission(active) ? await requestAtRuntimeAdmission(active, message, ctx, admissionGuard ?? (() => {}), projectionPreference ?? projectionRequested) : await active.request(message, ctx);
        verifyReply(reply, ctx);
      } catch (error) {
        if (error instanceof RuntimeAdmissionRejected)
          return reject(ctx, error);
        install({ operationRevision: reserved, status: "refresh-required" });
        notifyError(error, ctx, "unknown");
        return result("committed-refresh-required", ctx, error);
      }
      const application = reply.meta?.application ?? (reply.applied === true ? "applied" : reply.error && reply.applied === false ? "unapplied" : undefined);
      if (reply.historyPoisoned === true || reply.historyStats?.poisoned === true) {
        install({
          content: ownObservation(writePolicy.observe(state.content, false))(),
          capabilities: ownObservation(writePolicy.capabilities(state.capabilities, false))(),
          operationRevision: application === "unapplied" ? state.operationRevision : reserved,
          status: "refresh-required",
          historyRecoveryRequired: true,
          nativeHistoryStats: reply.historyStats,
          nativeHistoryRevision: history(reply)
        });
        const failure = reply.error ?? "HistoryReloadRequired";
        notifyError(failure, ctx, application === "unapplied" ? false : "unknown");
        return result(application === "unapplied" ? "rejected-unapplied" : "committed-refresh-required", ctx, failure, reply);
      }
      if (application === "unapplied") {
        if (message.kind === "formatting-patch" && reply.formattingRefreshRequired === true)
          install({ status: "refresh-required" });
        if (message.kind === "formatting-patch" && reply.formattingNativeCode === 2) {
          if (reply.error)
            notifyError(reply.error, ctx, false);
          return result("known-no-op", ctx, reply.error, reply);
        }
        if (message.kind === "formatting-patch" && reply.error) {
          notifyError(reply.error, ctx, false);
          return result("rejected-unapplied", ctx, reply.error, reply);
        }
        if (reply.error)
          return reject(ctx, reply.error);
        return result("known-no-op", ctx, undefined, reply);
      }
      const noOp = !reply.error && (reply.meta?.changed === false || reply.changed === false);
      if (noOp) {
        geometry.invalidate();
        return result("known-no-op", ctx, undefined, reply);
      }
      if (reply.error || reply.content === undefined) {
        install({
          operationRevision: reserved,
          status: "refresh-required",
          nativeHistoryStats: reply.historyStats,
          nativeHistoryRevision: history(reply)
        });
        notifyError(reply.error ?? "SnapshotMissing", ctx, application === "applied" ? true : "unknown");
        return result("committed-refresh-required", ctx, reply.error ?? "SnapshotMissing", reply);
      }
      try {
        const mutationReply = reply;
        let origin = takeGeometryOrigin(active, reply, ctx);
        let merged;
        if (reply.content?.viewKind === "history-owner-window") {
          requireReady(token);
          merged = geometry.mergeHistoryWindow(state, reply.content, origin, historyCapture, reply);
          if (!merged) {
            geometry.invalidate();
            reply = await active.request({ kind: "refresh" }, ctx);
            verifyReply(reply, ctx);
            requireReady(token);
            if (reply.error || !reply.content || reply.content.viewKind)
              throw Error("HistoryWindowFallbackFailed");
            origin = takeGeometryOrigin(active, reply, ctx);
          }
        }
        if (reply.content?.viewKind === "owner-window-patch") {
          requireReady(token);
          if (priorProjection && origin)
            merged = mergeExclusiveOwnerWindow(state, reply.content, origin, {
              context: ctx,
              sequence: exclusiveCapture.sequence + 1,
              revision: state.nativeHistoryRevision,
              epoch: priorProjection.evidence.nativeEpoch,
              referenceScope: priorProjection.evidence.scope.referenceScope
            });
          if (!merged) {
            reply = await active.request({ kind: "refresh" }, ctx);
            verifyReply(reply, ctx);
            requireReady(token);
            if (reply.error || !reply.content || reply.content.viewKind)
              throw Error("OwnerProjectionFallbackFailed");
            origin = takeGeometryOrigin(active, reply, ctx);
          }
        }
        const patch = merged ? {
          content: merged,
          capabilities: observeCapabilities(assembleCapabilities(reply), undefined, true),
          historyRecoveryRequired: false,
          nativeHistoryStats: reply.historyStats,
          nativeHistoryRevision: history(reply),
          nativeHistoryRevisions: reply.historyRevisions,
          selection: undefined,
          viewRevision: state.viewRevision + 1
        } : contentPatch(reply);
        let selection = preserveFormattingSelection ? formattingSelection(state, patch, reserved) : undefined;
        if (message.kind === "undo" || message.kind === "redo") {
          const provisional = new EditorState({
            ...state.token,
            ...patch,
            operationRevision: reserved,
            stateVersion: state.stateVersion + 1,
            status: "ready"
          }, runRead);
          selection = selectionHistory.restore(provisional);
        }
        install({ ...patch, selection, operationRevision: reserved, status: "ready" }, true, ctx, origin, { kind: message.kind, capture: historyCapture });
        if (["owner-window-patch", "history-owner-window"].includes(mutationReply.content?.viewKind)) {
          reply = {
            ...mutationReply,
            content: state.content,
            ...reply.historyStats === undefined ? {} : { historyStats: reply.historyStats },
            ...reply.historyRevision === undefined ? {} : { historyRevision: reply.historyRevision },
            ...reply.historyRevisions === undefined ? {} : { historyRevisions: reply.historyRevisions },
            ...reply.historyPoisoned === undefined ? {} : { historyPoisoned: reply.historyPoisoned }
          };
        }
      } catch (error) {
        install({ operationRevision: reserved, status: "refresh-required" });
        notifyError(error, ctx, true);
        return result("committed-refresh-required", ctx, error);
      }
      return result("committed-with-snapshot", ctx, undefined, reply);
    } catch (error) {
      return reject(ctx, error);
    }
  }
  function capture(command, payload, snapshot = state) {
    if (!command || typeof command.id !== "symbol")
      throw Error("InvalidCommand");
    const owned = copyOwned(payload);
    return {
      command,
      payload: owned,
      token: owned?.target ?? owned?.token ?? snapshot.token,
      handlers: registry.capture(command)
    };
  }
  async function execute(pending) {
    const ctx = context(pending.token);
    try {
      requireReady(pending.token);
      handling = true;
      let handled;
      try {
        handled = registry.run(pending.handlers, pending.payload, (v) => copyOwned(v));
      } finally {
        handling = false;
      }
      assertLive();
      if (handled)
        return result("handled-without-runtime", ctx);
      writePolicy.assertWritable();
      if (pending.command.id === APPLY_FORMATTING_PATCH_COMMAND.id) {
        const payload = pending.payload;
        if (!payload || Object.keys(payload).some((key) => !["target", "patch", "selectionVersion"].includes(key)))
          throw Error("InvalidFormattingPatch");
        validateFormattingPatch(payload.patch);
        const selector = atomicSelector(payload.target, state, true, formattingPatchNeedsCharacter(payload.patch));
        const capability = await readFormattingCapabilities(payload.target);
        if (!capability.atomic)
          throw Error(capability.reason);
        const guard = () => {
          requireReady(payload.target, true);
          assertFormattingAdmission(payload, state.stateVersion, capability.selectionAdmissionFence);
        };
        guard();
        const prepared = await readRequest({ kind: "query-formatting", selector, fields: [] }, payload.target, guard, true);
        guard();
        const value = checkedFormattingQuery(prepared.formatting);
        if (value.binding.revision === null)
          throw Error("InvalidFormattingBinding");
        return await mutate({
          kind: "formatting-patch",
          request: {
            schemaVersion: 1,
            binding: value.binding,
            targets: value.targets,
            patch: payload.patch
          }
        }, payload.target, true, guard);
      }
      if (pending.command.id === SPLICE_TEXT_COMMAND.id) {
        const payload = pending.payload;
        if (payload.selectionVersion !== undefined && payload.selectionVersion !== state.stateVersion)
          throw Error("StaleClipboardSelection");
        if (typeof payload.text !== "string" || !isWellFormed(payload.text))
          throw Error("InvalidText");
        const position = selectionMessage(payload.target, state);
        return await mutate({ kind: "splice", ...position, text: payload.text }, payload.target);
      }
      if (pending.command.id === INSERT_TABLE_COMMAND.id) {
        const payload = pending.payload;
        return await mutate(tableInsertMessage(payload, state), payload.target);
      }
      if (pending.command.id === SET_CHARACTER_FONT_NAME_COMMAND.id) {
        const payload = pending.payload;
        return await mutate(fontNameMessage(payload, state), payload.target, true);
      }
      if (pending.command.id === SET_CHARACTER_TEXT_COLOR_COMMAND.id) {
        const payload = pending.payload;
        return await mutate(textColorMessage(payload, state), payload.target, true);
      }
      if (pending.command.id === SET_CHARACTER_STRIKE_COMMAND.id) {
        const payload = pending.payload;
        return await mutate(strikeMessage(payload, state), payload.target, true);
      }
      if (pending.command.id === SET_CHARACTER_UNDERLINE_COMMAND.id) {
        const payload = pending.payload;
        return await mutate(underlineMessage(payload, state), payload.target, true);
      }
      if (pending.command.id === SET_CHARACTER_PROPERTIES_COMMAND.id || pending.command.id === SET_PARAGRAPH_ALIGNMENT_COMMAND.id) {
        const payload = pending.payload;
        const message = formattingMessage(payload, state, pending.command.id === SET_CHARACTER_PROPERTIES_COMMAND.id);
        return await mutate(message, payload.target, true);
      }
      if (pending.command.id === UNDO_COMMAND.id || pending.command.id === REDO_COMMAND.id) {
        const payload = pending.payload;
        validateToken(payload.token, state);
        return await mutate({ kind: pending.command.id === UNDO_COMMAND.id ? "undo" : "redo" }, payload.token);
      }
      return reject(ctx, "UnsupportedCommand");
    } catch (error) {
      return reject(ctx, error);
    }
  }
  function dispatchCommand(command, payload) {
    assertPublicMutation();
    const pending = capture(command, payload);
    return admit(() => execute(pending));
  }
  function update(callback) {
    if (readDepth) {
      geometry.invalidate();
      throw Error("ReadMutation");
    }
    if (collecting)
      throw Error("NestedUpdate");
    if (handling) {
      geometry.invalidate();
      throw Error("CommandHandlerMutation");
    }
    assertLive();
    if (typeof callback !== "function")
      throw TypeError("InvalidUpdateCallback");
    if (isAsyncFunction(callback))
      throw Error("AsyncUpdate");
    const snapshot = state, pending = [];
    let open = true;
    const collector = Object.freeze({
      dispatchCommand(command, payload) {
        if (!open)
          throw Error("CollectorClosed");
        pending.push(capture(command, payload, snapshot));
      }
    });
    collecting = true;
    try {
      const returned = callback(collector, snapshot);
      if (isPromiseLike(returned)) {
        discardPromise(returned);
        throw Error("AsyncUpdate");
      }
      if (returned !== undefined)
        throw Error("InvalidUpdateReturn");
    } finally {
      collecting = false;
      open = false;
    }
    return admit(async () => {
      const results = [];
      let stoppedIndex = null;
      for (const [index, command] of pending.entries()) {
        const answer = await execute(command);
        results.push(answer);
        if (answer.status === "rejected-unapplied" || answer.status === "committed-refresh-required") {
          stoppedIndex = index;
          break;
        }
      }
      return Object.freeze({ results: Object.freeze(results), stoppedIndex, state });
    });
  }
  function refresh() {
    assertPublicMutation();
    const token = state.token;
    return enqueue(async () => {
      if (!active || state.status !== "refresh-required")
        throw Error("RefreshNotRequired");
      validateToken(token, state);
      const ctx = context(token);
      try {
        const reply = await active.request({ kind: "refresh" }, ctx);
        verifyReply(reply, ctx);
        if (reply.error)
          throw Error(reply.error);
        assertLive();
        const poisoned = state.historyRecoveryRequired || reply.historyPoisoned === true || reply.historyStats?.poisoned === true;
        install({ ...contentPatch(reply), status: poisoned ? "refresh-required" : "ready" }, true, ctx);
        if (poisoned)
          throw Error("HistoryReloadRequired");
        return state;
      } catch (error) {
        notifyError(error, ctx, false);
        throw error;
      }
    });
  }
  function save(saveOptions = {}) {
    assertPublicMutation();
    const owned = copyOwned(saveOptions);
    return admit(async () => {
      const token = owned.token ?? state.token;
      if (!active || state.documentId === null)
        throw Error("EditorNotReady");
      validateToken(token, state);
      const stale = state.status === "refresh-required" || state.historyRecoveryRequired || state.nativeHistoryStats?.poisoned === true;
      if (stale && !owned.recovery)
        throw Error("RecoverySaveRequired");
      if (!stale && state.status !== "ready")
        throw Error("EditorNotReady");
      const ctx = context(token);
      const format = state.content?.format;
      if (format !== "hwp5" && format !== "hwpx")
        throw Error("UnknownDocumentFormat");
      try {
        const reply = await active.request({
          kind: "save",
          allowStaleLayout: owned.allowStaleLayout ?? false,
          allowUnprotectedOutput: owned.allowUnprotectedOutput ?? false
        }, ctx);
        verifyReply(reply, ctx);
        if (reply.error)
          throw Error(reply.error);
        if (!(reply.bytes instanceof Uint8Array))
          throw Error("SaveBytesMissing");
        const bytes = reply.bytes.slice();
        assertLive();
        install({ savedOperationRevision: token.operationRevision });
        return Object.freeze({
          bytes,
          documentId: token.documentId,
          generation: token.generation,
          operationRevision: token.operationRevision,
          nativeHistoryRevision: history(reply) ?? state.nativeHistoryRevision,
          format,
          staleSnapshot: stale,
          layoutRequiresReflow: typeof reply.layoutRequiresReflow === "boolean" ? reply.layoutRequiresReflow : undefined,
          reply: freezeDTO(copyOwned(reply, true))
        });
      } catch (error) {
        notifyError(error, ctx, false);
        throw error;
      }
    });
  }
  function requestExperimental(message, experimental) {
    assertPublicMutation();
    const owned = copyOwned(message), settings = copyOwned(experimental);
    if (!owned || typeof owned.kind !== "string" || typeof settings.mutation !== "boolean")
      throw Error("InvalidExperimentalRequest");
    if (["load", "unlock", "enable", "save", "refresh", "undo", "redo", "splice"].includes(owned.kind))
      throw Error("UseTypedEditorOperation");
    const operation = surfaceOperation(owned.kind);
    if (operation && settings.mutation !== (operation === "mutation"))
      throw Error("OperationClassificationMismatch");
    if (!settings.mutation && operation !== "read")
      throw Error("UnsafeExperimentalQuery");
    return (settings.mutation ? admit : enqueue)(async () => {
      if (settings.mutation)
        return mutate(owned, settings.token);
      requireReady(settings.token);
      const ctx = context(settings.token);
      try {
        const reply = await active.request(owned, ctx);
        verifyReply(reply, ctx);
        if (reply.error)
          throw Error(reply.error);
        return freezeDTO(copyOwned(reply, true));
      } catch (error) {
        notifyError(error, ctx, false);
        throw error;
      }
    });
  }
  function setSelection(target, options = {}) {
    assertPublicMutation();
    const owned = copyOwned(target), settings = copyOwned(options);
    if (!settings || typeof settings !== "object" || Array.isArray(settings) || Object.keys(settings).some((key) => key !== "stateVersion") || settings.stateVersion !== undefined && (!Number.isSafeInteger(settings.stateVersion) || settings.stateVersion < 0))
      throw Error("InvalidSelectionOptions");
    const version = settings.stateVersion;
    return admit(async () => {
      requireReady(owned ?? state.token);
      if (version !== undefined && version !== state.stateVersion)
        throw Error("StaleSelectionObservation");
      if (owned)
        validateSelection(owned, state);
      install({ selection: owned });
      return state;
    });
  }
  function historyCommand(command, token) {
    assertPublicMutation();
    const explicit = token === undefined ? undefined : copyOwned(token), handlers = registry.capture(command);
    return admit(() => execute({ ...capture(command, { token: explicit ?? state.token }), handlers }));
  }
  async function readRequest(message, token, guard = () => {}, admitted = false) {
    guard();
    requireReady(token, true);
    const ctx = context(token);
    try {
      const reply = admitted ? await requestAtRuntimeAdmission(active, message, ctx, guard) : await active.request(message, ctx);
      verifyReply(reply, ctx);
      if (reply.error)
        throw Error(reply.error);
      assertLive();
      guard();
      return freezeDTO(copyOwned(reply, true));
    } catch (error) {
      notifyError(error, ctx, false);
      throw error;
    }
  }
  function hostFormattingWritable() {
    try {
      writePolicy.assertWritable();
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === "ReadOnlyDocument")
        return false;
      throw error;
    }
  }
  function checkedFormattingQuery(input) {
    const v = input;
    if (v?.schemaVersion !== 1 || typeof v.binding?.session !== "string" || !v.binding.session || !Array.isArray(v.targets) || v.targets.length !== 1 || typeof v.targets[0]?.ref !== "string" || !v.targets[0].ref || !Array.isArray(v.observations?.perTarget) || v.observations.perTarget.length !== 1 || v.observations.perTarget[0].ref !== v.targets[0].ref || !v.observations.aggregate)
      throw Error("MalformedFormattingQuery");
    if (v.binding.revision !== null && (!Number.isSafeInteger(v.binding.revision) || v.binding.revision < 0 || v.binding.revision >= 4294967295))
      throw Error("InvalidFormattingBinding");
    for (const fields of [v.observations.aggregate, v.observations.perTarget[0].fields]) {
      if (!fields || typeof fields !== "object" || Array.isArray(fields))
        throw Error("MalformedFormattingQuery");
      for (const observation of Object.values(fields)) {
        const o = observation;
        if (!o || typeof o.state !== "string" || !["known", "mixed", "unknown", "unavailable"].includes(o.state) || typeof o.writable !== "boolean" || !o.writable && typeof o.writeUnavailableReason !== "string" || (o.state === "unknown" || o.state === "unavailable") && typeof o.reason !== "string" || o.state === "known" && !Object.hasOwn(o, "value") || o.unit !== undefined && typeof o.unit !== "string")
          throw Error("MalformedFormattingQuery");
      }
    }
    if (!hostFormattingWritable()) {
      const observe = (fields) => Object.fromEntries(Object.entries(fields).map(([key, o]) => [
        key,
        o.writable ? { ...o, writable: false, writeUnavailableReason: "ReadOnlyDocument" } : o
      ]));
      return freezeDTO(copyOwned({
        ...v,
        observations: {
          perTarget: v.observations.perTarget.map((row) => ({
            ...row,
            fields: observe(row.fields)
          })),
          aggregate: observe(v.observations.aggregate)
        }
      }, true));
    }
    return freezeDTO(copyOwned(v, true));
  }
  async function readFormattingCapabilities(token, guard = () => {}) {
    requireReady(token, true);
    if (!hasRuntimeAdmission(active))
      return Object.freeze({ atomic: false, reason: "UnsupportedAtomicRuntime" });
    const ready = () => {
      requireReady(token, true);
      guard();
    };
    const reply = await readRequest({ kind: "formatting-capabilities" }, token, ready, true);
    const cap = reply.formattingCapabilities;
    if (cap?.atomic === false && typeof cap.reason === "string")
      return freezeDTO(copyOwned(cap, true));
    if (cap?.atomic !== true || cap.schemaVersion !== 1 || cap.coordinateSpace !== "native-source-utf16" || cap.requiresHistoryProtocol !== 2 || cap.format !== state.content.format || typeof cap.binding?.session !== "string" || !cap.binding.session || !cap.fields || !cap.limits)
      throw Error("MalformedFormattingCapabilities");
    if (cap.binding.revision !== null && (!Number.isSafeInteger(cap.binding.revision) || cap.binding.revision < 0 || cap.binding.revision >= 4294967295))
      throw Error("InvalidFormattingBinding");
    for (const n of [
      "requestBytes",
      "replyBytes",
      "targets",
      "ranges",
      "commands",
      "fontNameBytes",
      "projectionBytes"
    ])
      if (!Number.isSafeInteger(cap.limits[n]) || cap.limits[n] <= 0)
        throw Error("MalformedFormattingCapabilities");
    const fence = Object.freeze({
      version: 1,
      commands: Object.freeze(["APPLY_FORMATTING_PATCH"]),
      epoch: "stateVersion"
    });
    const fields = hostFormattingWritable() ? cap.fields : Object.fromEntries(Object.entries(cap.fields).map(([key, field]) => [
      key,
      field.writable ? { ...field, writable: false, writeUnavailableReason: "ReadOnlyDocument" } : field
    ]));
    return freezeDTO(copyOwned({
      ...cap,
      fields,
      ...hasRuntimeAdmission(active) ? { selectionAdmissionFence: fence } : {}
    }, true));
  }
  function getFormattingCapabilities(options = {}) {
    assertPublicMutation();
    const settings = copyOwned(options);
    if (!settings || typeof settings !== "object" || Array.isArray(settings) || Object.keys(settings).some((k) => k !== "token"))
      throw Error("InvalidFormattingCapabilityOptions");
    if (settings.token === null)
      throw Error("InvalidFormattingCapabilityOptions");
    const token = copyOwned(settings.token ?? state.token);
    return enqueue(() => readFormattingCapabilities(token));
  }
  function queryFormatting(target, options = {}) {
    assertPublicMutation();
    const owned = copyOwned(target), settings = copyOwned(options);
    if (!settings || typeof settings !== "object" || Array.isArray(settings) || Object.keys(settings).some((k) => k !== "fields") || settings.fields !== undefined && (!Array.isArray(settings.fields) || settings.fields.some((f) => typeof f !== "string")))
      throw Error("InvalidFormattingQueryOptions");
    return enqueue(async () => {
      requireReady(owned, true);
      if (!hasRuntimeAdmission(active))
        throw Error("UnsupportedAtomicRuntime");
      const selector = atomicSelector(owned, state, false, owned.startUnit !== owned.endUnit);
      const reply = await readRequest({
        kind: "query-formatting",
        selector,
        ...settings.fields === undefined ? {} : { fields: settings.fields }
      }, owned, () => requireReady(owned, true), true);
      return checkedFormattingQuery(reply.formatting);
    });
  }
  function readResource(message, requestOptions) {
    assertPublicMutation();
    const owned = copyOwned(message), expected = copyOwned(requestOptions === undefined ? state.token : ("token" in requestOptions) ? requestOptions.token : requestOptions);
    if (surfaceOperation(owned.kind) !== "read")
      return Promise.reject(Error("UnsupportedReadOperation"));
    return enqueue(() => readRequest(owned, expected));
  }
  function acquireInputSurface(hooks) {
    assertPublicMutation();
    assertLive();
    if (surface)
      throw Error("InputSurfaceAlreadyAttached");
    if (!hooks || typeof hooks.commitComposition !== "function" || typeof hooks.cancelComposition !== "function")
      throw Error("InvalidInputSurfaceHooks");
    const fence = new CancellationFence;
    const generation = ++surfaceEpoch;
    const record = {
      id: `${editorId}:surface:${generation}`,
      generation,
      active: true,
      hooks: {
        commitComposition: hooks.commitComposition.bind(hooks),
        cancelComposition: hooks.cancelComposition.bind(hooks)
      },
      fence
    };
    surface = record;
    const lease = Object.freeze({
      id: record.id,
      generation,
      isActive: () => !terminal && record.active && surface === record,
      request(message, requestOptions) {
        assertPublicMutation();
        let owned, expected, operation;
        try {
          assertSurface(record);
          owned = copyOwned(message);
          expected = copyOwned(requestOptions);
          if (expected.coordinates !== "legacy-native")
            throw Error("InvalidSurfaceCoordinates");
          operation = surfaceOperation(owned.kind);
          if (!operation)
            throw Error("UnsupportedSurfaceOperation");
        } catch (error) {
          return Promise.reject(error);
        }
        return enqueue(async () => {
          assertSurface(record);
          requireReady(expected.token, true);
          if (operation === "read")
            return readRequest(owned, expected.token, () => assertSurface(record));
          if (operation === "view") {
            const ctx = context(expected.token);
            const reply = await active.request(owned, ctx);
            verifyReply(reply, ctx);
            if (reply.error)
              throw Error(reply.error);
            install(contentPatch(reply), false, ctx, takeGeometryOrigin(active, reply, ctx));
            assertSurface(record);
            return freezeDTO(copyOwned(reply, true));
          }
          const answer = await mutate(owned, expected.token);
          assertSurface(record);
          return answer;
        });
      },
      publishSelection(target) {
        assertPublicMutation();
        let owned;
        const expected = state.token;
        try {
          assertSurface(record);
          owned = copyOwned(target);
        } catch (error) {
          return Promise.reject(error);
        }
        return enqueue(async () => {
          assertSurface(record);
          requireReady(owned ?? expected);
          if (owned)
            validateSelection(owned, state);
          install({ selection: owned });
          assertSurface(record);
          return state;
        });
      },
      release() {
        if (!record.active)
          return;
        assertPublicMutation();
        geometry.invalidate();
        record.active = false;
        record.fence.cancel();
        if (surface === record) {
          surface = undefined;
          install({ selection: null });
        }
        cancelComposition(record, "detach");
      }
    });
    bindGeometryProjectionPort(lease, (snapshot) => !terminal && record.active && surface === record && snapshot === state ? geometry.read(snapshot) : undefined);
    return lease;
  }
  function register(set, listener) {
    assertLive();
    if (typeof listener !== "function")
      throw TypeError("InvalidListener");
    set.add(listener);
    let attached = true;
    return () => {
      if (!attached)
        return;
      attached = false;
      set.delete(listener);
    };
  }
  function dispose() {
    geometry.invalidate();
    assertPublicMutation();
    if (disposePromise)
      return disposePromise;
    terminal = true;
    selectionHistory.clear();
    disposedFence.cancel();
    for (const job of loads)
      job.fence.cancel();
    loads.clear();
    if (surface) {
      const detached = surface;
      surface = undefined;
      detached.active = false;
      detached.fence.cancel();
      cancelComposition(detached, "dispose");
    }
    state = new EditorState({
      editorId,
      documentId: state.documentId,
      generation: state.generation,
      operationRevision: state.operationRevision,
      viewRevision: state.viewRevision,
      stateVersion: ++stateVersion,
      status: "disposed",
      content: state.content,
      capabilities: state.capabilities,
      historyRecoveryRequired: state.historyRecoveryRequired,
      nativeHistoryStats: state.nativeHistoryStats,
      nativeHistoryRevision: state.nativeHistoryRevision,
      nativeHistoryRevisions: state.nativeHistoryRevisions,
      savedOperationRevision: state.savedOperationRevision,
      selection: state.selection
    }, runRead);
    stateListeners.clear();
    updateListeners.clear();
    errorListeners.clear();
    registry.clear();
    const nativeDisposal = queue.enqueue(async () => {
      const current = active, candidate = locked?.runtime;
      active = undefined;
      locked = undefined;
      const failures = [];
      for (const runtime of [candidate, current])
        try {
          await release(runtime);
        } catch (error) {
          failures.push(error);
        }
      if (failures.length)
        throw new AggregateError(failures, "RuntimeDisposeFailed");
    });
    disposePromise = Promise.all([nativeDisposal, admission.drain()]).then(() => {});
    return disposePromise;
  }
  function geometryGuard(fn) {
    return (...args) => {
      try {
        const value = fn(...args);
        if (value instanceof Promise)
          value.catch(() => geometry.invalidate());
        return value;
      } catch (error) {
        geometry.invalidate();
        throw error;
      }
    };
  }
  return Object.freeze({
    getEditorState: () => state,
    read: (callback) => runRead(callback, state),
    load: geometryGuard(load),
    createDocument: geometryGuard(createDocument),
    unlock: geometryGuard(unlock),
    cancelLoad: geometryGuard(cancelLoad),
    dispatchCommand: geometryGuard(dispatchCommand),
    update: geometryGuard(update),
    save: geometryGuard(save),
    refresh: geometryGuard(refresh),
    requestExperimental: geometryGuard(requestExperimental),
    readResource: geometryGuard(readResource),
    getFormattingCapabilities: geometryGuard(getFormattingCapabilities),
    queryFormatting: geometryGuard(queryFormatting),
    setSelection: geometryGuard(setSelection),
    acquireInputSurface: geometryGuard(acquireInputSurface),
    dispose: geometryGuard(dispose),
    undo: (token) => historyCommand(UNDO_COMMAND, token),
    redo: (token) => historyCommand(REDO_COMMAND, token),
    registerStateListener: (listener) => register(stateListeners, listener),
    registerUpdateListener: (listener) => register(updateListeners, listener),
    registerErrorListener: (listener) => register(errorListeners, listener),
    registerCommand: (command, callback, priority = 0) => {
      assertLive();
      return registry.register(command, callback, priority);
    }
  });
}
// web/preview/character-size-selection.mjs
var isSourceCharacterSize = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
function characterSizeState(content, paragraph, start, end, { isBoundary = (text, unit, last = false) => snapUnit(text, unit, last) === unit } = {}) {
  if (content?.characterPropertiesAvailable !== true || typeof paragraph?.text !== "string" || paragraph.clipped || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end || end > paragraph.text.length || !isBoundary(paragraph.text, start) || !isBoundary(paragraph.text, end, true))
    return null;
  const shapes = observationRows(content.characterShapes);
  const spans = observationSpans(paragraph);
  if (!shapes || !spans)
    return null;
  let cursor = start, size, mixed = false;
  for (const span of spans) {
    const low = Math.max(start, span.start), high = Math.min(end, span.end);
    if (low >= high)
      continue;
    if (!uint(span.charShapeId))
      return null;
    const current = shapes.get(span.charShapeId)?.height;
    if (low !== cursor || !isSourceCharacterSize(current))
      return null;
    if (size === undefined)
      size = current;
    else if (size !== current)
      mixed = true;
    cursor = high;
  }
  return cursor === end && size !== undefined ? mixed ? "mixed" : size : null;
}

// web/preview/character-typing-properties.mjs
function scalarStart(text, unit) {
  const previous = text.charCodeAt(unit - 1), current = text.charCodeAt(unit);
  return previous >= 55296 && previous <= 56319 && current >= 56320 && current <= 57343 ? unit - 1 : unit;
}
function typingSourceSpan(text, unit) {
  if (typeof text !== "string" || !text.length || !Number.isInteger(unit) || unit < 0 || unit > text.length)
    return null;
  const at = scalarStart(text, unit);
  return {
    start: at > 0 ? scalarStart(text, at - 1) : 0,
    end: at > 0 ? at : text.codePointAt(0) > 65535 ? 2 : 1
  };
}

// web/preview/character-property-selection.mjs
function characterPropertyResourceValue(property, shape, underline, strike) {
  if (property === "strike")
    return strike?.enabled;
  if (property === "underline") {
    const kind = underline?.kind;
    return ["none", "bottom", "center", "top"].includes(kind) ? kind !== "none" : null;
  }
  return shape?.[property];
}
function characterSelectionState(content, paragraph, start, end, property) {
  const underline = property === "underline";
  const strike = property === "strike";
  if (typeof paragraph?.text !== "string" || (strike ? content?.characterStrikeAvailable : underline ? content?.characterUnderlineAvailable : content?.characterPropertiesAvailable) !== true || !["bold", "italic", "underline", "strike"].includes(property) || paragraph?.clipped || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end || end > paragraph?.text?.length)
    return null;
  const spans = observationSpans(paragraph);
  const shapes = underline || strike ? null : observationRows(content.characterShapes);
  const underlines = underline ? observationRows(content.characterUnderlines) : null;
  const strikes = strike ? observationRows(content.characterStrikes) : null;
  if (!spans || !(strike ? strikes : underline ? underlines : shapes))
    return null;
  let cursor = start, allEnabled = true, anyEnabled = false;
  for (const span of spans) {
    const low = Math.max(start, span.start), high = Math.min(end, span.end);
    if (low >= high)
      continue;
    if (!uint(span.charShapeId))
      return null;
    const shape = shapes?.get(span.charShapeId);
    const enabled = characterPropertyResourceValue(property, shape, underlines?.get(span.charShapeId), strikes?.get(span.charShapeId));
    if (low !== cursor || typeof enabled !== "boolean")
      return null;
    allEnabled &&= enabled;
    anyEnabled ||= enabled;
    cursor = high;
  }
  return cursor === end ? allEnabled ? true : anyEnabled ? "mixed" : false : null;
}

// packages/core/src/state/formatting-state.ts
var message = (error) => error instanceof Error ? error.message : String(error);
function getSelectionFormatting(state) {
  const unavailable = (reason) => Object.freeze({
    target: null,
    characterAvailableReason: reason,
    paragraphAvailableReason: reason,
    underlineAvailableReason: reason,
    strikeAvailableReason: reason,
    textColorAvailableReason: reason,
    fontNames: Object.freeze(Object.fromEntries(FONT_LANGUAGES.map((language) => [
      language,
      Object.freeze({ kind: "unknown" })
    ]))),
    fontNameAvailableReasons: Object.freeze(Object.fromEntries(FONT_LANGUAGES.map((language) => [language, reason]))),
    textColor: null,
    bold: null,
    italic: null,
    underline: null,
    strike: null,
    size: null,
    align: null
  });
  if (state.status !== "ready")
    return unavailable(state.status === "refresh-required" ? "RefreshRequired" : "EditorNotReady");
  const selection = state.selection;
  if (selection == null)
    return unavailable("MissingSelection");
  let target, row;
  try {
    const selected = selection;
    row = validateSelection(selected, state);
    target = Object.freeze({
      editorId: selected.editorId,
      documentId: selected.documentId,
      generation: selected.generation,
      operationRevision: selected.operationRevision,
      viewRevision: selected.viewRevision,
      coordinateSpace: selected.coordinateSpace,
      format: selected.format,
      owner: selected.owner,
      section: selected.section,
      paragraph: selected.paragraph,
      startUnit: selected.startUnit,
      endUnit: selected.endUnit,
      affinity: selected.affinity
    });
  } catch (error) {
    return unavailable(message(error));
  }
  const reason = (character, capability) => {
    try {
      validateFormattingTarget(target, state, character, capability);
      return null;
    } catch (error) {
      return message(error);
    }
  };
  const characterAvailableReason = reason(true), paragraphAvailableReason = reason(false);
  const underlineAvailableReason = reason(true, "characterUnderlineAvailable");
  const strikeTargetReason = reason(true, "characterStrikeAvailable");
  const content = state.content;
  const caret = target.startUnit === target.endUnit;
  const span = caret ? typingSourceSpan(row.text, target.startUnit) : null;
  const start = span?.start ?? target.startUnit;
  const end = span?.end ?? target.endUnit;
  const observedSpan = characterRangeValues({ paragraphs: [row] }, [{ section: target.section, paragraph: target.paragraph, startUnit: start, endUnit: end }], () => true, { isBoundary: isUtf16Boundary });
  const canObserve = (capability) => observedSpan !== null && content[capability] === true;
  const bold = canObserve("characterPropertiesAvailable") ? characterSelectionState(content, row, start, end, "bold") : null;
  const italic = canObserve("characterPropertiesAvailable") ? characterSelectionState(content, row, start, end, "italic") : null;
  const underline = canObserve("characterUnderlineAvailable") ? characterSelectionState(content, row, start, end, "underline") : null;
  const strike = canObserve("characterStrikeAvailable") ? characterSelectionState(content, row, start, end, "strike") : null;
  const strikeAvailableReason = strikeTargetReason ?? (strike === null ? "UnknownCharacterStrike" : null);
  const textColorTargetReason = reason(true, "characterTextColorAvailable");
  const colorObservation = canObserve("characterTextColorAvailable") ? characterTextColorObservation(content, row, start, end) : null;
  const textColor = colorObservation?.value ?? null;
  const textColorAvailableReason = textColorTargetReason ?? (colorObservation?.bindingValid ? null : "UnknownCharacterTextColor");
  const size = canObserve("characterPropertiesAvailable") ? characterSizeState(content, row, start, end, {
    isBoundary: isUtf16Boundary
  }) : null;
  const align = paragraphAlignmentKey(row.paragraphShape?.alignment);
  const fontTargetReason = reason(true, "characterFontNameAvailable");
  const fontObserved = characterFontNameObservations(content, row, start, end);
  const fontNames = Object.freeze(Object.fromEntries(FONT_LANGUAGES.map((language) => [
    language,
    fontObserved[language].value
  ])));
  const fontNameAvailableReasons = Object.freeze(Object.fromEntries(FONT_LANGUAGES.map((language) => [
    language,
    fontTargetReason ?? (fontObserved[language].bindingValid ? null : "UnknownCharacterFontName")
  ])));
  return Object.freeze({
    target,
    characterAvailableReason,
    paragraphAvailableReason,
    underlineAvailableReason,
    strikeAvailableReason,
    textColorAvailableReason,
    fontNames,
    fontNameAvailableReasons,
    textColor,
    bold,
    italic,
    underline,
    strike,
    size,
    align
  });
}
// js/document-format.mjs
var cfbSignature = Uint8Array.of(208, 207, 17, 224, 161, 177, 26, 225);
var hwp3Signature = new TextEncoder().encode("HWP Document File V3");
var startsWith = (bytes, signature) => bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
function detectDocumentFormat(input) {
  const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null;
  if (!bytes)
    throw new TypeError("ExpectedDocumentBytes");
  if (startsWith(bytes, cfbSignature))
    return "hwp5";
  if (bytes.length >= 4 && bytes[0] === 80 && bytes[1] === 75 && (bytes[2] === 3 && bytes[3] === 4 || bytes[2] === 5 && bytes[3] === 6 || bytes[2] === 7 && bytes[3] === 8))
    return "hwpx";
  if (startsWith(bytes, hwp3Signature))
    throw new Error("UnsupportedHwp3Document");
  throw new Error("UnsupportedDocumentSignature");
}

// packages/core/src/document-format.ts
function detectDocumentFormat2(input) {
  return detectDocumentFormat(input);
}
// packages/core/src/state/text-tools.ts
function textRows(state) {
  if (state.status !== "ready")
    return [];
  const content = state.content;
  if (!Array.isArray(content?.paragraphs))
    throw Error("InvalidDocumentTextSnapshot");
  const identities = new Set;
  return content.paragraphs.filter((row) => {
    if (!row || !Number.isSafeInteger(row.section) || row.section < 0 || !Number.isSafeInteger(row.paragraph) || row.paragraph < 0 || typeof row.text !== "string")
      throw Error("InvalidDocumentTextSnapshot");
    const key = `${row.section}:${row.paragraph}`;
    if (identities.has(key))
      throw Error("AmbiguousDocumentText");
    identities.add(key);
    return true;
  });
}
function searchOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options) || ![Object.prototype, null].includes(Object.getPrototypeOf(options)))
    throw Error("InvalidFindTextOptions");
  for (const key of Reflect.ownKeys(options)) {
    if (typeof key !== "string" || !["direction", "wrap", "origin"].includes(key) || !("value" in Object.getOwnPropertyDescriptor(options, key)))
      throw Error("InvalidFindTextOptions");
  }
  if (options.direction !== undefined && !["forward", "backward"].includes(options.direction) || options.wrap !== undefined && typeof options.wrap !== "boolean" || options.origin !== undefined && !["selection", "document"].includes(options.origin))
    throw Error("InvalidFindTextOptions");
  return {
    direction: options.direction ?? "forward",
    wrap: options.wrap ?? true,
    origin: options.origin ?? "selection"
  };
}
function findTextMatch(state, query, options = {}) {
  const { direction, wrap, origin } = searchOptions(options);
  if (typeof query !== "string" || !query || !isWellFormedText(query))
    throw Error("InvalidSearchQuery");
  const content = state.content;
  if (state.status !== "ready" || !["hwp5", "hwpx"].includes(content?.format ?? ""))
    throw Error("EditorNotReady");
  const rows = textRows(state), selected = origin === "selection" ? state.selection : null;
  if (!rows.length)
    return null;
  const selectedIndex = selected ? rows.findIndex((row) => row.section === selected.section && row.paragraph === selected.paragraph) : -1;
  const backward = direction === "backward", anchored = selectedIndex >= 0;
  const first = anchored ? selectedIndex : backward ? rows.length - 1 : 0;
  const start = anchored ? backward ? selected.startUnit : selected.endUnit : backward ? rows[first].text.length : 0;
  const visits = rows.length + (wrap && anchored ? 1 : 0);
  for (let step = 0;step < visits; step++) {
    const absolute = first + (backward ? -step : step);
    if (!wrap && (absolute < 0 || absolute >= rows.length))
      break;
    const row = rows[(absolute % rows.length + rows.length) % rows.length];
    if (row.clipped)
      continue;
    const owner = paragraphSelectionOwner(row);
    if (!owner)
      continue;
    const from = backward ? (step === 0 ? start : row.text.length) - query.length : step === 0 ? start : 0;
    if (backward && from < 0)
      continue;
    const at = backward ? row.text.lastIndexOf(query, from) : row.text.indexOf(query, from);
    if (at < 0 || step === rows.length && (backward ? at + query.length <= start : at >= start))
      continue;
    return Object.freeze({
      ...state.token,
      coordinateSpace: "display",
      format: content.format,
      owner,
      section: row.section,
      paragraph: row.paragraph,
      startUnit: at,
      endUnit: at + query.length,
      affinity: "forward"
    });
  }
  return null;
}
function selectionMatchesText(state, query) {
  const selected = state.selection;
  if (!selected || !query)
    return false;
  const row = textRows(state).find((row) => row.section === selected.section && row.paragraph === selected.paragraph);
  return !!row && !row.clipped && row.text.slice(selected.startUnit, selected.endUnit) === query;
}
function getDocumentTextStatistics(state) {
  if (state.status !== "ready")
    throw Error("EditorNotReady");
  const rows = textRows(state), content = state.content;
  const texts = rows.map((row) => row.text.replace(/\ufffc/g, ""));
  const scalars = Array.from(texts.join(""));
  return Object.freeze({
    complete: !content?.window && !content?.limited && !rows.some((row) => row.clipped),
    paragraphs: rows.length,
    characters: scalars.length,
    charactersWithoutWhitespace: scalars.filter((char) => !/\s/u.test(char)).length,
    words: texts.reduce((count, text) => count + (text.trim() ? text.trim().split(/\s+/u).length : 0), 0)
  });
}
// packages/core/src/state/clipboard-state.ts
function getSelectionClipboard(state) {
  const unavailable = (reason) => Object.freeze({
    target: null,
    text: null,
    copyReason: reason,
    editReason: reason,
    stateVersion: state.stateVersion
  });
  if (!state.documentId || state.status === "empty")
    return unavailable("NoDocument");
  if (state.status !== "ready")
    return unavailable(state.status === "refresh-required" ? "RefreshRequired" : "EditorNotReady");
  if (state.selection == null)
    return unavailable("MissingSelection");
  try {
    const selected = state.selection;
    const row = validateSelection(selected, state);
    const target = Object.freeze({
      ...state.token,
      coordinateSpace: selected.coordinateSpace,
      format: selected.format,
      owner: selected.owner,
      section: selected.section,
      paragraph: selected.paragraph,
      startUnit: selected.startUnit,
      endUnit: selected.endUnit,
      affinity: selected.affinity
    });
    const text = row.text.slice(target.startUnit, target.endUnit);
    if (text.includes("￼"))
      return unavailable("ClipboardObjectSelectionUnsupported");
    let editReason = null;
    try {
      selectionMessage(target, state);
    } catch (error) {
      editReason = error instanceof Error ? error.message : String(error);
    }
    return Object.freeze({
      target,
      text,
      copyReason: text.length ? null : "EmptyClipboardSelection",
      editReason,
      stateVersion: state.stateVersion
    });
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}
// packages/core/src/keymap/config.ts
var platforms = ["mac", "windows", "linux"];
var modifiers = new Set(["Mod", "Control", "Meta", "Alt", "Shift"]);
var namedCodes = new Set(("Backquote Backslash Backspace BracketLeft BracketRight Comma Equal Minus Period Quote Semicolon Slash " + "AltLeft AltRight CapsLock ContextMenu ControlLeft ControlRight Enter MetaLeft MetaRight ShiftLeft ShiftRight Space Tab " + "Delete End Help Home Insert PageDown PageUp ArrowDown ArrowLeft ArrowRight ArrowUp Escape NumLock ScrollLock Pause PrintScreen " + "IntlBackslash IntlRo IntlYen Convert NonConvert KanaMode Lang1 Lang2 Lang3 Lang4 Lang5 " + "NumpadAdd NumpadBackspace NumpadClear NumpadClearEntry NumpadComma NumpadDecimal NumpadDivide NumpadEnter NumpadEqual NumpadHash NumpadMemoryAdd NumpadMemoryClear NumpadMemoryRecall NumpadMemoryStore NumpadMemorySubtract NumpadMultiply NumpadParenLeft NumpadParenRight NumpadStar NumpadSubtract " + "AudioVolumeDown AudioVolumeMute AudioVolumeUp MediaPlayPause MediaStop MediaTrackNext MediaTrackPrevious").split(" "));
function invalid(detail) {
  throw new TypeError(`InvalidKeymap: ${detail}`);
}
function record2(value, where) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    invalid(where);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !("value" in Object.getOwnPropertyDescriptor(value, key)))
      invalid(`${where} property`);
  }
  return value;
}
function fields(value, allowed, where) {
  for (const key of Object.getOwnPropertyNames(value))
    if (!allowed.includes(key))
      invalid(`${where}.${key}`);
}
function text(value, where) {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f\u007f]/.test(value))
    invalid(where);
  return value;
}
function keymapModifierMask(binding, platform) {
  let mask = 0;
  for (const modifier of binding.modifiers) {
    const expanded = modifier === "Mod" ? platform === "mac" ? "Meta" : "Control" : modifier;
    mask |= expanded === "Control" ? 1 : expanded === "Meta" ? 2 : expanded === "Alt" ? 4 : 8;
  }
  return mask;
}
function validateKeymapConfig(input) {
  const config = record2(input, "config");
  fields(config, ["version", "bindings", "messages"], "config");
  if (config.version !== 1 || !Array.isArray(config.bindings))
    invalid("version/bindings");
  const ids = new Set;
  const bindings = config.bindings.map((input, index) => {
    const row = record2(input, `bindings[${index}]`);
    fields(row, ["id", "command", "code", "modifiers", "platform", "enabled", "labelKey"], "binding");
    const id = text(row.id, "id"), command = text(row.command, "command"), code = text(row.code, "code");
    if (ids.has(id))
      invalid(`duplicate id ${id}`);
    ids.add(id);
    if (!/^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(code) && !namedCodes.has(code))
      invalid(`code ${code}`);
    if (!Array.isArray(row.modifiers))
      invalid("modifiers");
    const seen = new Set;
    for (const modifier of row.modifiers) {
      if (typeof modifier !== "string" || !modifiers.has(modifier) || seen.has(modifier))
        invalid("modifier");
      seen.add(modifier);
    }
    if (seen.has("Mod") && (seen.has("Control") || seen.has("Meta")))
      invalid("Mod with explicit primary modifier");
    if ("platform" in row && !["all", ...platforms].includes(row.platform))
      invalid("platform");
    if ("enabled" in row && typeof row.enabled !== "boolean")
      invalid("enabled");
    if ("labelKey" in row)
      text(row.labelKey, "labelKey");
    return Object.freeze({
      id,
      command,
      code,
      modifiers: Object.freeze([...seen]),
      ..."platform" in row ? { platform: row.platform } : {},
      ..."enabled" in row ? { enabled: row.enabled } : {},
      ..."labelKey" in row ? { labelKey: row.labelKey } : {}
    });
  });
  for (const platform of platforms) {
    const keys = new Set;
    for (const binding of bindings) {
      if (binding.enabled === false || binding.platform && binding.platform !== "all" && binding.platform !== platform)
        continue;
      const key = `${binding.code}:${keymapModifierMask(binding, platform)}`;
      if (keys.has(key))
        invalid(`shortcut conflict on ${platform}: ${key}`);
      keys.add(key);
    }
  }
  let messages;
  if ("messages" in config) {
    const source = record2(config.messages, "messages");
    messages = Object.create(null);
    for (const [locale, input] of Object.entries(source)) {
      if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(locale))
        invalid("locale");
      const translations = record2(input, "translations");
      const owned = Object.create(null);
      for (const [key, value] of Object.entries(translations)) {
        text(key, "labelKey");
        if (typeof value !== "string")
          invalid("message");
        owned[key] = value;
      }
      messages[locale] = Object.freeze(owned);
    }
    Object.freeze(messages);
  }
  return Object.freeze({
    version: 1,
    bindings: Object.freeze(bindings),
    ...messages ? { messages } : {}
  });
}
function mergeKeymap(defaults, overrides) {
  const base = validateKeymapConfig(defaults), custom = validateKeymapConfig(overrides);
  const rows = new Map(base.bindings.map((binding) => [binding.id, binding]));
  for (const binding of custom.bindings)
    rows.set(binding.id, binding);
  const messages = Object.create(null);
  for (const config of [base, custom])
    for (const [locale, values] of Object.entries(config.messages ?? {})) {
      messages[locale] = Object.assign(Object.create(null), messages[locale], values);
    }
  return validateKeymapConfig({ version: 1, bindings: [...rows.values()], messages });
}
function resolveShortcutLabel(config, binding, locale) {
  const key = binding.labelKey ?? binding.id;
  for (const language of [locale, locale.split("-")[0], "en"]) {
    const labels = config.messages?.[language];
    if (labels && Object.hasOwn(labels, key))
      return labels[key];
  }
  return binding.id;
}
var parseKeymapConfig = validateKeymapConfig;
// packages/core/src/keymap/resolve.ts
var compiledIndexes = new WeakMap;
function compileKeymap(config, platform) {
  if (!["mac", "windows", "linux"].includes(platform))
    throw new TypeError("InvalidKeymapPlatform");
  const owned = validateKeymapConfig(config);
  const bindings = Object.freeze(owned.bindings.filter((binding) => binding.enabled !== false && (!binding.platform || binding.platform === "all" || binding.platform === platform)));
  const index = new Map(bindings.map((binding) => [
    `${binding.code}:${keymapModifierMask(binding, platform)}`,
    binding
  ]));
  const compiled = Object.freeze({ platform, bindings });
  compiledIndexes.set(compiled, index);
  return compiled;
}
function resolveKeyboardShortcut(compiled, event) {
  const index = compiledIndexes.get(compiled);
  if (!index)
    throw new TypeError("InvalidCompiledKeymap");
  if (!event || event.isComposing || event.keyCode === 229 || event.altGraph)
    return null;
  if (typeof event.code !== "string" || [event.ctrlKey, event.metaKey, event.altKey, event.shiftKey].some((value) => typeof value !== "boolean"))
    return null;
  const mask = (event.ctrlKey ? 1 : 0) | (event.metaKey ? 2 : 0) | (event.altKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
  const binding = index.get(`${event.code}:${mask}`) ?? null;
  if (event.repeat && binding?.command !== "undo" && binding?.command !== "redo")
    return null;
  return binding;
}
// packages/core/src/keymap/defaults.json
var defaults_default = {
  version: 1,
  bindings: [
    {
      id: "new-document",
      command: "new-document",
      code: "KeyN",
      modifiers: ["Mod"],
      platform: "all",
      labelKey: "command.new-document"
    },
    {
      id: "save",
      command: "save",
      code: "KeyS",
      modifiers: ["Mod"],
      platform: "all",
      labelKey: "command.save"
    },
    {
      id: "undo",
      command: "undo",
      code: "KeyZ",
      modifiers: ["Mod"],
      platform: "all",
      labelKey: "command.undo"
    },
    {
      id: "cut",
      command: "cut",
      code: "KeyX",
      modifiers: ["Mod"],
      platform: "all",
      labelKey: "command.cut"
    },
    {
      id: "copy",
      command: "copy",
      code: "KeyC",
      modifiers: ["Mod"],
      platform: "all",
      labelKey: "command.copy"
    },
    {
      id: "paste",
      command: "paste",
      code: "KeyV",
      modifiers: ["Mod"],
      platform: "all",
      labelKey: "command.paste"
    },
    {
      id: "find",
      command: "find",
      code: "KeyF",
      modifiers: ["Mod"],
      platform: "all",
      labelKey: "command.find"
    },
    {
      id: "bold",
      command: "bold",
      code: "KeyB",
      modifiers: ["Mod"],
      platform: "all",
      labelKey: "command.bold"
    },
    {
      id: "italic",
      command: "italic",
      code: "KeyI",
      modifiers: ["Mod"],
      platform: "all",
      labelKey: "command.italic"
    },
    {
      id: "underline",
      command: "underline",
      code: "KeyU",
      modifiers: ["Mod"],
      platform: "all",
      labelKey: "command.underline"
    },
    {
      id: "redo",
      command: "redo",
      code: "KeyZ",
      modifiers: ["Mod", "Shift"],
      platform: "all",
      labelKey: "command.redo"
    },
    {
      id: "replace-mac",
      command: "replace",
      code: "KeyH",
      modifiers: ["Mod", "Shift"],
      platform: "mac",
      labelKey: "command.replace"
    },
    {
      id: "replace-windows",
      command: "replace",
      code: "KeyH",
      modifiers: ["Control"],
      platform: "windows",
      labelKey: "command.replace"
    },
    {
      id: "replace-linux",
      command: "replace",
      code: "KeyH",
      modifiers: ["Control"],
      platform: "linux",
      labelKey: "command.replace"
    },
    {
      id: "bold-hancom-windows",
      command: "bold",
      code: "KeyB",
      modifiers: ["Alt", "Shift"],
      platform: "windows",
      labelKey: "command.bold"
    },
    {
      id: "bold-hancom-linux",
      command: "bold",
      code: "KeyB",
      modifiers: ["Alt", "Shift"],
      platform: "linux",
      labelKey: "command.bold"
    },
    {
      id: "italic-hancom-windows",
      command: "italic",
      code: "KeyI",
      modifiers: ["Alt", "Shift"],
      platform: "windows",
      labelKey: "command.italic"
    },
    {
      id: "italic-hancom-linux",
      command: "italic",
      code: "KeyI",
      modifiers: ["Alt", "Shift"],
      platform: "linux",
      labelKey: "command.italic"
    },
    {
      id: "underline-hancom-windows",
      command: "underline",
      code: "KeyU",
      modifiers: ["Alt", "Shift"],
      platform: "windows",
      labelKey: "command.underline"
    },
    {
      id: "underline-hancom-linux",
      command: "underline",
      code: "KeyU",
      modifiers: ["Alt", "Shift"],
      platform: "linux",
      labelKey: "command.underline"
    },
    {
      id: "redo-compat-y",
      command: "redo",
      code: "KeyY",
      modifiers: ["Mod"],
      labelKey: "command.redo"
    }
  ],
  messages: {
    ko: {
      "command.save": "저장",
      "command.undo": "실행 취소",
      "command.redo": "다시 실행",
      "command.cut": "잘라내기",
      "command.copy": "복사",
      "command.paste": "붙여넣기",
      "command.find": "찾기",
      "command.replace": "찾아 바꾸기",
      "command.bold": "굵게",
      "command.italic": "기울임",
      "command.underline": "밑줄",
      "command.new-document": "새 문서"
    },
    en: {
      "command.save": "Save",
      "command.undo": "Undo",
      "command.redo": "Redo",
      "command.cut": "Cut",
      "command.copy": "Copy",
      "command.paste": "Paste",
      "command.find": "Find",
      "command.replace": "Replace",
      "command.bold": "Bold",
      "command.italic": "Italic",
      "command.underline": "Underline",
      "command.new-document": "New document"
    }
  }
};

// packages/core/src/keymap/defaults.ts
var DEFAULT_KEYMAP = parseKeymapConfig(defaults_default);
export {
  APPLY_FORMATTING_PATCH_COMMAND,
  BACKGROUND_HATCH_STYLES,
  BORDER_LINE_STYLES,
  BORDER_WIDTHS_HUNDREDTH_MM,
  DEFAULT_KEYMAP,
  EditorState,
  INSERT_TABLE_COMMAND,
  PasswordAttemptError,
  REDO_COMMAND,
  SET_CHARACTER_FONT_NAME_COMMAND,
  SET_CHARACTER_PROPERTIES_COMMAND,
  SET_CHARACTER_STRIKE_COMMAND,
  SET_CHARACTER_TEXT_COLOR_COMMAND,
  SET_CHARACTER_UNDERLINE_COMMAND,
  SET_PARAGRAPH_ALIGNMENT_COMMAND,
  SPLICE_TEXT_COMMAND,
  UNDO_COMMAND,
  compileKeymap,
  createCommand,
  createEditor,
  createParagraphSelection,
  detectDocumentFormat2 as detectDocumentFormat,
  findTextMatch,
  getDocumentTextStatistics,
  getHistoryAvailability,
  getSelectionClipboard,
  getSelectionFormatting,
  mergeKeymap,
  parseKeymapConfig,
  resolveKeyboardShortcut,
  resolveShortcutLabel,
  selectionMatchesText
};

//# debugId=745DB69EA824F71564756E2164756E21
