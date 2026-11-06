import {
  isOwnedImmutableObservation,
  ownObservation
} from "./core-index-09xbv2b9-d6497b28f901-8bc2d4402e298adce7bb34969d66829b137007c5fa5f123caf2a9d5b6ce565d7.js";

// packages/core/src/internal/full-snapshot-text-delta.ts
function exactDisplayValue(a, b, budget = { n: 200000 }, depth = 0) {
  if (--budget.n < 0 || depth > 64)
    return false;
  if (Object.is(a, b))
    return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b))
    return false;
  if (![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(a)) || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(b)))
    return false;
  const aa = Object.getOwnPropertyDescriptors(a), bb = Object.getOwnPropertyDescriptors(b), ak = Reflect.ownKeys(aa), bk = Reflect.ownKeys(bb);
  if (ak.length !== bk.length)
    return false;
  return ak.every((k) => Object.hasOwn(bb, k) && ("value" in aa[k]) && ("value" in bb[k]) && exactDisplayValue(aa[k].value, bb[k].value, budget, depth + 1));
}
function validateFullSnapshotTextDelta(before, next, packet) {
  try {
    for (const snapshot of [before, next]) {
      if (snapshot === null || typeof snapshot !== "object" || Reflect.ownKeys(snapshot).some((key) => !("value" in Object.getOwnPropertyDescriptor(snapshot, key))))
        return false;
    }
    const r = packet?.receipt, w = packet?.window, b = packet?.before, reference = packet?.reference;
    if (!r || !w || !b || !reference || before?.format !== "hwp5" || next?.format !== "hwp5" || before.readOnly || next.readOnly || before.limited !== false || next.limited !== false || before.window || next.window || before.viewKind || next.viewKind || !Array.isArray(before.paragraphs) || !Array.isArray(next.paragraphs) || before.paragraphs.length !== next.paragraphs.length || !Object.isFrozen(before) || !Object.isFrozen(next))
      return false;
    if (r.version !== 1 || r.exclusive !== true || b.epoch !== r.beforeEpoch || w.epoch !== r.epoch || b.section !== r.section || w.section !== r.section || b.sourceNode !== r.sourceNode || w.sourceNode !== r.sourceNode || b.parentNode !== r.parentNode || w.parentNode !== r.parentNode || w.startUnit !== 0 || w.endUnit !== r.totalUnits || w.totalUnits !== r.totalUnits || typeof w.text !== "string" || w.text.length !== r.totalUnits || w.text.at(-1) !== "\r")
      return false;
    const { paragraphs: ap, ...ah } = before, { paragraphs: bp, ...bh } = next;
    if (!exactDisplayValue(ah, bh))
      return false;
    let owners = 0;
    for (let i = 0;i < ap.length; i++) {
      const a = ap[i], z = bp[i], ar = a.currentReference, zr = z.currentReference;
      if (!ar || !zr || ar.epoch !== r.beforeEpoch || zr.epoch !== r.epoch || ar.scope !== zr.scope || ar.kind !== "original" || zr.kind !== "original")
        return false;
      const { epoch: _ae, ...av } = ar, { epoch: _ze, ...zv } = zr;
      if (!exactDisplayValue(av, zv))
        return false;
      const { currentReference: _ax, ...oldRow } = a, { currentReference: _zx, ...newRow } = z;
      if (a.section === r.section && a.paragraph === r.paragraph) {
        owners++;
        if (ar.id !== String(r.sourceNode) || !exactDisplayValue(zr, reference) || a.editable !== true || z.editable !== true || a.clipped || z.clipped || a.sourceOffsets || z.sourceOffsets || z.text !== w.text.slice(0, -1) || typeof a.text !== "string" || typeof z.text !== "string" || [...a.text, ...z.text].some((c) => c.charCodeAt(0) < 32 || c === "￼"))
          return false;
        const { text: _at, characterRanges: _ac, ...restA } = oldRow, { text: _zt, characterRanges: zc, ...restZ } = newRow;
        if (!exactDisplayValue(restA, restZ) || !Array.isArray(zc))
          return false;
        const ranges = [];
        for (let j = 0;j < r.runs.length; j++) {
          const start = Math.min(z.text.length, r.runs[j].start_unit), end = Math.min(z.text.length, r.runs[j + 1]?.start_unit ?? r.totalUnits), id = r.runs[j].char_shape_id;
          if (start === end) {
            if (start === z.text.length)
              ranges.push({ start, end, charShapeId: id });
            continue;
          }
          const last = ranges.at(-1);
          if (last?.charShapeId === id)
            last.end = end;
          else
            ranges.push({ start, end, charShapeId: id });
        }
        if (!exactDisplayValue(ranges, zc))
          return false;
      } else if (!exactDisplayValue(oldRow, newRow))
        return false;
    }
    return owners === 1;
  } catch {
    return false;
  }
}

