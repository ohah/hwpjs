import { parseObjectReference } from '../object-reference.ts';
import {
  readFormInventory,
  resolveFormReference,
  sdkMethod,
  formWriterCapabilities,
  type FormControl,
} from '../document-forms.ts';
import type { OperationDocument } from '../types/native-document.ts';
import type { DocumentOperation } from './validate.ts';
export type FormStateOperation =
  | {
      readonly kind: 'form-checkbox-state';
      readonly reference: string;
      readonly expectedState: 'UNCHECKED' | 'CHECKED' | 'INDETERMINATE';
      readonly state: 'UNCHECKED' | 'CHECKED' | 'INDETERMINATE';
    }
  | {
      readonly kind: 'form-radio-select';
      readonly reference: string;
      readonly expectedState: 'UNCHECKED' | 'CHECKED';
      readonly expectedGroupName: string;
    }
  | {
      readonly kind: 'form-text';
      readonly reference: string;
      readonly expectedText: string;
      readonly text: string;
    };
export interface FormStateResult {
  operation: number;
  kind: FormStateOperation['kind'];
  reference: string;
  changed: boolean;
  before: unknown;
  after: unknown;
  affected: unknown[];
}
export const isFormOperation = (
  operation: DocumentOperation,
): operation is DocumentOperation & FormStateOperation =>
  ['form-checkbox-state', 'form-radio-select', 'form-text'].includes(operation.kind);
