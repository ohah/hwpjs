import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { createReaderRuntime } from "../../../../web/preview/reader-runtime.mjs";
export const artifact =
  process.env.HWPJS_TEST_WASM ?? "zig-out/verification/hwp5-object-extra-u16/bin/hwpjs.wasm";
export const modulePromise = WebAssembly.compile(readFileSync(artifact));
export const fixture = (format: string) =>
  readFileSync(
    `legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === "hwp5" ? "hwp" : "hwpx"}`,
  );
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const ok = async (runtime: ReturnType<typeof createReaderRuntime>, message: any) => {
  const reply = await runtime.request(message);
  if (reply.error !== undefined) throw Error(`${message.kind}: ${reply.error}`);
  return reply;
};
