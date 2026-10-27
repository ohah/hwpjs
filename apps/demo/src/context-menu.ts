import { getSelectionFormatting, type HeadlessEditor } from '@hwpjs/core';
import type { DemoAction, DemoShellState } from './shell-contract.ts';
import {
  CONTEXT_COMMAND_IDS,
  contextCommandIds,
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
  execute: (action: DemoAction) => void | Promise<void>;
  subscribe: (listener: () => void) => () => void;
  onError: (error: unknown) => void;
}) {
  let captured: ContextTarget | undefined;
  const events = new AbortController();
  const capture = () => {
    captured = options.getTarget();
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
    const value = options.getTarget();
    return captured && value.key === captured.key && value.kind === captured.kind;
  };
  const control = createDocumentContextMenu({
    document: options.root.ownerDocument,
    targets: [options.root],
    commandIds: [...CONTEXT_COMMAND_IDS],
    registry: {
      commands: () => {
        const target = captured ?? options.getTarget();
        const valid = !captured || current();
        const state = options.getState();
        return contextCommandIds(target.kind).map((id) => {
          const value = actionAvailability(state, id, true);
          return {
            id,
            label: contextCommandLabel(id, target.kind),
            enabled: valid && value.enabled,
            reason: valid ? value.reason : '선택이나 문서가 변경되었습니다. 메뉴를 다시 여세요.',
            pressed: value.pressed === undefined ? undefined : String(value.pressed),
          };
        });
      },
      execute: (id: string) => {
        if (
          !captured ||
          !current() ||
          !contextCommandIds(captured.kind).includes(id as ContextCommand) ||
          !actionAvailability(options.getState(), id as ContextCommand, true).enabled
        )
          return;
        try {
          void Promise.resolve(options.execute({ command: id as ContextCommand })).catch(
            options.onError,
          );
        } catch (error) {
          options.onError(error);
        }
      },
      subscribe: options.subscribe,
    },
  });
  return {
    close() {
      events.abort();
      control.close();
      captured = undefined;
    },
  };
}
