import { applyNativeEdit } from './native-edit-outcome.mjs';
import {
  ownObjectGeometryRecord,
  checkedObjectGeometryObservation,
  checkedObjectGeometrySelector,
  checkedObjectGeometryPatch,
} from './object-geometry-edit.mjs';
let scopes = 0n;
export function createObjectGeometryApi({ wasm, memory, check, format = 'hwpx' }) {
  if (!['hwpx', 'hwp5'].includes(format)) throw Error('InvalidObjectGeometryFormat');
  const prefix = format + '_edit_',
    scope = 'geometry-' + ++scopes + ':';
  const supported = ['object_geometry', 'set_object_geometry'].every(
    (name) => typeof wasm[prefix + name] === 'function',
  );
  function read(input) {
    check();
    if (!supported) throw Error('ObjectGeometryUnavailable');
    const selector = checkedObjectGeometrySelector(input);
    try {
      if (
        wasm[prefix + 'object_geometry'](
          selector.section,
          selector.node,
          selector.kind === 'chart' ? 0 : 1,
        ) !== 1
      )
        throw memory.error();
      const len = wasm[prefix + 'output_len']();
      if (!Number.isSafeInteger(len) || len <= 0 || len > 32768)
        throw Error('InvalidObjectGeometryObservation');
      const current = checkedObjectGeometryObservation(
        JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            memory.copy(wasm[prefix + 'output_ptr'](), len),
          ),
        ),
      );
      if (
        current.format !== format ||
        current.selector.kind !== selector.kind ||
        current.selector.section !== selector.section ||
        current.selector.node !== selector.node ||
        !/^s[1-9][0-9]{0,19}$/.test(current.binding.session)
      )
        throw Error('InvalidObjectGeometryObservation');
      return checkedObjectGeometryObservation({
        ...current,
        binding: { ...current.binding, session: scope + current.binding.session },
      });
    } finally {
      wasm[prefix + 'output_free']();
    }
  }
  return {
    supportsObjectGeometry() {
      check();
      return supported;
    },
    objectGeometry: read,
    setObjectGeometry(input) {
      check();
      if (!supported) throw Error('ObjectGeometryUnavailable');
      const record = ownObjectGeometryRecord(input, [
        'selector',
        'owner',
        'expected',
        'historyRevision',
        'binding',
        'patch',
      ]);
      const binding = ownObjectGeometryRecord(record.binding, ['session', 'serial']);
      // Validate before reading Native; getters and callbacks cannot enter the transport.
      const checked = checkedObjectGeometryObservation({
        format,
        selector: record.selector,
        owner: record.owner,
        frame: record.expected,
        historyRevision: record.historyRevision,
        binding,
        editable: { size: true, position: true },
        reason: null,
      });
      const patch = checkedObjectGeometryPatch(record.patch);
      const current = read(checked.selector);
      if (
        checked.historyRevision !== current.historyRevision ||
        checked.binding.session !== current.binding.session ||
        checked.binding.serial !== current.binding.serial ||
        !['ownerNode', 'componentNode', 'paragraph', 'anchorUnit', 'link'].every(
          (key) => checked.owner[key] === current.owner[key],
        ) ||
        !checked.owner.sourceSha256.every(
          (byte, index) => byte === current.owner.sourceSha256[index],
        ) ||
        !['width', 'height', 'horizontalOffset', 'verticalOffset', 'treatAsCharacter'].every(
          (key) => checked.frame[key] === current.frame[key],
        )
      )
        return {
          nativeCode: 0,
          application: 'unapplied',
          changed: false,
          error: 'StaleObjectGeometryOwner',
        };
      if (
        (('width' in patch || 'height' in patch) && !current.editable.size) ||
        (('horizontalOffset' in patch ||
          'verticalOffset' in patch ||
          'treatAsCharacter' in patch) &&
          !current.editable.position)
      )
        return {
          nativeCode: 0,
          application: 'unapplied',
          changed: false,
          error: 'ObjectGeometryReadOnly',
        };
      const request = {
        selector: checked.selector,
        owner: checked.owner,
        expected: checked.frame,
        historyRevision: checked.historyRevision,
        binding: { ...checked.binding, session: checked.binding.session.slice(scope.length) },
        patch,
      };
      const bytes = new TextEncoder().encode(JSON.stringify(request));
      if (bytes.length > 16384) throw Error('LimitExceeded');
      return applyNativeEdit(
        memory,
        bytes,
        (ptr, len) => wasm[prefix + 'set_object_geometry'](ptr, len),
        'InvalidObjectGeometryCompletion',
      );
    },
  };
}
