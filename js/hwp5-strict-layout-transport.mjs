// Internal host bridge. The Native instance and its snapshot remain authoritative.
// No transport is obtained from a caller's metric packet or certification flag.
const transports = new WeakMap();
export function registerStrictLayoutTransport(editor, transport) {
  transports.set(editor, transport);
  return editor;
}
export function strictLayoutTransport(editor) {
  const transport = transports.get(editor);
  if (!transport?.supported()) throw Error('Hwp5StrictLayoutAbiUnavailable');
  return transport;
}
export function hasStrictLayoutTransport(editor) {
  try {
    return transports.get(editor)?.supported() === true;
  } catch {
    return false;
  }
}
