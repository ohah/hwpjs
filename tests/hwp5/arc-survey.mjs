import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { documentRecords } from "./documents.mjs";
// Framing inventory independent of shape hierarchy acceptance. No automatic layout choice.
export function arcSurvey(call, cfb) {
  const root = new URL('../../reference/rhwp/samples/', import.meta.url);
  if (!existsSync(root)) return { skipped: true };
  const out = { files: 0, completed: 0, security: 0, sections: 0, failures: [], records: [] };
  for (const name of readdirSync(root, {recursive: true}).filter(n => n.endsWith('.hwp')).sort()) {
    out.files++; let stage = 'container';
    try {
      cfb.parse(readFileSync(join(fileURLToPath(root), name)), {strict: true});
      const h = Buffer.from(cfb.findExact('/FileHeader').content);
      if (h.readUInt32LE(36) & (2 | 4 | 16 | 256 | 1024)) { out.security++; continue; }
      const nodes = cfb.document().nodes, body = nodes.findIndex(n => n.parent === 0 && n.name === 'BodyText');
      assert.ok(body >= 0);
      const sections = nodes.filter(n => n.parent === body && /^Section\d+$/.test(n.name));
      assert.ok(sections.length > 0);
      for (const s of sections) {
        stage = s.name;
        const b = call(3, Buffer.concat([h, Buffer.from(s.content)]));
        for (const r of documentRecords(b)) if (r.tag === 81) out.records.push({name, section: s.name, offset: r.offset, bytes: r.end - r.start});
        out.sections++;
      }
      out.completed++;
    } catch (e) {
      if (e instanceof WebAssembly.RuntimeError) throw e;
      out.failures.push({name, stage, error: e.message});
    }
  }
  assert.equal(out.files, out.completed + out.security + out.failures.length);
  assert.ok(out.sections > 0);
  // New actual arcs must trigger explicit layout/field verification, not silently count as tested.
  assert.equal(out.records.length, 0, 'New arc fixtures require explicit layout verification');
  return out;
}
