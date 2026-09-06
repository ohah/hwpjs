import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { documentRecords } from "./documents.mjs";
import { drawingStyleActual } from "./drawing-style.mjs";

// Inventory only: failures remain visible and never authorize a fallback layout.
export function drawingStyleSurvey(call, cfb) {
  const root = new URL("../../reference/rhwp/samples/", import.meta.url);
  if (!existsSync(root)) return { skipped: true };
  const out = { files: 0, hierarchyCompleted: 0, security: 0, failures: [], kinds: {} };
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
      const stack = [];
      for (const record of records) {
        const level = bytes.readUInt32LE(record.offset) >>> 10 & 1023;
        stack.length = level;
        if (record.tag === 76) {
          const p = bytes.subarray(record.start, record.end);
          const id = Buffer.from(p.subarray(0, 4)).reverse().toString("latin1");
          const stats = out.kinds[id] ??= { total: 0, deferred: 0, known: 0, unknown: 0, errors: [], flags: {}, extras: {} };
          stats.total++;
          if (drawingIds.has(id)) {
            const start = (stack[level - 1].tag === 71 ? 8 : 4) + 42;
            const end = start + 50 + p.readUInt16LE(start) * 96;
            const style = p.subarray(end);
            let result;
            try { result = call(53, Buffer.concat([Buffer.from([1]), style])); }
            catch (e) {
              if (e instanceof WebAssembly.RuntimeError) throw e;
              stats.errors.push({ name, section: section.name, offset: record.offset, version: header.readUInt32LE(32).toString(16), localVersion: p.readUInt16LE(start - 32), bytes: style.length, hex: style.subarray(0, 64).toString("hex"), error: e.message });
            }
            if (result) {
              const parsed = drawingStyleActual(call, style);
              stats[parsed.known ? "known" : "unknown"]++;
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
  for (const [name, count, bytes, version] of [
    ["issue2559/1341000_research_report_footnotes.hwp", 17, 21, "5000107"],
    ["issue5714/1490000-200800034_vietnam_labor_report.hwp", 1, 51, "5000006"],
  ]) {
    if (!existsSync(join(fileURLToPath(root), name))) continue;
    assert.ok(!out.failures.some(f => f.name === name), "regression fixture must reach styles");
    const failures = out.kinds.$rec.errors.filter(e => e.name === name);
    assert.equal(failures.length, count);
    for (const failure of failures) {
      assert.equal(failure.bytes, bytes);
      assert.equal(failure.version, version);
      assert.equal(failure.error, "UnexpectedEnd");
    }
  }
  return out;
}
