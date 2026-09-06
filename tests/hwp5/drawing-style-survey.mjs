import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { documentRecords } from "./documents.mjs";
import { drawingStyleActual } from "./drawing-style.mjs";
import { lineActual } from "./shape-line.mjs";
import { lineOwnerActual } from "./line-validation.mjs";

// Inventory only: failures remain visible and never authorize a fallback layout.
export function drawingStyleSurvey(call, cfb) {
  const root = new URL("../../reference/rhwp/samples/", import.meta.url);
  if (!existsSync(root)) return { skipped: true };
  const out = { files: 0, hierarchyCompleted: 0, security: 0, failures: [], kinds: {} };
  // Explicit per-fixture experiment, NOT version inference or production fallback.
  const olderFixtures = new Map([
    ["issue2559/1341000_research_report_footnotes.hwp", { count: 17, bytes: 21, version: "5000107" }],
    ["issue5714/1490000-200800034_vietnam_labor_report.hwp", { count: 1, bytes: 51, version: "5000006" }],
  ]);
  out.fillOnly = { parsed: 0, rejectedPrefixes: 0 };
  out.versions = {};
  out.images = [];
  out.lines = { parsed: 0, rejected: 0, groupDrawingLines: 0, attributes: {}, extras: {}, deferredOwners: {} };
  out.metadata = { parsed: 0, rejected: 0, reservedNonzero: 0, alphaNonzero: 0, reservedExamples: [] };
  const drawingIds = new Set(["$lin", "$rec", "$ell", "$arc", "$pol", "$cur"]);
  for (const name of readdirSync(root, { recursive: true }).filter(n => n.endsWith(".hwp")).sort()) {
    out.files++;
    let sections, header;
    try {
      cfb.parse(readFileSync(join(fileURLToPath(root), name)), { strict: true });
      header = Buffer.from(cfb.findExact("/FileHeader").content);
      if (header.readUInt32LE(36) & (2 | 4 | 16 | 256 | 1024)) { out.security++; continue; }
      const nodes = cfb.document().nodes;
      const body = nodes.findIndex(n => n.parent === 0 && n.name === "BodyText");
      assert.ok(body >= 0, "missing BodyText");
      sections = nodes.filter(n => n.parent === body && /^Section\d+$/.test(n.name))
        .map(n => ({ name: n.name, raw: Buffer.from(n.content) }));
      assert.ok(sections.length > 0, "missing sections");
    } catch (e) {
      if (e instanceof WebAssembly.RuntimeError) throw e;
      out.failures.push({ name, stage: "container", error: e.message }); continue;
    }
    let failed = false;
    for (const section of sections) {
      let bytes, records;
      try {
        bytes = call(3, Buffer.concat([header, section.raw]));
        records = documentRecords(bytes);
        const version = header.subarray(32, 36);
        call(51, Buffer.concat([version, bytes]));
      } catch (e) {
        if (e instanceof WebAssembly.RuntimeError) throw e;
        out.failures.push({ name, section: section.name, stage: "shape hierarchy", error: e.message });
        failed = true; continue;
      }
      lineOwnerActual(call,header.readUInt32LE(32),bytes);
      const stack = [];
      for (const record of records) {
        const level = bytes.readUInt32LE(record.offset) >>> 10 & 1023;
        stack.length = level;
        if(record.tag===78){
          const parent=stack[level-1];
          const owner=parent?.tag===76?Buffer.from(bytes.subarray(parent.start,parent.start+4)).reverse().toString("latin1"):"other";
          if(owner==="$lin"){
            const line=lineActual(call,bytes.subarray(record.start,record.end));
            out.lines.parsed++;out.lines.rejected+=line.rejected;
            if(name==="group-drawing-02.hwp")out.lines.groupDrawingLines++;
            out.lines.attributes[line.attributes]=(out.lines.attributes[line.attributes]??0)+1;
            out.lines.extras[line.extra]=(out.lines.extras[line.extra]??0)+1;
          }else out.lines.deferredOwners[owner]=(out.lines.deferredOwners[owner]??0)+1;
        }
        if (record.tag === 76) {
          const p = bytes.subarray(record.start, record.end);
          const id = Buffer.from(p.subarray(0, 4)).reverse().toString("latin1");
          const stats = out.kinds[id] ??= { total: 0, deferred: 0, known: 0, unknown: 0, errors: [], flags: {}, extras: {} };
          stats.total++;
          if (drawingIds.has(id)) {
            const start = (stack[level - 1].tag === 71 ? 8 : 4) + 42;
            const end = start + 50 + p.readUInt16LE(start) * 96;
            const style = p.subarray(end);
            const versionKey = `${header.readUInt32LE(32).toString(16)}/${p.readUInt16LE(start - 32)}`;
            const versionStats = out.versions[versionKey] ??= { full: 0, unknown: 0, failed: 0, fillOnly: 0 };
            if (olderFixtures.has(name) && id === "$rec") {
              const parsed = drawingStyleActual(call, style, 3);
              assert.equal(parsed.known, true);
              assert.equal(parsed.extra, 0);
              out.fillOnly.parsed++;
              versionStats.fillOnly++;
              for (let n = 0; n < parsed.consumed; n++) {
                assert.throws(() => call(53, Buffer.concat([Buffer.from([3]), style.subarray(0, n)])), /UnexpectedEnd/);
                out.fillOnly.rejectedPrefixes++;
              }
              drawingStyleActual(call, style, 3);
            }
            let result;
            try { result = call(53, Buffer.concat([Buffer.from([1]), style])); }
            catch (e) {
              if (e instanceof WebAssembly.RuntimeError) throw e;
              versionStats.failed++;
              stats.errors.push({ name, section: section.name, offset: record.offset, version: header.readUInt32LE(32).toString(16), localVersion: p.readUInt16LE(start - 32), bytes: style.length, hex: style.subarray(0, 64).toString("hex"), error: e.message });
            }
            if (result) {
              const parsed = drawingStyleActual(call, style);
              if(parsed.known){
                const full=drawingStyleActual(call,style,5);
                assert.equal(full.consumed,parsed.consumed+6);
                assert.equal(full.extra,0);
                out.metadata.parsed++;
                out.metadata.reservedNonzero+=Number(style[parsed.consumed+4]!==0);
                if(style[parsed.consumed+4]!==0)out.metadata.reservedExamples.push({name,section:section.name,offset:record.offset,value:style[parsed.consumed+4]});
                out.metadata.alphaNonzero+=Number(style[parsed.consumed+5]!==0);
                for(let n=0;n<6;n++){
                  assert.throws(()=>call(53,Buffer.concat([Buffer.from([5]),style.subarray(0,parsed.consumed+n)])),/UnexpectedEnd/);
                  out.metadata.rejected++;
                }
                drawingStyleActual(call,style,5);
              }
              if (parsed.imageId !== null) out.images.push({ name, section: section.name, offset: record.offset, id: parsed.imageId });
              stats[parsed.known ? "known" : "unknown"]++;
              versionStats[parsed.known ? "full" : "unknown"]++;
              stats.flags[parsed.flags] = (stats.flags[parsed.flags] ?? 0) + 1;
              stats.extras[parsed.extra] = (stats.extras[parsed.extra] ?? 0) + 1;
            }
          } else stats.deferred++;
        }
        stack.push(record);
      }
    }
    if (!failed) out.hierarchyCompleted++;
  }
  assert.equal(out.hierarchyCompleted + out.security + new Set(out.failures.map(f => f.name)).size, out.files);
  for (const stats of Object.values(out.kinds)) assert.equal(stats.total, stats.deferred + stats.known + stats.unknown + stats.errors.length);
  // Pin the newly observed incompatibilities, not a claim that these files are corrupt.
  let expectedParsed = 0;
  for (const [name, { count, bytes, version }] of olderFixtures) {
    if (!existsSync(join(fileURLToPath(root), name))) continue;
    expectedParsed += count;
    assert.ok(!out.failures.some(f => f.name === name), "regression fixture must reach styles");
    const failures = out.kinds.$rec.errors.filter(e => e.name === name);
    assert.equal(failures.length, count);
    for (const failure of failures) {
      assert.equal(failure.bytes, bytes);
      assert.equal(failure.version, version);
      assert.equal(failure.error, "UnexpectedEnd");
    }
  }
  assert.equal(out.fillOnly.parsed, expectedParsed);
  if(existsSync(join(fileURLToPath(root),"group-drawing-02.hwp")))assert.equal(out.lines.groupDrawingLines,4);
  const versions = Object.values(out.versions);
  const kinds = Object.values(out.kinds);
  for (const [versionField, kindField] of [["full", "known"], ["unknown", "unknown"]]) {
    assert.equal(versions.reduce((n, v) => n + v[versionField], 0), kinds.reduce((n, k) => n + k[kindField], 0));
  }
  assert.equal(versions.reduce((n, v) => n + v.failed, 0), kinds.reduce((n, k) => n + k.errors.length, 0));
  assert.equal(versions.reduce((n, v) => n + v.fillOnly, 0), out.fillOnly.parsed);
  // The same local version occurs in both layouts: it cannot select a tail by itself.
  if (expectedParsed > 0 && existsSync(join(fileURLToPath(root), "group-drawing-02.hwp"))) {
    assert.ok(Object.entries(out.versions).some(([key, v]) => key.endsWith("/1") && v.full > 0));
    assert.ok(Object.entries(out.versions).some(([key, v]) => key.endsWith("/1") && v.fillOnly > 0));
  }
  return out;
}
