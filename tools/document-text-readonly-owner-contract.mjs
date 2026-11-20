import assert from 'node:assert/strict';
// Lexical ownership/registration contract only; never a substitute for Zig compilation.
export function assertReadonlyOwnerContract(source) {
  assert.match(source, /pub const Owner = opaque/);
  const methods = [...source.matchAll(/pub fn (\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(methods, ['open', 'close', 'snapshot', 'selection', 'anchor']);
  assert.match(source, /Source\.openReadOnly\(a, input\)/);
  assert(
    !/@import\("(?:edit\/)?(?:style_preservation|editor_session|editor_history)\.zig"\)/.test(
      source,
    ),
  );
  assert.match(source, /issuer\.epoch != s\.issuer_epoch/);
  assert.match(source, /current\.epoch != s\.issuer_epoch/);
  assert.match(source, /\.created_cell_paragraphs = 0/);
  assert.match(source, /result\.bindReadStamp\(current\)/);
  for (const name of ['snapshot', 'anchor', 'selection'])
    assert(source.includes(`edit/document_text_${name}.zig`));
  assert(!/history_revision|history_delta_managed|enableHistory|\.apply\(/.test(source));
  return methods;
}
