export { createEditor } from './editor/create-editor.ts';
export type {
  CreatedCellTextTarget,
  CreatedCellTextSelector,
  CreatedCellTextRange,
  CreatedCellSplicePayload,
} from './commands/created-cell-text.ts';
export type { NativeEditOutcome } from './contracts/native-edit-outcome.ts';
export type {
  CreatedCellTypingRequest,
  CreatedCellTypingCapabilities,
  CreatedCellTypingApi,
} from './commands/created-cell-typing-dto.ts';
export type {
  HeadlessEditor,
  CreateEditorOptions,
  CommandResult,
  CommandStatus,
  UpdateResult,
  UpdateCollector,
  EditorError,
  LoadOptions,
  CreateDocumentOptions,
  SaveOptions,
  SaveResult,
  SelectionOptions,
} from './editor/create-editor.ts';
export { EditorState } from './state/editor-state.ts';
export type { StateToken, StateData, EditorStatus } from './state/editor-state.ts';
export {
  createCommand,
  SPLICE_TEXT_COMMAND,
  SET_NAMED_FIELD_VALUE_COMMAND,
  RENAME_NAMED_FIELD_COMMAND,
  EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND,
  CREATE_NAMED_FIELD_COMMAND,
  SET_NAMED_FIELD_PARAMETERS_COMMAND,
  INSERT_TABLE_COMMAND,
  EDIT_CREATED_TABLE_GRID_COMMAND,
  EDIT_SOURCE_TABLE_GRID_COMMAND,
  MERGE_SOURCE_TABLE_CELLS_COMMAND,
  SPLIT_SOURCE_TABLE_CELLS_COMMAND,
  EQUALIZE_SOURCE_TABLE_CELL_WIDTH_COMMAND,
  EQUALIZE_SOURCE_TABLE_CELL_HEIGHT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  SET_CHARACTER_PROPERTIES_COMMAND,
  SET_PARAGRAPH_ALIGNMENT_COMMAND,
  SET_CHARACTER_UNDERLINE_COMMAND,
  SET_CHARACTER_STRIKE_COMMAND,
  SET_CHARACTER_TEXT_COLOR_COMMAND,
  SET_CHARACTER_FONT_NAME_COMMAND,
} from './commands/commands.ts';
export type {
  EditorCommand,
  SelectionTarget,
  SpliceTextPayload,
  HistoryPayload,
  CharacterProperties,
  SetCharacterPropertiesPayload,
  SetParagraphAlignmentPayload,
  CharacterUnderlineKind,
  SetCharacterUnderlinePayload,
  SetCharacterStrikePayload,
  SetCharacterTextColorPayload,
  SetCharacterFontNamePayload,
  CharacterFontLanguage,
} from './commands/commands.ts';
export type {
  EditorRuntime,
  RuntimeFactory,
  RuntimeMessage,
  RuntimeReply,
  RuntimeRequestContext,
} from './contracts.ts';
export type {
  CompositionSettlement,
  InputSurfaceHooks,
  InputSurfaceLease,
  SurfaceRequestOptions,
} from './host-contracts.ts';
export { getSelectionFormatting } from './state/formatting-state.ts';
export type { SelectionFormatting, FormattingValue } from './state/formatting-state.ts';

export { detectDocumentFormat } from './document-format.ts';
export {
  findTextMatch,
  selectionMatchesText,
  getDocumentTextStatistics,
} from './state/text-tools.ts';
export { PasswordAttemptError } from './editor/unlock-policy.ts';

export { getSelectionClipboard } from './state/clipboard-state.ts';
export type { SelectionClipboard } from './state/clipboard-state.ts';

export { getHistoryAvailability } from './state/history-state.ts';
export type { HistoryAvailability } from './state/history-state.ts';

export { parseKeymapConfig, mergeKeymap, resolveShortcutLabel } from './keymap/config.ts';
export { compileKeymap, resolveKeyboardShortcut } from './keymap/resolve.ts';
export { DEFAULT_KEYMAP } from './keymap/defaults.ts';
export type {
  KeymapConfig,
  KeymapPlatform,
  KeymapModifier,
  KeymapBinding,
  ShortcutBinding,
} from './keymap/config.ts';
export type { CompiledKeymap, NormalizedShortcutEvent } from './keymap/resolve.ts';

