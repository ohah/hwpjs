import assert from 'node:assert/strict';

/** Mask exactly one complete function-export name, never a prefix match. */
export function withoutNormalizationExport(bytes, name) {
  const label = Buffer.from(name);
  assert(label.length < 128);
  const copy = Buffer.from(bytes),
    at = copy.indexOf(Buffer.concat([Buffer.from([label.length]), label, Buffer.from([0])]));
  assert(at > 0, `candidate must provide ${name}`);
  copy[at + 1] = 'x'.charCodeAt(0);
  assert(
    !WebAssembly.Module.exports(new WebAssembly.Module(copy)).some((row) => row.name === name),
  );
  return copy;
}
