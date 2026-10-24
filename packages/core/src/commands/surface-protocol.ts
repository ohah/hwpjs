/** Internal compatibility inventory from reader-runtime and canvas-editor, not a general JSON API. */
export const SURFACE_READ_KINDS = Object.freeze([
  'query-window', 'query-edit-window', 'query-edit-range', 'query-split-range',
  'query-current-references', 'query-current-source-references', 'query-current-text', 'query-created-tables',
  'picture-bytes', 'table-background-bytes', 'chart-display', 'chart-points', 'chart-series-text', 'chart-rich-text',
  'inline-string-sources', 'equation-sources', 'equation-script-query', 'dutmal-text-query',
] as const);
export const SURFACE_MUTATION_KINDS = Object.freeze([
  'splice', 'splice-current', 'splice-font-name', 'splice-character-properties', 'created-cell-text', 'insert-table',
  'undo', 'redo', 'split', 'merge', 'format', 'replace-paragraph-ranges',
  'character-properties', 'character-properties-ranges', 'character-font', 'character-font-ranges',
  'character-font-name', 'character-font-name-ranges', 'character-outline', 'character-outline-ranges',
  'character-effect', 'character-effect-ranges', 'character-shade', 'character-shade-ranges',
  'character-text-color', 'character-text-color-ranges', 'character-strike', 'character-strike-ranges',
  'character-strike-color', 'character-underline', 'character-underline-ranges', 'character-underline-color',
  'paragraph-format', 'paragraph-alignment', 'paragraph-spacing', 'paragraph-margins',
  'formula-definition', 'manual-formula-result', 'chart-points-set', 'chart-numeric-point', 'chart-point',
  'chart-series-text-set', 'chart-rich-text-set', 'equation-script-set', 'dutmal-text',
  'radio-select', 'checkbox-state', 'form-text', 'picture-resize', 'picture-current-size', 'picture-dimensions',
  'table-column-width', 'cell-size',
] as const);
export const SURFACE_VIEW_KINDS = Object.freeze(['enable', 'set-edit-window'] as const);
const reads = new Set<string>(SURFACE_READ_KINDS);
const mutations = new Set<string>(SURFACE_MUTATION_KINDS);
const views = new Set<string>(SURFACE_VIEW_KINDS);
export function surfaceOperation(kind:string):'read'|'mutation'|'view'|undefined {
  return reads.has(kind)?'read':mutations.has(kind)?'mutation':views.has(kind)?'view':undefined;
}
