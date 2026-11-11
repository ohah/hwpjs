// @ts-ignore Existing display enum owns the alignment names, not Native ordinals.
import { paragraphAlignments } from '../../../web/preview/paragraph-alignments.mjs';
import type { ActionAvailability, DemoCommand } from './shell-contract.ts';

// UI intent metadata, not claims about Native implementation. A bridge owns
// current capability and must revalidate its target at dispatch.
const entry = (label: string, category: string, selection = false, document = true) =>
  Object.freeze({ label, category, selection, document });
const alignmentLabel = (key: 'DISTRIBUTE' | 'DISTRIBUTE_SPACE'): string => {
  const found = (paragraphAlignments as readonly { key: string; label: string }[]).find(
    (value) => value.key === key,
  );
  if (!found) throw Error('UnknownParagraphAlignment');
  return found.label;
};
export const DEMO_COMMAND_REGISTRY = Object.freeze({
  'new-document': entry('새 문서', '문서', false, false),
  save: entry('저장', '문서'),
  'print-preview': entry('인쇄 미리보기', '문서'),
  'insert-document': entry('HWPX 문서 끼워 넣기', '문서', true),
  'block-selection': entry('블록 설정', '편집'),
  'table-cell-block': entry('셀 블록 설정', '표'),
  'table-cell-block-extend': entry('셀 블록 확장', '표'),
  'table-cell-split': entry('셀 나누기', '표'),
  'table-cell-merge': entry('셀 합치기', '표'),
  'table-cell-width-equal': entry('셀 너비를 같게', '표'),
  'table-cell-height-equal': entry('셀 높이를 같게', '표'),
  undo: entry('실행 취소', '편집'),
  redo: entry('다시 실행', '편집'),
  cut: entry('잘라내기', '클립보드', true),
  copy: entry('복사', '클립보드', true),
  paste: entry('붙여넣기', '클립보드', true),
  find: entry('찾기', '검색'),
  replace: entry('바꾸기', '검색'),
  'format-copy': entry('서식 복사', '서식', true),
  'insert-shape': entry('도형', '삽입', true),
  'insert-image': entry('그림', '삽입', true),
  'insert-table': entry('표', '삽입', true),
  'generated-table-insert-row': entry('아래에 행 삽입', '표', true),
  'generated-table-delete-row': entry('선택 행 삭제', '표', true),
  'generated-table-insert-column': entry('오른쪽에 열 삽입', '표', true),
  'generated-table-delete-column': entry('선택 열 삭제', '표', true),
  'table-cell-properties': entry('표/셀 속성', '표', true),
  'table-cell-appearance': entry('셀 테두리/배경', '표', true),
  'table-cell-background': entry('셀 배경', '표', true),
  'table-cell-border': entry('셀 테두리', '표', true),
  'insert-chart': entry('차트', '삽입', true),
  'insert-footnote': entry('각주', '삽입', true),
  'insert-endnote': entry('미주', '삽입', true),
  'insert-link': entry('링크', '삽입', true),
  'insert-symbol': entry('기호', '삽입', true),
  'character-properties': entry('글자 속성', '서식', true),
  'paragraph-properties': entry('문단 속성', '서식', true),
  'paragraph-bullets': entry('글머리표 적용/해제', '서식', true),
  'object-properties': entry('개체 속성', '서식'),
  'insert-header': entry('머리말', '삽입'),
  'insert-footer': entry('꼬리말', '삽입'),
  'toggle-paragraph-marks': entry('문단 부호', '보기'),
  'toggle-marks': entry('조판 부호', '보기'),
  'toggle-grid': entry('격자', '보기'),
  'toggle-transparent-lines': entry('투명 선', '보기'),
  'insert-comment': entry('주석', '삽입', true),
  'word-count': entry('문서 통계', '문서'),
  bold: entry('굵게', '서식', true),
  italic: entry('기울임', '서식', true),
  underline: entry('밑줄', '서식', true),
  strike: entry('취소선', '서식', true),
  'text-color': entry('글자 색', '서식', true),
  'font-name': entry('언어별 글꼴', '서식', true),
  'align-left': entry('왼쪽 정렬', '서식', true),
  'align-center': entry('가운데 정렬', '서식', true),
  'align-right': entry('오른쪽 정렬', '서식', true),
  'align-justify': entry('양쪽 정렬', '서식', true),
  'align-distribute': entry(alignmentLabel('DISTRIBUTE'), '서식', true),
  'align-distribute-space': entry(alignmentLabel('DISTRIBUTE_SPACE'), '서식', true),
  'zoom-in': entry('확대', '보기', false, false),
  'zoom-out': entry('축소', '보기', false, false),
  'set-font-size': entry('글자 크기', '서식', true),
  'set-zoom': entry('확대·축소', '보기', false, false),
} satisfies Record<DemoCommand, ReturnType<typeof entry>>);
export const DEMO_COMMANDS = Object.freeze(Object.keys(DEMO_COMMAND_REGISTRY) as DemoCommand[]);
export type CommandSupportKind =
  | 'available'
  | 'disposed'
  | 'busy'
  | 'loading'
  | 'no-document'
  | 'missing-selection'
  | 'unconnected'
  | 'unimplemented'
  | 'unavailable';
