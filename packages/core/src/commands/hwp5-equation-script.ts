import type { EditorState } from '../state/editor-state.ts';
import type { SelectionTarget } from './commands.ts';
import { validateSelection } from './selection.ts';
import { ownPageRecord } from '../../../../js/page-settings-edit.mjs';
import { checkedHwp5EquationScript } from '../../../../js/hwp5-equation-script-edit.mjs';
import type {
  Hwp5EquationScriptSelector,
  Hwp5EquationScriptTarget,
  EditHwp5EquationScriptPayload,
  Hwp5EquationScriptSource,
} from './hwp5-equation-script-dto.ts';
const uint = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value < 0xffffffff &&
  !Object.is(value, -0);
export function checkedHwp5EquationScriptDraft(script: unknown): string {
  return checkedHwp5EquationScript(script);
}
export function hwp5EquationScriptSelector(input: unknown): Hwp5EquationScriptSelector {
  const v = ownPageRecord(input, ['section', 'equationNode', 'layout']);
  if (
    !uint(v.section) ||
    !uint(v.equationNode) ||
    (v.layout !== 'version-only' && v.layout !== 'with-font')
  )
    throw Error('InvalidHwp5EquationScriptSelector');
  return Object.freeze({ section: v.section, equationNode: v.equationNode, layout: v.layout });
}
export function captureHwp5EquationScriptPayload(input: unknown): EditHwp5EquationScriptPayload {
  const v = ownPageRecord(input, ['target', 'script']);
  if (!v.target || typeof v.target !== 'object') throw Error('InvalidHwp5EquationScriptTarget');
  return Object.freeze({
    target: v.target as Hwp5EquationScriptTarget,
    script: checkedHwp5EquationScriptDraft(v.script),
  });
}
export function hwp5EquationScriptAvailability(
  state: EditorState,
): Readonly<{ enabled: boolean; reason?: string }> {
  const c = state.content as Record<string, unknown> | undefined;
  const ready =
    state.status === 'ready' &&
    c?.format === 'hwp5' &&
    !c.readOnly &&
    !c.window &&
    !c.limited &&
    !c.viewKind &&
    !(state.capabilities as Record<string, unknown> | undefined)?.readOnly &&
    !state.historyRecoveryRequired &&
    state.nativeHistoryStats?.protocolVersion === 2 &&
    Number.isSafeInteger(state.nativeHistoryRevision) &&
    typeof state.nativeHistoryRevision === 'number' &&
    state.nativeHistoryRevision >= 0;
  return ready
    ? { enabled: true }
    : { enabled: false, reason: '현재 전체 HWP5 문서의 원본 수식만 편집할 수 있습니다.' };
}
const indices = new WeakMap<
  object,
  {
    sources: readonly Hwp5EquationScriptSource[];
    byNode: Map<string, Hwp5EquationScriptSource | null>;
  }
>();
/** Existing display metadata only. One content index, no Native query/capture per row. */
export function hwp5EquationScriptSources(state: EditorState): readonly Hwp5EquationScriptSource[] {
  const content = state.content as
    | { format?: unknown; paragraphs?: Record<string, unknown>[] }
    | undefined;
  if (!content || content.format !== 'hwp5' || !Array.isArray(content.paragraphs)) return [];
  const cached = indices.get(content);
  if (cached) return cached.sources;
  const counts = new Map<string, number>(),
    sources: Hwp5EquationScriptSource[] = [],
    byNode = new Map<string, Hwp5EquationScriptSource | null>();
  for (const row of content.paragraphs) {
    const key = `${row.section}:${row.paragraph}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const row of content.paragraphs) {
    if (!uint(row.section) || !uint(row.paragraph) || !Array.isArray(row.equations)) continue;
    const reference = row.currentReference as { kind?: unknown } | undefined;
    for (const e of row.equations as { node?: unknown; unit?: unknown }[]) {
      if (!e || !uint(e.node) || !uint(e.unit)) continue;
      const issue =
        counts.get(`${row.section}:${row.paragraph}`) !== 1
          ? 'AmbiguousHwp5EquationOwner'
          : typeof row.text !== 'string' || row.text[e.unit] !== '\ufffc'
            ? 'InvalidHwp5EquationAnchor'
            : row.editable !== true ||
                row.clipped ||
                row.tableCell ||
                row.drawingText ||
                row.drawingCaption ||
                row.noteBody ||
                row.selectionOwner !== `section:${row.section}:body` ||
                reference?.kind !== 'original'
              ? 'UnsupportedHwp5EquationOwner'
              : null;
      const source = Object.freeze({
        section: row.section,
        equationNode: e.node,
        paragraph: row.paragraph,
        unit: e.unit,
        issue,
      });
      const key = `${row.section}:${e.node}`;
      byNode.set(key, byNode.has(key) ? null : source);
      sources.push(source);
    }
  }
  const result = Object.freeze(
    sources.map((row) =>
      byNode.get(`${row.section}:${row.equationNode}`) === null
        ? Object.freeze({ ...row, issue: 'AmbiguousHwp5EquationOwner' })
        : row,
    ),
  );
  indices.set(content, { sources: result, byNode });
  return result;
}
export function assertHwp5EquationScriptSelection(
  state: EditorState,
  selector: Hwp5EquationScriptSelector,
): SelectionTarget {
  if (!hwp5EquationScriptAvailability(state).enabled)
    throw Error('Hwp5EquationScriptEditUnavailable');
  hwp5EquationScriptSources(state);
  const source =
    state.content && typeof state.content === 'object'
      ? indices.get(state.content)?.byNode.get(`${selector.section}:${selector.equationNode}`)
      : undefined;
  if (!source || source.issue) throw Error(source?.issue ?? 'AmbiguousHwp5EquationOwner');
  const selection = state.selection as SelectionTarget | null | undefined;
  if (!selection) throw Error('Hwp5EquationAnchorSelectionRequired');
  validateSelection(selection, state, true);
  if (
    selection.section !== source.section ||
    selection.paragraph !== source.paragraph ||
    selection.startUnit !== source.unit ||
    selection.endUnit !== source.unit + 1 ||
    selection.owner !== `section:${source.section}:body`
  )
    throw Error('Hwp5EquationAnchorSelectionRequired');
  return selection;
}
export function checkedHwp5EquationScriptCapture(
  input: unknown,
  selector: Hwp5EquationScriptSelector,
  revision: number,
): Readonly<{ leaseKey: string; script: string }> {
  const v = ownPageRecord(input, [
    'section',
    'equationNode',
    'layout',
    'historyRevision',
    'script',
    'leaseKey',
  ]);
  if (
    v.section !== selector.section ||
    v.equationNode !== selector.equationNode ||
    v.layout !== selector.layout ||
    v.historyRevision !== revision ||
    typeof v.script !== 'string' ||
    typeof v.leaseKey !== 'string' ||
    !v.leaseKey.length ||
    v.leaseKey.length > 128
  )
    throw Error('InvalidHwp5EquationScriptCapture');
  return Object.freeze({ leaseKey: v.leaseKey, script: v.script });
}