export function requireFormOperation(document: OperationDocument, operation: FormStateOperation) {
  const cap = formWriterCapabilities(document),
    key =
      operation.kind === 'form-checkbox-state'
        ? 'checkbox'
        : operation.kind === 'form-radio-select'
          ? 'radio'
          : 'text';
  if (cap[key] !== true) throw new Error('FormWriterAbiUnavailable:' + operation.kind);
  if (document.sdk.supportsSourceTableCellSplit?.() !== true)
    throw new Error('FormLifetimeBindingAbiUnavailable');
}
function precondition(form: FormControl, operation: FormStateOperation) {
  if (form.ownership !== 'located') throw new Error('UnsupportedFormSourceOwner');
  if (
    form.permissions.enabled.state !== 'known' ||
    form.permissions.enabled.value !== true ||
    form.permissions.editable.state !== 'known' ||
    form.permissions.editable.value !== true
  )
    throw new Error('FormNotEditable');
  if (operation.kind === 'form-text') {
    if (!['edit', 'edit_box', 'combo_box'].includes(form.kind))
      throw new Error('UnsupportedFormTextKind');
    if (
      ['edit', 'edit_box'].includes(form.kind) &&
      (form.permissions.readOnly.state !== 'known' || form.permissions.readOnly.value !== false)
    )
      throw new Error('FormReadOnlyOrUnknown');
    if (
      form.kind === 'combo_box' &&
      (form.permissions.editEnable.state !== 'known' || form.permissions.editEnable.value !== true)
    )
      throw new Error('FormEditEnableUnavailable');
    if (form.current.text.state !== 'known' || form.current.text.value !== operation.expectedText)
      throw new Error('FormTextPreconditionFailed');
  } else {
    if (
      !(
        (operation.kind === 'form-checkbox-state' &&
          ['check_box', 'check_button'].includes(form.kind)) ||
        (operation.kind === 'form-radio-select' && form.kind === 'radio_button')
      )
    )
      throw new Error('UnsupportedFormChoiceKind');
    if (
      form.current.state.state !== 'known' ||
      form.current.state.scope !== 'current' ||
      form.current.state.value !== operation.expectedState
    )
      throw new Error('FormStatePreconditionFailed');
    if (
      operation.kind === 'form-checkbox-state' &&
      operation.state === 'INDETERMINATE' &&
      (form.permissions.triState.state !== 'known' || form.permissions.triState.value !== true)
    )
      throw new Error('FormTriStateUnavailable');
    if (
      operation.kind === 'form-radio-select' &&
      (form.current.groupName.state !== 'known' ||
        form.current.groupName.value !== operation.expectedGroupName)
    )
      throw new Error('FormGroupPreconditionFailed');
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function prepareFormOperations(
  document: OperationDocument,
  operations: readonly DocumentOperation[],
) {
  const selected = operations.filter(isFormOperation),
    plans = new Map<FormStateOperation, Readonly<{ reference: string; fingerprint: string }>>();
  const sdk = document.sdk,
    format = document.format,
    sourceSha256 = document.sourceSha256;
  let binding = selected.length ? Object.freeze({ ...sdk.sourceTableCellSplitBinding() }) : null;
  function scope(current: OperationDocument) {
    if (
      current !== document ||
      current.sdk !== sdk ||
      current.format !== format ||
      current.sourceSha256 !== sourceSha256
    )
      throw new Error('ForeignFormStateTarget');
  }
  function lease(current: OperationDocument) {
    scope(current);
    if (!binding || !same(binding, sdk.sourceTableCellSplitBinding()))
      throw new Error('StaleFormStateReference');
  }
  if (selected.length) {
    for (const op of selected) {
      requireFormOperation(document, op);
      const parsed = parseObjectReference(op.reference, { format, sourceSha256 });
      if (parsed.kind !== 'form' || parsed.section >= document.sectionCount)
        throw new Error('ExpectedFormReference');
    }
    let unsafe = false;
    for (const op of operations) {
      if (isFormOperation(op)) {
        if (unsafe) throw new Error('StaleFormStateReference');
      } else unsafe = true;
    }
    const inventory = readFormInventory(document);
    if (inventory.status !== 'available') throw new Error(inventory.reason);
    lease(document);
    const indexed = new Map(inventory.forms.map((row) => [row.reference, row]));
    for (const op of selected) {
      const row = indexed.get(op.reference);
      if (!row) throw new Error('FormReferenceNotFound');
      precondition(row, op);
      if (
        op.kind === 'form-radio-select' &&
        row.current.groupName.state === 'known' &&
        row.current.groupName.value === '' &&
        (typeof Reflect.get(sdk, 'supportsUnnamedRadioSelect') !== 'function' ||
          sdkMethod(document, 'supportsUnnamedRadioSelect')() !== true)
      )
        throw new Error('UnnamedRadioSelectAbiUnavailable');
      plans.set(op, Object.freeze({ reference: op.reference, fingerprint: row.fingerprint }));
    }
  }
  return {
    apply(
      current: OperationDocument,
      operation: FormStateOperation,
      index: number,
    ): FormStateResult {
      lease(current);
      requireFormOperation(current, operation);
      const beforeInventory = readFormInventory(current),
        before = resolveFormReference(current, operation.reference, beforeInventory);
      if (
        !plans.has(operation) ||
        plans.get(operation)!.reference !== operation.reference ||
        plans.get(operation)!.fingerprint !== before.fingerprint
      )
        throw new Error('StaleFormSourceFingerprint');
      precondition(before, operation);
      lease(current);
      const { section, node } = before.source;
      // Exact existing SDK methods. Radio group transaction belongs to Native.
      const value =
        operation.kind === 'form-checkbox-state'
          ? sdkMethod(current, 'setCheckBoxState')(section, node, operation.state)
          : operation.kind === 'form-radio-select'
            ? sdkMethod(current, 'selectRadioButton')(section, node)
            : sdkMethod(current, 'setFormText')({ section, formNode: node, text: operation.text });
      if (value !== undefined) throw new Error('InvalidFormWriterResult');
      const afterInventory = readFormInventory(current),
        after = resolveFormReference(current, operation.reference, afterInventory);
      if (after.fingerprint !== before.fingerprint) throw new Error('FormOwnerChangedDuringWrite');
      const actual = operation.kind === 'form-text' ? after.current.text : after.current.state;
      const expected =
        operation.kind === 'form-text'
          ? operation.text
          : operation.kind === 'form-checkbox-state'
            ? operation.state
            : 'CHECKED';
      if (actual.state !== 'known' || actual.value !== expected)
        throw new Error('UnconfirmedFormStateWrite');
      const beforeMap = new Map(beforeInventory.forms.map((row) => [row.reference, row]));
      if (afterInventory.forms.length !== beforeMap.size)
        throw new Error('FormInventoryChangedDuringWrite');
      const affected = afterInventory.forms.flatMap((row) => {
        const old = beforeMap.get(row.reference);
        if (!old || old.fingerprint !== row.fingerprint)
          throw new Error('FormOwnerChangedDuringWrite');
        return !same(old.current, row.current)
          ? [{ reference: row.reference, before: old.current, after: row.current }]
          : [];
      });
      scope(current);
      for (const row of afterInventory.forms) {
        const old = beforeMap.get(row.reference)!;
        const target = row.reference === operation.reference;
        const sameRadioGroup =
          operation.kind === 'form-radio-select' &&
          row.kind === 'radio_button' &&
          row.current.groupName.state === 'known' &&
          row.current.groupName.value === operation.expectedGroupName &&
          (operation.expectedGroupName !== '' || target);
        const allowedState = (operation.kind === 'form-checkbox-state' && target) || sameRadioGroup;
        const allowedText = operation.kind === 'form-text' && target;
        const { state: oldState, text: oldText, ...oldRest } = old.current;
        const { state: newState, text: newText, ...newRest } = row.current;
        if (
          !same(oldRest, newRest) ||
          (!allowedState && !same(oldState, newState)) ||
          (!allowedText && !same(oldText, newText))
        )
          throw new Error('UnexpectedFormStateSideEffect');
        if (
          sameRadioGroup &&
          (newState.state !== 'known' ||
            newState.scope !== 'current' ||
            newState.value !== (target ? 'CHECKED' : 'UNCHECKED'))
        )
          throw new Error('UnconfirmedFormRadioGroup');
      }
      const next = sdk.sourceTableCellSplitBinding();
      const unchanged = same(binding, next);
      if (
        next.session !== binding.session ||
        (!unchanged &&
          !(
            next.revision === binding.revision + 1 &&
            BigInt(next.serial) === BigInt(binding.serial) + 1n
          )) ||
        (affected.length > 0 && unchanged)
      )
        throw new Error('StaleFormStateReference');
      plans.delete(operation);
      binding = Object.freeze({ ...next });
      return {
        operation: index,
        kind: operation.kind,
        reference: operation.reference,
        changed: affected.length > 0,
        before: before.current,
        after: after.current,
        affected,
      };
    },
  };
}
