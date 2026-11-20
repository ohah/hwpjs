import {
  checkedOperationSelector,
  resolveOperationSelector,
  type InlineObjectOperationSelector,
  type CreatedOperationTable,
} from './created-operation-selector.ts';
import {
  checkedChartCreatePayload,
  checkedEquationInsertOptions,
  inlineInsertRecord,
  type ChartCreatePayload,
} from '../../../../js/hwpx-inline-object-insert.mjs';
import { matchInlineObjectObservation } from '../../../../js/hwpx-inline-object-placement.mjs';
import type { EquationInsertOptions } from '../../../core/src/commands/inline-object-insert.ts';
import type { OperationDocument } from '../types/native-document.ts';

interface InlineObjectOperationBase {
  readonly selector: InlineObjectOperationSelector;
  readonly unit: number;
  readonly expectedText: string;
  readonly affinity?: 'forward' | 'backward';
}
export type InlineObjectOperation = InlineObjectOperationBase &
  (
    | { readonly kind: 'chart-create'; readonly payload: ChartCreatePayload }
    | { readonly kind: 'equation-insert'; readonly payload: EquationInsertOptions }
  );
export function isInlineObjectOperation(value: {
  readonly kind: string;
}): value is InlineObjectOperation & { readonly kind: string } {
  return value.kind === 'chart-create' || value.kind === 'equation-insert';
}
const uint = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isSafeInteger(v) &&
  v >= 0 &&
  v <= 0xffffffff &&
  !Object.is(v, -0);
/** Called only after the shared operation capture owns every nested data field. */
export function validateInlineObjectOperation(input: unknown): InlineObjectOperation {
  const keys = [
    'kind',
    'coordinates',
    'selector',
    'unit',
    'expectedText',
    'payload',
    ...(!!input && typeof input === 'object' && Object.hasOwn(input, 'affinity')
      ? ['affinity']
      : []),
  ];
  const value = inlineInsertRecord(input, keys);
  const selector = checkedOperationSelector(value.selector);
  if (
    !uint(value.unit) ||
    typeof value.expectedText !== 'string' ||
    !value.expectedText.isWellFormed() ||
    value.unit > value.expectedText.length
  )
    throw Error('InvalidInlineObjectOperationCaret');
  if (
    value.unit > 0 &&
    value.unit < value.expectedText.length &&
    /[\uD800-\uDBFF]/.test(value.expectedText[value.unit - 1]) &&
    /[\uDC00-\uDFFF]/.test(value.expectedText[value.unit])
  )
    throw Error('InvalidScalarBoundary');
  if (
    Object.hasOwn(value, 'affinity') &&
    value.affinity !== 'forward' &&
    value.affinity !== 'backward'
  )
    throw Error('InvalidInlineObjectOperationAffinity');
  const common = {
    selector,
    unit: value.unit,
    expectedText: value.expectedText,
    ...(Object.hasOwn(value, 'affinity')
      ? { affinity: value.affinity as 'forward' | 'backward' }
      : {}),
  };
  if (value.kind === 'chart-create')
    return { kind: value.kind, ...common, payload: checkedChartCreatePayload(value.payload) };
  if (value.kind === 'equation-insert')
    return { kind: value.kind, ...common, payload: checkedEquationInsertOptions(value.payload) };
  throw Error('InvalidInlineObjectOperationKind');
}
export function requireInlineObjectOperation(
  document: OperationDocument,
  operation: InlineObjectOperation,
): asserts document is Extract<OperationDocument, { format: 'hwpx' }> {
  if (document.format !== 'hwpx') throw Error('Hwp5InlineObjectCreationUnavailable');
  const sdk = document.sdk;
  if (
    typeof sdk.inlineObjectPlacementVersion !== 'function' ||
    sdk.inlineObjectPlacementVersion() !== 1 ||
    typeof sdk.inlineObjectOwner !== 'function'
  )
    throw Error('InlineObjectPlacementUnavailable');
  if (operation.kind === 'chart-create') {
    if (
      typeof sdk.supportsChartCreationAbi !== 'function' ||
      !sdk.supportsChartCreationAbi() ||
      typeof sdk.createChart !== 'function'
    )
      throw Error('ChartCreationUnavailable');
    if (
      operation.payload.chart &&
      (typeof sdk.chartCreateProfileVersion !== 'function' || sdk.chartCreateProfileVersion() !== 1)
    )
      throw Error('ChartCreateProfileUnavailable');
  } else if (
    typeof sdk.supportsEquationInsertionAbi !== 'function' ||
    !sdk.supportsEquationInsertionAbi() ||
    typeof sdk.insertEquation !== 'function'
  )
    throw Error('EquationInsertionUnavailable');
}
/** Query and dispatch are synchronous: never yield with a borrowed owner proof. */
export function applyInlineObjectOperation(
  document: OperationDocument,
  operation: InlineObjectOperation,
  tables: ReadonlyMap<number, CreatedOperationTable>,
): void {
  requireInlineObjectOperation(document, operation);
  const selector = resolveOperationSelector(operation.selector, tables);
  const observed = matchInlineObjectObservation(selector, document.sdk.inlineObjectOwner(selector));
  if (observed.expected_text !== operation.expectedText)
    throw Error('OperationTextPreconditionFailed');
  const affinity = Object.hasOwn(operation, 'affinity') ? { affinity: operation.affinity } : {};
  // Native owns current-source digest, physical transfer, binding recheck and the
  // single document Edge. No serialized/source/UI target is synthesized here.
  const result =
    operation.kind === 'chart-create'
      ? document.sdk.createChart({
          target: {
            section: observed.section,
            ...(Object.hasOwn(observed, 'paragraph') ? { paragraph: observed.paragraph } : {}),
            owner: observed.owner,
            unit: operation.unit,
            expected_text: observed.expected_text,
            ...affinity,
          },
          ...operation.payload,
        })
      : document.sdk.insertEquation({
          section: observed.section,
          ...(Object.hasOwn(observed, 'paragraph') ? { paragraph: observed.paragraph } : {}),
          owner: observed.owner,
          start: operation.unit,
          expectedText: observed.expected_text,
          ...affinity,
          ...operation.payload,
        });
  if (
    result.application !== 'applied' ||
    result.changed !== true ||
    result.error ||
    result.cleanupError ||
    result.refreshRequired
  )
    throw Error(result.error || result.cleanupError || 'InlineObjectCreationNotCommitted');
}
