import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { toolConfigs } from "./quality-policy.mjs";
export function assertQualityConfigs(root) {
  for (const name of [".eslintignore", ".prettierignore"])
    if (existsSync(resolve(root, name))) throw Error("canonical policy 밖의 ignore 파일: " + name);
  for (const [name, expected] of Object.entries(toolConfigs())) {
    const file = resolve(root, name);
    if (
      !existsSync(file) ||
      JSON.stringify(JSON.parse(readFileSync(file, "utf8"))) !== JSON.stringify(expected)
    )
      throw Error("품질 설정 드리프트: " + name + "; bun tools/sync-quality-config.mjs --write");
  }
}
export function syncQualityConfigs(root) {
  for (const [name, value] of Object.entries(toolConfigs()))
    writeFileSync(resolve(root, name), JSON.stringify(value, null, 2) + "\n");
}
const self = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === self) {
  try {
    const args = process.argv.slice(2),
      root = resolve(dirname(self), "..");
    if (args.length !== 1 || !["--check", "--write"].includes(args[0]))
      throw Error("사용법: bun tools/sync-quality-config.mjs --check|--write");
    if (args[0] === "--write") syncQualityConfigs(root);
    assertQualityConfigs(root);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