export interface CommandSupport extends ActionAvailability {
  readonly kind: CommandSupportKind;
}
export interface CommandSupportContext {
  readonly document?: 'none' | 'loading' | 'ready' | 'error';
  /** Undefined means unknown, not an absent selection. A caret counts as a selection target. */
  readonly hasSelection?: boolean;
  readonly busy?: boolean;
  readonly disposed?: boolean;
}
export interface CommandSupportInput extends CommandSupportContext {
  readonly connected: boolean;
  readonly availability?: ActionAvailability;
  /** Only a verified engine limitation may be labelled unimplemented. */
  readonly confirmedUnimplemented?: { readonly reason: string; readonly evidence: string };
}
export const UNCONNECTED_COMMAND_REASON = '데모 UI에 아직 연결되지 않았습니다';
export function resolveCommandSupport(
  command: DemoCommand,
  input: CommandSupportInput,
): CommandSupport {
  const deny = (kind: CommandSupportKind, reason: string): CommandSupport => ({
    enabled: false,
    kind,
    reason,
    pressed: input.availability?.pressed,
  });
  if (input.disposed) return deny('disposed', '종료된 데모입니다. 다시 열어주세요.');
  if (input.document === 'loading') return deny('loading', '문서를 불러오는 중입니다.');
  if (input.busy) return deny('busy', '진행 중인 작업이 끝난 뒤 사용하세요.');
  const definition = DEMO_COMMAND_REGISTRY[command];
  if (definition.document && (input.document === 'none' || input.document === 'error'))
    return deny('no-document', '문서를 먼저 열어주세요.');
  const proof = input.confirmedUnimplemented;
  if (proof?.reason.trim() && proof.evidence.trim()) return deny('unimplemented', proof.reason);
  if (!input.connected) return deny('unconnected', UNCONNECTED_COMMAND_REASON);
  const surfaceSelection =
    [
      'generated-table-insert-row',
      'generated-table-delete-row',
      'generated-table-insert-column',
      'generated-table-delete-column',
      'copy',
      'cut',
      'underline',
      'strike',
      'bold',
      'italic',
      'set-font-size',
      'text-color',
      'font-name',
      'align-left',
      'align-center',
      'align-right',
      'align-justify',
      'align-distribute',
      'align-distribute-space',
    ].includes(command) &&
    input.availability?.enabled === true &&
    input.availability.surfaceSelection === true;
  if (definition.selection && input.hasSelection === false && !surfaceSelection)
    return deny('missing-selection', '편집 위치나 대상을 먼저 선택해주세요.');
  if (input.availability?.enabled === true) return { ...input.availability, kind: 'available' };
  return deny(
    'unavailable',
    input.availability?.reason?.trim() || '명령의 실행 가능 상태가 아직 제공되지 않았습니다.',
  );
}
export interface CommandSupportActionsInput extends CommandSupportContext {
  readonly connectedCommands: ReadonlySet<DemoCommand>;
  readonly availability?: Readonly<Partial<Record<DemoCommand, ActionAvailability>>>;
}
export function commandSupportActions(
  input: CommandSupportActionsInput,
): Readonly<Record<DemoCommand, CommandSupport>> {
  return Object.fromEntries(
    DEMO_COMMANDS.map((command) => [
      command,
      resolveCommandSupport(command, {
        ...input,
        connected: input.connectedCommands.has(command),
        availability: input.availability?.[command],
      }),
    ]),
  ) as Record<DemoCommand, CommandSupport>;
}
/** Static UI wiring gaps only; never inferred from a document/selection denial. */
export function unsupportedCommandCategories(connectedCommands: ReadonlySet<DemoCommand>) {
  const groups = new Map<string, { command: DemoCommand; label: string; reason: string }[]>();
  for (const command of DEMO_COMMANDS) {
    if (connectedCommands.has(command)) continue;
    const { category, label } = DEMO_COMMAND_REGISTRY[command];
    const items = groups.get(category) ?? [];
    items.push({ command, label, reason: UNCONNECTED_COMMAND_REASON });
    groups.set(category, items);
  }
  return Array.from(groups, ([category, commands]) => ({ category, commands }));
}