// packages/core/src/internal/owner-window-cow.ts
var ROOT_KEYS = new Set([
  "format",
  "version",
  "paragraphs",
  "totalParagraphs",
  "limited",
  "editorSessionAvailable",
  "observedDocInfoEditingAvailable",
  "observedDocInfoDiagnostics",
  "currentReferenceErrors",
  "tableCreationAvailable",
  "tableCreationResources",
  "createdTables",
  "normalizationEditingAvailable",
  "normalizationInfo",
  "documentWindowAvailable",
  "distributionEditingAvailable",
  "paragraphAlignmentAvailable",
  "paragraphMarginsAvailable",
  "paragraphSpacingAvailable",
  "characterPropertiesAvailable",
  "characterPropertiesRangesAvailable",
  "paragraphReplacementAvailable",
  "characterUnderlineAvailable",
  "characterStrikeAvailable",
  "characterStrikeRangesAvailable",
  "characterUnderlineRangesAvailable",
  "characterUnderlineColorAvailable",
  "characterStrikeColorAvailable",
  "characterTextColorAvailable",
  "characterShadeAvailable",
  "characterEffectAvailable",
  "characterEffectExclusiveAvailable",
  "characterEffectRangesExclusiveAvailable",
  "characterOutlineAvailable",
  "characterOutlineRangesAvailable",
  "characterOutlineExtendedAvailable",
  "characterOutlineRangesExtendedAvailable",
  "characterEffectRangesAvailable",
  "characterFontAvailable",
  "characterFontNameAvailable",
  "namedFontTextAvailable",
  "characterPropertyTextAvailable",
  "namedFontPropertyTextAvailable",
  "namedFontReplacementAvailable",
  "characterPropertyReplacementAvailable",
  "namedFontPropertyReplacementAvailable",
  "characterFontNameRangesAvailable",
  "characterFontRangesAvailable",
  "characterTextColorRangesAvailable",
  "characterShadeRangesAvailable",
  "textSourcePolicyAvailable",
  "readOnly",
  "characterShapes",
  "characterShapesError",
  "characterUnderlines",
  "characterUnderlinesError",
  "characterUnderlineStyles",
  "characterUnderlineStylesError",
  "characterTextColors",
  "characterTextColorsError",
  "fontFaces",
  "fontFacesError",
  "fontFaceMetadata",
  "fontFaceMetadataError",
  "characterFontReferences",
  "characterFontReferencesError",
  "characterFontMetrics",
  "characterFontMetricsError",
  "characterStrikes",
  "characterStrikesError",
  "characterStrikeStyles",
  "characterStrikeStylesError",
  "characterShades",
  "characterShadesError",
  "characterEffects",
  "characterEffectsError",
  "characterOutlines",
  "characterOutlinesError",
  "tables",
  "tableBindingsErrors",
  "hwp5BorderFillSources",
  "hwp5BorderFillSourceError",
  "tablePlacementsErrors",
  "tableLayoutSourceErrors",
  "cellLayoutSourceErrors",
  "tableAnchorErrors",
  "tableGeometryErrors",
  "paragraphFormatAvailable",
  "paragraphShapeCount",
  "paragraphShapeOptions",
  "pageSources",
  "pageSourceErrors",
  "sectionSources",
  "sectionSourceErrors",
  "currentParagraphFlows",
  "columnSources",
  "flowSourceErrors",
  "hwp5Memos",
  "hwp5MemoErrors",
  "structuralAnchorErrors",
  "pageAreaSources",
  "pageAreaSourceErrors",
  "masterPageSources",
  "masterPageSourceErrors",
  "hwp5Notes",
  "hwp5NoteErrors",
  "hwp5NoteShapes",
  "hwp5NotePolicies",
  "hwp5NoteShapeErrors",
  "hwp5Captions",
  "hwp5CaptionErrors",
  "hwp5CaptionGeometryErrors",
  "hwp5Drawings",
  "hwp5DrawingErrors",
  "hwp5DrawingObjectExtraErrors",
  "hwp5PolygonPoints",
  "hwp5PolygonPointErrors",
  "hwp5CurvePoints",
  "hwp5CurvePointErrors",
  "hwp5DrawingComponents",
  "hwp5DrawingComponentErrors",
  "hwp5DrawingBodies",
  "hwp5DrawingBodyErrors",
  "hwp5DrawingMatrices",
  "hwp5DrawingMatrixErrors",
  "hwp5DrawingLocalTransforms",
  "hwp5DrawingLocalErrors",
  "hwp5DrawingCorners",
  "hwp5DrawingCornerErrors",
  "hwp5DrawingGeometry",
  "hwp5DrawingGeometryErrors",
  "hwp5DrawingStyles",
  "hwp5DrawingStyleErrors",
  "columnDisplaySources",
  "columnDisplayErrors",
  "automaticNumberErrors",
  "pageControlSources",
  "pageControlSourceErrors",
  "documentPropertySource",
  "documentPropertySourceError",
  "hwp5Pictures",
  "hwp5PictureErrors",
  "hwp5PictureTails",
  "hwp5PictureTailErrors",
  "hwp5PictureAbsentTails",
  "hwp5GroupGeometry",
  "hwp5FormSourcesAvailable",
  "hwp5Forms",
  "hwp5FormErrors",
  "hwp5FormPropertiesAvailable",
  "hwp5FormPropertyErrors",
  "hwp5FormTextEditAvailable",
  "hwp5FormTextLayoutRetentionAvailable",
  "hwp5CheckBoxStateEditAvailable",
  "hwp5RadioSelectAvailable",
  "hwp5UnnamedRadioSelectAvailable",
  "lines",
  "lineErrors",
  "pictures",
  "formulas",
  "formulaErrors",
  "formulaDefinitionAvailable",
  "drawings",
  "containers"
]);
var EMPTY_KEYS = [
  "createdTables",
  "hwp5Memos",
  "hwp5Notes",
  "hwp5NoteShapes",
  "hwp5NotePolicies",
  "hwp5Captions",
  "hwp5Forms",
  "hwp5DrawingBodies",
  "lines",
  "formulas",
  "drawings",
  "containers",
  "pageAreaSources",
  "masterPageSources",
  "hwp5PolygonPoints",
  "hwp5CurvePoints"
];
var OWNER_KEYS = new Set([
  "section",
  "paragraph",
  "editable",
  "label",
  "text",
  "selectionOwner",
  "currentReference",
  "textSourcePolicyError",
  "characterRanges",
  "tableCell",
  "paraShapeId",
  "paragraphShape",
  "automaticNumbers",
  "automaticNumberPrefixes",
  "pageControls"
]);
function isPlainOwnerBaseline(content, section, paragraph) {
  try {
    if (!isOwnedImmutableObservation(content) || content.format !== "hwp5" || content.readOnly || content.limited !== false || !Array.isArray(content.paragraphs) || !Number.isSafeInteger(content.totalParagraphs) || content.paragraphs.length !== content.totalParagraphs || content.window || content.viewKind || Object.keys(content).some((k) => !ROOT_KEYS.has(k)))
      return false;
    for (const key of EMPTY_KEYS)
      if (!Array.isArray(content[key]) || content[key].length !== 0)
        return false;
    for (const [key, value] of Object.entries(content))
      if (/note|memo|caption|formula|field|formpropert|container|polygon|curve/i.test(key) && Array.isArray(value) && value.length)
        return false;
    if (!Array.isArray(content.hwp5Drawings) || content.hwp5Drawings.some((d) => d.source?.kind_id !== 611346787))
      return false;
    if (!Array.isArray(content.currentParagraphFlows) || content.currentParagraphFlows.some((f) => f.generated !== false || !["body", "table_cell"].includes(f.host) || f.memo_index !== null || f.memo_node !== null))
      return false;
    if (content.currentParagraphFlows.length !== content.paragraphs.length)
      return false;
    const flows = new Map;
    for (const flow of content.currentParagraphFlows) {
      if (!Number.isSafeInteger(flow.section) || !Number.isSafeInteger(flow.paragraph) || !Number.isSafeInteger(flow.source_node) || flow.section < 0 || flow.paragraph < 0 || flow.source_node < 0)
        return false;
      const key = flow.section + ":" + flow.paragraph;
      if (flows.has(key))
        return false;
      flows.set(key, flow);
    }
    let owner;
    let visibleUnits = 0;
    let count = 0;
    let scope, epoch;
    for (const row of content.paragraphs) {
      if (typeof row.text !== "string")
        return false;
      visibleUnits += row.text.length;
      if (!Number.isSafeInteger(visibleUnits) || visibleUnits > 1e5)
        return false;
      const flow = flows.get(row.section + ":" + row.paragraph);
      const ref = row.currentReference;
      if (!flow || ref?.id !== String(flow.source_node) || ref.section !== row.section)
        return false;
      flows.delete(row.section + ":" + row.paragraph);
      if (!ref || ref.kind !== "original" || row.clipped || row.textSourcePolicyError)
        return false;
      if (scope === undefined) {
        scope = ref.scope;
        epoch = ref.epoch;
      } else if (ref.scope !== scope || ref.epoch !== epoch)
        return false;
      if (row.fieldLabels?.length || row.manualFormulaResults?.length)
        return false;
      if (row.section === section && row.paragraph === paragraph) {
        owner = row;
        if (Object.keys(row).some((k) => !OWNER_KEYS.has(k)))
          return false;
        for (const key of ["automaticNumbers", "automaticNumberPrefixes", "pageControls"])
          if (!Array.isArray(row[key]) || row[key].length)
            return false;
        if (flow.host === "table_cell" ? !row.tableCell || row.tableCell.listNode !== flow.list_node : row.tableCell !== undefined)
          return false;
        count++;
      }
    }
    return flows.size === 0 && count === 1 && !owner.sourceOffsets && owner.editable === true && typeof owner.text === "string" && owner.text.length > 0 && owner.text.isWellFormed() && ![...owner.text].some((c) => c.charCodeAt(0) < 32 || c === "￼");
  } catch {
    return false;
  }
}
function mergeExclusiveOwnerWindow(beforeState, packet, origin, expected) {
  const baseline = beforeState.content;
  if (!isPlainOwnerBaseline(baseline, packet?.receipt?.section, packet?.receipt?.paragraph))
    return null;
  try {
    if (!isOwnedImmutableObservation(baseline) || !origin || origin.authority() !== true || origin.kind !== "exclusive-text" || !origin.ownerWindowDelta || origin.ownerWindowDelta !== packet)
      return null;
    for (const k of ["editorId", "documentId", "generation", "requestId", "operationRevision"])
      if (origin.context[k] !== expected.context[k])
        return null;
    if (origin.sequence !== expected.sequence || origin.beforeRevision !== expected.revision || origin.beforeEpoch !== expected.epoch || origin.referenceScope !== expected.referenceScope)
      return null;
    const { receipt: r, window: w } = packet;
    const ownerFlow = baseline.currentParagraphFlows.find((f) => f.section === r.section && f.paragraph === r.paragraph);
    if (!ownerFlow || ownerFlow.parent_node !== r.parentNode)
      return null;
    if (r.totalUnits > 4096 || r.totalUnits < 1 || !w.text.isWellFormed() || r.epoch !== origin.nativeEpoch || r.revision !== origin.nativeRevision)
      return null;
    const refs = baseline.paragraphs;
    let owners = 0;
    const paragraphs = refs.map((row) => {
      if (!isOwnedImmutableObservation(row) || row.currentReference?.kind !== "original" || row.currentReference.scope !== expected.referenceScope || row.currentReference.epoch !== expected.epoch)
        throw Error("StaleBaseline");
      const reference = { ...row.currentReference, epoch: r.epoch };
      if (row.section !== r.section || row.paragraph !== r.paragraph)
        return { ...row, currentReference: reference };
      owners++;
      if (row.text.length === 0 || !exactDisplayValue(reference, packet.reference))
        throw Error("IneligibleOwner");
      const text = w.text.slice(0, -1), characterRanges = [];
      if (!text.length)
        throw Error("EmptyOwnerTransition");
      for (let i = 0;i < r.runs.length; i++) {
        const start = Math.min(text.length, r.runs[i].start_unit), end = Math.min(text.length, r.runs[i + 1]?.start_unit ?? r.totalUnits), charShapeId = r.runs[i].char_shape_id;
        if (start === end) {
          if (start === text.length)
            characterRanges.push({ start, end, charShapeId });
          continue;
        }
        const last = characterRanges.at(-1);
        if (last?.charShapeId === charShapeId)
          last.end = end;
        else
          characterRanges.push({ start, end, charShapeId });
      }
      return { ...row, currentReference: reference, text, characterRanges };
    });
    if (owners !== 1)
      return null;
    const next = ownObservation({ ...baseline, paragraphs })();
    if (!validateFullSnapshotTextDelta(baseline, next, packet))
      return null;
    return next;
  } catch {
    return null;
  }
}

