import { formattingCapabilities, queryAtomicFormatting } from './atomic-formatting-command.mjs';
import { createDisplayResourceCache } from './display-resource-cache.mjs';
import { createHwp5Reader } from '../../js/hwp5.mjs';
import {
  availableSectionsCapability,
  availableSectionsRequest,
  availableSectionsContent,
} from './hwp5-available-preview.mjs';
import {
  availableSectionCopyCapability,
  availableSectionCopyRequest,
} from './hwp5-available-copy-preview.mjs';
import { createHwpxReader } from '../../js/hwpx.mjs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { applyParagraphSplit, paragraphBreakIntent } from './paragraph-split-command.mjs';
import { attachHwpxCharts } from './hwpx-chart-content.mjs';
import { applyChartPointBatchCommand } from './chart-point-batch-command.mjs';
import { tableColumnWidthPlan } from './table-column-width-plan.mjs';
import { hwpxFieldRangeTarget } from './hwpx-field-range-target.mjs';
import { attachCheckBoxes } from './checkbox-content.mjs';
import { attachDutmal } from './dutmal-content.mjs';
import { attachEquations } from './equation-content.mjs';
import { attachEquationRendering } from './equation-render-content.mjs';
import { projectFieldLabelDisplay } from './field-label-display-content.mjs';
import {
  formulaResultTextAvailable,
  projectFormulaResultText,
  spliceFormulaResultText,
  formulaResultTextRangeAllowed,
} from './formula-result-text-command.mjs';
import { createFormulaResultParagraphFilter } from './formula-result-paragraph-filter.mjs';
import { createFormulaResultDisplayLookup } from './formula-result-display-lookup.mjs';
import { attachHwpxPageAreaDeclarations } from './hwpx-page-area-declarations.mjs';
import { attachHwpxOleSources } from './hwpx-ole-content.mjs';
import { readDutmalText, writeDutmalText, dutmalQueryIdentity } from './dutmal-edit-command.mjs';
import {
  readEquationScript,
  writeEquationScript,
  equationQueryIdentity,
} from './equation-edit-command.mjs';
import { createHwpxPasswordDecoder } from '../../js/hwpx-password.mjs';
import { createHwp5PasswordDecoder } from '../../js/hwp5-password.mjs';
import { requirePasswordRemovalConsent } from './password-policy.mjs';
import { displayHwpxContent, HWPX_DISPLAY_BOUNDS } from './hwpx-content.mjs';
import { projectHwpxWindow } from './hwpx-window-projection.mjs';
import { attachHwpxStyles } from './hwpx-style-content.mjs';
import { attachTabDefinitions } from './tab-definition-content.mjs';
import { attachSectionTabSources } from './section-tab-content.mjs';
import { attachHwp5Styles } from './hwp5-style-content.mjs';
import { attachHwp5TextSourcePolicy } from './hwp5-text-source-policy.mjs';
import { attachHwp5Tables } from './hwp5-table-content.mjs';
import { attachHwp5ParagraphFormats } from './hwp5-paragraph-formats.mjs';
import { attachHwpxParagraphFormats } from './hwpx-paragraph-formats.mjs';
import { attachHwpxFormulas } from './hwpx-formulas-content.mjs';
import { attachHwp5Formulas } from './hwp5-formulas-content.mjs';
import { attachHwp5Forms } from './hwp5-form-content.mjs';
import { attachHwp5FormProperties } from './hwp5-form-property-content.mjs';
import { attachHwpxTables } from './hwpx-table-content.mjs';
import { attachHwpxTableBorders } from './hwpx-table-border-content.mjs';
import { attachCreatedTables } from './created-table-content.mjs';
import { attachDrawingTextBindings } from './drawing-text-content.mjs';
import { attachEllipses } from './ellipse-content.mjs';
import {
  attachAutomaticNumbers,
  retainedAutomaticNumberPlainText,
} from './automatic-number-content.mjs';
import { createAutomaticNumberDisplaySnapshot } from './automatic-number-display-snapshot.mjs';
import { attachNoteReferences } from './note-reference-content.mjs';
import { attachHwpxPictures } from './hwpx-picture-content.mjs';
import { attachHwpxPictureCaptions } from './hwpx-picture-captions.mjs';
import { attachHwpxLines } from './hwpx-line-content.mjs';
import { attachHwpxConnectors } from './hwpx-connector-content.mjs';
import { attachHwp5Lines } from './hwp5-line-content.mjs';
import { attachHwpxPageSettings } from './hwpx-page-content.mjs';
import { attachHwp5PageSources } from './hwp5-page-content.mjs';
import { displayContent } from './content.mjs';
import { projectHwp5RootContent } from './hwp5-root-content-projection.mjs';
import { attachHwp5Pictures, readHwp5PictureBytes } from './hwp5-picture-content.mjs';
import { attachHwp5PictureTails } from './hwp5-picture-tail-content.mjs';
import { projectHwp5PictureGeometry } from './hwp5-picture-geometry.mjs';
import { projectHwp5GroupGeometry } from './hwp5-group-geometry-projection.mjs';
import { clipText } from './content.mjs';
import { createExperimentalHwp5Editor as createHwp5Session } from '../../js/hwp5-editor.mjs';
import { saveDocument } from './document-save.mjs';
import { encodeCharacterRanges } from '../../js/character-range-batch.mjs';
import { createFieldLinkDisplayGuard } from './field-link-display-guard.mjs';
import { queryHwp5WindowContent } from './hwp5-window-query-content.mjs';
import { currentReferenceCommand } from './hwp5-current-reference-command.mjs';
import { attachHwp5CurrentReferences } from './hwp5-current-reference-content.mjs';
import { attachHwp5NoteSelectionOwners } from './hwp5-note-selection-owner.mjs';
import { attachHwp5CreatedTables } from './hwp5-created-table-content.mjs';
import {
  hwp5TableCreationRequest,
  setHwp5CreatedCellText,
} from './hwp5-table-creation-command.mjs';
import { selectionEditQuery, selectionSplitQuery } from './selection-edit-query.mjs';

/** Copy before the first await; no caller buffers or shared memory cross the queue. */
export function copyRuntimeMessage(message) {
  const ancestors = new Set();
  function validate(value) {
    if (
      value === null ||
      value === undefined ||
      ['string', 'number', 'boolean'].includes(typeof value)
    )
      return;
    if (typeof value !== 'object') throw new TypeError('InvalidRuntimePayload');
    if (
      typeof SharedArrayBuffer !== 'undefined' &&
      (value instanceof SharedArrayBuffer ||
        (ArrayBuffer.isView(value) && value.buffer instanceof SharedArrayBuffer))
    )
      throw new TypeError('SharedRuntimePayloadUnsupported');
    if (
      value instanceof WebAssembly.Module ||
      value instanceof ArrayBuffer ||
      ArrayBuffer.isView(value)
    )
      return;
    if (ancestors.has(value)) throw new TypeError('CyclicRuntimePayload');
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      throw new TypeError('InvalidRuntimePayload');
    ancestors.add(value);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if (descriptor.get || descriptor.set) throw new TypeError('InvalidRuntimePayload');
      validate(descriptor.value);
    }
    ancestors.delete(value);
  }
  validate(message);
  if (!message || typeof message.kind !== 'string') throw new TypeError('InvalidRuntimeMessage');
  return structuredClone(message);
}

/** DOM-free legacy protocol backend. Compile Modules may be shared; instances never are.
 * loadWasmModule is a host boundary, called only for load without an explicit Module.
 * allowReload exists for the legacy Worker; core creates one runtime per candidate.
 */
