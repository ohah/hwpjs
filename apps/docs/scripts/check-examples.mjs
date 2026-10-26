import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("..", import.meta.url));
async function walk(dir) {
  const result = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, e.name);
    if (e.isDirectory()) result.push(...(await walk(path)));
    else if (/\.mdx?$/.test(e.name)) result.push(path);
  }
  return result;
}
let blocks = 0;
const included = new Set();
for (const path of await walk(resolve(root, "docs"))) {
  const text = await readFile(path, "utf8");
  const matches = [...text.matchAll(/<!-- example:([^\s]+) -->\s*```(?:ts|tsx)\n([\s\S]*?)\n```/g)];
  for (const [, name, code] of matches) {
    const source = await readFile(resolve(root, "examples", name), "utf8");
    if (code.trimEnd() !== source.trimEnd())
      throw Error(`예제와 문서 불일치: ${relative(root, path)} / ${name}`);
    included.add(name);
    blocks++;
  }
  // Unchecked TS snippets must not silently enter the public guide.
  const codeBlocks = [...text.matchAll(/^```(?:typescript|javascript|ts|tsx|js|jsx)\b/gm)].length;
  if (codeBlocks !== matches.length) throw Error(`타입 검사에 연결되지 않은 코드 블록: ${path}`);
}
for (const name of await readdir(resolve(root, "examples"))) {
  if (/\.tsx?$/.test(name) && !included.has(name)) throw Error(`문서에 없는 예제: ${name}`);
}
const command = resolve(root, "../../node_modules/.bin/tsc");
const result = spawnSync(command, ["--noEmit", "-p", resolve(root, "tsconfig.examples.json")], {
  encoding: "utf8",
});
const report = {
  checkedAt: new Date().toISOString(),
  exampleFiles: [...included].sort(),
  codeBlocks: blocks,
  input: "현재 packages/*/src public entry; dist/npm 아티팩트와 구분",
  exitCode: result.status,
  output: result.stdout + result.stderr,
};
await mkdir(resolve(root, "verification"), { recursive: true });
await writeFile(
  resolve(root, "verification/typecheck.json"),
  JSON.stringify(report, null, 2) + "\n",
);
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(report.output);
  process.exit(result.status ?? 1);
}
console.log(`공개 소스 타입 검사 통과: 예제 ${included.size}개, 문서 코드 블록 ${blocks}개`);
