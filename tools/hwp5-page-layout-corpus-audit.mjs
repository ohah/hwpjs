// Read-only complete Git-tracked CFB inventory. Fixed measurement is not Hancom layout.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { layoutHwp5PageContent } from '../web/preview/hwp5-page-layout.mjs';
import { hwp5PageFixturePaths } from './hwp5-page-fixture-paths.mjs';
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--distribution') || args.length > 1)
  throw new Error('UnknownPageLayoutOption');
const distributionPolicy = args.includes('--distribution');
const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const trackedPaths = execFileSync('git', ['ls-files', '-z', '*.hwp', '*.hwpx'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);
const paths = hwp5PageFixturePaths(trackedPaths);
if (!paths.length) throw new Error('EmptyHwp5FixtureInventory');
const replies = [];
globalThis.self = {
  postMessage(value) {
    replies.push(value);
  },
};
globalThis.fetch = async () => new Response(wasm);
await import('../web/preview/reader-worker.mjs');
const send = async (data) => {
  await self.onmessage({ data });
  if (replies.length !== 1) throw new Error('UnexpectedWorkerReplyCount');
  return replies.shift();
};
const totals = {
    files: paths.length,
    loaded: 0,
    enabledDistribution: 0,
    paginated: 0,
    partial: 0,
    unavailable: 0,
    failed: 0,
    unchanged: 0,
  },
  reasons = {};
console.log(
  JSON.stringify({
    kind: 'inventory',
    wasmSha256: hash(wasm),
    trackedDocuments: trackedPaths.length,
    files: paths.length,
    scope: 'all tracked CFB HWP candidates including demos; excludes ZIP/HWP3',
    distributionPolicy,
    measure: 'fixed 8px per grapheme',
  }),
);
for (const path of paths) {
  const bytes = readFileSync(path),
    before = hash(bytes);
  let reply = await send({ kind: 'load', format: 'hwp5', bytes });
  if (reply.passwordRequired && path.endsWith('/password-12345.hwp'))
    reply = await send({ kind: 'unlock', password: '12345' });
  if (distributionPolicy && reply.content?.distributionEditingAvailable === true) {
    reply = await send({ kind: 'enable', distribution: true });
    if (!reply.error && reply.content) totals.enabledDistribution++;
  }
  if (reply.error || !reply.content) {
    totals.failed++;
    console.log(
      JSON.stringify({
        kind: 'result',
        path,
        state: 'load_failed',
        error: reply.error ?? 'PasswordRequired',
      }),
    );
  } else {
    totals.loaded++;
    const layout = layoutHwp5PageContent(reply.content, () => 8);
    const partial = layout.state === 'paginated' && layout.objectCoverage === 'incomplete';
    if (partial) {
      totals.partial++;
      reasons.UnrenderedHwp5Objects = (reasons.UnrenderedHwp5Objects ?? 0) + 1;
    } else if (layout.state === 'paginated') totals.paginated++;
    else {
      totals.unavailable++;
      reasons[layout.error ?? layout.state] = (reasons[layout.error ?? layout.state] ?? 0) + 1;
    }
    const diagnostics =
      layout.state === 'paginated' && !partial
        ? undefined
        : {
            layoutFailure: {
              section: layout.section,
              tableNode: layout.tableNode,
              reasons: layout.reasons,
            },
            unrenderedObjects: layout.unrenderedObjects,
            hosts: Object.fromEntries(
              [...new Set((reply.content.currentParagraphFlows ?? []).map((row) => row.host))].map(
                (host) => [
                  host,
                  reply.content.currentParagraphFlows.filter((row) => row.host === host).length,
                ],
              ),
            ),
            tables: reply.content.tables?.length ?? 0,
            tableGeometryErrors: reply.content.tableGeometryErrors ?? [],
            tableSources: (reply.content.tables ?? []).map((table) => ({
              tableNode: table.tableNode,
              object_flags: table.layoutSource?.object_flags,
              object_extra_bytes: table.layoutSource?.object_extra_bytes,
              table_extra_bytes: table.layoutSource?.table_extra_bytes,
              text_wrap: table.sourceGeometry?.text_wrap,
              treat_as_character: table.sourceGeometry?.geometry?.treat_as_character,
            })),
            pageSourceErrors: reply.content.pageSourceErrors ?? [],
            sectionSourceErrors: reply.content.sectionSourceErrors ?? [],
            sections: (reply.content.sectionSources ?? []).map((row) => ({
              section: row.section,
              flags: row.flags,
              extra_bytes: row.extra_bytes,
              extra_nonzero: row.extra_nonzero,
            })),
          };
    console.log(
      JSON.stringify({
        kind: 'result',
        path,
        state: partial ? 'partial_paginated' : layout.state,
        error: layout.error,
        pages: layout.pages?.length,
        diagnostics,
      }),
    );
  }
  if (hash(bytes) !== before || hash(readFileSync(path)) !== before)
    throw new Error('FixtureChanged');
  totals.unchanged++;
}
console.log(JSON.stringify({ kind: 'summary', ...totals, reasons }));
if (totals.failed) process.exitCode = 1;
