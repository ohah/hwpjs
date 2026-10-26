import type { ActionAvailability, DemoCommand } from './shell-contract.ts';

// UI intent metadata, not claims about Native implementation. A bridge owns
// current capability and must revalidate its target at dispatch.
const entry = (label: string, category: string, selection = false, document = true) =>
  Object.freeze({ label, category, selection, document });
export const DEMO_COMMAND_REGISTRY = Object.freeze({
  save: entry('저장', '문서'),
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
  'insert-chart': entry('차트', '삽입', true),
  'insert-footnote': entry('각주', '삽입', true),
  'insert-endnote': entry('미주', '삽입', true),
  'insert-link': entry('링크', '삽입', true),
  'insert-symbol': entry('기호', '삽입', true),
  'character-properties': entry('글자 속성', '서식', true),
  'paragraph-properties': entry('문단 속성', '서식', true),
  'object-properties': entry('개체 속성', '서식', true),
  'insert-header': entry('머리말', '삽입'),
  'insert-footer': entry('꼬리말', '삽입'),
  'toggle-paragraph-marks': entry('문단 부호', '보기'),
  'toggle-marks': entry('조판 부호', '보기'),
  'toggle-grid': entry('격자', '보기'),
  'insert-comment': entry('주석', '삽입', true),
  'word-count': entry('문서 통계', '문서'),
  bold: entry('굵게', '서식', true),
  italic: entry('기울임', '서식', true),
  underline: entry('밑줄', '서식', true),
  strike: entry('취소선', '서식', true),
  'align-left': entry('왼쪽 정렬', '서식', true),
  'align-center': entry('가운데 정렬', '서식', true),
  'align-right': entry('오른쪽 정렬', '서식', true),
  'align-justify': entry('양쪽 정렬', '서식', true),
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
  if (definition.selection && input.hasSelection === false)
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