export type { FindTextOptions } from './state/text-tools.ts';
export { findDocumentTextMatch, documentTextMatches } from './state/document-text-search.ts';
export type {
  DocumentTextIndex,
  DocumentTextSnapshot,
  DocumentTextRow,
  DocumentTextMatch,
} from './state/document-text-search.ts';

export type {
  HistoryOptions,
  HistoryBudgetOptions,
  LegacyHistoryOptions,
  NativeHistoryStats,
  HistoryPolicyObservation,
} from './history-options.ts';

export { createParagraphSelection } from './state/paragraph-selection.ts';
export type { ParagraphSelectionOptions } from './state/paragraph-selection.ts';

export type { CharacterFontNameValue } from './state/font-name-state.ts';

export { APPLY_FORMATTING_PATCH_COMMAND } from './commands/commands.ts';
export type {
  ParagraphBullet,
  ParagraphFormattingPatch,
  FormattingPatch,
  ApplyFormattingPatchPayload,
  SelectionAdmissionFence,
  FormattingObservation,
  FormattingBinding,
  FormattingNativeTarget,
  FormattingQueryResult,
  QueryFormattingOptions,
  FormattingCapabilities,
  FormattingCapabilityOptions,
} from './commands/formatting-patch.ts';
export type {
  BorderLineStyle,
  BorderEdgePatch,
  BorderPatch,
  BackgroundPatch,
} from './commands/formatting-resource-intent.ts';

export type {
  CharacterFormattingPatch,
  CharacterLineStyle,
  CharacterOutlineKind,
  CharacterFontIntent,
  CharacterLanguageMetrics,
  FormattingReset,
} from './commands/character-formatting-patch.ts';

export {
  BORDER_LINE_STYLES,
  BORDER_WIDTHS_HUNDREDTH_MM,
  BACKGROUND_HATCH_STYLES,
} from './commands/formatting-resource-intent.ts';

export type {
  InsertTablePayload,
  InsertTableOptions,
  TableInsertResources,
  TableInsertAvailability,
} from './commands/table-insert.ts';
export { getTableInsertAvailability } from './commands/table-insert.ts';

export { toHtml } from './conversion.ts';
export type { HTMLConversionOptions } from './conversion.ts';

export type {
  SourceTableCellSplitTarget,
  SourceTableCellSplitProfile,
  SourceTableCellSplitCapabilities,
  SourceTableCellSplitCapture,
  SourceTableCellSplitSelection,
  SplitSourceTableCellsPayload,
} from './commands/source-table-cell-split.ts';
export type { SourceTableCellMergeTarget } from './commands/source-table-cell-merge.ts';
export type {
  EditSourceTableGridPayload,
  SourceTableGridAction,
} from './commands/source-table-grid.ts';
export type {
  EditCreatedTableGridPayload,
  CreatedTableGridAction,
} from './commands/created-table-grid.ts';

export { REPLACE_ALL_COMMAND } from './commands/commands.ts';
export { planReplaceAll } from './commands/replace-all.ts';
export type {
  ReplaceAllPlanRequest,
  ReplaceAllPlan,
  ReplaceAllCapabilities,
} from './commands/replace-all.ts';

export { resolveNamedField } from './editor/named-fields.ts';
export type {
  NamedField,
  NamedFieldFormat,
  NamedFieldInventory,
  NamedFieldLocation,
  NamedFieldNavigation,
  NamedFieldOptions,
  NamedFieldResolution,
  NamedFieldSelector,
  NamedFieldSource,
  NamedFieldSourceRow,
  NamedFieldValue,
  SetNamedFieldValuePayload,
  RenameNamedFieldPayload,
  CreateNamedFieldPayload,
  NamedFieldParameters,
  SetNamedFieldParametersPayload,
  NamedFieldParametersRead,
} from './editor/named-fields.ts';

export { INSERT_DOCUMENT_COMMAND } from './commands/commands.ts';
export type {
  DocumentInsertionCapabilities,
  DocumentInsertionCapabilityOptions,
  InsertDocumentPayload,
} from './commands/document-insert.ts';

export type { SourceTableCellWidthTarget } from './commands/source-table-cell-width.ts';

export type { SourceTableCellHeightTarget } from './commands/source-table-cell-height.ts';
export type {
  ParagraphBulletDeclaration,
  ParagraphBulletDefinitions,
  ParagraphBulletDefinitionsOptions,
} from './editor/paragraph-bullet-definitions.ts';

