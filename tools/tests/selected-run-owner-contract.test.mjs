import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (path) => readFile(new URL('../../' + path, import.meta.url), 'utf8');
function indexContract(text) {
  for (const guard of [
    'at >= node',
    '!frames[node].active or frames[at].in_text',
    'owners[node] != paragraph',
    'invalid[node] = paragraph',
    'for (tree.elements, 0..)',
  ]) {
    assert(text.includes(guard), guard);
  }
  assert(!text.includes('while ('));
  assert(!text.includes('sort('));
  assert(text.indexOf('knownReadChildKind') < text.indexOf('wrappers[node] = run;'));
}
test('selected-run index uses existing frames, actual owners and bounded parent order', async () => {
  const text = await source('src/hwpx/selected_run_owner.zig');
  indexContract(text);
  for (const original of ['at >= node', 'frames[at].in_text', 'owners[node] != paragraph'])
    assert.throws(() => indexContract(text.replace(original, 'false')));
});
test('editing direct-run guards precede the shared query-only shape facts', async () => {
  const anchor = await source('src/hwpx/run_anchor.zig');
  const strict = anchor.slice(
    anchor.indexOf('pub fn kind('),
    anchor.indexOf('pub fn knownReadChildKind('),
  );
  assert(strict.includes('!run.is(uri, "run")'));
  assert(strict.includes('!tree.elements[paragraph_index].is(uri, "p")'));
  assert(strict.indexOf('!run.is') < strict.indexOf('return knownReadChildKind'));
  const conditional = await source('src/hwpx/run_switch_anchor.zig');
  const supported = conditional.slice(
    conditional.indexOf('pub fn supported('),
    conditional.indexOf('pub fn readShapeSupported('),
  );
  assert(supported.includes('!tree.elements[run].is(uri, "run")'));
  assert(supported.includes('!tree.elements[paragraph].is(uri, "p")'));
});
test('streamed selection uses the current borrowed parser scope after source-index checks', async () => {
  const frames = await source('src/hwpx/xml_tree_selection.zig');
  assert(frames.includes('tree.visitOrdered'));
  assert(frames.includes('selection.choose(self.allocator, tag, scope'));
  assert(!frames.includes('chooseTree('));
  const content = await source('src/hwpx/xml_part_content.zig');
  const at = content.indexOf('if (self.visitor.on_open_tag)');
  assert(at > content.indexOf('if (node.parent != parent)'));
  assert(at > content.indexOf('if (!try matchesName(node, tag, scope))'));
  assert(content.includes('on_open_tag: ?*const fn'));
});
test('actual Native Context and registered Session regression consume the same checked owner fixture', async () => {
  const context = await source('src/hwpx/control_text_read_context.zig');
  for (const binding of [
    'selected_run_owner.zig',
    'self.selected_parents.invalid_owners[node]',
    'knownReadChildKind',
    'readRunChildSupported',
    'reject_owner',
  ])
    assert(context.includes(binding));
  assert(context.indexOf('Index.build') < context.indexOf('try self.classify(at)'));
  const regression = await source('src/hwpx/document_text_batch_delegation_tests.zig');
  assert(regression.includes('@embedFile("test_fixtures/document_text_selected_run.xml")'));
  assert(regression.includes('@import("selected_run_owner_tests.zig")'));
  for (const call of [
    'document_text_snapshot.zig',
    'document_text_anchor.zig',
    'document_text_selection.zig',
    'service.apply',
  ])
    assert(regression.includes(call));
  assert(regression.includes('expectEqualSlices(u8, before_bytes, undone)'));
  assert(regression.includes('expectEqualSlices(u8, after_bytes, redone)'));
});
