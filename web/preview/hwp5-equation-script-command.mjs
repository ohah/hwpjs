import { ownPageRecord } from '../../js/page-settings-edit.mjs';
import { checkedHwp5EquationScript } from '../../js/hwp5-equation-script-edit.mjs';
const uint = (v) => Number.isSafeInteger(v) && v >= 0 && v < 0xffffffff && !Object.is(v, -0);
function message(input, required) {
  const keys = Reflect.ownKeys(input);
  if (
    keys.some((k) => ![...required, 'origin', 'requestId'].includes(k)) ||
    required.some((k) => !Object.hasOwn(input, k))
  )
    throw Error('InvalidHwp5EquationScriptRequest');
  return ownPageRecord(input, keys);
}
/** One Worker capture slot. No Native lease ID/witness crosses this closure. */
export function createHwp5EquationScriptCommands(getEditor, writable) {
  let active = null,
    sequence = 0;
  function discard() {
    const previous = active;
    active = null;
    if (!previous) return false;
    try {
      return previous.editor.discardHwp5EquationScript(previous.capture) === true;
    } catch {
      return false;
    }
  }
  function backend() {
    const editor = getEditor();
    if (
      !writable() ||
      !editor ||
      editor.historyStats?.()?.protocolVersion !== 2 ||
      ![
        'supportsHwp5EquationScriptEditAbi',
        'captureHwp5EquationScript',
        'isHwp5EquationScriptCurrent',
        'editHwp5EquationScript',
        'discardHwp5EquationScript',
      ].every((key) => typeof editor[key] === 'function') ||
      editor.supportsHwp5EquationScriptEditAbi() !== true
    )
      throw Error('Hwp5EquationScriptEditUnavailable');
    return editor;
  }
  return {
    reset: discard,
    capture(input) {
      discard(); // A failed new attempt also retires the old Worker/SDK capture.
      const v = message(input, ['kind', 'section', 'equationNode', 'layout']);
      if (
        v.kind !== 'hwp5-equation-script-capture' ||
        !uint(v.section) ||
        !uint(v.equationNode) ||
        !['version-only', 'with-font'].includes(v.layout)
      )
        throw Error('InvalidHwp5EquationScriptSelector');
      const editor = backend(),
        capture = editor.captureHwp5EquationScript(v.section, v.equationNode, v.layout);
      if (
        capture.section !== v.section ||
        capture.equationNode !== v.equationNode ||
        capture.layout !== v.layout ||
        !Number.isSafeInteger(capture.historyRevision) ||
        capture.historyRevision < 0 ||
        typeof capture.script !== 'string' ||
        !Object.isFrozen(capture) ||
        editor !== getEditor() ||
        editor.isHwp5EquationScriptCurrent(capture) !== true
      ) {
        editor.discardHwp5EquationScript(capture);
        throw Error('InvalidHwp5EquationScriptCapture');
      }
      const leaseKey = `eq-${++sequence}`;
      active = { editor, capture, leaseKey };
      return {
        section: capture.section,
        equationNode: capture.equationNode,
        layout: capture.layout,
        script: capture.script,
        historyRevision: capture.historyRevision,
        leaseKey,
      };
    },
    edit(input) {
      const v = message(input, ['kind', 'leaseKey', 'script']);
      if (v.kind !== 'hwp5-equation-script-edit' || typeof v.leaseKey !== 'string')
        throw Error('InvalidHwp5EquationScriptRequest');
      const script = checkedHwp5EquationScript(v.script),
        editor = backend(),
        owned = active;
      if (
        !owned ||
        owned.editor !== editor ||
        owned.leaseKey !== v.leaseKey ||
        editor.isHwp5EquationScriptCurrent(owned.capture) !== true
      )
        throw Error('StaleHwp5EquationScriptCapture');
      active = null;
      // Advisory checks are over. Native consumes and validates its retained owner/epoch.
      return editor.editHwp5EquationScript(owned.capture, script);
    },
    close(input) {
      const v = message(input, ['kind', 'leaseKey']);
      if (v.kind !== 'hwp5-equation-script-close' || typeof v.leaseKey !== 'string')
        throw Error('InvalidHwp5EquationScriptRequest');
      if (!active || active.leaseKey !== v.leaseKey) return false;
      return discard(); // Never discard another, newer capture.
    },
  };
}
