import test from "node:test";
import { execFileSync } from "node:child_process";
for (const flags of [[], ["-O"]]) test(`prefix oracle requires present unique section and positive paragraph (${flags.join() || "normal"})`, () => {
  execFileSync("python3", [...flags, "tests/hwpx/prefix-oracle-target.py"], { timeout: 10000 });
});
