import test from "node:test";
import assert from "node:assert/strict";
import { paintNumberPrefix } from "../../web/preview/number-prefix-paint.mjs";

test("stored prefix paint shares native owner style and scrolling geometry", () => {
  const calls = [], owner = {};
  const ctx = { fillText: (...args) => calls.push(args) };
  const fontAt = (paragraph, unit, kind) => { assert.equal(paragraph, owner); assert.equal(unit, 0); assert.equal(kind, "number-prefix"); return "12px serif"; };
  fontAt.script = () => ({ offset: -2 });
  assert.equal(paintNumberPrefix(ctx, { x: 30, y: 100, textTop: 8, numberPrefix: { text: "7." } }, 0, owner, fontAt, 40), true);
  assert.equal(ctx.font, "12px serif");
  assert.deepEqual(calls, [["7.", 30, 66]]);
  assert.equal(paintNumberPrefix(ctx, {}, 0, owner, fontAt, 40), false);
  assert.equal(calls.length, 1);
});
