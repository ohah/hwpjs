const fields = ['width', 'height', 'horizontalOffset', 'verticalOffset', 'treatAsCharacter'];
export function ownObjectGeometryRecord(value, allowed, required = allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error('InvalidObjectGeometryRequest');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string' || !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  )
    throw Error('InvalidObjectGeometryRequest');
  const output = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (!('value' in descriptor)) throw Error('InvalidObjectGeometryRequest');
    output[key] = descriptor.value;
  }
  return output;
}
const uint = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff && !Object.is(value, -0);
const signed = (value) =>
  Number.isSafeInteger(value) &&
  value >= -0x80000000 &&
  value <= 0x7fffffff &&
  !Object.is(value, -0);
export function checkedObjectGeometrySelector(value) {
  const p = ownObjectGeometryRecord(value, ['kind', 'section', 'node']);
  if (!['chart', 'drawing'].includes(p.kind) || !uint(p.section) || !uint(p.node))
    throw Error('InvalidObjectGeometryTarget');
  return Object.freeze(p);
}
export function checkedObjectGeometryPatch(value) {
  const p = ownObjectGeometryRecord(value, fields, []);
  for (const key of Object.keys(p)) {
    if (key === 'width' || key === 'height') {
      if (!uint(p[key]) || p[key] === 0) throw Error('InvalidObjectGeometrySize');
    } else if (key === 'treatAsCharacter') {
      if (typeof p[key] !== 'boolean') throw Error('InvalidObjectGeometryPlacement');
    } else if (!signed(p[key])) throw Error('InvalidObjectGeometryOffset');
  }
  return Object.freeze(p);
}
export function checkedObjectGeometryFrame(value) {
  const p = ownObjectGeometryRecord(value, fields);
  return checkedObjectGeometryPatch(p);
}
export function checkedObjectGeometryOwner(value) {
  const p = ownObjectGeometryRecord(value, [
    'ownerNode',
    'componentNode',
    'paragraph',
    'anchorUnit',
    'sourceSha256',
    'link',
  ]);
  if (
    ![p.ownerNode, p.paragraph, p.anchorUnit].every(uint) ||
    (p.componentNode !== null && !uint(p.componentNode)) ||
    typeof p.link !== 'string' ||
    p.link.length === 0 ||
    p.link.length > 8192
  )
    throw Error('InvalidObjectGeometryOwner');
  if (
    !Array.isArray(p.sourceSha256) ||
    Object.getPrototypeOf(p.sourceSha256) !== Array.prototype ||
    p.sourceSha256.length !== 32
  )
    throw Error('InvalidObjectGeometryOwner');
  const bytes = [];
  const descriptors = Object.getOwnPropertyDescriptors(p.sourceSha256);
  if (Reflect.ownKeys(descriptors).length !== 33) throw Error('InvalidObjectGeometryOwner');
  for (let index = 0; index < 32; index++) {
    const d = descriptors[index];
    if (!d || !('value' in d) || !uint(d.value) || d.value > 255)
      throw Error('InvalidObjectGeometryOwner');
    bytes.push(d.value);
  }
  return Object.freeze({ ...p, sourceSha256: Object.freeze(bytes) });
}
export function checkedObjectGeometryObservation(value) {
  const p = ownObjectGeometryRecord(value, [
    'format',
    'selector',
    'owner',
    'frame',
    'editable',
    'reason',
    'historyRevision',
    'binding',
  ]);
  const binding = ownObjectGeometryRecord(p.binding, ['session', 'serial']);
  if (
    typeof binding.session !== 'string' ||
    !/^[A-Za-z0-9:._-]{1,256}$/.test(binding.session) ||
    typeof binding.serial !== 'string' ||
    !/^(0|[1-9][0-9]{0,19})$/.test(binding.serial)
  )
    throw Error('InvalidObjectGeometryBinding');
  const editable = ownObjectGeometryRecord(p.editable, ['size', 'position']);
  if (
    !['hwp5', 'hwpx'].includes(p.format) ||
    ![editable.size, editable.position].every((x) => typeof x === 'boolean') ||
    (p.reason !== null && (typeof p.reason !== 'string' || p.reason.length > 4096)) ||
    !Number.isSafeInteger(p.historyRevision) ||
    p.historyRevision < 0
  )
    throw Error('InvalidObjectGeometryObservation');
  return Object.freeze({
    format: p.format,
    selector: checkedObjectGeometrySelector(p.selector),
    owner: checkedObjectGeometryOwner(p.owner),
    frame: checkedObjectGeometryFrame(p.frame),
    editable: Object.freeze(editable),
    reason: p.reason,
    historyRevision: p.historyRevision,
    binding: Object.freeze(binding),
  });
}
export function objectGeometryMessage(observation, patch) {
  const before = checkedObjectGeometryObservation(observation),
    update = checkedObjectGeometryPatch(patch);
  if (
    (Object.keys(update).some((k) => ['width', 'height'].includes(k)) && !before.editable.size) ||
    (Object.keys(update).some((k) =>
      ['horizontalOffset', 'verticalOffset', 'treatAsCharacter'].includes(k),
    ) &&
      !before.editable.position)
  )
    throw Error('ObjectGeometryWriteUnavailable');
  return Object.freeze({
    kind: 'object-geometry-set',
    request: Object.freeze({
      selector: before.selector,
      owner: before.owner,
      expected: before.frame,
      historyRevision: before.historyRevision,
      binding: before.binding,
      patch: update,
    }),
  });
}