export function createReaderRuntime({
  wasmModule,
  loadWasmModule,
  allowReload = false,
  referenceScope,
} = {}) {
  if (
    referenceScope !== undefined &&
    (typeof referenceScope !== 'string' || !referenceScope.length)
  )
    throw new TypeError('InvalidCurrentReferenceScope');
  const createExperimentalHwp5Editor = (module, input, options = {}) =>
    createHwp5Session(module, input, { ...options, referenceScope });
  let module, bytes, preview, editor, format;
  const displayResources = createDisplayResourceCache();
  let historyEnabled = false;
  let historyPoisoned = false;
  let hwpxChartOlePolicy = false;
  let protectionRemoved = false;
  let hwp5StyleOpenError = null;
  let documentWindow = null;
  let hwpxCreatedTablesPending = false;
  function normalizationMetadataAvailable() {
    return WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_normalization_info' && entry.kind === 'function',
    );
  }
  function outsideFieldRange(section, paragraph, start, end) {
    if (hwpxCreatedTablesPending && !editor.createdTableHostMode(section)) return false;
    return (
      WebAssembly.Module.exports(module).some(
        (entry) => entry.name === 'hwpx_edit_can_edit_outside_field' && entry.kind === 'function',
      ) && editor.canEditOutsideField(section, paragraph, start, end)
    );
  }
  function hwp5DisplayProjection() {
    // Only an explicitly opened native editor can lift the display-only gate.
    return editor && historyEnabled && preview.primarySource === 'distribution_viewtext'
      ? { ...preview, readOnly: false }
      : preview;
  }
  function hwp5ParagraphFormatsAvailable() {
    return [
      'hwp5_edit_para_shape_count',
      'hwp5_edit_para_shape_id',
      'hwp5_edit_set_paragraph_format',
    ].every((name) =>
      WebAssembly.Module.exports(module).some(
        (entry) => entry.name === name && entry.kind === 'function',
      ),
    );
  }
  async function refreshHwp5PreviewFallback() {
    if (historyEnabled && editor?.supportsCurrentTextPreview?.()) return;
    const fallback = await createHwp5Reader(module);
    try {
      preview = fallback.readText(editor.save({ allowStaleLayout: true }).bytes);
    } finally {
      fallback.close();
    }
  }
  function hwp5TableCreationAvailable() {
    return (
      Boolean(editor) &&
      [
        'hwp5_edit_insert_table',
        'hwp5_edit_created_tables',
        'hwp5_edit_table_creation_resources',
        'hwp5_edit_current_text_preview',
        'hwp5_edit_current_source_references',
        'hwp5_edit_current_references',
        'hwp5_edit_copy_current_text',
        'hwp5_edit_splice_current',
      ].every((name) =>
        WebAssembly.Module.exports(module).some(
          (entry) => entry.name === name && entry.kind === 'function',
        ),
      )
    );
  }
  function hwp5Display(projected = null) {
    if (historyEnabled && editor?.supportsCurrentTextPreview?.()) {
      preview = { ...preview, ...editor.currentTextPreview() };
    }
    if (!projected && documentWindow) {
      const total = preview.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
      const offset = Math.min(documentWindow.offset, Math.max(0, total - 1));
      projected = queryHwp5WindowContent(
        editor,
        hwp5DisplayProjection(),
        { offset, count: Math.min(documentWindow.count, total - offset) },
        hwp5ParagraphFormatsAvailable(),
      );
    }
    const content = projected ?? displayContent(hwp5DisplayProjection());
    content.editorSessionAvailable = Boolean(editor);
    const observedDocInfoAvailable = [
      'hwp5_edit_open_observed_docinfo',
      'hwp5_edit_observed_docinfo_diagnostics',
    ].every((name) =>
      WebAssembly.Module.exports(module).some(
        (entry) => entry.kind === 'function' && entry.name === name,
      ),
    );
    if (observedDocInfoAvailable) {
      content.observedDocInfoEditingAvailable =
        !editor &&
        preview.primarySource !== 'distribution_viewtext' &&
        ['UnexpectedEnd', 'RepairedSourceUnsupported', 'ResourceCountMismatch'].includes(
          hwp5StyleOpenError,
        );
      content.observedDocInfoDiagnostics = editor?.observedDocInfoDiagnostics() ?? null;
    }
    if (historyEnabled || editor?.supportsAtomicFormatting?.())
      attachHwp5CurrentReferences(editor, preview, content);
    attachHwp5CreatedTables(editor, content, hwp5TableCreationAvailable(), preview.sections.length);
    const normalizationExport =
      preview.primarySource === 'distribution_viewtext'
        ? 'hwp5_edit_open_normalized_distribution'
        : 'hwp5_edit_open_normalized';
    content.normalizationEditingAvailable =
      normalizationMetadataAvailable() &&
      hwp5StyleOpenError === 'RepairedSourceUnsupported' &&
      WebAssembly.Module.exports(module).some(
        (entry) => entry.name === normalizationExport && entry.kind === 'function',
      );
    if (editor?.supportsNormalizationInfo()) content.normalizationInfo = editor.normalizationInfo();
    content.documentWindowAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_field_spans' && entry.kind === 'function',
    );
    if (preview.primarySource === 'distribution_viewtext')
      content.primarySource = preview.primarySource;
    content.distributionEditingAvailable =
      preview.primarySource === 'distribution_viewtext' &&
      WebAssembly.Module.exports(module).some(
        (entry) => entry.name === 'hwp5_edit_open_distribution' && entry.kind === 'function',
      ) &&
      (hwp5StyleOpenError !== 'RepairedSourceUnsupported' || content.normalizationEditingAvailable);
    content.paragraphAlignmentAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_set_paragraph_alignment' && entry.kind === 'function',
    );
    content.paragraphMarginsAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_set_paragraph_margins' && entry.kind === 'function',
    );
    content.paragraphSpacingAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_set_paragraph_spacing' && entry.kind === 'function',
    );
    content.characterPropertiesAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_set_character_properties' && entry.kind === 'function',
    );
    content.characterPropertiesRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_set_character_properties_ranges' && entry.kind === 'function',
    );
    content.paragraphReplacementAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_replace_paragraph_ranges' && entry.kind === 'function',
    );
    content.characterUnderlineAvailable = [
      'hwp5_edit_set_character_underline',
      'hwp5_edit_character_underlines',
    ].every((name) =>
      WebAssembly.Module.exports(module).some(
        (entry) => entry.name === name && entry.kind === 'function',
      ),
    );
    content.characterStrikeAvailable = [
      'hwp5_edit_set_character_strike',
      'hwp5_edit_character_strikes',
    ].every((name) =>
      WebAssembly.Module.exports(module).some(
        (entry) => entry.name === name && entry.kind === 'function',
      ),
    );
    content.characterStrikeRangesAvailable =
      content.characterStrikeAvailable &&
      WebAssembly.Module.exports(module).some(
        (entry) =>
          entry.name === 'hwp5_edit_set_character_strike_ranges' && entry.kind === 'function',
      );
    content.characterUnderlineRangesAvailable =
      content.characterUnderlineAvailable &&
      WebAssembly.Module.exports(module).some(
        (entry) =>
          entry.name === 'hwp5_edit_set_character_underline_ranges' && entry.kind === 'function',
      );
    content.characterUnderlineColorAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_set_character_underline_color' && entry.kind === 'function',
    );
    content.characterStrikeColorAvailable =
      content.characterStrikeAvailable &&
      ['hwp5_edit_set_character_strike_color', 'hwp5_edit_character_strike_styles'].every((name) =>
        WebAssembly.Module.exports(module).some(
          (entry) => entry.name === name && entry.kind === 'function',
        ),
      );
    content.characterTextColorAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_set_character_text_color' && entry.kind === 'function',
    );
    content.characterShadeAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_set_character_shade' && entry.kind === 'function',
    );
    content.characterEffectAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_set_character_effect' && entry.kind === 'function',
    );
    content.characterEffectExclusiveAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_set_character_effect_exclusive' && entry.kind === 'function',
    );
    content.characterEffectRangesExclusiveAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_set_character_effect_ranges_exclusive' &&
        entry.kind === 'function',
    );
    content.characterOutlineAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_set_character_outline' && entry.kind === 'function',
    );
    content.characterOutlineRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_set_character_outline_ranges' && entry.kind === 'function',
    );
    content.characterOutlineExtendedAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_set_character_outline_extended' && entry.kind === 'function',
    );
    content.characterOutlineRangesExtendedAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_set_character_outline_ranges_extended' &&
        entry.kind === 'function',
    );
    content.characterEffectRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_set_character_effect_ranges' && entry.kind === 'function',
    );
    content.characterFontAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_set_character_font' && entry.kind === 'function',
    );
    content.characterFontNameAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_set_character_font_name' && entry.kind === 'function',
    );
    content.namedFontTextAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_splice_font_name' && entry.kind === 'function',
    );
    content.characterPropertyTextAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_splice_character_properties' && entry.kind === 'function',
    );
    content.namedFontPropertyTextAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_splice_font_name_properties' && entry.kind === 'function',
    );
    content.namedFontReplacementAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_replace_paragraph_ranges_font_name' && entry.kind === 'function',
    );
    content.characterPropertyReplacementAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_replace_paragraph_ranges_properties' && entry.kind === 'function',
    );
    content.namedFontPropertyReplacementAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_replace_paragraph_ranges_font_name_properties' &&
        entry.kind === 'function',
    );
    content.characterFontNameRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_set_character_font_name_ranges' && entry.kind === 'function',
    );
    content.characterFontRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_set_character_font_ranges' && entry.kind === 'function',
    );
    content.characterTextColorRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwp5_edit_set_character_text_color_ranges' && entry.kind === 'function',
    );
    content.characterShadeRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwp5_edit_set_character_shade_ranges' && entry.kind === 'function',
    );
    if (protectionRemoved) content.passwordProtectionRemoved = true;
    attachHwp5TextSourcePolicy(editor, content);
    if (content.window) return content;
    const paragraphFormatAvailable = hwp5ParagraphFormatsAvailable();
    const prepared = attachHwp5PictureTails(
      editor,
      attachHwp5Pictures(
        editor,
        attachHwp5PageSources(
          editor,
          attachHwp5ParagraphFormats(
            editor,
            attachHwp5Tables(
              editor,
              preview,
              attachHwp5Styles(editor, preview, content, hwp5StyleOpenError),
            ),
            paragraphFormatAvailable,
          ),
        ),
      ),
    );
    prepared.hwp5GroupGeometry = projectHwp5GroupGeometry(prepared);
    attachHwp5Forms(editor, prepared);
    attachHwp5FormProperties(editor, prepared);
    prepared.hwp5FormTextEditAvailable =
      historyEnabled && editor?.supportsFormTextEdit?.() === true;
    prepared.hwp5FormTextLayoutRetentionAvailable =
      prepared.hwp5FormTextEditAvailable && editor?.supportsFormTextLayoutRetention?.() === true;
    prepared.hwp5CheckBoxStateEditAvailable =
      historyEnabled && editor?.supportsCheckBoxStateEdit?.() === true;
    prepared.hwp5RadioSelectAvailable =
      historyEnabled && editor?.supportsRadioButtonSelect?.() === true;
    prepared.hwp5UnnamedRadioSelectAvailable =
      prepared.hwp5RadioSelectAvailable && editor?.supportsUnnamedRadioSelect?.() === true;
    attachHwp5Lines(editor, prepared);
    if (prepared.hwp5Pictures?.length) {
      const pictures = projectHwp5PictureGeometry(prepared);
      if (pictures.state === 'projected') prepared.pictures = pictures.pictures;
      else prepared.hwp5PictureGeometryError = pictures.error;
    }
    attachHwp5Formulas(
      editor,
      prepared,
      ['hwp5_edit_formula_sources', 'hwp5_edit_set_formula_definition'].every((name) =>
        WebAssembly.Module.exports(module).some(
          (entry) => entry.name === name && entry.kind === 'function',
        ),
      ),
    );
    const roots = projectHwp5RootContent(prepared);
    if (roots.state === 'projected') return attachHwp5NoteSelectionOwners(roots.content);
    if (
      prepared.hwp5Drawings?.length &&
      prepared.hwp5Drawings.every((row) => row.source.kind_id === 0x24636f6e)
    )
      prepared.hwp5GroupPageModelError = roots.error;
    else prepared.hwp5DrawingPageModelError = roots.error;
    return attachHwp5NoteSelectionOwners(prepared);
  }
  function anchorView(section, paragraph) {
    try {
      return editor.anchorText(section, paragraph);
    } catch (error) {
      if (
        [
          'MissingTextSite',
          'UnsupportedParagraphControl',
          'UnsupportedInlineControl',
          'SourceBindingMismatch',
          'UnsupportedTextPositionProjection',
          'HwpxAnchorEditAbiUnavailable',
          'UnsupportedStructuralAnchorEdit',
          'UnsupportedStructuralFieldEdit',
        ].includes(error.message)
      )
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
    if (!content.window) attachHwpxFormulas(editor, content);
    content.formulaDefinitionAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_set_formula_definition' && entry.kind === 'function',
    );
    const formulaExports = new Set(
      WebAssembly.Module.exports(module)
        .filter((entry) => entry.kind === 'function')
        .map((entry) => entry.name),
    );
    attachHwpxCharts(editor, content, formulaExports, hwpxChartOlePolicy);
    content.manualFormulaResultAvailable =
      typeof editor.setManualFormulaResult === 'function' &&
      ['hwpx_edit_set_manual_formula_result', 'hwpx_edit_manual_formula_result_max_bytes'].every(
        (name) => formulaExports.has(name),
      );
    content.manualFormulaResultTextAvailable = formulaResultTextAvailable(editor, module);
    const formulaResultContext =
      content.manualFormulaResultTextAvailable && content.window
        ? attachHwpxFormulas(editor, { paragraphs: content.paragraphs })
        : content;
    const formulaResultSections = new Set(
      (formulaResultContext.formulas ?? []).map((row) => row.section),
    );
    const formulaResultParagraph = createFormulaResultParagraphFilter(editor, formulaExports);
    const formulaDisplay = createFormulaResultDisplayLookup(editor, formulaExports);
    content.paragraphAlignmentAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_set_paragraph_alignment' && entry.kind === 'function',
    );
    content.paragraphMarginsAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_set_paragraph_margins' && entry.kind === 'function',
    );
    content.paragraphSpacingAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_set_paragraph_spacing' && entry.kind === 'function',
    );
    content.characterPropertiesAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_set_character_properties' && entry.kind === 'function',
    );
    content.characterPropertiesRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwpx_edit_set_character_properties_ranges' && entry.kind === 'function',
    );
    content.paragraphReplacementAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_replace_paragraph_ranges' && entry.kind === 'function',
    );
    content.characterUnderlineAvailable = [
      'hwpx_edit_set_character_underline',
      'hwpx_edit_character_underlines',
    ].every((name) =>
      WebAssembly.Module.exports(module).some(
        (entry) => entry.name === name && entry.kind === 'function',
      ),
    );
    content.characterStrikeAvailable = [
      'hwpx_edit_set_character_strike',
      'hwpx_edit_character_strikes',
    ].every((name) =>
      WebAssembly.Module.exports(module).some(
        (entry) => entry.name === name && entry.kind === 'function',
      ),
    );
    content.characterStrikeRangesAvailable =
      content.characterStrikeAvailable &&
      WebAssembly.Module.exports(module).some(
        (entry) =>
          entry.name === 'hwpx_edit_set_character_strike_ranges' && entry.kind === 'function',
      );
    content.characterUnderlineRangesAvailable =
      content.characterUnderlineAvailable &&
      WebAssembly.Module.exports(module).some(
        (entry) =>
          entry.name === 'hwpx_edit_set_character_underline_ranges' && entry.kind === 'function',
      );
    content.characterUnderlineColorAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwpx_edit_set_character_underline_color' && entry.kind === 'function',
    );
    content.characterStrikeColorAvailable =
      content.characterStrikeAvailable &&
      ['hwpx_edit_set_character_strike_color', 'hwpx_edit_character_strike_styles'].every((name) =>
        WebAssembly.Module.exports(module).some(
          (entry) => entry.name === name && entry.kind === 'function',
        ),
      );
    content.characterTextColorAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_set_character_text_color' && entry.kind === 'function',
    );
    content.characterShadeAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_set_character_shade' && entry.kind === 'function',
    );
    content.characterEffectAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_set_character_effect' && entry.kind === 'function',
    );
    content.characterEffectExclusiveAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwpx_edit_set_character_effect_exclusive' && entry.kind === 'function',
    );
    content.characterEffectRangesExclusiveAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwpx_edit_set_character_effect_ranges_exclusive' &&
        entry.kind === 'function',
    );
    content.characterOutlineAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_set_character_outline' && entry.kind === 'function',
    );
    content.characterOutlineRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwpx_edit_set_character_outline_ranges' && entry.kind === 'function',
    );
    content.characterOutlineExtendedAvailable = false;
    content.characterOutlineRangesExtendedAvailable = false;
    content.characterEffectRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwpx_edit_set_character_effect_ranges' && entry.kind === 'function',
    );
    content.characterFontAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_set_character_font' && entry.kind === 'function',
    );
    content.characterFontNameAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_set_character_font_name' && entry.kind === 'function',
    );
    content.namedFontTextAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_splice_font_name' && entry.kind === 'function',
    );
    content.characterPropertyTextAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwpx_edit_splice_character_properties' && entry.kind === 'function',
    );
    content.namedFontPropertyTextAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwpx_edit_splice_font_name_properties' && entry.kind === 'function',
    );
    content.namedFontReplacementAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwpx_edit_replace_paragraph_ranges_font_name' && entry.kind === 'function',
    );
    content.characterPropertyReplacementAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwpx_edit_replace_paragraph_ranges_properties' && entry.kind === 'function',
    );
    content.namedFontPropertyReplacementAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwpx_edit_replace_paragraph_ranges_font_name_properties' &&
        entry.kind === 'function',
    );
    content.characterFontNameRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwpx_edit_set_character_font_name_ranges' && entry.kind === 'function',
    );
    content.characterFontRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_set_character_font_ranges' && entry.kind === 'function',
    );
    content.characterTextColorRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) =>
        entry.name === 'hwpx_edit_set_character_text_color_ranges' && entry.kind === 'function',
    );
    content.characterShadeRangesAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_set_character_shade_ranges' && entry.kind === 'function',
    );
    let units = 0;
    const fieldLinkGuard = createFieldLinkDisplayGuard();
    const currentText = new Map();
    const automaticNumberSnapshot = createAutomaticNumberDisplaySnapshot(editor);
    const nextMerge = new Map(),
      previousMerge = new Map();
    const neighborAvailable = WebAssembly.Module.exports(module).some(
      (entry) => entry.name === 'hwpx_edit_paragraph_neighbors' && entry.kind === 'function',
    );
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
            if (previousMerge.has(key)) throw new Error('DuplicateParagraphNeighbor');
            previousMerge.set(key, paragraph);
          }
        }
      }
    }
    for (const paragraph of content.paragraphs) {
      const current = currentText.get(`${paragraph.section}:${paragraph.paragraph}`);
      if (!current) throw new Error('MissingCurrentParagraphText');
      paragraph.selectionOwner = current.nested ? null : `section:${paragraph.section}:body`;
      if (neighborAvailable) {
        paragraph.nextMergeParagraph =
          nextMerge.get(`${paragraph.section}:${paragraph.paragraph}`) ?? null;
        paragraph.previousMergeParagraph =
          previousMerge.get(`${paragraph.section}:${paragraph.paragraph}`) ?? null;
      }
      paragraph.label = `구역 ${paragraph.section + 1} · 문단 ${paragraph.paragraph + 1}${current.nested ? ' · 중첩' : ''} · HWPX 읽기 전용`;
      paragraph.plainEditable =
        !paragraph.clipped &&
        fieldLinkGuard.read(
          paragraph.section,
          () => editor.canEdit(paragraph.section, paragraph.paragraph + 1),
          false,
          'plain',
        );
      if (paragraph.plainEditable) {
        const anchored = editor.anchorText(paragraph.section, paragraph.paragraph + 1);
        paragraph.text = current.nested
          ? retainedAutomaticNumberPlainText(
              editor,
              paragraph.section,
              paragraph.paragraph + 1,
              current.text,
              anchored,
              automaticNumberSnapshot,
            )
          : anchored;
      }
      paragraph.fieldLabels = [];
      paragraph.manualFormulaResults = [];
      paragraph.anchorEditable = false;
      if (!paragraph.clipped && !paragraph.plainEditable) {
        const anchored = fieldLinkGuard.read(
          paragraph.section,
          () => anchorView(paragraph.section, paragraph.paragraph + 1),
          null,
          'anchor',
        );
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
      paragraph.anchoredSplitAvailable =
        !paragraph.clipped &&
        (paragraph.anchorEditable ||
          (paragraph.plainEditable && /[\t\r\n]/.test(paragraph.text))) &&
        WebAssembly.Module.exports(module).some(
          (entry) => entry.name === 'hwpx_edit_split_anchored' && entry.kind === 'function',
        );
      if (!paragraph.clipped && !paragraph.plainEditable && !paragraph.anchorEditable) {
        try {
          paragraph.fieldLabels = fieldLinkGuard.read(
            paragraph.section,
            () => editor.fieldLabels(paragraph.section, paragraph.paragraph + 1),
            [],
            'labels',
          );
        } catch (error) {
          if (
            ![
              'SourceBindingMismatch',
              'UnsupportedTextPositionProjection',
              'HwpxFieldEditAbiUnavailable',
              'UnsupportedStructuralFieldEdit',
            ].includes(error.message)
          )
            throw error;
          paragraph.fieldReadOnlyReason = error.message;
        }
      }
      if (
        paragraph.fieldLabels.length &&
        WebAssembly.Module.exports(module).some(
          (entry) =>
            entry.name === 'hwpx_edit_field_label_display_text' && entry.kind === 'function',
        )
      )
        units += projectFieldLabelDisplay(
          editor,
          paragraph,
          HWPX_DISPLAY_BOUNDS.maxUnits - units + paragraph.text.length,
        );
      units += fieldLinkGuard.read(
        paragraph.section,
        () => {
          const eligible =
            content.manualFormulaResultTextAvailable &&
            !paragraph.clipped &&
            !paragraph.plainEditable &&
            formulaResultSections.has(paragraph.section);
          const snapshot =
            eligible && formulaDisplay.available
              ? formulaDisplay.get(paragraph.section, paragraph.paragraph + 1)
              : undefined;
          const available =
            eligible &&
            (snapshot !== undefined
              ? snapshot !== null
              : formulaResultParagraph(paragraph.section, paragraph.paragraph + 1));
          return projectFormulaResultText(
            editor,
            paragraph,
            available,
            HWPX_DISPLAY_BOUNDS.maxUnits - units + paragraph.text.length,
            snapshot ?? undefined,
          );
        },
        0,
        'formula-results',
      );
      if (paragraph.clipped) content.limited = true;
      const wholeFormulaResult =
        paragraph.manualFormulaResults.length === 1 &&
        paragraph.manualFormulaResults[0].start === 0 &&
        paragraph.manualFormulaResults[0].end === paragraph.text.length;
      paragraph.editable =
        paragraph.plainEditable ||
        paragraph.anchorEditable ||
        paragraph.fieldLabels.length > 0 ||
        wholeFormulaResult;
      if (!paragraph.editable && fieldLinkGuard.reason(paragraph.section))
        paragraph.fieldReadOnlyReason = fieldLinkGuard.reason(paragraph.section);
      if (paragraph.editable)
        paragraph.label = paragraph.label.replace(
          '읽기 전용',
          paragraph.plainEditable
            ? '일반 텍스트 편집'
            : paragraph.anchorEditable
              ? '보호 개체 텍스트 편집'
              : paragraph.manualFormulaResults.length
                ? '계산 결과 편집'
                : '필드 라벨만 편집',
        );
      else if (paragraph.manualFormulaResults.length)
        paragraph.label = paragraph.label.replace('읽기 전용', '계산 결과 범위만 편집');
    }
    content.readOnly = !content.paragraphs.some((paragraph) => paragraph.editable);
    attachAutomaticNumbers(editor, content, automaticNumberSnapshot);
    attachDutmal(
      editor,
      content,
      [
        'hwpx_edit_inline_string_sources',
        'hwpx_edit_dutmal_sites',
        'hwpx_edit_dutmal_text',
        'hwpx_edit_dutmal_display_text',
      ].every((name) =>
        WebAssembly.Module.exports(module).some(
          (entry) => entry.name === name && entry.kind === 'function',
        ),
      ),
    );
    attachEquations(
      editor,
      content,
      WebAssembly.Module.exports(module).some(
        (entry) => entry.name === 'hwpx_edit_equation_sites' && entry.kind === 'function',
      ),
    );
    attachEquationRendering(
      editor,
      content,
      content.equationAvailable &&
        WebAssembly.Module.exports(module).some(
          (entry) => entry.name === 'equation_process' && entry.kind === 'function',
        ),
      undefined,
      WebAssembly.Module.exports(module).some(
        (entry) => entry.name === 'hwpx_edit_equation_styles' && entry.kind === 'function',
      ),
    );
    attachNoteReferences(editor, content);
    attachDrawingTextBindings(editor, content);
    attachCheckBoxes(
      editor,
      content,
      [
        'hwpx_edit_form_sites',
        'hwpx_edit_form_source_attributes',
        'hwpx_edit_checkbox_state',
        'hwpx_edit_set_checkbox_state',
      ].every((name) =>
        WebAssembly.Module.exports(module).some(
          (entry) => entry.name === name && entry.kind === 'function',
        ),
      ),
    );
    if (protectionRemoved) content.passwordProtectionRemoved = true;
    const styleAvailable = ['hwpx_edit_character_shapes', 'hwpx_edit_character_ranges'].every(
      (name) =>
        WebAssembly.Module.exports(module).some(
          (entry) => entry.name === name && entry.kind === 'function',
        ),
    );
    const paragraphAvailable = [
      'hwpx_edit_paragraph_shape_ids',
      'hwpx_edit_paragraph_shape_refs',
      'hwpx_edit_set_paragraph_format',
    ].every((name) =>
      WebAssembly.Module.exports(module).some(
        (entry) => entry.name === name && entry.kind === 'function',
      ),
    );
    const tableContent = attachHwpxTables(
      editor,
      attachHwpxStyles(resources, content, styleAvailable),
    );
    attachHwpxTableBorders(
      editor,
      tableContent,
      formulaExports.has('hwpx_edit_table_border_sources'),
    );
    if (content.window) attachHwpxFormulas(editor, tableContent);
    const sourced = attachHwpxConnectors(
      editor,
      attachHwpxLines(
        editor,
        attachHwpxPictures(
          editor,
          attachHwpxParagraphFormats(resources, tableContent, paragraphAvailable),
        ),
      ),
    );
    attachTabDefinitions(resources, sourced);
    attachSectionTabSources(editor, sourced);
    attachEllipses(editor, sourced, formulaExports.has('hwpx_edit_ellipse_sources'));
    const displayed = attachHwpxPageSettings(editor, sourced);
    attachHwpxPictureCaptions(
      editor,
      displayed,
      ['hwpx_edit_picture_caption', 'hwpx_edit_picture_caption_bindings'].every((name) =>
        WebAssembly.Module.exports(module).some(
          (entry) => entry.name === name && entry.kind === 'function',
        ),
      ),
    );
    attachHwpxPageAreaDeclarations(
      editor,
      displayed,
      formulaExports.has('hwpx_edit_page_area_declarations'),
    );
    attachHwpxOleSources(
      editor,
      displayed,
      ['hwpx_edit_ole_sites', 'hwpx_edit_ole_source'].every((name) => formulaExports.has(name)),
    );
    displayed.lines.push(
      ...displayed.connectors.flatMap((row) => (row.referenceLine ? [row.referenceLine] : [])),
    );
    if (content.window && content.paragraphs.some((row) => row.clipped))
      throw new Error('ParagraphWindowTextBudgetExceeded');
    const creationAvailable = [
      'hwpx_edit_created_tables',
      'hwpx_edit_insert_table',
      'hwpx_edit_set_created_cell_text',
      'hwpx_edit_save_for_display',
    ].every((name) =>
      WebAssembly.Module.exports(module).some(
        (entry) => entry.name === name && entry.kind === 'function',
      ),
    );
    displayed.tableCreationResources =
      creationAvailable &&
      WebAssembly.Module.exports(module).some(
        (entry) => entry.name === 'hwpx_edit_table_creation_resources' && entry.kind === 'function',
      )
        ? resources.tableCreationResources()
        : null;
    const result = attachCreatedTables(
      editor,
      displayed,
      creationAvailable,
      HWPX_DISPLAY_BOUNDS.maxUnits,
      preview.sectionCount,
    );
    hwpxCreatedTablesPending = result.createdTableHostPending;
    return result;
  }
  const outcomes = new WeakMap();
  let lastHistoryRevision;
  // Only the next admitted request can consume this privately owned projection.
  // Never keep text/history authority or a cache beyond that one request.
  let loadProjection = null;
  let requestSequence = 0;
  async function execute(message, requestTicket, reusableLoad) {
    let reader;
    let response;
    const minimalError = (error) => ({
      origin: message.origin,
      kind: message.kind,
      applied,
      ...(historyPoisoned ? { historyPoisoned: true } : {}),
      ...(message.requestId === undefined ? {} : { requestId: message.requestId }),
      error: error?.message || String(error),
    });
    const reply = (value) => {
      if (response !== undefined) throw new Error('DuplicateRuntimeReply');
      try {
        let historyRevision, historyRevisions, historyStats;
        if (
          historyEnabled &&
          editor &&
          WebAssembly.Module.exports(module).some(
            (entry) => entry.name === `${format}_edit_history_revision`,
          )
        )
          historyRevision = editor.historyRevision();
        if (
          historyEnabled &&
          editor &&
          ['count', 'at'].every((suffix) =>
            WebAssembly.Module.exports(module).some(
              (entry) => entry.name === `${format}_edit_history_revision_${suffix}`,
            ),
          )
        )
          historyRevisions = editor.historyRevisions();
        if (historyEnabled && editor) historyStats = editor.historyStats();
        response = {
          origin: message.origin,
          ...value,
          ...(historyPoisoned ? { historyPoisoned: true } : {}),
          ...(historyStats === undefined ? {} : { historyStats }),
          ...(historyRevision === undefined ? {} : { historyRevision }),
          ...(historyRevisions === undefined ? {} : { historyRevisions }),
        };
      } catch (error) {
        // Metadata failure must never enter the same failing metadata path again.
        response = minimalError(error);
      }
    };
    let applied = false;
    let mutationUncertain = false;
    let atomicOutcome;
    let nativeTextDelta;
    let beforeTextOwner = null;
    if (format === 'hwp5' && historyEnabled && message.kind === 'splice') {
      try {
        beforeTextOwner = editor?.captureExclusiveTextOwner(message.section, message.paragraph);
      } catch {
        /* Optional read failure keeps full display. */
      }
    }
    const captureTextDelta = () => {
      try {
        nativeTextDelta = editor.readExclusiveTextDelta(beforeTextOwner);
      } catch {
        nativeTextDelta = undefined;
      }
    };
    displayResources.beginRequest(message, { format, editor, historyEnabled });
    try {
      if (message.kind === 'formatting-capabilities') {
        if (!editor) throw Error('EditorNotOpen');
        reply({ kind: message.kind, formattingCapabilities: formattingCapabilities(editor) });
        return;
      }
      if (message.kind === 'query-formatting') {
        if (!editor) throw Error('EditorNotOpen');
        reply({ kind: message.kind, formatting: queryAtomicFormatting(editor, format, message) });
        return;
      }
      if (message.kind === 'formatting-patch') {
        if (!editor || !historyEnabled) throw Error('HistoryNotEnabled');
        atomicOutcome = editor.applyFormattingPatch(message.request);
        applied = atomicOutcome.application === 'applied';
        mutationUncertain = atomicOutcome.application === 'unknown';
        if (mutationUncertain) historyPoisoned = true;
        if (atomicOutcome.error || atomicOutcome.cleanupError)
          throw Error(atomicOutcome.error || atomicOutcome.cleanupError);
        if (atomicOutcome.nativeCode === 2) {
          reply({ kind: message.kind, changed: false });
          return;
        }
        reply({ kind: message.kind, content: format === 'hwpx' ? hwpxDisplay() : hwp5Display() });
        return;
      }
      if (format === 'hwp5' && preview?.sectionInventory && message.kind !== 'load')
        throw new Error('AvailableSectionsReadOnly');
      if (
        [
          'query-current-references',
          'query-current-source-references',
          'query-current-text',
          'query-created-tables',
          'splice-current',
        ].includes(message.kind)
      ) {
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
      if (message.kind === 'insert-table' || message.kind === 'created-cell-text') {
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        if (format === 'hwp5') {
          if (!hwp5TableCreationAvailable()) throw new Error('Hwp5TableCreationAbiUnavailable');
          const identity =
            message.kind === 'insert-table'
              ? editor.insertTable(hwp5TableCreationRequest(message))
              : message.identity;
          if (message.kind === 'created-cell-text') setHwp5CreatedCellText(editor, message);
          applied = true;
          reply({ kind: message.kind, identity, content: hwp5Display() });
          return;
        }
        if (format !== 'hwpx') throw new Error('UnsupportedTableCreationFormat');
        let identity = message.identity;
        if (message.kind === 'insert-table')
          identity = editor.insertTable(
            message.section,
            message.paragraph + 1,
            message.unit,
            message.options,
          );
        else
          editor.setCreatedCellText(
            message.section,
            identity,
            message.row,
            message.column,
            message.text,
          );
        applied = true;
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.saveForDisplay());
        reply({ kind: message.kind, identity, content: hwpxDisplay() });
        return;
      }
      if (message.kind === 'set-edit-window') {
        if (!editor || !preview || !historyEnabled) throw new Error('EditorNotOpen');
        const full = message.offset === null && message.count === null;
        if (format === 'hwp5') {
          const projected = full
            ? displayContent(hwp5DisplayProjection())
            : queryHwp5WindowContent(
                editor,
                hwp5DisplayProjection(),
                { offset: message.offset, count: message.count },
                hwp5ParagraphFormatsAvailable(),
              );
          const content = hwp5Display(projected);
          documentWindow = full ? null : { offset: message.offset, count: message.count };
          reply({ kind: 'set-edit-window', content });
          return;
        }
        if (format !== 'hwpx') throw new Error('UnsupportedDocumentWindowFormat');
        const projected = full
          ? displayHwpxContent(preview)
          : projectHwpxWindow(editor, preview, { offset: message.offset, count: message.count });
        const content = hwpxDisplay(projected);
        documentWindow = full ? null : { offset: message.offset, count: message.count };
        reply({ kind: 'set-edit-window', content });
        return;
      }
      if (message.kind === 'query-window' || message.kind === 'query-edit-window') {
        if (!editor || !preview) throw new Error('EditorNotOpen');
        if (message.kind === 'query-edit-window' && !historyEnabled)
          throw new Error('EditorNotOpen');
        if (format === 'hwp5') {
          const content = hwp5Display(
            queryHwp5WindowContent(
              editor,
              hwp5DisplayProjection(),
              { offset: message.offset, count: message.count },
              hwp5ParagraphFormatsAvailable(),
            ),
          );
          reply({ kind: message.kind, content });
          return;
        }
        if (format !== 'hwpx') throw new Error('UnsupportedDocumentWindowFormat');
        let content = projectHwpxWindow(editor, preview, {
          offset: message.offset,
          count: message.count,
        });
        if (message.kind === 'query-edit-window') {
          content = hwpxDisplay(content);
          if (content.paragraphs.some((row) => row.clipped))
            throw new Error('ParagraphWindowTextBudgetExceeded');
        }
        reply({ kind: message.kind, content });
        return;
      }
      if (message.kind === 'query-edit-range') {
        reply(
          selectionEditQuery(message, {
            active: Boolean(editor) && historyEnabled,
            format,
            canEdit: (section, paragraph, start, end) =>
              formulaResultTextRangeAllowed(editor, module, section, paragraph, start, end) ||
              hwpxFieldRangeTarget(
                editor,
                hwpxCreatedTablesPending,
                section,
                paragraph,
                start,
                end,
              ) !== null ||
              outsideFieldRange(section, paragraph, start, end),
          }),
        );
        return;
      }
      if (message.kind === 'query-split-range') {
        reply(
          selectionSplitQuery(message, {
            active: Boolean(editor) && historyEnabled,
            format,
            canSplit: (section, paragraph, atUnit, endUnit) =>
              editor.canSplitParagraph({ section, paragraph, atUnit, endUnit }),
            canSplitAnchored: editor?.supportsAnchoredSplitQuery?.()
              ? (section, paragraph, atUnit, endUnit) =>
                  editor.canSplitParagraphAnchored({ section, paragraph, atUnit, endUnit })
              : undefined,
          }),
        );
        return;
      }
      // Opening a native session for display metadata does not activate editing.
      if (
        format === 'hwp5' &&
        !historyEnabled &&
        ['save', 'undo', 'redo', 'split', 'merge', 'splice', 'format'].includes(message.kind)
      )
        throw new Error('EditorNotOpen');
      if (message.kind === 'refresh') {
        if (!editor || !preview) throw new Error('EditorNotOpen');
        if (format === 'hwp5') await refreshHwp5PreviewFallback();
        else {
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
        }
        reply({ kind: 'refresh', content: format === 'hwpx' ? hwpxDisplay() : hwp5Display() });
        return;
      }
      if (message.kind === 'load') {
        const availableSectionsOnly = availableSectionsRequest(message);
        const availableSectionCopy = availableSectionCopyRequest(message);
        const requestedPolicy =
          message.allowObservedChartOleDeviations === undefined
            ? false
            : message.allowObservedChartOleDeviations;
        if (typeof requestedPolicy !== 'boolean') throw new Error('InvalidChartOlePolicy');
        if (requestedPolicy && message.format !== 'hwpx')
          throw new Error('UnsupportedChartOlePolicyFormat');
        editor?.close();
        editor = undefined;
        preview = undefined;
        if (protectionRemoved) bytes?.fill(0);
        protectionRemoved = false;
        bytes = undefined;
        module = undefined;
        historyEnabled = false;
        historyPoisoned = false;
        hwp5StyleOpenError = null;
        documentWindow = null;
        hwpxCreatedTablesPending = false;
        format = message.format ?? 'hwp5';
        hwpxChartOlePolicy = format === 'hwpx' && requestedPolicy;
        if (format !== 'hwp5' && format !== 'hwpx') throw new Error('UnknownDocumentFormat');
        if (message.wasmModule !== undefined) {
          if (!(message.wasmModule instanceof WebAssembly.Module))
            throw new Error('InvalidPreviewWasmModule');
          module = message.wasmModule;
        } else {
          module = wasmModule ?? (await loadWasmModule?.());
          if (!(module instanceof WebAssembly.Module)) throw new Error('PreviewWasmModuleRequired');
        }
        bytes = new Uint8Array(message.bytes);
        if (format === 'hwpx') {
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
          reply({ kind: 'load', content: hwpxDisplay() });
          return;
        }
        reader = await createHwp5Reader(module);
        if (availableSectionCopy) {
          const next = await createExperimentalHwp5Editor(module, bytes, {
            availableSectionCopy: true,
          });
          try {
            preview = reader.readText(next.save().bytes);
          } catch (error) {
            next.close();
            throw error;
          }
          editor = next;
          reply({ kind: 'load', content: hwp5Display() });
          return;
        }
        preview = availableSectionsOnly ? reader.readAvailableText(bytes) : reader.readText(bytes);
        if (availableSectionsOnly) {
          reply({ kind: 'load', content: availableSectionsContent(preview) });
          return;
        }
        if (!preview.readOnly) {
          try {
            editor = await createExperimentalHwp5Editor(module, bytes);
          } catch (error) {
            hwp5StyleOpenError = error.message;
          }
        }
        if (
          !editor &&
          preview.primarySource === 'distribution_viewtext' &&
          WebAssembly.Module.exports(module).some(
            (entry) => entry.name === 'hwp5_edit_open_distribution' && entry.kind === 'function',
          )
        ) {
          // Probe capability without retaining a session or lifting read-only.
          try {
            const probe = await createExperimentalHwp5Editor(module, bytes, { distribution: true });
            probe.close();
          } catch (error) {
            hwp5StyleOpenError = error.message;
          }
        }
        reply({ kind: 'load', content: hwp5Display() });
      } else if (message.kind === 'table-background-bytes') {
        if (!editor || format !== 'hwpx') throw new Error('TableBackgroundReadUnavailable');
        const backgroundBytes = editor.tableBackgroundBytes(message.section, message.listNode);
        reply({
          kind: 'table-background-bytes',
          section: message.section,
          listNode: message.listNode,
          bytes: backgroundBytes,
        });
      } else if (message.kind === 'picture-bytes') {
        if (!editor || !['hwpx', 'hwp5'].includes(format))
          throw new Error('PictureReadUnavailable');
        const pictureBytes =
          format === 'hwp5'
            ? readHwp5PictureBytes(editor, message.section, message.pictureNode)
            : editor.pictureBytes(message.section, message.pictureNode);
        reply({
          kind: 'picture-bytes',
          section: message.section,
          pictureNode: message.pictureNode,
          bytes: pictureBytes,
        });
      } else if (message.kind === 'unlock') {
        if (!bytes || !module) throw new Error('PasswordDocumentNotLoaded');
        const decoder = await (format === 'hwpx'
          ? createHwpxPasswordDecoder(module)
          : createHwp5PasswordDecoder(module));
        let plaintext;
        try {
          plaintext = decoder.decryptToPlaintext(bytes, message.password);
        } finally {
          decoder.close();
          delete message.password;
        }
        if (!plaintext) throw new Error('DocumentNotEncrypted');
        let next;
        try {
          reader = await (format === 'hwpx' ? createHwpxReader(module) : createHwp5Reader(module));
          const current =
            format === 'hwpx' ? reader.readTextEvents(plaintext) : reader.readText(plaintext);
          if (format === 'hwpx') {
            next = await createHwpxEditor(module);
            next.open(plaintext, { allowObservedChartOleDeviations: hwpxChartOlePolicy });
          } else next = await createExperimentalHwp5Editor(module, plaintext);
          editor?.close();
          editor = next;
          next = undefined;
          bytes = plaintext;
          preview = current;
          protectionRemoved = true;
          historyEnabled = false;
          historyPoisoned = false;
          reply({ kind: 'unlock', content: format === 'hwpx' ? hwpxDisplay() : hwp5Display() });
        } catch (error) {
          next?.close();
          if (bytes !== plaintext) plaintext.fill(0);
          throw error;
        }
      } else if (message.kind === 'save') {
        requirePasswordRemovalConsent(protectionRemoved, message.allowUnprotectedOutput);
        const saved = saveDocument(
          editor,
          format,
          message.allowStaleLayout === undefined ? false : message.allowStaleLayout,
        );
        reply({
          kind: 'save',
          ...saved,
          ...(protectionRemoved ? { passwordProtectionRemoved: true } : {}),
        });
      } else if (
        message.kind === 'splice-font-name' ||
        message.kind === 'splice-character-properties'
      ) {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error(
            message.kind === 'splice-font-name'
              ? 'UnsupportedNamedFontTextEditing'
              : 'UnsupportedCharacterPropertyTextEditing',
          );
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        if (message.rangePolicy !== undefined && message.rangePolicy !== 'reject')
          throw new Error('InvalidRangePolicy');
        if (
          !Number.isInteger(message.paragraph) ||
          message.paragraph < 0 ||
          message.paragraph > (format === 'hwpx' ? 0xfffffffe : 0xffffffff)
        )
          throw new RangeError('Invalid paragraph');
        const paragraph = message.paragraph + (format === 'hwpx' ? 1 : 0);
        let textMode = 'plain',
          beginElement = 0;
        if (format === 'hwpx' && !editor.canEdit(message.section, paragraph)) {
          const target = hwpxFieldRangeTarget(
            editor,
            hwpxCreatedTablesPending,
            message.section,
            paragraph,
            message.startUnit,
            message.endUnit,
          );
          if (target !== null) {
            textMode = 'field';
            beginElement = target.beginElement;
          } else if (
            outsideFieldRange(message.section, paragraph, message.startUnit, message.endUnit)
          )
            textMode = 'plain';
          else if (anchorView(message.section, paragraph) !== null) textMode = 'anchored';
          else throw new Error('UnsupportedFieldLabelRange');
        }
        if (message.kind === 'splice-font-name')
          editor.spliceWithFontName({ ...message, paragraph, textMode, beginElement });
        else
          editor.spliceWithCharacterProperties({ ...message, paragraph, textMode, beginElement });
        applied = true;
        if (format === 'hwpx') {
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
        } else {
          await refreshHwp5PreviewFallback();
        }
        reply({ kind: message.kind, content: format === 'hwpx' ? hwpxDisplay() : hwp5Display() });
      } else if (message.kind === 'character-font-name') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterFontNameEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        if (
          !Number.isInteger(message.paragraph) ||
          message.paragraph < 0 ||
          message.paragraph > (format === 'hwpx' ? 0xfffffffe : 0xffffffff)
        )
          throw new RangeError('Invalid paragraph');
        editor.setCharacterFontName({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          language: message.language,
          name: message.name,
        });
        applied = true;
        reply({
          kind: 'character-font-name',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-font') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterFontEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        if (
          !Number.isInteger(message.paragraph) ||
          message.paragraph < 0 ||
          message.paragraph > (format === 'hwpx' ? 0xfffffffe : 0xffffffff)
        )
          throw new RangeError('Invalid paragraph');
        editor.setCharacterFont({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          language: message.language,
          fontId: message.fontId,
        });
        applied = true;
        reply({
          kind: 'character-font',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-outline') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterOutlineEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        if (
          !Number.isInteger(message.paragraph) ||
          message.paragraph < 0 ||
          message.paragraph > (format === 'hwpx' ? 0xfffffffe : 0xffffffff)
        )
          throw new RangeError('Invalid paragraph');
        editor.setCharacterOutline({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          kind: message.outlineKind,
        });
        applied = true;
        reply({
          kind: 'character-outline',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-effect') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterEffectEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        if (
          !Number.isInteger(message.paragraph) ||
          message.paragraph < 0 ||
          message.paragraph > (format === 'hwpx' ? 0xfffffffe : 0xffffffff)
        )
          throw new RangeError('Invalid paragraph');
        editor.setCharacterEffect({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          effect: message.effect,
          enabled: message.enabled,
          exclusive: message.exclusive,
        });
        applied = true;
        reply({
          kind: 'character-effect',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-shade') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterShadeEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        if (
          !Number.isInteger(message.paragraph) ||
          message.paragraph < 0 ||
          message.paragraph > (format === 'hwpx' ? 0xfffffffe : 0xffffffff)
        )
          throw new RangeError('Invalid paragraph');
        editor.setCharacterShade({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          color: message.color,
        });
        applied = true;
        reply({
          kind: 'character-shade',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-text-color') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterTextColorEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.setCharacterTextColor({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          color: message.color,
        });
        applied = true;
        reply({
          kind: 'character-text-color',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-strike-color') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterStrikeColorEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        if (
          !Number.isInteger(message.paragraph) ||
          message.paragraph < 0 ||
          message.paragraph > (format === 'hwpx' ? 0xfffffffe : 0xffffffff)
        )
          throw new RangeError('InvalidTextPosition');
        editor.setCharacterStrikeColor({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          color: message.color,
        });
        applied = true;
        reply({
          kind: 'character-strike-color',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-underline-color') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterUnderlineColorEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.setCharacterUnderlineColor({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          color: message.color,
        });
        applied = true;
        reply({
          kind: 'character-underline-color',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-strike') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterStrikeEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        if (
          !Number.isInteger(message.paragraph) ||
          message.paragraph < 0 ||
          message.paragraph > (format === 'hwpx' ? 0xfffffffe : 0xffffffff)
        )
          throw new RangeError('InvalidTextPosition');
        editor.setCharacterStrike({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          enabled: message.enabled,
        });
        applied = true;
        reply({
          kind: 'character-strike',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-underline') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterUnderlineEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.setCharacterUnderline({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          kind: message.underlineKind,
        });
        applied = true;
        reply({
          kind: 'character-underline',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'replace-paragraph-ranges') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedParagraphReplacement');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        encodeCharacterRanges(message.ranges);
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === 'hwpx' ? 1 : 0),
        }));
        if (Object.hasOwn(message, 'language') || Object.hasOwn(message, 'name')) {
          editor.replaceParagraphRangesWithFontName({
            ranges,
            text: message.text,
            language: message.language,
            name: message.name,
            properties: message.properties,
          });
        } else
          editor.replaceParagraphRanges({
            ranges,
            text: message.text,
            properties: message.properties,
          });
        applied = true;
        if (format === 'hwpx') {
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
        } else {
          await refreshHwp5PreviewFallback();
        }
        reply({
          kind: 'replace-paragraph-ranges',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-font-name-ranges') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterFontNameEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        encodeCharacterRanges(message.ranges);
        if (format === 'hwpx' && message.ranges.some((range) => range.paragraph === 0xffffffff))
          throw new RangeError('Invalid paragraph');
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === 'hwpx' ? 1 : 0),
        }));
        editor.setCharacterFontNameRanges({
          ranges,
          language: message.language,
          name: message.name,
        });
        applied = true;
        reply({ kind: message.kind, content: format === 'hwpx' ? hwpxDisplay() : hwp5Display() });
      } else if (message.kind === 'character-font-ranges') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterFontEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        encodeCharacterRanges(message.ranges);
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === 'hwpx' ? 1 : 0),
        }));
        editor.setCharacterFontRanges({
          ranges,
          language: message.language,
          fontId: message.fontId,
        });
        applied = true;
        reply({
          kind: 'character-font-ranges',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-outline-ranges') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterOutlineEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        encodeCharacterRanges(message.ranges);
        if (format === 'hwpx' && message.ranges.some((range) => range.paragraph === 0xffffffff))
          throw new RangeError('InvalidTextPosition');
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === 'hwpx' ? 1 : 0),
        }));
        editor.setCharacterOutlineRanges({ ranges, kind: message.outlineKind });
        applied = true;
        reply({
          kind: 'character-outline-ranges',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-effect-ranges') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterEffectEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        encodeCharacterRanges(message.ranges);
        if (format === 'hwpx' && message.ranges.some((range) => range.paragraph === 0xffffffff))
          throw new RangeError('InvalidTextPosition');
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === 'hwpx' ? 1 : 0),
        }));
        editor.setCharacterEffectRanges({
          ranges,
          effect: message.effect,
          enabled: message.enabled,
          exclusive: message.exclusive,
        });
        applied = true;
        reply({
          kind: 'character-effect-ranges',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-shade-ranges') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterShadeEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        encodeCharacterRanges(message.ranges);
        if (format === 'hwpx' && message.ranges.some((range) => range.paragraph === 0xffffffff))
          throw new RangeError('InvalidTextPosition');
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === 'hwpx' ? 1 : 0),
        }));
        editor.setCharacterShadeRanges({ ranges, color: message.color });
        applied = true;
        reply({
          kind: 'character-shade-ranges',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-text-color-ranges') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterTextColorEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        encodeCharacterRanges(message.ranges);
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === 'hwpx' ? 1 : 0),
        }));
        editor.setCharacterTextColorRanges({ ranges, color: message.color });
        applied = true;
        reply({
          kind: 'character-text-color-ranges',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-strike-ranges') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterStrikeEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        encodeCharacterRanges(message.ranges);
        if (format === 'hwpx' && message.ranges.some((range) => range.paragraph === 0xffffffff))
          throw new RangeError('InvalidTextPosition');
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === 'hwpx' ? 1 : 0),
        }));
        editor.setCharacterStrikeRanges({ ranges, enabled: message.enabled });
        applied = true;
        reply({
          kind: 'character-strike-ranges',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-underline-ranges') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterUnderlineEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        encodeCharacterRanges(message.ranges);
        if (format === 'hwpx' && message.ranges.some((range) => range.paragraph === 0xffffffff))
          throw new RangeError('Invalid paragraph');
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === 'hwpx' ? 1 : 0),
        }));
        editor.setCharacterUnderlineRanges({ ranges, kind: message.underlineKind });
        applied = true;
        reply({
          kind: 'character-underline-ranges',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-properties-ranges') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterPropertiesEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        // 번호 변환 전에 검증하여 문자열 연결·누락 값의 보정을 막습니다.
        encodeCharacterRanges(message.ranges);
        const ranges = message.ranges.map((range) => ({
          ...range,
          paragraph: range.paragraph + (format === 'hwpx' ? 1 : 0),
        }));
        editor.setCharacterPropertiesRanges({ ranges, properties: message.properties });
        applied = true;
        reply({
          kind: 'character-properties-ranges',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'character-properties') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedCharacterPropertiesEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.setCharacterProperties({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          startUnit: message.startUnit,
          endUnit: message.endUnit,
          properties: message.properties,
        });
        applied = true;
        reply({
          kind: 'character-properties',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'paragraph-spacing') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedParagraphSpacingEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.setParagraphSpacing({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          type: message.type,
          value: message.value,
        });
        applied = true;
        reply({
          kind: 'paragraph-spacing',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'paragraph-margins') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedParagraphMarginsEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.setParagraphMargins({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          margins: message.margins,
        });
        applied = true;
        reply({
          kind: 'paragraph-margins',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'paragraph-alignment') {
        if (format !== 'hwpx' && format !== 'hwp5')
          throw new Error('UnsupportedParagraphAlignmentEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.setParagraphAlignment({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          alignment: message.alignment,
        });
        applied = true;
        reply({
          kind: 'paragraph-alignment',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'paragraph-format') {
        if (format !== 'hwp5' && format !== 'hwpx')
          throw new Error('UnsupportedParagraphFormatEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.setParagraphFormat({
          section: message.section,
          paragraph: message.paragraph + (format === 'hwpx' ? 1 : 0),
          paraShapeId: message.paraShapeId,
        });
        applied = true;
        reply({
          kind: 'paragraph-format',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'formula-definition') {
        if (format !== 'hwpx' && format !== 'hwp5')
          throw new Error('UnsupportedFormulaDefinitionEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        if (format === 'hwp5')
          editor.setFormulaDefinition({
            section: message.section,
            sourceNode: message.beginElement,
            formula: message.formula,
          });
        else editor.setFormulaDefinition(message.section, message.beginElement, message.formula);
        applied = true;
        if (format === 'hwp5') {
          await refreshHwp5PreviewFallback();
          reply({ kind: 'formula-definition', content: hwp5Display() });
        } else {
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
          reply({ kind: 'formula-definition', content: hwpxDisplay() });
        }
      } else if (message.kind === 'chart-display') {
        if (format !== 'hwpx') throw new Error('UnsupportedChartEditing');
        // Display is read-only and load already owns an open native Session.
        if (!editor) throw new Error('EditorNotOpen');
        const chart = editor.chartDisplay(message.section, message.wrapper);
        reply({
          kind: message.kind,
          requestId: message.requestId,
          section: message.section,
          wrapper: message.wrapper,
          chart,
        });
      } else if (
        message.kind === 'chart-points' ||
        message.kind === 'chart-series-text' ||
        message.kind === 'chart-rich-text'
      ) {
        if (format !== 'hwpx') throw new Error('UnsupportedChartEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        const chart =
          message.kind === 'chart-rich-text'
            ? editor.chartRichText(message.section, message.wrapper)
            : message.kind === 'chart-series-text'
              ? editor.chartSeriesText(message.section, message.wrapper)
              : editor.chartPoints(message.section, message.wrapper);
        reply({
          kind: message.kind,
          requestId: message.requestId,
          section: message.section,
          wrapper: message.wrapper,
          chart,
        });
      } else if (
        message.kind === 'chart-points-set' ||
        message.kind === 'chart-numeric-point' ||
        message.kind === 'chart-point' ||
        message.kind === 'chart-series-text-set' ||
        message.kind === 'chart-rich-text-set'
      ) {
        if (format !== 'hwpx') throw new Error('UnsupportedChartEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        if (message.kind === 'chart-points-set') applyChartPointBatchCommand(editor, message);
        else if (message.kind === 'chart-rich-text-set')
          editor.setChartRichText(message.section, message.wrapper, message.ordinal, message.value);
        else if (message.kind === 'chart-series-text-set')
          editor.setChartSeriesText(
            message.section,
            message.wrapper,
            message.ordinal,
            message.value,
          );
        else if (message.kind === 'chart-point')
          editor.setChartPoint(message.section, message.wrapper, message.point, message.value);
        else
          editor.setChartNumericPoint(
            message.section,
            message.wrapper,
            message.point,
            message.value,
          );
        applied = true;
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.saveForDisplay());
        const chart =
          message.kind === 'chart-rich-text-set'
            ? editor.chartRichText(message.section, message.wrapper)
            : message.kind === 'chart-series-text-set'
              ? editor.chartSeriesText(message.section, message.wrapper)
              : editor.chartPoints(message.section, message.wrapper);
        reply({ kind: message.kind, content: hwpxDisplay(), chart });
      } else if (message.kind === 'manual-formula-result') {
        if (format !== 'hwpx') throw new Error('UnsupportedManualFormulaResultEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        if (typeof editor.setManualFormulaResult !== 'function')
          throw new Error('HwpxManualFormulaResultAbiUnavailable');
        editor.setManualFormulaResult(message.section, message.beginElement, message.display);
        applied = true;
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.saveForDisplay());
        reply({ kind: 'manual-formula-result', content: hwpxDisplay() });
      } else if (message.kind === 'inline-string-sources') {
        if (format !== 'hwpx') throw new Error('UnsupportedInlineStringSources');
        if (!editor) throw new Error('EditorNotOpen');
        reply({
          kind: message.kind,
          requestId: message.requestId,
          sources: editor.inlineStringSources(),
        });
      } else if (message.kind === 'equation-sources') {
        if (format !== 'hwpx') throw new Error('UnsupportedEquationScriptEditing');
        if (!editor) throw new Error('EditorNotOpen');
        reply({
          kind: message.kind,
          ...equationQueryIdentity(message),
          sources: editor.equationSources(message.section),
        });
      } else if (message.kind === 'equation-script-query') {
        if (format !== 'hwpx') throw new Error('UnsupportedEquationScriptEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        reply({
          kind: message.kind,
          ...equationQueryIdentity(message),
          equation: readEquationScript(editor, message),
        });
      } else if (message.kind === 'equation-script-set') {
        if (format !== 'hwpx') throw new Error('UnsupportedEquationScriptEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        writeEquationScript(editor, message);
        applied = true;
        const equation = readEquationScript(editor, message);
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.saveForDisplay());
        reply({
          kind: message.kind,
          ...equationQueryIdentity(message),
          equation,
          content: hwpxDisplay(),
        });
      } else if (message.kind === 'dutmal-text-query') {
        if (format !== 'hwpx') throw new Error('UnsupportedDutmalTextEditing');
        if (!editor) throw new Error('EditorNotOpen');
        reply({
          kind: message.kind,
          requestId: message.requestId,
          dutmal: readDutmalText(editor, message),
        });
      } else if (message.kind === 'dutmal-text') {
        if (format !== 'hwpx') throw new Error('UnsupportedDutmalTextEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        const dutmal = writeDutmalText(editor, message);
        applied = true;
        reader = await createHwpxReader(module);
        preview = reader.readTextEvents(editor.saveForDisplay());
        reply({ kind: message.kind, requestId: message.requestId, dutmal, content: hwpxDisplay() });
      } else if (message.kind === 'radio-select') {
        if (format !== 'hwp5') throw new Error('UnsupportedRadioSelectEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.selectRadioButton(message.section, message.formNode);
        applied = true;
        reply({ kind: message.kind, content: hwp5Display() });
      } else if (message.kind === 'checkbox-state') {
        if (format !== 'hwpx' && format !== 'hwp5')
          throw new Error('UnsupportedCheckBoxStateEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.setCheckBoxState(message.section, message.formNode, message.state);
        applied = true;
        reply({
          kind: 'checkbox-state',
          content: format === 'hwp5' ? hwp5Display() : hwpxDisplay(),
        });
      } else if (message.kind === 'form-text') {
        if (format !== 'hwp5') throw new Error('UnsupportedFormTextEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.setFormText({
          section: message.section,
          formNode: message.formNode,
          text: message.text,
        });
        applied = true;
        reply({ kind: message.kind, content: hwp5Display() });
      } else if (message.kind === 'picture-resize') {
        if (format !== 'hwpx' && format !== 'hwp5')
          throw new Error('UnsupportedPictureResizeEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.resizePicture({
          section: message.section,
          pictureNode: message.pictureNode,
          width: message.width,
          height: message.height,
        });
        applied = true;
        reply({
          kind: 'picture-resize',
          content: format === 'hwp5' ? hwp5Display() : hwpxDisplay(),
        });
      } else if (message.kind === 'picture-current-size') {
        if (format !== 'hwp5') throw new Error('UnsupportedPictureCurrentSizeEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.setPictureCurrentSize({
          section: message.section,
          pictureNode: message.pictureNode,
          width: message.width,
          height: message.height,
        });
        applied = true;
        reply({ kind: 'picture-current-size', content: hwp5Display() });
      } else if (message.kind === 'picture-dimensions') {
        if (format !== 'hwpx') throw new Error('UnsupportedPictureDimensionEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.setPictureDimensions({
          section: message.section,
          pictureNode: message.pictureNode,
          display: message.display,
          original: message.original,
          current: message.current,
        });
        applied = true;
        reply({ kind: 'picture-dimensions', content: hwpxDisplay() });
      } else if (message.kind === 'table-column-width') {
        if (format !== 'hwpx' && format !== 'hwp5') throw new Error('UnsupportedCellSizeEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        const content = format === 'hwpx' ? hwpxDisplay() : hwp5Display();
        const table = content.tables?.find(
          (row) => row.section === message.section && row.tableNode === message.tableNode,
        );
        const plan = tableColumnWidthPlan(table, message);
        if (plan.state !== 'planned') throw new Error(plan.error);
        editor.setCellSizes(plan.cells);
        applied = plan.cells.length !== 0;
        reply({
          kind: 'table-column-width',
          content: format === 'hwpx' ? hwpxDisplay() : hwp5Display(),
        });
      } else if (message.kind === 'cell-size') {
        if (format !== 'hwpx' && format !== 'hwp5') throw new Error('UnsupportedCellSizeEditing');
        if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
        editor.setCellSize({
          section: message.section,
          listNode: message.listNode,
          width: message.width,
          height: message.height,
        });
        applied = true;
        reply({ kind: 'cell-size', content: format === 'hwpx' ? hwpxDisplay() : hwp5Display() });
      } else if (message.kind === 'enable') {
        if (format === 'hwpx') {
          if (message.normalizeObservedCfb !== undefined)
            throw new Error('UnsupportedNormalizationFormat');
          if (message.retainObservedDocInfo !== undefined)
            throw new Error('UnsupportedObservedDocInfoFormat');
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
          const structureAvailable = WebAssembly.Module.exports(module).some(
            (entry) => entry.name === 'hwpx_edit_split' && entry.kind === 'function',
          );
          const splitQueryAvailable = WebAssembly.Module.exports(module).some(
            (entry) => entry.name === 'hwpx_edit_can_split' && entry.kind === 'function',
          );
          const mergeAvailable = WebAssembly.Module.exports(module).some(
            (entry) => entry.name === 'hwpx_edit_merge' && entry.kind === 'function',
          );
          const formattingAvailable = [
            'hwpx_edit_set_character_format',
            'hwpx_edit_character_shape_ids',
          ].every((name) =>
            WebAssembly.Module.exports(module).some(
              (entry) => entry.name === name && entry.kind === 'function',
            ),
          );
          const charShapeIds = formattingAvailable ? editor.characterShapeIds() : [];
          const displayAvailable = WebAssembly.Module.exports(module).some(
            (entry) => entry.name === 'hwpx_edit_character_shapes' && entry.kind === 'function',
          );
          let characterShapes = null,
            characterShapesError = null;
          if (displayAvailable) {
            try {
              characterShapes = editor.characterShapes();
            } catch (error) {
              characterShapesError = error.message;
            }
          }
          // Optional display metadata must not disable otherwise valid editing.
          const cellSizeAvailable = WebAssembly.Module.exports(module).some(
            (entry) => entry.name === 'hwpx_edit_set_cell_size' && entry.kind === 'function',
          );
          const cellSizeBatchAvailable = WebAssembly.Module.exports(module).some(
            (entry) => entry.name === 'hwpx_edit_set_cell_sizes' && entry.kind === 'function',
          );
          const pictureDimensionsAvailable = WebAssembly.Module.exports(module).some(
            (entry) =>
              entry.name === 'hwpx_edit_set_picture_dimensions' && entry.kind === 'function',
          );
          const pictureResizeAvailable = WebAssembly.Module.exports(module).some(
            (entry) => entry.name === 'hwpx_edit_resize_picture' && entry.kind === 'function',
          );
          const dutmalTextAvailable = [
            'hwpx_edit_inline_string_sources',
            'hwpx_edit_dutmal_text',
            'hwpx_edit_set_dutmal_text',
            'hwpx_edit_dutmal_text_max_bytes',
          ].every((name) =>
            WebAssembly.Module.exports(module).some(
              (entry) => entry.name === name && entry.kind === 'function',
            ),
          );
          const equationScriptAvailable = [
            'hwpx_edit_equation_sources',
            'hwpx_edit_equation_script',
            'hwpx_edit_set_equation_script',
            'hwpx_edit_equation_script_max_bytes',
            'hwpx_edit_history_revision',
          ].every((name) =>
            WebAssembly.Module.exports(module).some(
              (entry) => entry.name === name && entry.kind === 'function',
            ),
          );
          reply({
            kind: 'enable',
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
            content:
              reusableLoad &&
              requestSequence === requestTicket &&
              reusableLoad.ticket === requestTicket - 1 &&
              reusableLoad.editor === editor &&
              reusableLoad.preview === preview &&
              reusableLoad.bytes === bytes &&
              reusableLoad.module === module &&
              reusableLoad.window === documentWindow &&
              reusableLoad.chartOlePolicy === hwpxChartOlePolicy &&
              reusableLoad.protectionRemoved === protectionRemoved &&
              reusableLoad.createdTablesPending === hwpxCreatedTablesPending &&
              Object.keys(message).every((key) => ['kind', 'origin', 'requestId'].includes(key))
                ? reusableLoad.content
                : hwpxDisplay(),
          });
          return;
        }
        if (message.distribution !== undefined && typeof message.distribution !== 'boolean')
          throw new Error('InvalidDistributionPolicy');
        if (
          message.normalizeObservedCfb !== undefined &&
          typeof message.normalizeObservedCfb !== 'boolean'
        )
          throw new Error('InvalidNormalizationPolicy');
        if (
          message.retainObservedDocInfo !== undefined &&
          typeof message.retainObservedDocInfo !== 'boolean'
        )
          throw new Error('InvalidObservedDocInfoPolicy');
        if (message.retainObservedDocInfo === true && editor)
          throw new Error('ObservedDocInfoRequiresFreshSession');
        if (message.normalizeObservedCfb === true && !normalizationMetadataAvailable())
          throw new Error('Hwp5NormalizationAbiUnavailable');
        editor ??= await createExperimentalHwp5Editor(module, bytes, {
          distribution: message.distribution ?? false,
          normalizeObservedCfb: message.normalizeObservedCfb ?? false,
          retainObservedDocInfo: message.retainObservedDocInfo ?? false,
        });
        if (!historyEnabled) {
          editor.enableHistoryDefault(message.history);
          historyEnabled = true;
        }
        const structureAvailable = WebAssembly.Module.exports(module).some(
          (entry) => entry.name === 'hwp5_edit_split' && entry.kind === 'function',
        );
        const mergeAvailable = WebAssembly.Module.exports(module).some(
          (entry) => entry.name === 'hwp5_edit_merge' && entry.kind === 'function',
        );
        let characterShapes = null,
          characterShapesError = null;
        try {
          characterShapes = editor.characterShapes();
        } catch (error) {
          characterShapesError = error.message;
        }
        const cellSizeAvailable = WebAssembly.Module.exports(module).some(
          (entry) => entry.name === 'hwp5_edit_set_cell_size' && entry.kind === 'function',
        );
        const cellSizeBatchAvailable = WebAssembly.Module.exports(module).some(
          (entry) => entry.name === 'hwp5_edit_set_cell_sizes' && entry.kind === 'function',
        );
        const pictureCurrentSizeAvailable = WebAssembly.Module.exports(module).some(
          (entry) =>
            entry.name === 'hwp5_edit_set_picture_current_size' && entry.kind === 'function',
        );
        const pictureResizeAvailable = WebAssembly.Module.exports(module).some(
          (entry) => entry.name === 'hwp5_edit_resize_picture' && entry.kind === 'function',
        );
        reply({
          kind: 'enable',
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
          content: hwp5Display(),
        });
      } else if (message.kind === 'undo' || message.kind === 'redo') {
        if (!editor) throw new Error('EditorNotOpen');
        const changed = message.kind === 'undo' ? editor.undo() : editor.redo();
        applied = changed;
        if (format === 'hwpx') {
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
          reply({ kind: message.kind, changed, content: hwpxDisplay() });
        } else {
          // Restore every derived paragraph/control/formula from native state.
          // Neither the original load bytes nor a JS inverse edit is authoritative.
          await refreshHwp5PreviewFallback();
          reply({ kind: message.kind, changed, content: hwp5Display() });
        }
      } else if (message.kind === 'split' || message.kind === 'merge') {
        if (!editor) throw new Error('EditorNotOpen');
        paragraphBreakIntent(message);
        if (format === 'hwpx') {
          if (
            !Number.isInteger(message.paragraph) ||
            message.paragraph < 0 ||
            message.paragraph >= 0xffffffff
          )
            throw new Error('InvalidParagraphIndex');
          const target = { ...message, paragraph: message.paragraph + 1 };
          if (message.kind === 'split') {
            if (message.anchored !== undefined && typeof message.anchored !== 'boolean')
              throw new Error('InvalidAnchorMode');
            applyParagraphSplit(editor, target, message, true);
          } else if (message.rightParagraph !== undefined) {
            if (
              !Number.isInteger(message.rightParagraph) ||
              message.rightParagraph < 0 ||
              message.rightParagraph >= 0xffffffff
            )
              throw new Error('InvalidParagraphIndex');
            editor.mergeParagraphPair({ ...target, rightParagraph: message.rightParagraph + 1 });
          } else editor.mergeParagraph(target);
          applied = true;
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
          const content = hwpxDisplay();
          const splitParagraph =
            message.kind === 'split'
              ? content.paragraphs.find(
                  (row) => row.section === message.section && row.paragraph === message.paragraph,
                )?.nextMergeParagraph
              : undefined;
          reply({
            kind: message.kind,
            content,
            ...(message.kind === 'split'
              ? {
                  splitTarget: Number.isInteger(splitParagraph)
                    ? { section: message.section, paragraph: splitParagraph }
                    : null,
                }
              : {}),
          });
          return;
        }
        if (message.kind === 'merge' && message.rightParagraph !== undefined)
          throw new Error('UnsupportedMergeTarget');
        if (message.kind === 'split') applyParagraphSplit(editor, message, message);
        else editor.mergeParagraph(message);
        applied = true;
        await refreshHwp5PreviewFallback();
        const content = hwp5Display();
        // HWP5 native split inserts one right paragraph in its flat section list.
        const right =
          message.kind === 'split'
            ? content.paragraphs.find(
                (row) =>
                  row.section === message.section &&
                  row.paragraph === message.paragraph + 1 &&
                  row.editable,
              )
            : null;
        reply({
          kind: message.kind,
          content,
          ...(message.kind === 'split'
            ? { splitTarget: right ? { section: right.section, paragraph: right.paragraph } : null }
            : {}),
        });
      } else if (message.kind === 'splice' || message.kind === 'format') {
        if (!editor) throw new Error('EditorNotOpen');
        if (format === 'hwpx') {
          if (message.rangePolicy && message.rangePolicy !== 'reject')
            throw new Error('InvalidRangePolicy');
          if (
            !Number.isInteger(message.startUnit) ||
            !Number.isInteger(message.endUnit) ||
            message.endUnit < message.startUnit
          )
            throw new Error('InvalidTextPosition');
          const plainTextSplice =
            message.kind === 'splice' && editor.canEdit(message.section, message.paragraph + 1);
          if (!plainTextSplice) displayResources.invalidate();
          if (message.kind === 'format') {
            editor.setCharacterFormat({ ...message, paragraph: message.paragraph + 1 });
          } else if (plainTextSplice) {
            editor.splice(
              message.section,
              message.paragraph + 1,
              message.startUnit,
              message.endUnit - message.startUnit,
              message.text,
            );
          } else if (spliceFormulaResultText(editor, module, message)) {
            // A validated result target can belong to a split formula paragraph
            // that the ordinary field-label projection cannot represent.
          } else {
            const target = hwpxFieldRangeTarget(
              editor,
              hwpxCreatedTablesPending,
              message.section,
              message.paragraph + 1,
              message.startUnit,
              message.endUnit,
            );
            if (target) {
              editor.spliceFieldLabel(
                message.section,
                message.paragraph + 1,
                target.beginElement,
                message.startUnit,
                message.endUnit - message.startUnit,
                message.text,
              );
            } else if (
              outsideFieldRange(
                message.section,
                message.paragraph + 1,
                message.startUnit,
                message.endUnit,
              )
            ) {
              editor.splice(
                message.section,
                message.paragraph + 1,
                message.startUnit,
                message.endUnit - message.startUnit,
                message.text,
              );
            } else if (anchorView(message.section, message.paragraph + 1) !== null) {
              editor.spliceAnchored(
                message.section,
                message.paragraph + 1,
                message.startUnit,
                message.endUnit - message.startUnit,
                message.text,
              );
            } else {
              const targets = editor.fieldLabels(message.section, message.paragraph + 1);
              if (targets.length === 0) {
                // Preserve the native refusal classification for ordinary paths.
                editor.splice(
                  message.section,
                  message.paragraph + 1,
                  message.startUnit,
                  message.endUnit - message.startUnit,
                  message.text,
                );
              } else {
                throw new Error('UnsupportedFieldLabelRange');
              }
            }
          }
          applied = true;
          reader = await createHwpxReader(module);
          preview = reader.readTextEvents(editor.saveForDisplay());
          reply({ kind: message.kind, content: hwpxDisplay() });
          return;
        }
        if (message.kind === 'splice' && message.reference !== undefined) {
          editor.spliceCurrent(message);
          applied = true;
          captureTextDelta();
          await refreshHwp5PreviewFallback();
          reply({ kind: message.kind, content: hwp5Display() });
          return;
        }
        if (message.kind === 'splice') {
          editor.splice(message);
          captureTextDelta();
        } else editor.setCharacterFormat(message);
        applied = true;
        if (historyEnabled && editor.supportsCurrentTextPreview?.()) {
          reply({ kind: message.kind, content: hwp5Display() });
          return;
        }
        // Refresh only a derived display snapshot from authoritative native text.
        // This snapshot is never used as an editor command's source or for saving.
        const raw = editor.copyText(message.section, message.paragraph);
        const p = preview.sections[message.section].paragraphs[message.paragraph];
        const sectionHasFields = preview.sections[message.section].paragraphs.some((paragraph) =>
          paragraph.tokens.some((t) => t.type === 'control' && t.code === 3),
        );
        if (sectionHasFields || p.tokens.some((t) => t.type === 'control' && t.code !== 13)) {
          // Never interpret retained control payload as ordinary Unicode or
          // advertise it as directly editable. Reuse native token projection.
          await refreshHwp5PreviewFallback();
        } else {
          const text = new TextDecoder('utf-16le', { fatal: true, ignoreBOM: true }).decode(
            raw.subarray(0, -2),
          );
          preview.sections[message.section].paragraphs[message.paragraph] =
            raw.length === 0
              ? p
              : {
                  ...p,
                  text,
                  textPresent: true,
                  declaredUnits: raw.length / 2,
                  tokens: [
                    { type: 'text', startUnit: 0, text, raw: raw.subarray(0, -2) },
                    {
                      type: 'control',
                      startUnit: raw.length / 2 - 1,
                      code: 13,
                      raw: raw.subarray(-2),
                    },
                  ],
                };
        }
        reply({ kind: message.kind, content: hwp5Display() });
      } else throw new Error('UnknownPreviewCommand');
    } catch (error) {
      mutationUncertain =
        mutationUncertain ||
        ['MutationUncertain', 'HistoryMutationUncertain'].includes(error?.message);
      if (mutationUncertain) historyPoisoned = true;
      delete message.password;
      const availableSectionsPreviewAvailable =
        message.kind === 'load' &&
        message.availableSectionsOnly !== true &&
        format === 'hwp5' &&
        error.message === 'SectionCountMismatch' &&
        availableSectionsCapability(module);
      const availableSectionCopyAvailable =
        message.kind === 'load' &&
        message.availableSectionsOnly !== true &&
        message.availableSectionCopy !== true &&
        format === 'hwp5' &&
        error.message === 'SectionCountMismatch' &&
        availableSectionCopyCapability(module);
      const passwordRequired =
        message.kind === 'load' &&
        ((format === 'hwpx' && error.message === 'EncryptedDocument') ||
          (format === 'hwp5' && error.message === 'UnsupportedEncryption'));
      const queryIdentity = [
        'chart-points',
        'chart-series-text',
        'chart-rich-text',
        'chart-display',
      ].includes(message.kind)
        ? { requestId: message.requestId, section: message.section, wrapper: message.wrapper }
        : ['query-edit-range', 'query-split-range'].includes(message.kind)
          ? {
              requestId: message.requestId,
              section: message.section,
              paragraph: message.paragraph,
              startUnit: message.startUnit,
              endUnit: message.endUnit,
            }
          : {};
      const currentIdentity = [
        'query-current-references',
        'query-current-source-references',
        'query-current-text',
        'query-created-tables',
        'splice-current',
      ].includes(message.kind)
        ? { requestId: message.requestId }
        : {};
      reply({
        kind: message.kind,
        applied,
        ...(availableSectionsPreviewAvailable ? { availableSectionsPreviewAvailable: true } : {}),
        ...(availableSectionCopyAvailable ? { availableSectionCopyAvailable: true } : {}),
        error: error.message || String(error),
        ...queryIdentity,
        ...currentIdentity,
        ...dutmalQueryIdentity(message),
        ...equationQueryIdentity(message),
        ...(passwordRequired ? { passwordRequired: true } : {}),
      });
    } finally {
      try {
        reader?.close();
      } catch (error) {
        response = minimalError(error);
      }
      response ??= minimalError(new Error('MissingRuntimeReply'));
      if (nativeTextDelta && !response.error) response = { ...response, nativeTextDelta };
      // Match Worker structured-clone ownership for direct DOM-free callers too.
      try {
        response = structuredClone(response);
      } catch (error) {
        response = minimalError(error);
      }
      if (
        message.kind === 'load' &&
        format === 'hwpx' &&
        !response.error &&
        response.content &&
        !historyEnabled &&
        editor &&
        message.password === undefined &&
        requestSequence === requestTicket
      ) {
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
            content: structuredClone(response.content),
          };
        } catch {
          loadProjection = null;
        } // Uncertain ownership falls back to normal projection.
      }
      if (atomicOutcome)
        response = {
          ...response,
          formattingNativeCode: atomicOutcome.nativeCode,
          formattingRefreshRequired: atomicOutcome.refreshRequired === true,
          changed: atomicOutcome.changed,
        };
      const revision = response.historyRevision;
      const changed =
        typeof response.changed === 'boolean'
          ? response.changed
          : typeof revision === 'number' && typeof lastHistoryRevision === 'number'
            ? revision !== lastHistoryRevision
            : applied
              ? null
              : false;
      displayResources.finishRequest(Boolean(response.error), response);
      outcomes.set(
        response,
        atomicOutcome
          ? { application: atomicOutcome.application, changed: atomicOutcome.changed }
          : {
              application:
                historyPoisoned ||
                mutationUncertain ||
                ['MutationUncertain', 'HistoryMutationUncertain'].includes(response.error)
                  ? 'unknown'
                  : applied && changed !== false
                    ? 'applied'
                    : 'unapplied',
              changed,
            },
      );
      if (typeof revision === 'number') lastHistoryRevision = revision;
      // oxlint-disable-next-line no-unsafe-finally -- 직접 Runtime도 성공·실패를 응답 객체로 반환하는 기존 finally 정리 계약을 보존한다.
      return response;
    }
  }

  let tail = Promise.resolve();
  let terminal = false;
  let loaded = false;
  let disposal;
  function clear() {
    displayResources.reset();
    try {
      editor?.close();
    } finally {
      if (protectionRemoved) bytes?.fill(0);
      module = bytes = preview = editor = format = undefined;
      lastHistoryRevision = undefined;
      historyPoisoned =
        historyEnabled =
        hwpxChartOlePolicy =
        protectionRemoved =
        hwpxCreatedTablesPending =
          false;
      hwp5StyleOpenError = documentWindow = null;
    }
  }
  return {
    // Kept out of the legacy wire; the core adapter attaches this as meta.
    outcome(reply) {
      return { ...outcomes.get(reply) };
    },
    request(input, admission) {
      if (admission !== undefined && typeof admission !== 'function')
        return Promise.reject(Error('InvalidRuntimeAdmission'));
      const requestTicket = ++requestSequence;
      const reusableLoad = loadProjection;
      loadProjection = null; // Also invalidate on rejected/malformed/error requests.
      if (terminal) return Promise.reject(new Error('RuntimeDisposed'));
      let message;
      try {
        message = copyRuntimeMessage(input);
      } catch (error) {
        displayResources.invalidate();
        return Promise.reject(error);
      }
      const secret = message.password;
      const task = tail.then(async () => {
        if (terminal) throw new Error('RuntimeDisposed');
        if (message.kind === 'load') {
          if (loaded && !allowReload) throw new Error('RuntimeDocumentAlreadyLoaded');
          loaded = true;
          lastHistoryRevision = undefined;
        }
        admission?.();
        return execute(message, requestTicket, reusableLoad);
      });
      const settled = task.finally(() => {
        if (ArrayBuffer.isView(secret))
          new Uint8Array(secret.buffer, secret.byteOffset, secret.byteLength).fill(0);
        else if (secret instanceof ArrayBuffer) new Uint8Array(secret).fill(0);
        delete message.password;
      });
      tail = settled.then(
        () => undefined,
        () => undefined,
      );
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
    },
  };
}
