import type { CreatedCellTypingRequest } from '../../../core/src/commands/created-cell-typing-dto.ts';
import { validateCharacterFormattingPatch } from '../../../core/src/commands/character-formatting-patch.ts';
import { inlineInsertRecord } from '../../../../js/hwpx-inline-object-insert.mjs';
import { isUtf16Boundary } from '../../../../web/preview/utf16-boundary.mjs';
import {
  observeCreatedCellTextTarget,
  prepareCreatedCellTypingTarget,
} from '../../../../web/preview/created-cell-typing-admission.mjs';
import {
  checkedOperationSelector,
  resolveOperationSelector,
  type InlineObjectOperationSelector,
  type CreatedOperationTable,
} from './created-operation-selector.ts';
import type { OperationDocument } from '../types/native-document.ts';
export interface CreatedCellSpliceOperation {
  readonly kind: 'created-cell-splice';
  readonly selector: Extract<
    InlineObjectOperationSelector,
    { created_cell: { operation: number } }
  >;
  readonly startUnit: number;
  readonly endUnit: number;
  readonly expectedText: string;
  readonly text: string;
  readonly insertion?: CreatedCellTypingRequest['insertion'];
}
export function isCreatedCellSpliceOperation(value: {
  kind: string;
}): value is CreatedCellSpliceOperation {
  return value.kind === 'created-cell-splice';
}
const uint = (n: unknown): n is number =>
  typeof n === 'number' &&
  Number.isSafeInteger(n) &&
  n >= 0 &&
  n <= 0xffffffff &&
  !Object.is(n, -0);
export function validateCreatedCellSpliceOperation(input: unknown): void {
  const optional = input && typeof input === 'object' && Object.hasOwn(input, 'insertion');
  const value = inlineInsertRecord(input, [
    'kind',
    'coordinates',
    'selector',
    'startUnit',
    'endUnit',
    'expectedText',
    'text',
    ...(optional ? ['insertion'] : []),
  ]);
  const selector = checkedOperationSelector(value.selector);
  if (!selector.created_cell || !('operation' in selector.created_cell))
    throw Error('CreatedTableOperationReferenceRequired');
  if (!uint(value.startUnit) || !uint(value.endUnit) || value.endUnit < value.startUnit)
    throw Error('InvalidTextPosition');
  for (const text of [value.text, value.expectedText]) {
    if (typeof text !== 'string' || !text.isWellFormed()) throw Error('InvalidUnicodeEncoding');
    // LF는 정식 rich 셀 입력 경로에서만 허용하며 초기 cellTexts 정책은 바꾸지 않습니다.
    for (let i = 0; i < text.length; i++) {
      const unit = text.charCodeAt(i);
      if ((unit < 0x20 && unit !== 0x0a) || unit === 0x7f)
        throw Error('InvalidCreatedCellTextControl');
    }
  }
  const text = value.expectedText as string;
  if (
    value.endUnit > text.length ||
    !isUtf16Boundary(text, value.startUnit) ||
    !isUtf16Boundary(text, value.endUnit)
  )
    throw Error('InvalidScalarBoundary');
  if (optional) {
    const insertion = inlineInsertRecord(
      value.insertion,
      Object.hasOwn(value.insertion as object, 'character') ? ['character'] : [],
    );
    if (Object.hasOwn(insertion, 'character'))
      validateCharacterFormattingPatch(insertion.character);
  }
}
export function requireCreatedCellSpliceStatic(document: OperationDocument): void {
  const sdk = document.sdk;
  if (
    typeof sdk.historyV2Available !== 'function' ||
    sdk.historyV2Available() !== true ||
    typeof sdk.enableHistoryV2 !== 'function'
  )
    throw Error('HistoryV2AbiUnavailable');
  if (
    typeof sdk.supportsCreatedCellTypingAbi !== 'function' ||
    sdk.supportsCreatedCellTypingAbi() !== true ||
    typeof sdk.spliceCreatedCell !== 'function' ||
    typeof sdk.createdTables !== 'function' ||
    typeof sdk.historyRevision !== 'function' ||
    typeof sdk.createdCellTypingCapabilities !== 'function'
  )
    throw Error('CreatedCellTypingUnavailable');
  if (
    document.format === 'hwp5' &&
    (typeof document.sdk.currentReferences !== 'function' ||
      typeof document.sdk.currentText !== 'function')
  )
    throw Error('InvalidCurrentReferenceScope');
}
// 정적 ABI 입장 검사와 달리 현재 capabilities는 관리 이력을 활성화한 뒤에만 조회합니다.
export function requireCreatedCellSplice(document: OperationDocument): void {
  requireCreatedCellSpliceStatic(document);
  const sdk = document.sdk;
  const cap = sdk.createdCellTypingCapabilities();
  if (
    cap.schemaVersion !== 1 ||
    cap.atomic !== true ||
    cap.format !== document.format ||
    cap.coordinateSpace !== 'created-cell-utf16' ||
    cap.requiresHistoryProtocol !== 2 ||
    typeof cap.binding?.session !== 'string' ||
    !cap.binding.session ||
    !uint(cap.binding.revision) ||
    cap.binding.revision !== sdk.historyRevision()
  )
    throw Error('StaleCreatedCellTypingBinding');
}
export function applyCreatedCellSpliceOperation(
  document: OperationDocument,
  operation: CreatedCellSpliceOperation,
  tables: ReadonlyMap<number, CreatedOperationTable>,
): void {
  requireCreatedCellSplice(document);
  const resolved = resolveOperationSelector(operation.selector, tables);
  const cell = resolved.created_cell;
  if (!cell) throw Error('CreatedTableOperationReferenceRequired');
  const selector = {
    section: resolved.section,
    identity: cell.identity,
    row: cell.row,
    column: cell.column,
  };
  // 독립 CLI 세션에는 Surface scope가 없습니다. 이 호출의 조회·검증에만 같은 지역 표식을 사용합니다.
  const scope = 0;
  const observed = observeCreatedCellTextTarget({
    editor: document.sdk,
    format: document.format,
    selector,
    scope,
  });
  if (observed.text !== operation.expectedText) throw Error('OperationTextPreconditionFailed');
  const request: CreatedCellTypingRequest = prepareCreatedCellTypingTarget({
    editor: document.sdk,
    format: document.format,
    scope,
    message: {
      ...selector,
      startUnit: operation.startUnit,
      endUnit: operation.endUnit,
      text: operation.text,
      insertion: operation.insertion,
      expectedText: operation.expectedText,
      headlessBinding: observed.binding,
      reference: observed.reference,
      createdCellTypingScope: scope,
      expectedHistoryRevision: observed.binding.revision,
    },
  });
  const result = document.sdk.spliceCreatedCell(request);
  if (
    result.error ||
    result.cleanupError ||
    result.refreshRequired ||
    !(
      (result.application === 'applied' && result.changed === true) ||
      (result.nativeCode === 2 && result.application === 'unapplied' && result.changed === false)
    )
  )
    throw Error(result.error || result.cleanupError || 'CreatedCellSpliceNotCommitted');
}
