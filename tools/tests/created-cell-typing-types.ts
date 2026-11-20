import type {
  CreatedCellTypingApi,
  CreatedCellTypingRequest,
  NativeEditOutcome,
} from '../../packages/core/src/index.ts';
import type { createCreatedCellTypingApi } from '../../js/created-cell-typing-api.mjs';
declare const api: CreatedCellTypingApi;
declare const factoryApi: ReturnType<typeof createCreatedCellTypingApi>;
const request: CreatedCellTypingRequest = {
  section: 0,
  identity: '9007199254740993',
  row: 0,
  column: 0,
  startUnit: 4,
  endUnit: 4,
  text: '한😀',
  insertion: {
    character: {
      textColor: 0,
      underline: { kind: 'bottom' },
      strike: { enabled: true },
      fonts: {
        hangul: { name: 'Korean' },
        latin: { id: 0 },
        hanja: { name: 'Hanja' },
        japanese: { name: 'Japanese' },
        other: { name: 'Other' },
        symbol: { name: 'Symbol' },
        user: { name: 'User' },
      },
    },
  },
};
const result: NativeEditOutcome = api.spliceCreatedCell(request);
const same: CreatedCellTypingApi = factoryApi;
const space: 'created-cell-utf16' = api.createdCellTypingCapabilities().coordinateSpace;
void result;
void same;
void space;
// @ts-expect-error Logical u64 identity is never a lossy JS numeric category/paragraph index.
api.spliceCreatedCell({ ...request, identity: 1 });
// @ts-expect-error This port cannot fabricate a source paragraph target.
api.spliceCreatedCell({ ...request, paragraph: 0 });
// @ts-expect-error Paragraph formatting is outside an insertion's character intent.
api.spliceCreatedCell({ ...request, insertion: { paragraph: { alignment: 'center' } } });
api.spliceCreatedCell({
  ...request,
  // @ts-expect-error A font request has one discriminant, never an ID/name mixture.
  insertion: { character: { fonts: { latin: { id: 1, name: 'Mixed' } } } },
});
// @ts-expect-error Completion is immutable evidence, not a retry flag callers can rewrite.
result.application = 'unapplied';