export type {
  ParagraphBulletDefinition,
  ParagraphBulletDefinitionEdit,
  EditParagraphBulletDefinitionPayload,
} from './commands/paragraph-bullet-definition.ts';

export { EDIT_HWP5_EQUATION_SCRIPT_COMMAND } from './commands/commands.ts';
export {
  hwp5EquationScriptAvailability,
  hwp5EquationScriptSources,
  checkedHwp5EquationScriptDraft,
} from './commands/hwp5-equation-script.ts';
export type {
  Hwp5EquationScriptLayout,
  Hwp5EquationScriptSelector,
  Hwp5EquationScriptTarget,
  Hwp5EquationScriptSource,
  Hwp5EquationScriptRead,
  EditHwp5EquationScriptPayload,
} from './commands/hwp5-equation-script-dto.ts';

export { EDIT_PAGE_RESTART_COMMAND } from './commands/commands.ts';
export type {
  PageRestartTarget,
  PageRestartRead,
  PageRestartEntry,
  EditPageRestartPayload,
} from './commands/page-restart.ts';

export { EDIT_PAGE_SETTINGS_COMMAND } from './commands/commands.ts';
export type {
  PageSettingsValues,
  PageSettingsTarget,
  PageSettingsRead,
  PageSettingsSource,
  EditPageSettingsPayload,
} from './commands/page-settings.ts';

export type {
  PageSettingsCapabilities,
  HwpxPageSettingsCapabilities,
  Hwp5PageSettingsCapabilities,
  PageSettingsBinding,
  PageSettingsWriteOutcome,
  PageSettingsWriteRequest,
  HwpxPageSettingsSnapshot,
  Hwp5PageSettingsSnapshot,
  HwpxPageSettingsTarget,
  Hwp5PageSettingsTarget,
} from './commands/page-settings-dto.ts';

export { planCellAppearanceSelection } from './commands/cell-appearance-selection.ts';

export {
  INSERT_EQUATION_COMMAND,
  CREATE_CHART_COMMAND,
  hwp5ChartCreatePreviewMessage,
  getInlineObjectInsertAvailability,
} from './commands/inline-object-insert.ts';
export type {
  InlineObjectKind,
  InlineObjectInsertPayload,
  InsertEquationPayload,
  CreateChartPayload,
  EquationInsertOptions,
  ChartCreateOptions,
  Hwp5ChartCreateOptions,
  ChartCreateProfile,
  ChartCategoryProfile,
  ChartScatterProfile,
  ChartBubbleProfile,
  ChartStockProfile,
  ChartGrouping,
  ChartStockRole,
  ChartCreateSeries,
  ChartXYSeries,
  ChartBubbleSeries,
  ChartStockSeries,
} from './commands/inline-object-insert.ts';

export type { InlineObjectCreateTarget } from './commands/inline-object-owner.ts';
export type {
  InlineObjectSelector,
  InlineObjectOwner,
} from './commands/inline-object-placement-dto.ts';

export type {
  DocumentTextSelectionObservation,
  DocumentTextReadTarget,
} from './state/document-text-selection.ts';

export { SET_OBJECT_GEOMETRY_COMMAND } from './commands/object-geometry.ts';
export type {
  ObjectGeometryTarget,
  ObjectGeometryRead,
  ObjectGeometrySelector,
  ObjectGeometryObservation,
  ObjectGeometryFrame,
  ObjectGeometryPatch,
  SetObjectGeometryPayload,
} from './commands/object-geometry.ts';

export type {
  ControlTextCoverage,
  ControlTextKind,
  ControlTextUnit,
  ControlTextIssue,
  ControlTextRow,
  ControlTextSnapshot,
  ControlTextReadApi,
  ControlTextReadIdentity,
} from './contracts/control-text-read.ts';

export type { DocumentTextCaretPoint, DocumentTextAnchor } from './state/document-text-anchor.ts';

export { DELETE_NOTE_COMMAND, getNoteDeleteAvailability } from './commands/note-delete.ts';
export type { DeleteNotePayload } from './commands/note-delete.ts';
export {
  INSERT_FOOTNOTE_COMMAND,
  INSERT_ENDNOTE_COMMAND,
  getNoteInsertAvailability,
} from './commands/note-insert.ts';
export type {
  InsertNotePayload,
  NoteInsertOptions,
  NoteFormat,
  NotePolicyShape,
  NoteKind,
} from './commands/note-insert.ts';

