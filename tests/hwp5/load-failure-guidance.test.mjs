import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadFailureMessage } from "../../web/preview/load-failure-guidance.mjs";

test("section-count load guidance keeps the native code and uncertainty without repairing input", () => {
  const error = Object.freeze({ message: "SectionCountMismatch" });
  const text = loadFailureMessage(error);
  assert(text.startsWith("SectionCountMismatch:"));
  for (const fragment of ["선언된 구역 수", "일치하지 않습니다", "일부 구역 누락 또는 오래된 메타데이터", "파일을 변경하지 않았습니다", "다시 저장한 사본"]) assert(text.includes(fragment));
  assert.equal(loadFailureMessage("SectionCountMismatch"), text);
  assert.equal(error.message, "SectionCountMismatch");
  assert.doesNotMatch(text, /손상된 파일입니다|자동.*복구|편집.*허용/);
});

test("load guidance does not relabel unknown runtime errors or partial native code matches", () => {
  for (const code of ["InvalidFat", "OutOfMemory", "SectionCountMismatch at offset 12", "toString", "__proto__"]) assert.equal(loadFailureMessage(new Error(code)), code);
  assert.equal(loadFailureMessage({ get message() { throw new Error("getter"); } }), "알 수 없는 오류");
  assert.equal(loadFailureMessage(null), "알 수 없는 오류");
  const source = readFileSync(new URL("../../web/preview/app.mjs", import.meta.url), "utf8");
  assert(source.includes('else if (event.data.kind === "load") fail(loadFailureMessage(event.data.error));'));
});