// packages/core/src/internal/history-owner-window.ts
function mergeHistoryOwnerWindow(before, packet, origin, expected) {
  try {
    const baseline = before.content;
    if (!isOwnedImmutableObservation(baseline) || !isOwnedImmutableObservation(packet) || !isPlainOwnerBaseline(baseline, expected.owner.section, expected.owner.paragraph) || !origin.authority() || origin.kind !== "history-window" || origin.historyWindowDelta !== packet || packet.viewKind !== "history-owner-window" || packet.version !== 1 || !["undo", "redo"].includes(packet.operation) || packet.beforeEpoch !== expected.epoch || packet.beforeRevision !== expected.revision || packet.revision !== expected.nextRevision || packet.epoch !== origin.nativeEpoch || !exactDisplayValue(packet.owner, expected.owner))
      return null;
    const { window: w, reference: ref } = packet, owner = expected.owner;
    if (w.epoch !== packet.epoch || w.section !== owner.section || w.sourceNode !== owner.sourceNode || w.parentNode !== owner.parentNode || !Number.isSafeInteger(w.totalUnits) || w.totalUnits < 2 || w.totalUnits > 4096 || w.startUnit !== 0 || w.endUnit !== w.totalUnits || typeof w.text !== "string" || !w.text.isWellFormed() || w.text.length !== w.totalUnits || w.text.at(-1) !== "\r" || Array.from(w.text.slice(0, -1)).some((c) => c.charCodeAt(0) < 32 || c === "￼") || ref.kind !== "original" || ref.scope !== expected.referenceScope || ref.epoch !== w.epoch || ref.id !== String(owner.sourceNode) || ref.section !== owner.section || ref.row !== 0 || ref.column !== 0 || !Array.isArray(packet.characterRanges) || !packet.characterRanges.length || packet.characterRanges.length > 4096)
      return null;
    const flow = baseline.currentParagraphFlows.find((f) => f.section === owner.section && f.paragraph === owner.paragraph);
    if (!flow || flow.source_node !== owner.sourceNode || flow.parent_node !== owner.parentNode)
      return null;
    const text = w.text.slice(0, -1), characterRanges = [];
    const shapeIds = new Set(baseline.characterShapes.map((s) => s.id));
    let cursor = 0;
    for (const run of packet.characterRanges) {
      if (!Number.isSafeInteger(run.start) || !Number.isSafeInteger(run.end) || run.start !== cursor || run.end < run.start || run.end > text.length || !shapeIds.has(run.charShapeId))
        return null;
      cursor = run.end;
      characterRanges.push({ start: run.start, end: run.end, charShapeId: run.charShapeId });
    }
    if (cursor !== text.length)
      return null;
    let owners = 0;
    const paragraphs = baseline.paragraphs.map((row) => {
      const r = row.currentReference;
      if (!isOwnedImmutableObservation(row) || r?.kind !== "original" || r.scope !== expected.referenceScope || r.epoch !== expected.epoch)
        throw Error("StaleHistoryBaseline");
      const currentReference = { ...r, epoch: w.epoch };
      if (row.section !== owner.section || row.paragraph !== owner.paragraph)
        return { ...row, currentReference };
      owners++;
      if (!exactDisplayValue(currentReference, ref))
        throw Error("HistoryOwnerMismatch");
      return { ...row, currentReference, text, characterRanges };
    });
    if (owners !== 1 || !origin.authority())
      return null;
    const next = ownObservation({ ...baseline, paragraphs })();
    return isPlainOwnerBaseline(next, owner.section, owner.paragraph) && origin.authority() ? next : null;
  } catch {
    return null;
  }
}

