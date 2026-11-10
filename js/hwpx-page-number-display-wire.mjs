const u32 = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const owner = (value) =>
  value && u32(value.sourceNode) && (value.paragraph === null || u32(value.paragraph));
const string = (value, limit) => typeof value === 'string' && value.length <= limit;

export function decodeHwpxPageNumberDisplaySource(bytes) {
  const invalid = () => {
    throw Error('InvalidHwpxPageNumberDisplaySource');
  };
  if (bytes.length > 4 * 1024 * 1024) invalid();
  const packet = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (
    packet?.version !== 1 ||
    !u32(packet.initialPage) ||
    packet.initialPage === 0 ||
    (packet.charShapeId !== null && !u32(packet.charShapeId)) ||
    !Array.isArray(packet.sections) ||
    packet.sections.length > 4096
  )
    invalid();
  let count = 0;
  for (const [index, section] of packet.sections.entries()) {
    const position = section?.position;
    if (
      section?.section !== index ||
      !u32(section.startPage) ||
      !string(section.parity, 16) ||
      typeof section.hideFirst !== 'boolean' ||
      !Array.isArray(section.controls) ||
      (position !== null &&
        (!owner(position) ||
          !string(position.position, 32) ||
          !string(position.format, 32) ||
          !string(position.sideChar, 32)))
    )
      invalid();
    count += section.controls.length;
    if (count > 20000) invalid();
    for (const control of section.controls) {
      if (!owner(control)) invalid();
      if (control.kind === 'hide' && typeof control.value === 'boolean') continue;
      if (control.kind === 'restart' && u32(control.value)) continue;
      invalid();
    }
  }
  return packet;
}
