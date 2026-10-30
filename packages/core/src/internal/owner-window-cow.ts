import { isOwnedImmutableObservation, ownObservation } from '../state/owned.ts';
import { validateFullSnapshotTextDelta, exactDisplayValue } from './full-snapshot-text-delta.ts';

// 내부 후보: origin 발급/등록은 하지 않는다. 기존 canonical origin의 소비자만 호출한다.

// 명시 producer schema의 plain body/table/picture 부분집합. 문서 식별자나 SHA로 선택하지 않는다.
const ROOT_KEYS = new Set([
  'format',
  'version',
  'paragraphs',
  'totalParagraphs',
  'limited',
  'editorSessionAvailable',
  'observedDocInfoEditingAvailable',
  'observedDocInfoDiagnostics',
  'currentReferenceErrors',
  'tableCreationAvailable',
  'tableCreationResources',
  'createdTables',
  'normalizationEditingAvailable',
  'normalizationInfo',
  'documentWindowAvailable',
  'distributionEditingAvailable',
  'paragraphAlignmentAvailable',
  'paragraphMarginsAvailable',
  'paragraphSpacingAvailable',
  'characterPropertiesAvailable',
  'characterPropertiesRangesAvailable',
  'paragraphReplacementAvailable',
  'characterUnderlineAvailable',
  'characterStrikeAvailable',
  'characterStrikeRangesAvailable',
  'characterUnderlineRangesAvailable',
  'characterUnderlineColorAvailable',
  'characterStrikeColorAvailable',
  'characterTextColorAvailable',
  'characterShadeAvailable',
  'characterEffectAvailable',
  'characterEffectExclusiveAvailable',
  'characterEffectRangesExclusiveAvailable',
  'characterOutlineAvailable',
  'characterOutlineRangesAvailable',
  'characterOutlineExtendedAvailable',
  'characterOutlineRangesExtendedAvailable',
  'characterEffectRangesAvailable',
  'characterFontAvailable',
  'characterFontNameAvailable',
  'namedFontTextAvailable',
  'characterPropertyTextAvailable',
  'namedFontPropertyTextAvailable',
  'namedFontReplacementAvailable',
  'characterPropertyReplacementAvailable',
  'namedFontPropertyReplacementAvailable',
  'characterFontNameRangesAvailable',
  'characterFontRangesAvailable',
  'characterTextColorRangesAvailable',
  'characterShadeRangesAvailable',
  'textSourcePolicyAvailable',
  'readOnly',
  'characterShapes',
  'characterShapesError',
  'characterUnderlines',
  'characterUnderlinesError',
  'characterUnderlineStyles',
  'characterUnderlineStylesError',
  'characterTextColors',
  'characterTextColorsError',
  'fontFaces',
  'fontFacesError',
  'fontFaceMetadata',
  'fontFaceMetadataError',
  'characterFontReferences',
  'characterFontReferencesError',
  'characterFontMetrics',
  'characterFontMetricsError',
  'characterStrikes',
  'characterStrikesError',
  'characterStrikeStyles',
  'characterStrikeStylesError',
  'characterShades',
  'characterShadesError',
  'characterEffects',
  'characterEffectsError',
  'characterOutlines',
  'characterOutlinesError',
  'tables',
  'tableBindingsErrors',
  'hwp5BorderFillSources',
  'hwp5BorderFillSourceError',
  'tablePlacementsErrors',
  'tableLayoutSourceErrors',
  'cellLayoutSourceErrors',
  'tableAnchorErrors',
  'tableGeometryErrors',
  'paragraphFormatAvailable',
  'paragraphShapeCount',
  'paragraphShapeOptions',
  'pageSources',
  'pageSourceErrors',
  'sectionSources',
  'sectionSourceErrors',
  'currentParagraphFlows',
  'columnSources',
  'flowSourceErrors',
  'hwp5Memos',
  'hwp5MemoErrors',
  'structuralAnchorErrors',
  'pageAreaSources',
  'pageAreaSourceErrors',
  'masterPageSources',
  'masterPageSourceErrors',
  'hwp5Notes',
  'hwp5NoteErrors',
  'hwp5NoteShapes',
  'hwp5NotePolicies',
  'hwp5NoteShapeErrors',
  'hwp5Captions',
  'hwp5CaptionErrors',
  'hwp5CaptionGeometryErrors',
  'hwp5Drawings',
  'hwp5DrawingErrors',
  'hwp5DrawingObjectExtraErrors',
  'hwp5PolygonPoints',
  'hwp5PolygonPointErrors',
  'hwp5CurvePoints',
  'hwp5CurvePointErrors',
  'hwp5DrawingComponents',
  'hwp5DrawingComponentErrors',
  'hwp5DrawingBodies',
  'hwp5DrawingBodyErrors',
  'hwp5DrawingMatrices',
  'hwp5DrawingMatrixErrors',
  'hwp5DrawingLocalTransforms',
  'hwp5DrawingLocalErrors',
  'hwp5DrawingCorners',
  'hwp5DrawingCornerErrors',
  'hwp5DrawingGeometry',
  'hwp5DrawingGeometryErrors',
  'hwp5DrawingStyles',
  'hwp5DrawingStyleErrors',
  'columnDisplaySources',
  'columnDisplayErrors',
  'automaticNumberErrors',
  'pageControlSources',
  'pageControlSourceErrors',
  'documentPropertySource',
  'documentPropertySourceError',
  'hwp5Pictures',
  'hwp5PictureErrors',
  'hwp5PictureTails',
  'hwp5PictureTailErrors',
  'hwp5PictureAbsentTails',
  'hwp5GroupGeometry',
  'hwp5FormSourcesAvailable',
  'hwp5Forms',
  'hwp5FormErrors',
  'hwp5FormPropertiesAvailable',
  'hwp5FormPropertyErrors',
  'hwp5FormTextEditAvailable',
  'hwp5FormTextLayoutRetentionAvailable',
  'hwp5CheckBoxStateEditAvailable',
  'hwp5RadioSelectAvailable',
  'hwp5UnnamedRadioSelectAvailable',
  'lines',
  'lineErrors',
  'pictures',
  'formulas',
  'formulaErrors',
  'formulaDefinitionAvailable',
  'drawings',
  'containers',
]);
const EMPTY_KEYS = [
  'createdTables',
  'hwp5Memos',
  'hwp5Notes',
  'hwp5NoteShapes',
  'hwp5NotePolicies',
  'hwp5Captions',
  'hwp5Forms',
  'hwp5DrawingBodies',
  'lines',
  'formulas',
  'drawings',
  'containers',
  'pageAreaSources',
  'masterPageSources',
  'hwp5PolygonPoints',
  'hwp5CurvePoints',
];
const OWNER_KEYS = new Set([
  'section',
  'paragraph',
  'editable',
  'label',
  'text',
  'selectionOwner',
  'currentReference',
  'textSourcePolicyError',
  'characterRanges',
  'tableCell',
  'paraShapeId',
  'paragraphShape',
  'automaticNumbers',
  'automaticNumberPrefixes',
  'pageControls',
]);
export function isPlainOwnerBaseline(content: any, section: number, paragraph: number): boolean {
  try {
    if (
      !isOwnedImmutableObservation(content as unknown) ||
      content.format !== 'hwp5' ||
      content.readOnly ||
      content.limited !== false ||
      !Array.isArray(content.paragraphs) ||
      !Number.isSafeInteger(content.totalParagraphs) ||
      content.paragraphs.length !== content.totalParagraphs ||
      content.window ||
      content.viewKind ||
      Object.keys(content).some((k) => !ROOT_KEYS.has(k))
    )
      return false;
    for (const key of EMPTY_KEYS)
      if (!Array.isArray(content[key]) || content[key].length !== 0) return false;
    for (const [key, value] of Object.entries(content))
      if (
        /note|memo|caption|formula|field|formpropert|container|polygon|curve/i.test(key) &&
        Array.isArray(value) &&
        value.length
      )
        return false;
    if (
      !Array.isArray(content.hwp5Drawings) ||
      content.hwp5Drawings.some((d: any) => d.source?.kind_id !== 0x24706963)
    )
      return false;
    if (
      !Array.isArray(content.currentParagraphFlows) ||
      content.currentParagraphFlows.some(
        (f: any) =>
          f.generated !== false ||
          !['body', 'table_cell'].includes(f.host) ||
          f.memo_index !== null ||
          f.memo_node !== null,
      )
    )
      return false;
    if (content.currentParagraphFlows.length !== content.paragraphs.length) return false;
    const flows = new Map<string, any>();
    for (const flow of content.currentParagraphFlows) {
      if (
        !Number.isSafeInteger(flow.section) ||
        !Number.isSafeInteger(flow.paragraph) ||
        !Number.isSafeInteger(flow.source_node) ||
        flow.section < 0 ||
        flow.paragraph < 0 ||
        flow.source_node < 0
      )
        return false;
      const key = flow.section + ':' + flow.paragraph;
      if (flows.has(key)) return false;
      flows.set(key, flow);
    }
    let owner: any;
    let visibleUnits = 0;
    let count = 0;
    let scope: any, epoch: any;
    for (const row of content.paragraphs) {
      if (typeof row.text !== 'string') return false;
      visibleUnits += row.text.length;
      if (!Number.isSafeInteger(visibleUnits) || visibleUnits > 100000) return false;
      const flow = flows.get(row.section + ':' + row.paragraph);
      const ref = row.currentReference;
      if (!flow || ref?.id !== String(flow.source_node) || ref.section !== row.section)
        return false;
      flows.delete(row.section + ':' + row.paragraph);
      if (!ref || ref.kind !== 'original' || row.clipped || row.textSourcePolicyError) return false;
      if (scope === undefined) {
        scope = ref.scope;
        epoch = ref.epoch;
      } else if (ref.scope !== scope || ref.epoch !== epoch) return false;
      if (row.fieldLabels?.length || row.manualFormulaResults?.length) return false;
      if (row.section === section && row.paragraph === paragraph) {
        owner = row;
        if (Object.keys(row).some((k) => !OWNER_KEYS.has(k))) return false;
        for (const key of ['automaticNumbers', 'automaticNumberPrefixes', 'pageControls'])
          if (!Array.isArray(row[key]) || row[key].length) return false;
        if (
          flow.host === 'table_cell'
            ? !row.tableCell || row.tableCell.listNode !== flow.list_node
            : row.tableCell !== undefined
        )
          return false;
        count++;
      }
    }
    return (
      flows.size === 0 &&
      count === 1 &&
      !owner.sourceOffsets &&
      owner.editable === true &&
      typeof owner.text === 'string' &&
      owner.text.length > 0 &&
      owner.text.isWellFormed() &&
      ![...owner.text].some((c) => c.charCodeAt(0) < 32 || c === '\ufffc')
    );
  } catch {
    return false;
  }
}

