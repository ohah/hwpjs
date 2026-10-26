import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createHwpxPasswordDecoder } from "../../js/hwpx-password.mjs";
import { createHwp5PasswordDecoder } from "../../js/hwp5-password.mjs";
import { createHwpxReader } from "../../js/hwpx.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";

const cases = [
  {
    file: "HWP5-password-123456.hwpx",
    decoder: createHwpxPasswordDecoder,
    reader: createHwpxReader,
    hwpx: true,
    paragraphs: 418,
  },
  {
    file: "hwp3-sample16-hwp5-2024-password-123456.hwp",
    decoder: createHwp5PasswordDecoder,
    reader: createHwp5Reader,
    hwpx: false,
    paragraphs: 4282,
  },
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

for (const item of cases) {
  const path = "reference/rhwp/samples/" + item.file;
  test(
    `reference protected reader verifies explicit fixture password and immutable input: ${item.file}`,
    { skip: !existsSync(path) && "RHWP reference fixture is not installed" },
    async () => {
      const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
      const input = readFileSync(path),
        originalDigest = digest(input);
      const decoder = await item.decoder(wasm);
      let reader;
      try {
        let rejected = false;
        try {
          rejected = decoder.decryptToPlaintext(input, "incorrect-fixture-password") === null;
        } catch (error) {
          assert.equal(error.message, "WrongPasswordOrCorruptPayload");
          rejected = true;
        }
        assert(rejected, "a wrong password must not return a plaintext document");
        assert.equal(digest(input), originalDigest);
        // Public example password named by the fixture; not account credentials.
        const plaintext = decoder.decryptToPlaintext(input, "123456");
        assert(plaintext instanceof Uint8Array);
        const plaintextDigest = digest(plaintext);
        reader = await item.reader(wasm);
        const paragraphs = item.hwpx
          ? reader.readTextEvents(plaintext).paragraphCount
          : reader
              .readText(plaintext)
              .sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
        assert.equal(paragraphs, item.paragraphs);
        assert.equal(digest(plaintext), plaintextDigest);
        assert.equal(digest(input), originalDigest);
      } finally {
        reader?.close();
        decoder.close();
      }
    },
  );
}