export { createHwp5ChartDataEditor } from './commands/hwp5-chart-data.ts';
export type {
  Hwp5ChartDataTarget,
  Hwp5ChartLiterals,
  Hwp5ChartLiteralEdit,
  Hwp5ChartDataCapture,
  Hwp5ChartDataEditor,
} from './commands/hwp5-chart-data.ts';

export {
  INSERT_IMAGE_COMMAND,
  captureImageInsertPayload,
  imageInsertMessage,
} from './commands/image-insert.ts';
export type { ImageInsertOptions, InsertImagePayload } from './commands/image-insert.ts';

export { EDIT_CREATED_CELL_PROPERTIES_COMMAND } from './commands/commands.ts';
export type { CreatedCellPropertiesPayload } from './commands/created-cell-properties.ts';

export { REPLACE_PICTURE_COMMAND } from './commands/picture-replacement.ts';
export type {
  ReplacePicturePayload,
  PictureReplacementSelector,
  PictureReplacementTarget,
  PictureReplacementObservation,
  PictureReplacementRead,
} from './commands/picture-replacement.ts';

export { SET_OBJECT_OUTER_MARGINS_COMMAND } from './commands/object-outer-margins.ts';
export { SET_OBJECT_BODY_FLOW_COMMAND } from './commands/object-body-flow.ts';
export type {
  ObjectBodyFlow,
  ObjectBodyFlowSelector,
  ObjectBodyFlowTarget,
  ObjectBodyFlowRead,
  SetObjectBodyFlowPayload,
} from './commands/object-body-flow.ts';
export type {
  ObjectOuterMargins,
  ObjectOuterMarginsSelector,
  ObjectOuterMarginsTarget,
  ObjectOuterMarginsRead,
  SetObjectOuterMarginsPayload,
} from './commands/object-outer-margins.ts';

export { SET_HWP5_VERTICAL_MARGINS_COMMAND } from './commands/hwp5-vertical-margins.ts';
export type {
  Hwp5VerticalMarginsSelector,
  Hwp5VerticalMarginsTarget,
  Hwp5VerticalMarginsRead,
  Hwp5VerticalMarginsValues,
  SetHwp5VerticalMarginsPayload,
} from './commands/hwp5-vertical-margins-dto.ts';

export { SET_ORIGINAL_CELL_INSETS_COMMAND } from './commands/original-cell-insets.ts';
export type {
  OriginalCellInsetsTarget,
  OriginalCellInsetsRead,
  SetOriginalCellInsetsPayload,
  CellInsetsPatch,
  CellInsetsValue,
} from './commands/original-cell-insets.ts';
export { SET_ORIGINAL_CELL_VERTICAL_ALIGNMENT_COMMAND } from './commands/original-cell-vertical-alignment.ts';
export type {
  OriginalCellSelectionTarget,
  OriginalCellVerticalAlignmentTarget,
  OriginalCellVerticalAlignmentRead,
  OriginalCellSelector,
  OriginalCellAlignment,
  SetOriginalCellVerticalAlignmentPayload,
} from './commands/original-cell-vertical-alignment.ts';

export { SET_ORIGINAL_CELL_ALIGNMENT_BLOCK_COMMAND } from './commands/original-cell-vertical-alignment-batch.ts';
export type {
  OriginalCellAlignmentBlockSelection,
  OriginalCellAlignmentBlockTarget,
  SetOriginalCellAlignmentBlockPayload,
} from './commands/original-cell-vertical-alignment-batch.ts';

export {
  RESIZE_PICTURE_ANCHORED_COMMAND,
  PICTURE_RESIZE_ANCHORS,
} from './commands/picture-anchored-resize.ts';
export type {
  PictureResizeAnchor,
  PictureAnchoredResizeSelector,
  PictureAnchoredResizeTarget,
  PictureAnchoredResizeObservation,
  ResizePictureAnchoredPayload,
  PictureAnchoredResizeRead,
} from './commands/picture-anchored-resize.ts';

export { SET_PICTURE_CROP_COMMAND } from './commands/picture-crop.ts';
export type {
  PictureCropSelector,
  PictureCropRect,
  PictureCropBounds,
  PictureCropObservation,
  PictureCropTarget,
  PictureCropRead,
  SetPictureCropPayload,
} from './commands/picture-crop.ts';
