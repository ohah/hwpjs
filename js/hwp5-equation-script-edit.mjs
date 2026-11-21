import { HWP5_EQUATION_SCRIPT_EDIT_ABI } from './abi-schema.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
const encoder = new TextEncoder();
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const utf16 = new TextDecoder('utf-16le', { fatal: true, ignoreBOM: true });
const maxWire = 1024 * 1024;
const maxReply = 2 * 1024 * 1024;
const instances = new WeakMap();
const uint = (value) =>
  Number.isInteger(value) && value >= 0 && value < 0xffffffff && !Object.is(value, -0);
const token = (value) =>
  typeof value === 'string' &&
  /^[1-9][0-9]{0,19}$/.test(value) &&
  BigInt(value) <= 0xffffffffffffffffn;
const fail = () => {
  throw Error('InvalidEquationScriptCapture');
};
const keys = (value, names) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...names].sort().join();
export function checkedHwp5EquationScript(script) {
  if (typeof script !== 'string' || /[\uD800-\uDFFF]/u.test(script))
    throw Error('InvalidEquationScriptEncoding');
  if (!script.length) throw Error('EmptyEquationScript');
  if (script.length > 65535 || encoder.encode(script).length > 262140) throw Error('LimitExceeded');
  return script;
}
function decode(bytes, section, node, layout) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > maxReply) fail();
  const r = JSON.parse(utf8.decode(bytes));
  if (
    !keys(r, [
      'schemaVersion',
      'scope',
      'executionAuthority',
      'lease',
      'section',
      'equationNode',
      'layout',
      'historyRevision',
      'scriptUtf16LE',
      'limits',
    ]) ||
    r.schemaVersion !== 1 ||
    r.scope !== 'hwp5-equation-script-edit-capture' ||
    r.executionAuthority !== false ||
    !token(r.lease) ||
    !uint(r.section) ||
    !uint(r.equationNode) ||
    r.section !== section ||
    r.equationNode !== node ||
    r.layout !== layout ||
    !uint(r.historyRevision) ||
    !Array.isArray(r.scriptUtf16LE) ||
    r.scriptUtf16LE.length > 65535 ||
    !keys(r.limits, ['scriptUnits', 'scriptBytes', 'requestBytes', 'replyBytes']) ||
    r.limits.scriptUnits !== 65535 ||
    r.limits.scriptBytes !== 262140 ||
    r.limits.requestBytes !== maxWire ||
    r.limits.replyBytes !== maxReply
  )
    fail();
  const raw = new Uint8Array(r.scriptUtf16LE.length * 2),
    view = new DataView(raw.buffer);
  for (let i = 0; i < r.scriptUtf16LE.length; ++i) {
    const unit = r.scriptUtf16LE[i];
    if (!Number.isInteger(unit) || unit < 0 || unit > 65535 || Object.is(unit, -0)) fail();
    view.setUint16(i * 2, unit, true);
  }
  const script = utf16.decode(raw); // fatal; never repair unpaired source units.
  return { lease: r.lease, script, historyRevision: r.historyRevision };
}
export function clearHwp5EquationScriptCaptures(wasm) {
  const state = instances.get(wasm);
  if (state) state.active = null;
}
/** Only an opaque Native lease is retained here; no hashes, tickets or owner witness. */
export function createHwp5EquationScriptEditApi({ wasm, memory, check, output }) {
  let state = instances.get(wasm);
  if (!state) {
    state = { active: null };
    instances.set(wasm, state);
  }
  const captures = new WeakMap();
  const supported = () => {
    check();
    return (
      Object.entries(HWP5_EQUATION_SCRIPT_EDIT_ABI).every(
        ([name, sig]) =>
          typeof wasm[name] === 'function' && wasm[name].length === sig.params.length,
      ) &&
      typeof wasm.hwp5_edit_history_revision === 'function' &&
      wasm.hwp5_edit_equation_script_edit_version() === 1
    );
  };
  const discardNative = () => {
    try {
      check();
      if (
        typeof wasm.hwp5_edit_equation_script_edit_capture === 'function' &&
        wasm.hwp5_edit_equation_script_edit_capture.length === 3 &&
        typeof wasm.hwp5_edit_equation_script_edit_version === 'function' &&
        wasm.hwp5_edit_equation_script_edit_version() === 1
      )
        output(() => wasm.hwp5_edit_equation_script_edit_capture(0, 0, 0xffffffff));
    } catch {}
  };
  // Cheap local preflight only. Core additionally fences its exact State/token;
  // Native validates retained session/view epoch/full ticket on every commit.
  const current = (capture) => {
    if (!captures.has(capture) || state.active !== capture) return false;
    try {
      check();
      return supported() && wasm.hwp5_edit_history_revision() === capture.historyRevision;
    } catch {
      return false;
    }
  };
  return {
    supportsHwp5EquationScriptEditAbi: supported,
    captureHwp5EquationScript(section, equationNode, layout) {
      state.active = null; // A failed new capture invalidates the previous one too.
      try {
        if (
          arguments.length !== 3 ||
          !uint(section) ||
          !uint(equationNode) ||
          !['version-only', 'with-font'].includes(layout)
        )
          throw Error('InvalidEquationScriptSelector');
        if (!supported()) throw Error('Hwp5EquationScriptEditUnavailable');
        const r = decode(
          output(() =>
            wasm.hwp5_edit_equation_script_edit_capture(
              section,
              equationNode,
              layout === 'with-font' ? 1 : 0,
            ),
          ).bytes,
          section,
          equationNode,
          layout,
        );
        const capture = Object.freeze({
          section,
          equationNode,
          layout,
          script: r.script,
          historyRevision: r.historyRevision,
        });
        captures.set(capture, r.lease);
        state.active = capture;
        return capture;
      } catch (error) {
        discardNative();
        throw error;
      }
    },
    isHwp5EquationScriptCurrent: current,
    discardHwp5EquationScript(capture) {
      if (!captures.has(capture) || state.active !== capture) return false;
      captures.delete(capture);
      state.active = null;
      discardNative();
      return true; // Local capture was revoked; never claim a mutation occurred.
    },
    editHwp5EquationScript(capture, script) {
      if (arguments.length !== 2) throw Error('InvalidEquationScriptEditArguments');
      if (!current(capture)) throw Error('StaleEquationScriptCapture');
      const value = checkedHwp5EquationScript(script);
      const bytes = encoder.encode(
        JSON.stringify({ schemaVersion: 1, lease: captures.get(capture), script: value }),
      );
      if (bytes.length > maxWire) throw Error('LimitExceeded');
      captures.delete(capture);
      state.active = null; // Consume before any attempted call, including no-op/throw.
      try {
        return applyNativeEdit(
          memory,
          bytes,
          (ptr, size) => wasm.hwp5_edit_equation_script_edit_commit(ptr, size),
          'InvalidEquationScriptEditResult',
        );
      } catch (error) {
        discardNative();
        throw error;
      }
    },
  };
}
