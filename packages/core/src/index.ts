export { createEditor } from './editor/create-editor.ts';
export type {
  HeadlessEditor,
  CreateEditorOptions,
  CommandResult,
  CommandStatus,
  UpdateResult,
  UpdateCollector,
  EditorError,
  LoadOptions,
  SaveOptions,
  SaveResult,
  SelectionOptions,
} from './editor/create-editor.ts';
export { EditorState } from './state/editor-state.ts';
export type { StateToken, StateData, EditorStatus } from './state/editor-state.ts';
export {
  createCommand,
  SPLICE_TEXT_COMMAND,
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
