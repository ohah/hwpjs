import { readFileSync } from "node:fs";
import { createCfbReader } from "./cfb.mjs";

/** Host-only file adapter. The WASM core remains filesystem-independent. */
export async function createNodeCfbReader(source) {
  const reader = await createCfbReader(source);
  return {
    ...reader,
    read(data, options = {}) {
      return options.type === "file"
        ? reader.parse(readFileSync(data), options)
        : reader.read(data, options);
    },
  };
}