export function mergeExclusiveOwnerWindow(
  beforeState: any,
  packet: any,
  origin: any,
  expected: any,
) {
  const baseline = beforeState.content;
  if (!isPlainOwnerBaseline(baseline, packet?.receipt?.section, packet?.receipt?.paragraph))
    return null;
  try {
    if (
      !isOwnedImmutableObservation(baseline as unknown) ||
      !origin ||
      origin.authority() !== true ||
      origin.kind !== 'exclusive-text' ||
      !origin.ownerWindowDelta ||
      origin.ownerWindowDelta !== packet
    )
      return null;
    for (const k of ['editorId', 'documentId', 'generation', 'requestId', 'operationRevision'])
      if (origin.context[k] !== expected.context[k]) return null;
    if (
      origin.sequence !== expected.sequence ||
      origin.beforeRevision !== expected.revision ||
      origin.beforeEpoch !== expected.epoch ||
      origin.referenceScope !== expected.referenceScope
    )
      return null;
    const r = packet.receipt,
      w = packet.window;
    const ownerFlow = baseline.currentParagraphFlows.find(
      (f: any) => f.section === r.section && f.paragraph === r.paragraph,
    );
    if (!ownerFlow || ownerFlow.parent_node !== r.parentNode) return null;
    if (
      r.totalUnits > 4096 ||
      r.totalUnits < 1 ||
      !w.text.isWellFormed() ||
      r.epoch !== origin.nativeEpoch ||
      r.revision !== origin.nativeRevision
    )
      return null;
    const refs = baseline.paragraphs;
    let owners = 0;
    const paragraphs = refs.map((row: any) => {
      if (
        !isOwnedImmutableObservation(row as unknown) ||
        row.currentReference?.kind !== 'original' ||
        row.currentReference.scope !== expected.referenceScope ||
        row.currentReference.epoch !== expected.epoch
      )
        throw Error('StaleBaseline');
      const reference = { ...row.currentReference, epoch: r.epoch };
      if (row.section !== r.section || row.paragraph !== r.paragraph)
        return { ...row, currentReference: reference };
      owners++;
      if (row.text.length === 0 || !exactDisplayValue(reference, packet.reference))
        throw Error('IneligibleOwner');
      const text = w.text.slice(0, -1),
        characterRanges: any[] = [];
      if (!text.length) throw Error('EmptyOwnerTransition');
      for (let i = 0; i < r.runs.length; i++) {
        const start = Math.min(text.length, r.runs[i].start_unit),
          end = Math.min(text.length, r.runs[i + 1]?.start_unit ?? r.totalUnits),
          charShapeId = r.runs[i].char_shape_id;
        if (start === end) {
          if (start === text.length) characterRanges.push({ start, end, charShapeId });
          continue;
        }
        const last = characterRanges.at(-1);
        if (last?.charShapeId === charShapeId) last.end = end;
        else characterRanges.push({ start, end, charShapeId });
      }
      return { ...row, currentReference: reference, text, characterRanges };
    });
    if (owners !== 1) return null;
    const next = ownObservation({ ...baseline, paragraphs })();
    if (!validateFullSnapshotTextDelta(baseline, next, packet)) return null;
    return next;
  } catch {
    return null;
  }
}
