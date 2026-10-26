import assert from "node:assert/strict";
import { execFileSync } from "../../tools/oracle-process.mjs";

// One assertion contract shared by both format gates; Python owns the cases.
export function assertPlainSpliceOracleSelfTest() {
  for (const flags of [[], ["-O"]]) {
    const output = execFileSync(
      "python3",
      [...flags, "tools/hwpx-plain-splice-oracle.py", "--self-test"],
      { encoding: "utf8", timeout: 30000 },
    );
    const match = output.match(
      /^Plain splice oracle: valid boundary insertion and (\d+) counterexamples verified\n$/,
    );
    assert(match, "Independent oracle self-test must finish");
    assert(Number(match[1]) >= 23, "Plain text and protected-number negative cases must run");
  }
}