// packages/core/src/internal/private-history-edges.ts
var scopeKeys = ["editorId", "documentId", "generation", "referenceScope", "nativeContract"];
var commonKeys = ["kind", "scope", "resourceLease", "serial", "reachableRevisions"];
var uint = (value) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < 4294967295;
var serial = (value) => Number.isSafeInteger(value) && Number(value) >= 0;
var object = (value) => typeof value === "object" && value !== null;
function fields(value, keys) {
  if (!object(value))
    return null;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    return null;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key)))
    return null;
  const out = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !("value" in d))
      return null;
    out[key] = d.value;
  }
  return out;
}
function validScope(value) {
  const v = fields(value, scopeKeys);
  return !!v && Object.isFrozen(value) && ["editorId", "documentId", "referenceScope"].every((key) => typeof v[key] === "string" && v[key].length > 0 && v[key].length <= 1024) && serial(v.generation) && v.nativeContract === "hwp5-exclusive-text-delta-v1";
}
function copyOwner(value) {
  const v = fields(value, ["section", "paragraph", "sourceNode", "parentNode"]);
  if (!v || !uint(v.section) || !uint(v.paragraph) || !uint(v.sourceNode) || v.parentNode !== null && !uint(v.parentNode))
    return null;
  return Object.freeze({
    section: v.section,
    paragraph: v.paragraph,
    sourceNode: v.sourceNode,
    parentNode: v.parentNode
  });
}
function createPrivateHistoryEdges(options) {
  const limit = options.maxEdges ?? 512;
  const readValidated = options.readValidated;
  const validLimit = Number.isSafeInteger(limit) && limit >= 1 && limit <= 512;
  const edges = new Map;
  let vertices = new Set;
  let context;
  let currentRevision;
  let currentSerial;
  let generation = 0;
  let capture;
  let disposed = false;
  let exhausted = false;
  let reason = "not-started";
  let ingressActive = false;
  let ingressState;
  function ingress(fallback, action) {
    if (ingressActive) {
      clear("reentrant-ingress");
      return fallback;
    }
    ingressActive = true;
    ingressState = {
      generation,
      context,
      currentRevision,
      currentSerial,
      capture,
      disposed,
      exhausted
    };
    try {
      return action();
    } catch {
      clear("ingress-read-failed");
      return fallback;
    } finally {
      ingressState = undefined;
      ingressActive = false;
    }
  }
  function unchanged() {
    const s = ingressState;
    if (s && s.generation === generation && s.context === context && s.currentRevision === currentRevision && s.currentSerial === currentSerial && s.capture === capture && s.disposed === disposed && s.exhausted === exhausted)
      return true;
    clear("reentrant-state-change");
    return false;
  }
  function advance() {
    capture = undefined;
    if (generation === Number.MAX_SAFE_INTEGER) {
      exhausted = true;
      return false;
    }
    generation++;
    return true;
  }
  function clear(why) {
    edges.clear();
    vertices.clear();
    context = undefined;
    currentRevision = undefined;
    currentSerial = undefined;
    reason = why;
    advance();
    return false;
  }
  function enabled() {
    return !!context && !disposed && !exhausted && validLimit;
  }
  function read(proof, operation) {
    let input;
    try {
      input = readValidated(proof, operation);
    } catch {
      clear("validation-port-failed");
      return null;
    }
    try {
      const kind = object(input) ? Object.getOwnPropertyDescriptor(input, "kind") : undefined;
      const tag = kind && "value" in kind ? kind.value : undefined;
      const extra = tag === "baseline" || tag === "reachable" ? ["revision"] : tag === "text-delta" ? ["parentRevision", "childRevision", "owner"] : tag === "undo" || tag === "redo" ? ["from", "to"] : null;
      const v = extra ? fields(input, [...commonKeys, ...extra]) : null;
      if (!v || !validScope(v.scope) || !object(v.resourceLease) || !serial(v.serial)) {
        clear("unvalidated-or-malformed");
        return null;
      }
      return v;
    } catch {
      clear("malformed-metadata");
      return null;
    }
  }
  function matches(v) {
    return enabled() && v.scope === context.scope && v.resourceLease === context.resourceLease;
  }
  function reachable(value, required) {
    if (!Array.isArray(value) || value.length > limit + 1)
      return null;
    const ids = new Set;
    for (let i = 0;i < value.length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (!d || !("value" in d) || !uint(d.value) || ids.has(d.value))
        return null;
      ids.add(d.value);
    }
    return required.every((id) => ids.has(id)) ? ids : null;
  }
  function prune(ids) {
    const next = new Set([currentRevision]);
    for (const [child, edge] of edges) {
      if (!ids.has(child) || !ids.has(edge.parentRevision))
        edges.delete(child);
      else {
        next.add(child);
        next.add(edge.parentRevision);
      }
    }
    vertices = next;
  }
  function begin(proof) {
    const v = read(proof, "begin");
    if (!v || !unchanged())
      return false;
    if (disposed || exhausted || !validLimit)
      return clear("disabled");
    if (v.kind !== "baseline" || !uint(v.revision))
      return clear("invalid-baseline");
    let ids;
    try {
      ids = reachable(v.reachableRevisions, [v.revision]);
    } catch {
      return clear("invalid-reachable");
    }
    if (!ids)
      return clear("invalid-reachable");
    if (!unchanged())
      return false;
    clear("new-baseline");
    if (exhausted)
      return false;
    context = { scope: v.scope, resourceLease: v.resourceLease };
    currentRevision = v.revision;
    currentSerial = v.serial;
    vertices.add(v.revision);
    reason = "active";
    return true;
  }
  function recordVerifiedTextEdge(proof) {
    const v = read(proof, "record");
    if (!v || !unchanged())
      return false;
    if (!matches(v))
      return clear("scope-or-lease-mismatch");
    if (v.kind !== "text-delta" || !uint(v.parentRevision) || !uint(v.childRevision) || v.serial !== currentSerial + 1 || v.parentRevision !== currentRevision)
      return clear("gap-or-invalid-edge");
    let owner;
    let ids;
    try {
      owner = copyOwner(v.owner);
      ids = reachable(v.reachableRevisions, [v.parentRevision, v.childRevision]);
    } catch {
      return clear("invalid-edge-metadata");
    }
    if (!owner || !ids)
      return clear("invalid-owner-or-reachable");
    if (!unchanged())
      return false;
    if (vertices.has(v.childRevision) || edges.has(v.childRevision))
      return clear("cycle-or-revision-conflict");
    prune(ids);
    if (edges.size >= limit)
      return clear("edge-limit-exceeded");
    const edge = Object.freeze({
      parentRevision: v.parentRevision,
      childRevision: v.childRevision,
      owner,
      edgeToken: Object.freeze({})
    });
    edges.set(v.childRevision, edge);
    vertices.add(v.parentRevision);
    vertices.add(v.childRevision);
    currentRevision = v.childRevision;
    currentSerial = v.serial;
    if (!advance())
      return clear("generation-exhausted");
    return true;
  }
  function lookup(query, proof) {
    const v = read(proof, "lookup");
    if (!v || !unchanged())
      return null;
    let q;
    try {
      q = fields(query, [
        "from",
        "to",
        "kind",
        "scope",
        "resourceLease",
        "expectedGeneration",
        "capture"
      ]);
    } catch {
      clear("invalid-query");
      return null;
    }
    if (!unchanged())
      return null;
    if (!q || !matches(v) || q.scope !== context.scope || q.resourceLease !== context.resourceLease || q.expectedGeneration !== generation || !capture || q.capture !== capture) {
      clear("stale-capture-or-context");
      return null;
    }
    if (q.kind !== "undo" && q.kind !== "redo" || !uint(q.from) || !uint(q.to) || q.from !== currentRevision || v.kind !== q.kind || v.from !== q.from || v.to !== q.to || v.serial !== currentSerial + 1) {
      clear("gap-or-ack-mismatch");
      return null;
    }
    const edge = edges.get(q.kind === "undo" ? q.from : q.to);
    if (!edge || (q.kind === "undo" ? edge.childRevision !== q.from || edge.parentRevision !== q.to : edge.parentRevision !== q.from || edge.childRevision !== q.to)) {
      clear("missing-exact-edge");
      return null;
    }
    let ids;
    try {
      ids = reachable(v.reachableRevisions, [q.to]);
    } catch {
      clear("invalid-reachable");
      return null;
    }
    if (!ids) {
      clear("invalid-reachable");
      return null;
    }
    if (!unchanged())
      return null;
    if (!ids.has(edge.parentRevision) || !ids.has(edge.childRevision)) {
      clear("unreachable-edge");
      return null;
    }
    currentRevision = q.to;
    currentSerial = v.serial;
    prune(ids);
    if (!advance()) {
      clear("generation-exhausted");
      return null;
    }
    return Object.freeze({ owner: edge.owner, edgeToken: edge.edgeToken, generation });
  }
  function pruneNativeReachable(proof) {
    const v = read(proof, "prune");
    if (!v || !unchanged())
      return false;
    if (!matches(v) || v.kind !== "reachable" || v.revision !== currentRevision || v.serial !== currentSerial)
      return clear("reachable-context-mismatch");
    let ids;
    try {
      ids = reachable(v.reachableRevisions, [currentRevision]);
    } catch {
      return clear("invalid-reachable");
    }
    if (!ids)
      return clear("invalid-reachable");
    if (!unchanged())
      return false;
    prune(ids);
    if (!advance())
      return clear("generation-exhausted");
    return true;
  }
  return Object.freeze({
    begin(proof) {
      return ingress(false, () => begin(proof));
    },
    recordVerifiedTextEdge(proof) {
      return ingress(false, () => recordVerifiedTextEdge(proof));
    },
    hint(kind, ticket) {
      if (ingressActive || !enabled() || !ticket || ticket !== capture)
        return null;
      let selected;
      if (kind === "undo")
        selected = edges.get(currentRevision);
      else if (kind === "redo") {
        for (const edge of edges.values())
          if (edge.parentRevision === currentRevision) {
            if (selected)
              return null;
            selected = edge;
          }
      }
      if (!selected)
        return null;
      return Object.freeze({
        from: currentRevision,
        to: kind === "undo" ? selected.parentRevision : selected.childRevision,
        owner: selected.owner,
        edgeToken: selected.edgeToken,
        generation
      });
    },
    lookup(query, proof) {
      return ingress(null, () => lookup(query, proof));
    },
    pruneNativeReachable(proof) {
      return ingress(false, () => pruneNativeReachable(proof));
    },
    capture() {
      if (!enabled())
        return null;
      return capture ??= Object.freeze({ generation });
    },
    reset(why = "reset") {
      const allowed = [
        "reset",
        "unknown-mutation",
        "refresh",
        "format",
        "gap",
        "document-generation",
        "poison",
        "scope-change",
        "lease-change"
      ];
      clear(allowed.includes(why) ? why : "reset");
    },
    dispose() {
      disposed = true;
      clear("dispose");
    },
    stats() {
      return Object.freeze({
        enabled: enabled(),
        edges: edges.size,
        vertices: vertices.size,
        currentRevision,
        serial: currentSerial,
        generation,
        limit,
        disposed,
        reason
      });
    }
  });
}

