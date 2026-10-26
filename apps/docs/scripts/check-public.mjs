import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../doc_build", import.meta.url));
let checked = 0;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (/\.(?:html|js|mjs|css|json|txt|xml|svg)$/i.test(entry.name)) {
      const text = await readFile(path, "utf8");
      checked++;
      // Router libraries may contain an inert localhost URL used for parsing; private hosts and actual local links are forbidden.
      if (
        /(?:[a-z0-9-]+\.)*ts\.net\b|https?:\/\/(?:192\.168\.)/i.test(text) ||
        /(?:href|src)\s*=\s*["']https?:\/\/(?:localhost|127\.0\.0\.1)(?:[:/"'])/i.test(text)
      ) {
        throw Error(`공개 출력에 내부 네트워크 주소가 있습니다: ${path}`);
      }
    }
    if (entry.isFile() && entry.name.endsWith(".map"))
      throw Error(`공개 출력에 source map이 있습니다: ${path}`);
  }
}
await scan(root);
if (!checked) throw Error("공개 출력이 없습니다. 문서를 먼저 빌드하세요.");
console.log(`공개 출력 ${checked}개: 내부 네트워크 주소·source map 없음`);
