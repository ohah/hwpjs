import {
  isFormOperation,
  prepareFormOperations,
  type FormStateResult,
} from './mutations/form-state.ts';
import {
  hasCharacterExtensions,
  prepareCharacterExtensions,
  type CharacterExtensionResult,
} from './mutations/character-extensions.ts';
import { prepareSourceTableCellSplits } from './mutations/source-table-cell-split.ts';
import { validateDocumentOperations } from './mutations/validate.ts';
import { applyOperation, prepareOperationSession } from './mutations/dispatch.ts';
import type { DocumentFormat, OperationDependencies } from './types/native-document.ts';
export { validateDocumentOperations, DOCUMENT_OPERATION_SPECS } from './mutations/validate.ts';
export type { DocumentOperation, DocumentOperationKind } from './mutations/validate.ts';

export interface AppliedOperationIdentity {
  operation: number;
  kind: 'table-insert';
  identity: string;
}
export interface DocumentOperationsResult {
  format: DocumentFormat;
  sourceSha256: string;
  bytes: Uint8Array;
  changed: boolean;
  layoutRequiresReflow: boolean;
  appliedOperations: number;
  operationResults: (AppliedOperationIdentity | CharacterExtensionResult | FormStateResult)[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
// 독립 세션의 모든 명령과 저장 및 종료가 성공한 뒤에만 소유 바이트를 반환합니다.
export async function applyDocumentOperations(
  input: unknown = {},
  dependencies: OperationDependencies = {},
): Promise<DocumentOperationsResult> {
  if (!record(input)) throw new TypeError('InvalidDocumentOperationsInput');
  const { bytes, wasm, expectedSha256, operations, allowStaleLayout = false } = input;
  if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedSha256))
    throw new TypeError('InvalidExpectedSha256');
  if (typeof allowStaleLayout !== 'boolean') throw new TypeError('InvalidAllowStaleLayout');
  const captured = validateDocumentOperations(operations);
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > 64 * 1024 * 1024
  )
    throw new RangeError('OperationInputLimitExceeded');
  if (!(wasm instanceof Uint8Array) || wasm.byteLength === 0 || wasm.byteLength > 64 * 1024 * 1024)
    throw new RangeError('OperationWasmLimitExceeded');
  const original = Uint8Array.from(bytes),
    binary = Uint8Array.from(wasm);
  const open = dependencies.openDocument ?? (await import('./engine.ts')).openDocument;
  const document = await open({ bytes: original, wasm: binary, expectedSha256 });
  let failed = false,
    failure: unknown,
    result: DocumentOperationsResult | undefined;
  try {
    if (document.sourceSha256 !== expectedSha256) throw new Error('SourceSha256Mismatch');
    prepareOperationSession(document, captured);
    // Capture form provenance before the existing asynchronous split admission.
    const forms = prepareFormOperations(document, captured);
    const sourceSplits = await prepareSourceTableCellSplits(document, captured);
    const extensions = prepareCharacterExtensions(document, captured);
    const identities: (AppliedOperationIdentity | CharacterExtensionResult | FormStateResult)[] =
      [];
    for (const [index, operation] of captured.entries()) {
      if (isFormOperation(operation)) {
        identities.push(forms.apply(document, operation, index));
        continue;
      }
      if (hasCharacterExtensions(operation)) {
        identities.push(extensions.apply(document, operation, index));
        extensions.advance(operation);
        continue;
      }
      const identity =
        operation.kind === 'source-table-cell-split'
          ? sourceSplits.apply(document, operation)
          : extensions.runLegacy(operation, () => applyOperation(document, operation));
      if (identity !== null) {
        if (
          typeof identity !== 'string' ||
          !/^[1-9][0-9]{0,19}$/u.test(identity) ||
          BigInt(identity) > 0xffffffffffffffffn
        )
          throw new Error('InvalidCreatedTableIdentity');
        identities.push({ operation: index, kind: 'table-insert', identity });
      }
      extensions.advance(operation);
    }
    const saved: unknown = captured.length ? await document.save({ allowStaleLayout }) : original;
    const hwp5Saved = document.format === 'hwp5' && captured.length !== 0;
    const output: unknown = hwp5Saved && record(saved) ? saved.bytes : saved;
    if (
      !(output instanceof Uint8Array) ||
      output.byteLength === 0 ||
      output.byteLength > 128 * 1024 * 1024
    )
      throw new RangeError('OperationOutputLimitExceeded');
    const reflow: unknown =
      hwp5Saved && record(saved)
        ? saved.layoutRequiresReflow
        : captured.some(
            (operation) =>
              operation.kind === 'source-table-cell-split' || operation.kind === 'page-settings',
          );
    if (typeof reflow !== 'boolean') throw new Error('InvalidOperationLayoutState');
    const owned = Uint8Array.from(output);
    const changed =
      original.length !== owned.length || original.some((byte, index) => byte !== owned[index]);
    result = {
      format: document.format,
      sourceSha256: document.sourceSha256,
      bytes: owned,
      changed,
      layoutRequiresReflow: reflow,
      appliedOperations: captured.length,
      operationResults: identities,
    };
  } catch (error) {
    failed = true;
    failure = error;
  }
  try {
    await document.close();
  } catch (error) {
    if (failed)
      throw new AggregateError([failure, error], 'DocumentOperationsAndCloseFailed', {
        cause: failure,
      });
    throw new Error('DocumentOperationsCloseFailed', { cause: error });
  }
  if (failed) throw failure;
  if (result === undefined) throw new Error('MissingOperationResult');
  return result;
}