// packages/core/src/internal/history-text-snapshot.ts
function validateHistoryTextSnapshots(before, next, owner, beforeEpoch, epoch, scope) {
  try {
    for (const snapshot of [before, next])
      if (snapshot === null || typeof snapshot !== "object" || Reflect.ownKeys(snapshot).some((key) => !("value" in Object.getOwnPropertyDescriptor(snapshot, key))))
        return false;
    if (!Object.isFrozen(before) || !Object.isFrozen(next) || before?.format !== "hwp5" || next?.format !== "hwp5" || before.readOnly !== false || next.readOnly !== false || before.limited !== false || next.limited !== false || before.window || next.window || before.viewKind || next.viewKind || !Array.isArray(before.paragraphs) || !Array.isArray(next.paragraphs) || before.paragraphs.length !== next.paragraphs.length)
      return false;
    const { paragraphs: ap, ...ah } = before, { paragraphs: bp, ...bh } = next;
    if (!exactDisplayValue(ah, bh))
      return false;
    const ids = new Set((before.characterShapes ?? []).map((s) => s.id));
    let found = 0;
    const ranges = (p) => {
      if (typeof p.text !== "string" || !p.text.isWellFormed() || Array.from(p.text).some((c) => c.charCodeAt(0) < 32 || c === "￼") || !Array.isArray(p.characterRanges))
        return false;
      let at = 0;
      for (const r of p.characterRanges) {
        if (r.start !== at || !Number.isSafeInteger(r.end) || r.end < r.start || r.end > p.text.length || !ids.has(r.charShapeId))
          return false;
        at = r.end;
      }
      return at === p.text.length;
    };
    for (let i = 0;i < ap.length; i++) {
      const a = ap[i], b = bp[i], ar = a.currentReference, br = b.currentReference;
      if (!ar || !br || ar.kind !== "original" || br.kind !== "original" || ar.epoch !== beforeEpoch || br.epoch !== epoch || ar.scope !== scope || br.scope !== scope)
        return false;
      const { epoch: _a, ...av } = ar, { epoch: _b, ...bv } = br;
      if (!exactDisplayValue(av, bv))
        return false;
      const { currentReference: _ar, ...ax } = a, { currentReference: _br, ...bx } = b;
      if (a.section === owner.section && a.paragraph === owner.paragraph) {
        found++;
        if (ar.id !== String(owner.sourceNode) || a.editable !== true || b.editable !== true || a.clipped || b.clipped || a.sourceOffsets || b.sourceOffsets || !ranges(a) || !ranges(b))
          return false;
        const { text: _at, characterRanges: _ac, ...aa } = ax, { text: _bt, characterRanges: _bc, ...bb } = bx;
        if (!exactDisplayValue(aa, bb))
          return false;
      } else if (!exactDisplayValue(ax, bx))
        return false;
    }
    return found === 1;
  } catch {
    return false;
  }
}

