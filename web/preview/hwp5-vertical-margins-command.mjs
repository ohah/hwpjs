import {
  checkedHwp5VerticalMarginsObservation,
  checkedHwp5VerticalMarginsRequest,
} from '../../js/hwp5-vertical-outer-margins.mjs';
import { checkedHwp5OuterMarginsSelector } from '../../js/hwp5-object-outer-margins.mjs';

const revision = (editor) => {
  const n = editor.historyRevision();
  if (!Number.isInteger(n) || n < 0 || n >= 0xffffffff)
    throw Error('InvalidVerticalMarginsRevision');
  return n;
};
function ready(editor, context) {
  if (context.format !== 'hwp5') return 'Hwp5VerticalMarginsFormatUnsupported';
  if (context.qualified !== true) return 'Hwp5VerticalMarginsUnqualified';
  const stats = editor?.historyStats?.();
  if (context.historyPoisoned || stats?.poisoned === true) throw Error('HistoryMutationUncertain');
  if (!context.historyEnabled || stats?.protocolVersion !== 2) return 'HistoryProtocol2Required';
  if (editor?.supportsVerticalObjectOuterMargins?.() !== true)
    return 'Hwp5VerticalMarginsUnavailable';
  return null;
}
/** Pure internal routing boundary; qualified is supplied only by the backend,
 * never by RuntimeMessage/capability fields. Native remains the final authority. */
export function queryHwp5VerticalMargins(editor, selector, context) {
  const reason = ready(editor, context);
  if (reason) return { verticalMargins: null, reason };
  const selected = checkedHwp5OuterMarginsSelector(selector);
  const before = revision(editor);
  const value = checkedHwp5VerticalMarginsObservation(editor.verticalObjectOuterMargins(selected));
  const w = value.witness;
  if (
    w.selector.section !== selected.section ||
    w.selector.node !== selected.node ||
    w.selector.kind !== selected.kind ||
    w.historyRevision !== before ||
    revision(editor) !== before
  )
    throw Error('Hwp5VerticalMarginsBindingMismatch');
  return { verticalMargins: value };
}
export function commitHwp5VerticalMargins(editor, request, context) {
  const reason = ready(editor, context);
  if (reason) throw Error(reason);
  const value = checkedHwp5VerticalMarginsRequest(request);
  const before = revision(editor);
  if (value.witness.historyRevision !== before) throw Error('StaleHwp5VerticalMarginsRevision');
  // One Native call only. Preserve the observed primitive outcome through all
  // later revision/projection/cleanup failures; never replay this mutation.
  const outcome = editor.setVerticalObjectOuterMargins(value);
  if (!outcome || !['applied', 'unapplied', 'unknown'].includes(outcome.application))
    return { application: 'unknown', changed: null, error: 'InvalidVerticalMarginsOutcome' };
  if (outcome.application === 'unknown') return outcome;
  let after;
  try {
    after = revision(editor);
  } catch (error) {
    return { ...outcome, cleanupError: error?.message || String(error), refreshRequired: true };
  }
  if ((outcome.nativeCode === 2 || outcome.nativeCode === 0) && after !== before)
    return {
      ...outcome,
      application: 'unknown',
      changed: null,
      error: 'VerticalMarginsRejectedRevisionChanged',
      refreshRequired: true,
    };
  if (outcome.application === 'applied' && after === before)
    return {
      ...outcome,
      application: 'unknown',
      changed: null,
      error: 'VerticalMarginsAppliedRevisionMissing',
      refreshRequired: true,
    };
  if (outcome.nativeCode === 0 && !outcome.error)
    return { ...outcome, error: 'VerticalMarginsRejected' };
  return outcome;
}