/** 선택 종류는 검증된 공개 관측값이며 명령 실행 권한을 새로 만들지 않습니다. */
export type ContextTargetKind =
  | 'body'
  | 'table-cell'
  | 'generated-table-cell'
  | 'source-table-cell'
  | 'picture'
  | 'none';
export type ContextCommand = Exclude<DemoCommand, 'set-font-size' | 'set-zoom'>;
const documentContextCommands: readonly ContextCommand[] = Object.freeze([
  'undo',
  'redo',
  'find',
  'replace',
  'word-count',
  'zoom-in',
  'zoom-out',
]);
const textContextCommands: readonly ContextCommand[] = Object.freeze([
  'cut',
  'copy',
  'paste',
  'bold',
  'italic',
  'underline',
  'strike',
  'character-properties',
  'paragraph-properties',
  'text-color',
  'font-name',
  'align-left',
  'align-center',
  'align-right',
  'align-justify',
  'align-distribute',
  'align-distribute-space',
]);
const editableContextCommands: readonly ContextCommand[] = Object.freeze([
  ...documentContextCommands,
  ...textContextCommands,
]);
const tableCellContextCommands: readonly ContextCommand[] = Object.freeze([
  ...editableContextCommands,
  'table-cell-block',
  'table-cell-properties',
  'table-cell-appearance',
  'table-cell-merge',
  'table-cell-split',
  'table-cell-width-equal',
  'table-cell-height-equal',
]);
const generatedTableContextCommands: readonly ContextCommand[] = Object.freeze([
  ...documentContextCommands,
  'table-cell-block',
  'generated-table-insert-row',
  'generated-table-delete-row',
  'generated-table-insert-column',
  'generated-table-delete-column',
]);
const sourceTableContextCommands: readonly ContextCommand[] = Object.freeze([
  ...tableCellContextCommands,
  'generated-table-insert-row',
  'generated-table-delete-row',
  'generated-table-insert-column',
  'generated-table-delete-column',
]);
const pictureContextCommands: readonly ContextCommand[] = Object.freeze([
  ...documentContextCommands,
  'object-properties',
]);
export const CONTEXT_COMMAND_IDS: readonly ContextCommand[] = Object.freeze([
  ...tableCellContextCommands,
  'generated-table-insert-row',
  'generated-table-delete-row',
  'generated-table-insert-column',
  'generated-table-delete-column',
  'object-properties',
]);
/** 목록은 표시 범위만 정하며 실행 시 기존 가용성·대상 검증을 유지합니다. */
export function contextCommandIds(kind: ContextTargetKind): readonly ContextCommand[] {
  if (kind === 'generated-table-cell') return generatedTableContextCommands;
  if (kind === 'source-table-cell') return sourceTableContextCommands;
  if (kind === 'table-cell') return tableCellContextCommands;
  if (kind === 'picture') return pictureContextCommands;
  return kind === 'body' ? editableContextCommands : documentContextCommands;
}
export function contextCommandLabel(command: ContextCommand, kind: ContextTargetKind): string {
  if (kind === 'table-cell' || kind === 'source-table-cell') {
    if (command === 'character-properties') return '셀 글자 속성';
    if (command === 'paragraph-properties') return '셀 문단 속성';
  }
  return DEMO_COMMAND_REGISTRY[command].label;
}

/** Surface가 소유한 여러 문단 선택의 표시 목록. body/cell owner로 재분류하지 않는다. */
export function surfaceTextContextCommandIds(): readonly ContextCommand[] {
  return editableContextCommands;
}
