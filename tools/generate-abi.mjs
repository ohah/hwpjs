import { readFileSync } from "node:fs";
import { ABI_VERSION, FIELD, VALUE, DOCUMENT } from "../js/abi-schema.mjs";

const enumeration = (name, entries) =>
  `pub const ${name} = enum(u32) {\n` +
  Object.entries(entries)
    .map(([key, value]) => `    ${key} = ${value},\n`)
    .join("") +
  "    _,\n};\n";
const generated =
  "// Generated from js/abi-schema.mjs by tools/generate-abi.mjs. Do not edit.\n" +
  `pub const version: u32 = ${ABI_VERSION};\n` +
  enumeration("Field", FIELD) +
  enumeration("Value", VALUE) +
  "pub const document = struct {\n" +
  Object.entries(DOCUMENT)
    .map(([key, value]) => `    pub const ${key}: usize = ${value};\n`)
    .join("") +
  "};\n";
if (process.argv.includes("--check")) {
  if (
    readFileSync(
      new URL("../src/wasm/abi_schema.zig", import.meta.url),
      "utf8",
    ) !== generated
  )
    throw new Error(
      "ABI schema drift: regenerate src/wasm/abi_schema.zig with tools/generate-abi.mjs",
    );
} else process.stdout.write(generated);