// packages/core/src/internal/native-geometry-evidence.ts
var capsules = new WeakMap;
var ports = new WeakMap;
function readGeometryProjection2(lease, state) {
  try {
    return ports.get(lease)?.(state);
  } catch {
    return;
  }
}
function readNativeGeometryEvidence2(evidence, content) {
  if (!evidence || typeof evidence !== "object")
    return;
  const r = capsules.get(evidence);
  if (!r || r.content !== content || !r.controller.active || r.serial !== r.controller.serial || r.controller.activeEvidence !== evidence || !r.authority())
    return;
  return evidence;
}
function bindGeometryProjectionPort(lease, read) {
  ports.set(lease, read);
}
function createGeometryEvidenceController() {
  const current = { serial: 0, active: false };
  const states = new WeakMap;
  const proofs = new WeakMap;
  const captures = new WeakMap;
  const historyMerges = new WeakMap;
  const edges = createPrivateHistoryEdges({
    readValidated: (proof, op) => {
      if (!proof || typeof proof !== "object")
        return;
      const r = proofs.get(proof);
      proofs.delete(proof);
      return r?.op === op ? r.metadata : undefined;
    }
  });
  const proof = (op, metadata) => {
    const p = Object.freeze({});
    proofs.set(p, { op, metadata });
    return p;
  };
  const reachable = (state) => state.nativeHistoryStats?.protocolVersion === 2 ? state.nativeHistoryRevisions : undefined;
  function captureHistory(state, kind) {
    if (!["undo", "redo"].includes(kind) || !read(state) || !reachable(state))
      return;
    const r = states.get(state), e = r.projection.evidence, c = edges.capture();
    if (!c)
      return;
    const p = Object.freeze({});
    captures.set(p, {
      capture: c,
      hint: edges.hint(kind, c),
      scope: e.scope,
      lease: e.resourceLease,
      revision: e.nativeRevision,
      epoch: e.nativeEpoch,
      sequence: r.sequence,
      serial: current.serial,
      operationRevision: state.operationRevision,
      kind
    });
    return p;
  }
  const invalidate = () => {
    edges.reset();
    current.active = false;
    current.activeEvidence = undefined;
    current.serial++;
  };
  const read = (state) => {
    const r = states.get(state);
    if (!r || r.serial !== current.serial || state.status !== "ready")
      return;
    return readNativeGeometryEvidence2(r.projection.evidence, r.projection.content) ? r.projection : undefined;
  };
  function publish(before, next, origin, transition) {
    if (!origin || !origin.authority() || next.status !== "ready" || !next.documentId || origin.context.editorId !== next.editorId || origin.context.documentId !== next.documentId || origin.context.generation !== next.generation) {
      invalidate();
      return;
    }
    let scope = Object.freeze({
      editorId: next.editorId,
      documentId: next.documentId,
      generation: next.generation,
      referenceScope: origin.referenceScope,
      nativeContract: "hwp5-exclusive-text-delta-v1"
    });
    let lease = undefined, generation = 0;
    let evidenceKind = origin.kind === "history-window" ? "full-baseline" : origin.kind, { owner, beforeEpoch, beforeRevision } = origin;
    let historyReuse = false;
    const priorRecord = states.get(before), priorEvidence = priorRecord?.projection.evidence;
    if (origin.kind === "history-window") {
      const merged = historyMerges.get(origin);
      historyMerges.delete(origin);
      if (!merged || merged.before !== before || merged.content !== next.content || merged.capture !== transition?.capture || !priorEvidence || !read(before) || origin.context.operationRevision !== before.operationRevision || next.operationRevision <= before.operationRevision || next.viewRevision !== before.viewRevision + 1 || origin.nativeRevision !== next.nativeHistoryRevision || merged.serial !== current.serial) {
        invalidate();
        return;
      }
      historyReuse = true;
      scope = priorEvidence.scope;
      lease = priorEvidence.resourceLease;
      generation = priorEvidence.ownerTextRunGeneration + 1;
      owner = merged.owner;
      evidenceKind = "history-text";
      beforeEpoch = priorEvidence.nativeEpoch;
      beforeRevision = priorEvidence.nativeRevision;
    }
    if (origin.kind === "full-baseline" && transition && ["undo", "redo"].includes(transition.kind) && transition.capture) {
      const c = captures.get(transition.capture);
      captures.delete(transition.capture);
      const e = priorEvidence, ids = reachable(next);
      if (c && e && priorRecord && read(before) && ids && origin.sequence === priorRecord.sequence + 1 && c.sequence === priorRecord.sequence && c.serial === current.serial && c.scope === e.scope && c.lease === e.resourceLease && c.revision === e.nativeRevision && c.epoch === e.nativeEpoch && c.operationRevision === before.operationRevision && c.kind === transition.kind && before.nativeHistoryRevision === e.nativeRevision && origin.nativeRevision === next.nativeHistoryRevision && origin.context.operationRevision === before.operationRevision && next.operationRevision > before.operationRevision && next.viewRevision === before.viewRevision + 1 && e.scope.editorId === scope.editorId && e.scope.documentId === scope.documentId && e.scope.generation === scope.generation && e.scope.referenceScope === scope.referenceScope && BigInt(origin.nativeEpoch) > BigInt(e.nativeEpoch)) {
        const hit = edges.lookup({
          from: e.nativeRevision,
          to: origin.nativeRevision,
          kind: transition.kind,
          scope: e.scope,
          resourceLease: e.resourceLease,
          expectedGeneration: c.capture.generation,
          capture: c.capture
        }, proof("lookup", {
          kind: transition.kind,
          scope: e.scope,
          resourceLease: e.resourceLease,
          serial: origin.sequence,
          from: e.nativeRevision,
          to: origin.nativeRevision,
          reachableRevisions: ids
        }));
        if (hit && validateHistoryTextSnapshots(before.content, next.content, hit.owner, e.nativeEpoch, origin.nativeEpoch, e.scope.referenceScope)) {
          historyReuse = true;
          scope = e.scope;
          lease = e.resourceLease;
          generation = e.ownerTextRunGeneration + 1;
          owner = hit.owner;
          evidenceKind = "history-text";
          beforeEpoch = e.nativeEpoch;
          beforeRevision = e.nativeRevision;
        }
      }
    }
    if (origin.kind === "exclusive-text") {
      const prior = states.get(before), e = prior?.projection.evidence;
      if (!prior || !read(before) || origin.sequence !== prior.sequence + 1 || !e || e.nativeEpoch !== origin.beforeEpoch || e.nativeRevision !== origin.beforeRevision || e.scope.editorId !== scope.editorId || e.scope.documentId !== scope.documentId || e.scope.generation !== scope.generation || e.scope.referenceScope !== scope.referenceScope || next.operationRevision <= before.operationRevision || next.viewRevision !== before.viewRevision + 1 || origin.context.operationRevision !== before.operationRevision) {
        if (origin.fullSnapshotDelta !== undefined) {
          publish(before, next, {
            ...origin,
            kind: "full-baseline",
            owner: null,
            fullSnapshotDelta: undefined
          });
        } else
          invalidate();
        return;
      }
      const packet = origin.fullSnapshotDelta ?? origin.ownerWindowDelta;
      const fullSnapshot = packet !== undefined;
      const update = next.content?.windowUpdate;
      if (fullSnapshot ? !validateFullSnapshotTextDelta(before.content, next.content, packet) : !update || update.section !== origin.owner?.section || update.paragraph !== origin.owner.paragraph || update.sourceNode !== origin.owner.sourceNode || update.epoch !== origin.nativeEpoch) {
        publish(before, next, {
          ...origin,
          kind: "full-baseline",
          owner: null,
          fullSnapshotDelta: undefined
        });
        return;
      }
      scope = e.scope;
      lease = e.resourceLease;
      generation = e.ownerTextRunGeneration + 1;
    } else if (!historyReuse) {
      invalidate();
      current.active = true;
      lease = Object.freeze({});
    }
    if (!lease) {
      invalidate();
      return;
    }
    const evidence = Object.freeze({
      scope,
      resourceLease: lease,
      ownerTextRunGeneration: generation,
      owner,
      kind: evidenceKind,
      nativeEpoch: origin.nativeEpoch,
      nativeRevision: origin.nativeRevision,
      ...evidenceKind !== "full-baseline" ? { beforeEpoch, beforeRevision } : {}
    });
    const projection = Object.freeze({ content: next.content, evidence });
    current.activeEvidence = evidence;
    capsules.set(evidence, {
      content: projection.content,
      controller: current,
      serial: current.serial,
      authority: origin.authority
    });
    states.set(next, {
      projection,
      sequence: origin.sequence,
      serial: current.serial,
      authority: origin.authority
    });
    const ids = reachable(next);
    if (evidenceKind === "full-baseline") {
      if (ids)
        edges.begin(proof("begin", {
          kind: "baseline",
          scope,
          resourceLease: lease,
          serial: origin.sequence,
          revision: origin.nativeRevision,
          reachableRevisions: ids
        }));
    } else if (evidenceKind === "exclusive-text") {
      if (ids && owner && (origin.fullSnapshotDelta || origin.ownerWindowDelta))
        edges.recordVerifiedTextEdge(proof("record", {
          kind: "text-delta",
          scope,
          resourceLease: lease,
          serial: origin.sequence,
          parentRevision: origin.beforeRevision,
          childRevision: origin.nativeRevision,
          owner,
          reachableRevisions: ids
        }));
      else
        edges.reset("unknown-mutation");
    }
  }
  function inherit(before, next) {
    const r = states.get(before);
    if (!r || !read(before) || before.content !== next.content || before.editorId !== next.editorId || before.documentId !== next.documentId || before.generation !== next.generation || before.operationRevision !== next.operationRevision || before.viewRevision !== next.viewRevision || before.nativeHistoryRevision !== next.nativeHistoryRevision || before.nativeHistoryRevisions !== next.nativeHistoryRevisions || next.stateVersion !== before.stateVersion + 1 || before.status !== "ready" || next.status !== "ready") {
      invalidate();
      return;
    }
    states.set(next, r);
  }
  return Object.freeze({
    publish,
    inherit,
    invalidate,
    read,
    captureHistory,
    historyWindowHint(state, capture) {
      const c = capture && captures.get(capture);
      const r = states.get(state), e = r?.projection.evidence, h = c?.hint;
      if (!c || !h || !r || !e || !read(state) || c.serial !== current.serial || c.sequence !== r.sequence || c.revision !== e.nativeRevision || c.epoch !== e.nativeEpoch || c.scope !== e.scope || c.lease !== e.resourceLease || c.operationRevision !== state.operationRevision)
        return;
      return Object.freeze({
        kind: "history-window-v1",
        operation: c.kind,
        beforeRevision: h.from,
        expectedRevision: h.to,
        beforeEpoch: c.epoch,
        owner: h.owner
      });
    },
    mergeHistoryWindow(state, packet, origin, capture, ack) {
      const c = capture && captures.get(capture), r = states.get(state), e = r?.projection.evidence;
      if (capture)
        captures.delete(capture);
      if (!c || !c.hint || !r || !e || !origin || origin.kind !== "history-window" || origin.historyWindowDelta !== packet || !origin.authority() || !read(state) || origin.sequence !== r.sequence + 1 || c.sequence !== r.sequence || c.serial !== current.serial || c.scope !== e.scope || c.lease !== e.resourceLease || c.revision !== state.nativeHistoryRevision || c.revision !== e.nativeRevision || c.epoch !== e.nativeEpoch || c.operationRevision !== state.operationRevision || origin.context.editorId !== state.editorId || origin.context.documentId !== state.documentId || origin.context.generation !== state.generation || origin.context.operationRevision !== state.operationRevision || origin.beforeRevision !== c.revision || origin.beforeEpoch !== c.epoch || origin.referenceScope !== e.scope.referenceScope || packet.operation !== c.kind || origin.nativeRevision !== c.hint.to || packet.revision !== c.hint.to)
        return null;
      const ids = ack.historyStats?.protocolVersion === 2 ? ack.historyRevisions : undefined;
      if (!ids)
        return null;
      const hit = edges.lookup({
        from: c.revision,
        to: origin.nativeRevision,
        kind: c.kind,
        scope: e.scope,
        resourceLease: e.resourceLease,
        expectedGeneration: c.capture.generation,
        capture: c.capture
      }, proof("lookup", {
        kind: c.kind,
        scope: e.scope,
        resourceLease: e.resourceLease,
        serial: origin.sequence,
        from: c.revision,
        to: origin.nativeRevision,
        reachableRevisions: ids
      }));
      if (!hit || hit.edgeToken !== c.hint.edgeToken) {
        invalidate();
        return null;
      }
      const merged = mergeHistoryOwnerWindow(state, packet, origin, {
        owner: hit.owner,
        epoch: e.nativeEpoch,
        revision: e.nativeRevision,
        nextRevision: origin.nativeRevision,
        referenceScope: e.scope.referenceScope
      });
      if (!merged || !read(state) || !origin.authority() || current.serial !== c.serial) {
        invalidate();
        return null;
      }
      historyMerges.set(origin, {
        before: state,
        content: merged,
        owner: hit.owner,
        capture,
        serial: current.serial
      });
      return merged;
    },
    captureExclusive(state) {
      const r = states.get(state);
      return r && read(state) ? { projection: r.projection, sequence: r.sequence, serial: r.serial } : undefined;
    }
  });
}

export { isPlainOwnerBaseline, mergeExclusiveOwnerWindow, readGeometryProjection2, readNativeGeometryEvidence2, bindGeometryProjectionPort, createGeometryEvidenceController };

//# debugId=3BC80118E2F0F8CF64756E2164756E21
