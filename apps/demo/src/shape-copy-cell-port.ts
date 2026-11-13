import {
  createParagraphSelection,
  getSelectionFormatting,
  planCellAppearanceSelection,
} from '@hwpjs/core';
import type { HeadlessEditor } from '@hwpjs/core';
// @ts-ignore Shared current Native DTO observation, indexed once per selected set.
import { createTableCellAppearanceObserver } from '../../../js/table-cell-appearance-observation.mjs';
import {
  createTableCellAppearancePort,
  tableCellAppearanceValues,
} from './table-cell-appearance-port.ts';
import type { TableCellAppearanceDraft } from './table-cell-appearance-port.ts';
const freeze = (v: any): any => {
  if (v && typeof v === 'object') {
    for (const c of Object.values(v)) freeze(c);
    Object.freeze(v);
  }
  return v;
};
export type CellCopySelection = Readonly<{
  state: ReturnType<HeadlessEditor['getEditorState']>;
  witness: Parameters<typeof planCellAppearanceSelection>[1];
  current: () => boolean;
}>;
function parts(observed: any, uniform: any, diagonalAvailable: boolean) {
  const values: Record<string, any> = {};
  if (uniform)
    values.border = {
      mode: 'cell',
      region: 'all',
      startRow: '',
      endRow: '',
      startColumn: '',
      endColumn: '',
      edges: 15,
      style: uniform.style,
      width: String(uniform.width),
      color: uniform.color,
      dirty: { style: true, width: true, color: true },
    };
  const f = observed?.fill;
  if (f?.state === 'none' && f.kind === 'none')
    values.background = { kind: 'none', color: '', dirty: true };
  if (f?.state === 'known') {
    if (f.kind === 'solid') values.background = { kind: 'solid', color: f.color, dirty: true };
    if (f.kind === 'hatch')
      values.background = {
        kind: 'hatch',
        color: f.background,
        hatchColor: f.color,
        hatchStyle: f.pattern,
        dirty: true,
      };
    if (
      f.kind === 'linear' &&
      f.colors?.length === 2 &&
      ['angle', 'centerX', 'centerY', 'step', 'stepCenter'].every((k) => Number.isInteger(f[k]))
    )
      values.background = {
        kind: 'linear',
        color: f.colors[0],
        endColor: f.colors[1],
        ...Object.fromEntries(
          ['angle', 'centerX', 'centerY', 'step', 'stepCenter'].map((k) => [k, String(f[k])]),
        ),
        dirty: true,
      };
  }
  const d = observed?.diagonal,
    stroke = d?.stroke;
  if (
    diagonalAvailable &&
    d?.state === 'known' &&
    d.directions != null &&
    ['known', 'none'].includes(stroke?.state) &&
    ['NONE', 'SOLID', 'DOUBLE_SLIM'].includes(stroke.style) &&
    Number.isInteger(stroke.width) &&
    typeof stroke.color === 'string' &&
    (stroke.style !== 'DOUBLE_SLIM' || stroke.width === 50)
  )
    values.diagonal = {
      directions: d.directions,
      style: stroke.style,
      width: String(stroke.width),
      color: stroke.color,
      dirty: { directions: true, style: true, width: true, color: true },
    };
  return values;
}
export function createCellShapeCopyPort(editor: HeadlessEditor) {
  const appearance = createTableCellAppearancePort(editor, {
    createParagraphSelection,
    getSelectionFormatting,
  });
  let disposed = false,
    pending = false;
  const issued = new WeakSet<object>();
  let copied: {
    token: ReturnType<HeadlessEditor['getEditorState']>['token'];
    parts: Record<string, any>;
  } | null = null;
  const sameDocument = () => {
    const t = editor.getEditorState().token,
      c = copied?.token;
    return (
      !!c &&
      t.editorId === c.editorId &&
      t.documentId === c.documentId &&
      t.generation === c.generation
    );
  };
  const discard = () => {
    if (copied && !sameDocument()) copied = null;
  };
  const guard = (state: ReturnType<HeadlessEditor['getEditorState']>, active: () => boolean) => {
    if (disposed || !active()) throw Error('CellShapeCopyInactive');
    if (editor.getEditorState() !== state) throw Error('StaleCellShapeCopy');
  };
  function capture() {
    const c = appearance.capture();
    if (c.reason || c.writeReason || !c.cell)
      throw Error(c.reason ?? c.writeReason ?? 'CellUnavailable');
    const content = c.state.content as any;
    const table = content.tables.find(
      (t: any) => t.section === c.cell!.section && t.tableNode === c.cell!.tableNode,
    );
    const cell = table.cells.find((v: any) => v.listNode === c.cell!.listNode);
    const witness = {
      section: table.section,
      tableNode: table.tableNode,
      rows: table.rows,
      columns: table.columns,
      cells: [
        {
          listNode: cell.listNode,
          row: cell.row,
          column: cell.column,
          paragraphs: [...cell.paragraphs],
        },
      ],
    };
    planCellAppearanceSelection(c.state, witness);
    return c;
  }
  return {
    hasCopy() {
      discard();
      return !disposed && copied !== null;
    },
    presentation() {
      discard();
      try {
        if (pending || disposed) throw Error('Pending');
        capture();
        return { enabled: true };
      } catch {
        return {
          enabled: false,
          reason: '편집 가능한 원본 표 셀을 선택하고 입력을 마친 뒤 사용하세요.',
        };
      }
    },
    async readSource(active: () => boolean) {
      const c = capture();
      guard(c.state, active);
      const t = getSelectionFormatting(c.state).target;
      if (!t || t.startUnit !== t.endUnit) throw Error('CellShapeCopySourceCaretRequired');
      const observedParts = parts(
        c.observed,
        c.currentBorder,
        (c.state.capabilities as any)?.cellDiagonalAvailable === true,
      );
      for (const key of Object.keys(observedParts)) {
        try {
          tableCellAppearanceValues(
            { border: null, background: null, [key]: observedParts[key] },
            c,
          );
        } catch {
          delete observedParts[key];
        }
      }
      // Validate every proposed part through the existing appearance planner, separately.
      const options = [
        [
          'border',
          '셀 테두리',
          '서로 다른 변 또는 확인할 수 없는 테두리는 아직 복사할 수 없습니다.',
        ],
        ['background', '셀 배경', '이 채우기는 아직 복사할 수 없습니다.'],
        ['diagonal', '셀 대각선', '이 대각선은 아직 복사할 수 없습니다.'],
      ].map(([key, label, reason]) => ({
        id: 'cell.' + key,
        group: 'cell' as const,
        label,
        enabled: !!observedParts[key],
        reason: observedParts[key] ? null : reason,
        part: observedParts[key] ? freeze(structuredClone(observedParts[key])) : undefined,
      }));
      const result = Object.freeze({ state: c.state, options: freeze(options), source: c });
      issued.add(result);
      return result;
    },
    remember(capture: any, ids: readonly string[], active: () => boolean) {
      guard(capture.state, active);
      if (
        pending ||
        !issued.has(capture) ||
        !appearance.isCurrent(capture.source) ||
        !ids.length ||
        new Set(ids).size !== ids.length
      )
        throw Error('InvalidCellShapeCopyCapture');
      const selected: Record<string, any> = {};
      for (const id of ids) {
        const option = capture.options.find((d: any) => d.id === id);
        if (!option?.enabled) throw Error('CellShapeCopyFieldUnavailable');
        selected[id.slice(5)] = structuredClone(option.part);
      }
      copied = { token: capture.state.token, parts: freeze(selected) };
    },
    async apply(active: () => boolean, selection?: CellCopySelection | null) {
      discard();
      if (!copied) throw Error('CellShapeCopySourceUnavailable');
      if (pending) throw Error('CellShapeCopyPending');
      const buffer = copied,
        c = capture();
      const witnessFingerprint = selection ? JSON.stringify(selection.witness) : null;
      const live = () => {
        try {
          guard(c.state, active);
          return (
            copied === buffer &&
            sameDocument() &&
            (!selection ||
              (selection.state === c.state &&
                selection.current() === true &&
                JSON.stringify(selection.witness) === witnessFingerprint))
          );
        } catch {
          return false;
        }
      };
      if (!live()) throw Error('StaleCellShapeCopy');
      const values = structuredClone(buffer.parts);
      let target: any,
        selected = [
          { section: c.cell!.section, tableNode: c.cell!.tableNode, listNode: c.cell!.listNode },
        ];
      if (selection) {
        const plan = planCellAppearanceSelection(c.state, selection.witness);
        selected = [...plan.cells];
        target = {
          mode: 'range',
          region: 'all',
          startRow: String(plan.top + 1),
          endRow: String(plan.bottom),
          startColumn: String(plan.left + 1),
          endColumn: String(plan.right),
        };
        if (values.border) Object.assign(values.border, target);
      }
      if (
        (c.state.content as any).format === 'hwpx' &&
        values.background &&
        values.background.kind !== 'none'
      ) {
        const observe = createTableCellAppearanceObserver(c.state.content);
        if (selected.some((cell) => observe(cell).fill.state !== 'known'))
          return { status: 'rejected-unapplied' as const, error: 'CellFillTargetAlphaUnavailable' };
      }
      const draft: TableCellAppearanceDraft = {
        border: values.border ?? null,
        background: values.background ?? null,
        ...(values.diagonal ? { diagonal: values.diagonal } : {}),
        ...(target ? { target } : {}),
      };
      pending = true;
      try {
        const result = await appearance.apply(c, draft, live);
        if (
          !disposed &&
          active() &&
          sameDocument() &&
          (await appearance.restoreSelection(c, result))
        ) {
          const now = editor.getEditorState();
          const beforeTarget = getSelectionFormatting(c.state).target,
            afterTarget = getSelectionFormatting(now).target;
          if (
            active() &&
            sameDocument() &&
            beforeTarget &&
            afterTarget &&
            ['section', 'paragraph', 'startUnit', 'endUnit', 'owner'].every(
              (k) => (beforeTarget as any)[k] === (afterTarget as any)[k],
            )
          )
            return { ...result, state: now };
        }
        return result;
      } finally {
        pending = false;
      }
    },
    clear() {
      copied = null;
    },
    dispose() {
      disposed = true;
      copied = null;
      appearance.dispose();
    },
  };
}
