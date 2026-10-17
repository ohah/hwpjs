import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";
import { createTextStyle } from "../../web/preview/text-style.mjs";

const base = "reference/rhwp/samples/text-align-2";
const available = existsSync(`${base}.hwp`) && existsSync(`${base}.pdf`);
const executable = spawnSync("pdftohtml", ["-v"], { encoding: "utf8", timeout: 10000 });
const skip = !available ? "RHWP paired reference is not installed" : executable.error?.code === "ENOENT" ? "pdftohtml is not installed" : false;

test("paired PDF reference agrees with HWP5 title and body declared font sizes", { skip }, () => {
  const converted = spawnSync("pdftohtml", ["-xml", "-stdout", "-i", "-f", "1", "-l", "1", "-zoom", "1", `${base}.pdf`], { encoding: "utf8", timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
  assert.ifError(converted.error);
  assert.equal(converted.status, 0, converted.stderr);
  const xml = converted.stdout;
  const fonts = new Map([...xml.matchAll(/<fontspec id="(\d+)" size="([\d.]+)"/g)].map(m => [m[1], Number(m[2])]));
  const texts = [...xml.matchAll(/<text [^>]*font="(\d+)"[^>]*>([^<]*)<\/text>/g)];
  const normalize = text => text.replace(/\s/g, "");
  const source = inspect(readFileSync(`${base}.hwp`));
  const characterShapes = records(source.decode(source.streams.get("DocInfo")))
    .filter(row => row.tag === 21).map((row, id) => ({ id, height: row.payload.readInt32LE(42) }));
  const style = createTextStyle({ format: "hwp5", characterShapes }, "16px sans-serif");
  const body = records(source.sections[0].bytes);
  for (const [needle, expectedPoints] of [["□ 국어 변화 관측 및 다양성 보존 체계 마련", 16], ["ㅇ 세대별", 15]]) {
    const index = body.findIndex(row => row.tag === 67 && row.payload.toString("utf16le").includes(needle));
    assert.ok(index >= 0, needle);
    const text = body[index].payload.toString("utf16le");
    let end = index + 1;
    while (end < body.length && body[end].tag !== 66) end++;
    const runs = body.slice(index + 1, end).find(row => row.tag === 68);
    assert.ok(runs, needle);
    const id = runs.payload.readUInt32LE(4);
    const pdf = texts.find(m => normalize(m[2]).includes(normalize(needle)));
    assert.ok(pdf, needle);
    assert.equal(fonts.get(pdf[1]), expectedPoints, needle);
    assert.equal(characterShapes[id].height, expectedPoints * 100, needle);
    const paragraph = { text, characterRanges: [{ start: 0, end: text.length, charShapeId: id }] };
    assert.ok(Math.abs(style.fontHeight(paragraph, 0) - expectedPoints * 96 / 72) < 1e-8);
    // This checks declared sizes, not PDF ink bounds, substitution or Canvas shaping.
  }
});
