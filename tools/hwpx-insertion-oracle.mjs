import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from './oracle-process.mjs';

function controls(script, payload, unsupported, wrongMessage) {
  const rows = [];
  for (const flags of [[], ['-O']]) {
    const invoke = (text) =>
      spawnSync('python3', [...flags, fileURLToPath(new URL(script, import.meta.url))], {
        input: JSON.stringify({ ...payload, text }),
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024,
      });
    const positive = invoke(payload.text);
    if (positive.error) throw positive.error;
    const detail = String(positive.stderr).slice(-1200);
    const row = {
      mode: flags.length ? 'optimized' : 'normal',
      status:
        positive.status === 0
          ? 'pass'
          : positive.status === 1 && unsupported.test(detail)
            ? 'unsupported'
            : 'mismatch',
    };
    if (positive.status !== 0) row.error = detail;
    else {
      const wrong = invoke(payload.text + 'WRONG');
      if (wrong.error) throw wrong.error;
      row.wrongExpectedRejected = wrong.status === 1 && wrongMessage.test(String(wrong.stderr));
      if (!row.wrongExpectedRejected) row.status = 'mismatch';
    }
    rows.push(row);
  }
  return {
    state: rows.every((r) => r.status === 'pass')
      ? 'verified'
      : rows.every((r) => r.status === 'unsupported')
        ? 'unsupported'
        : 'mismatch',
    controls: rows,
  };
}

/** sectionIndex is the selected-default zero-based paragraph index within section.
 * Prefix fallback is only admissible for an insertion at display offset zero.
 * A source mismatch is never reclassified as an unsupported oracle.
 */
export function verifyHwpxInsertion({
  before,
  after,
  section,
  sectionIndex,
  startUnit,
  text,
  preserveAutomaticNumbers = false,
}) {
  assert(Buffer.isBuffer(before) && Buffer.isBuffer(after));
  assert([section, sectionIndex, startUnit].every((n) => Number.isSafeInteger(n) && n >= 0));
  assert(typeof text === 'string' && text.length > 0 && text.isWellFormed());
  assert.equal(typeof preserveAutomaticNumbers, 'boolean');
  const bytes = { before: before.toString('base64'), after: after.toString('base64') };
  const sourceKind = JSON.parse(
    execFileSync('python3', [fileURLToPath(new URL('./hwpx-insertion-site.py', import.meta.url))], {
      input: JSON.stringify({ before: bytes.before, section, sectionIndex, startUnit }),
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    }),
  );
  assert(
    [
      'plain-splice',
      'empty-run-prefix',
      'direct-text-prefix',
      'markpen-owned-prefix',
      'bookmark-owned-prefix',
    ].includes(sourceKind),
    'UnknownInsertionSourceKind',
  );
  if (sourceKind === 'markpen-owned-prefix' || sourceKind === 'bookmark-owned-prefix') {
    const result = controls(
      './hwpx-anchor-prefix-oracle.py',
      {
        ...bytes,
        section,
        paragraph: sectionIndex + 1,
        paragraphScope: 'section',
        mode: sourceKind,
        text,
      },
      /ValueError: unsupported owned prefix source/,
      /ValueError: complete XML mismatch/,
    );
    return { ...result, kind: sourceKind };
  }
  if (sourceKind === 'empty-run-prefix') {
    const result = controls(
      './hwpx-anchor-prefix-oracle.py',
      {
        ...bytes,
        section,
        paragraph: sectionIndex + 1,
        paragraphScope: 'section',
        mode: 'plain_text',
        text,
      },
      /ValueError: (missing plain text source owner|ambiguous empty run)/,
      /ValueError: complete XML mismatch/,
    );
    return { ...result, kind: 'empty-run-prefix' };
  }

  const plain = controls(
    './hwpx-plain-splice-oracle.py',
    {
      ...bytes,
      part: `Contents/section${section}.xml`,
      index: sectionIndex,
      start: startUnit,
      end: startUnit,
      text,
      paragraph_order: 'selected_default',
      preserve_section_metadata: true,
      preserve_automatic_numbers: preserveAutomaticNumbers,
    },
    /ValueError: (Oracle supports plain text leaves only|Unsupported paragraph child)/,
    /ValueError: Whole XML mismatch/,
  );
  if (plain.state !== 'unsupported' || startUnit !== 0 || sourceKind !== 'direct-text-prefix')
    return { ...plain, kind: 'plain-splice' };
  const prefix = controls(
    './hwpx-anchor-prefix-oracle.py',
    {
      ...bytes,
      section,
      paragraph: sectionIndex + 1,
      paragraphScope: 'section',
      mode: 'direct_text',
      text,
    },
    /ValueError: missing direct text/,
    /ValueError: complete XML mismatch/,
  );
  return { ...prefix, kind: 'direct-prefix', plainControls: plain.controls };
}
