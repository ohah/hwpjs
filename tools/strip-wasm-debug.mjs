// Generate a separate deployment artifact; never overwrite source or an existing output.
import { readFileSync, writeFileSync } from "node:fs";
import { compareWasmRuntime, stripWasmDebug } from "./wasm-runtime-parity.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error("Usage: node tools/strip-wasm-debug.mjs INPUT.wasm NEW_OUTPUT.wasm");
  const input = readFileSync(args[0]), output = stripWasmDebug(input);
  writeFileSync(args[1], output, { flag: "wx" });
  console.log(JSON.stringify(compareWasmRuntime(input, output), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
