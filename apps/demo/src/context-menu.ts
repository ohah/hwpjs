import { demoCommandAction } from './demo-command-action.ts';
import { getSelectionFormatting, type HeadlessEditor } from '@hwpjs/core';
import type { DemoAction, DemoShellState } from './shell-contract.ts';
import {
  CONTEXT_COMMAND_IDS,
  contextCommandIds,
  surfaceTextContextCommandIds,
  contextCommandLabel,
  type ContextCommand,
  type ContextTargetKind,
} from './command-support.ts';
import { actionAvailability } from './shell-model.ts';
// @ts-ignore 접근 가능한 공통 메뉴만 재사용하며 허가는 공개 API bridge가 소유합니다.
import { createDocumentContextMenu } from '../../../web/preview/document-context-menu.mjs';
type State = ReturnType<HeadlessEditor['getEditorState']>;
export interface ContextPicture {
  readonly editorId: string;
  readonly documentId: string | null;
  readonly generation: number;
  readonly operationRevision: number;
  readonly viewRevision: number;
  readonly section: number;
  readonly pictureNode: number;
}
export interface ContextTarget {
  readonly kind: ContextTargetKind;
  readonly key: string;
}
/** 그림 관측 undefined는 미연결/불확실, null만 그림 선택 없음입니다. */
export function contextTarget(
  state: State,
  picture: ContextPicture | null | undefined,
): ContextTarget {
  const token = state.token;
  const base = [
    token.editorId,
    token.documentId,
    token.generation,
    token.operationRevision,
    token.viewRevision,
  ];
  const none = () => ({ kind: 'none' as const, key: JSON.stringify([...base, 'none']) });
  if (state.status !== 'ready' || picture === undefined) return none();
  if (picture !== null) {
    if (
      picture.editorId !== token.editorId ||
      picture.documentId !== token.documentId ||
      picture.generation !== token.generation ||
      picture.operationRevision !== token.operationRevision ||
      picture.viewRevision !== token.viewRevision ||
      ![picture.section, picture.pictureNode].every((v) => Number.isSafeInteger(v) && v >= 0)
    )
      return none();
    return {
      kind: 'picture',
      key: JSON.stringify([...base, 'picture', picture.section, picture.pictureNode]),
    };
  }
  const target = getSelectionFormatting(state).target;
  if (!target) return none();
  const content = state.content as {
    paragraphs?: {
      section: number;
      paragraph: number;
      tableCell?: unknown;
      drawingText?: unknown;
      drawingCaption?: unknown;
    }[];
  };
  // 공개 validator가 owner/중복/clipped/UTF16/토큰을 검증한 뒤 표시 종류만 구분합니다.
  const row = content.paragraphs?.find(
    (p) => p.section === target.section && p.paragraph === target.paragraph,
  );
  if (!row || row.drawingText || row.drawingCaption) return none();
  const kind = row.tableCell ? 'table-cell' : 'body';
  return {
    kind,
    key: JSON.stringify([
      ...base,
      kind,
      target.owner,
      target.section,
      target.paragraph,
      target.startUnit,
      target.endUnit,
      target.affinity,
    ]),
  };
}
export function mountDemoContextMenu(options: {
  root: HTMLElement;
  getState: () => DemoShellState;
  getTarget: () => ContextTarget;
  /** 표시 수명만 보존한다. 실행·선택 권한은 기존 Surface/action이 재검증한다. */
  captureTextSelection?: () => { current(): boolean } | null | undefined;
  execute: (action: DemoAction) => void | Promise<void>;
  subscribe: (listener: () => void) => () => void;
  onError: (error: unknown) => void;
}) {
  let captured: ContextTarget | undefined;
  let textSelection: { current(): boolean } | undefined;
  const staleTextSelection = Object.freeze({ current: () => false });
  let sequence = 0,
    closed = false;
  const events = new AbortController();
  const capture = () => {
    const ticket = ++sequence;
    captured = undefined;
    textSelection = undefined;
    const target = options.getTarget();
    let text: { current(): boolean } | undefined;
    if (target.kind === 'none' && options.captureTextSelection) {
      try {
        const value = options.captureTextSelection();
        if (value) {
          const current = value.current.bind(value);
          if (current() === true) text = { current };
        }
      } catch {
        // 캡처 없음·불확실·예외는 기존 문서 명령 목록만 유지한다.
      }
    }
    if (closed || sequence !== ticket) return;
    captured = target;
    textSelection = text;
  };
  options.root.addEventListener('contextmenu', capture, { capture: true, signal: events.signal });
  options.root.addEventListener(
    'keydown',
    (event) => {
      if (
        !event.defaultPrevented &&
        !event.isComposing &&
        !event.repeat &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        ((event.key === 'ContextMenu' && !event.shiftKey) ||
          (event.key === 'F10' && event.shiftKey))
      )
        capture();
    },
    { capture: true, signal: events.signal },
  );
  const current = () => {
    const saved = captured,
      text = textSelection,
      ticket = sequence;
    const reject = () => {
      // Keep the menu stale while detaching the old document/Surface closure.
      if (text && sequence === ticket && textSelection === text) textSelection = staleTextSelection;
      return false;
    };
    const value = options.getTarget();
    if (closed || !saved || value.key !== saved.key || value.kind !== saved.kind) return reject();
    if (!text) return captured === saved && sequence === ticket;
    try {
      if (text.current() !== true) return reject();
      const after = options.getTarget();
      return (
        (!closed &&
          sequence === ticket &&
          captured === saved &&
          textSelection === text &&
          after.key === saved.key &&
          after.kind === saved.kind) ||
        reject()
      );
    } catch {
      return reject();
    }
  };
  const commandIds = (target: ContextTarget) =>
    textSelection ? surfaceTextContextCommandIds() : contextCommandIds(target.kind);
  const control = createDocumentContextMenu({
    document: options.root.ownerDocument,
    targets: [options.root],
    commandIds: [...CONTEXT_COMMAND_IDS],
    registry: {
      commands: () => {
        const ticket = sequence,
          text = textSelection;
        const target = captured ?? options.getTarget();
        const valid = !captured || current();
        const state = options.getState();
        const rows = commandIds(target).map((id) => {
          const value = actionAvailability(state, id, true);
          return {
            id,
            label: contextCommandLabel(id, target.kind),
            enabled: valid && value.enabled,
            reason: valid ? value.reason : '선택이나 문서가 변경되었습니다. 메뉴를 다시 여세요.',
            pressed: value.pressed === undefined ? undefined : String(value.pressed),
          };
        });
        // 표시 callbacks가 캡처를 무효화했으면 메뉴를 권한 근거로 남기지 않는다.
        if (text && (sequence !== ticket || textSelection !== text || !current()))
          for (const row of rows) {
            row.enabled = false;
            row.reason = '선택이나 문서가 변경되었습니다. 메뉴를 다시 여세요.';
          }
        return rows;
      },
      execute: (id: string) => {
        const ticket = sequence,
          text = textSelection;
        if (
          !captured ||
          !current() ||
          !commandIds(captured).includes(id as ContextCommand) ||
          !actionAvailability(options.getState(), id as ContextCommand, true).enabled
        )
          return;
        try {
          const action = demoCommandAction(id);
          if (!action || (text && (sequence !== ticket || textSelection !== text || !current())))
            return;
          void Promise.resolve(options.execute(action)).catch(options.onError);
        } catch (error) {
          options.onError(error);
        }
      },
      subscribe: (listener: () => void) =>
        options.subscribe(() => {
          // State changes can arrive while the popup is hidden. Do not retain a
          // previous document solely because the menu has not been opened again.
          if (textSelection) current();
          listener();
        }),
    },
  });
  return {
    close() {
      closed = true;
      sequence++;
      textSelection = undefined;
      events.abort();
      control.close();
      captured = undefined;
    },
  };
}
