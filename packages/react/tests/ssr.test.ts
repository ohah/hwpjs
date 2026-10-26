import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("real public vanilla import and React SSR need no DOM/Worker/fetch", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./ssr-import-fixture.ts", import.meta.url))],
    { encoding: "utf8", timeout: 15000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("SSR render OK");
});
