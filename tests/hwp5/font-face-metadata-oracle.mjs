import assert from "node:assert/strict";
import { readStreams, records } from "./style-preservation/text-record-oracle.mjs";
import { inflateRawSync } from "node:zlib";
import { FONT_LANGUAGES } from "../../js/font-faces.mjs";

/** Independent byte offsets and UTF16 decoding, never product snapshots. */
export function expectedFontMetadata(input) {
  const streams = readStreams(input),
    header = streams.get("FileHeader");
  assert.equal(header.readUInt32LE(36) & 2, 0, "EncryptedFontOracleInput");
  const bytes = streams.get("DocInfo");
  const rows = records(
    header.readUInt32LE(36) & 1
      ? inflateRawSync(bytes, { maxOutputLength: 32 * 1024 * 1024 })
      : bytes,
  );
  const mapping = rows.find((row) => row.tag === 17).payload;
  const counts = FONT_LANGUAGES.map((_, i) => mapping.readInt32LE((i + 1) * 4));
  let language = 0,
    id = 0;
  const result = rows
    .filter((row) => row.tag === 19)
    .map(({ payload: bytes }) => {
      while (language < counts.length && id === counts[language]) {
        language++;
        id = 0;
      }
      assert.ok(language < counts.length);
      let at = 1;
      const string = () => {
        const length = bytes.readUInt16LE(at);
        at += 2;
        assert.ok(at + length * 2 <= bytes.length);
        const raw = bytes.subarray(at, at + length * 2);
        at += length * 2;
        try {
          return new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true }).decode(raw);
        } catch {
          return null;
        }
      };
      string();
      const attributes = bytes[0];
      const substitute = attributes & 128 ? { kind: bytes.readUInt8(at++), name: string() } : null;
      let typeInfo = null;
      if (attributes & 64) {
        assert.ok(at + 10 <= bytes.length);
        typeInfo = [...bytes.subarray(at, at + 10)];
        at += 10;
      }
      const defaultName = attributes & 32 ? string() : null;
      return {
        language: FONT_LANGUAGES[language],
        id: id++,
        attributes,
        substitute,
        typeInfo,
        defaultName,
      };
    });
  assert.equal(
    result.length,
    counts.reduce((a, b) => a + b, 0),
  );
  return result;
}
