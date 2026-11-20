import type { DocumentOperation } from '../src/document-operations.ts';
import type { OperationDocument } from '../src/types/native-document.ts';
import type { CreatedCellTypingRequest } from '../../core/src/commands/created-cell-typing-dto.ts';
const operation = {
  kind: 'created-cell-splice',
  coordinates: 'current-transaction',
  selector: { section: 0, created_cell: { operation: 0, row: 0, column: 0 } },
  startUnit: 0,
  endUnit: 0,
  expectedText: '',
  text: '앞😀\n뒤',
  insertion: { character: { bold: true, fonts: { hangul: { name: '함초롬바탕' } } } },
} as const satisfies DocumentOperation;
const invalidCoordinates: DocumentOperation = {
  ...operation,
  // @ts-expect-error 원본 좌표공간으로 새 셀 명령을 우회할 수 없습니다.
  coordinates: 'source',
};
const invalidSelector: DocumentOperation = {
  ...operation,
  // @ts-expect-error Native receipt 대신 호출자가 identity를 지정할 수 없습니다.
  selector: { section: 0, created_cell: { identity: '1', row: 0, column: 0 } },
};
const invalidStyle: DocumentOperation = {
  ...operation,
  // @ts-expect-error 글꼴의 이름과 리소스 ID는 동시에 지정할 수 없습니다.
  insertion: { character: { fonts: { latin: { id: 1, name: 'Own Font' } } } },
};
function dispatch(document: OperationDocument, request: CreatedCellTypingRequest) {
  return document.sdk.spliceCreatedCell(request);
}
void [invalidCoordinates, invalidSelector, invalidStyle, dispatch];
