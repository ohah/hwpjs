import { readFileSync } from "node:fs";
import { createHwp5Reader } from "../js/hwp5.mjs";

if (process.argv.length !== 3) {
  process.stderr.write("Usage: node tools/hwp5-text-preview.mjs FILE.hwp\n");
  process.exitCode = 2;
} else {
  const reader = await createHwp5Reader(readFileSync(new URL("../zig-out/bin/hwpjs.wasm", import.meta.url)));
  try {
    const result = reader.readText(readFileSync(process.argv[2]));
    process.stdout.write(`${JSON.stringify({
      version: result.version.join("."),
      sections: result.sections.map(section => ({
        index: section.index,
        paragraphs: section.paragraphs.map(paragraph => ({
          nodeIndex: paragraph.nodeIndex,
          parentNodeIndex: paragraph.parentNodeIndex,
          declaredUnits: paragraph.declaredUnits,
          textPresent: paragraph.textPresent,
          text: paragraph.text,
          controls: paragraph.tokens.filter(token => token.type === "control").map(token => ({ code: token.code, startUnit: token.startUnit })),
        })),
      })),
    }, null, 2)}\n`);
  } finally {
    reader.close();
  }
}
