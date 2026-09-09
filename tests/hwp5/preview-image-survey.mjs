// Explicit read-only corpus survey; names are corpus-relative, payloads are never logged.
import {readFileSync,readdirSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {digest,observePreviewFile,summarizePreviewEvidence} from './preview-image-evidence.mjs';

const roots = process.argv.slice(2);
if (!roots.length) roots.push('legacy/rust/crates/hwp-core/tests/fixtures');
const cfb = await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
const rows = [];
try {
  for (const root of roots) {
    // Deliberately direct children only; no implicit recursive or symlink traversal.
    for (const entry of readdirSync(root,{withFileTypes:true}).filter(e=>e.isFile() && /\.hwp$/i.test(e.name)).sort((a,b)=>a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const bytes = readFileSync(`${root}/${entry.name}`);
      rows.push({file:`${root}/${entry.name}`,sha256:digest(bytes),result:observePreviewFile(cfb,bytes)});
    }
  }
  console.log(JSON.stringify({scope:'direct-child HWP-named files; signature evidence only',summary:summarizePreviewEvidence(rows),rows},null,2));
} finally { cfb.close(); }
