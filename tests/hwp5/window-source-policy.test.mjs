import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

assert(process.env.HWPJS_TEST_WASM, "Explicit window source-policy candidate required");
const candidate = readFileSync(process.env.HWPJS_TEST_WASM);
const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");
const policyExport = "hwp5_edit_validate_text_source_policy";

async function worker(t, wasm, fault = false) {
  const previous = {
      self: globalThis.self,
      fetch: globalThis.fetch,
      instantiate: WebAssembly.instantiate,
    },
    replies = [];
  let failing = fault;
  if (fault) {
    const wrap = (instance) => ({
      exports: {
        ...instance.exports,
        [policyExport]: (section) => instance.exports[policyExport](failing ? 0xffffffff : section),
      },
    });
    WebAssembly.instantiate = async (...args) => {
      const value = await previous.instantiate(...args);
      return value.instance ? { ...value, instance: wrap(value.instance) } : wrap(value);
    };
  }
  globalThis.self = { postMessage: (reply) => replies.push(reply) };
  globalThis.fetch = async () => new Response(wasm);
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
  t.after(async () => {
    try {
      if (typeof self.onmessage === "function")
        await send({ kind: "load", format: "test-close", bytes: [] });
    } finally {
      WebAssembly.instantiate = previous.instantiate;
      globalThis.fetch = previous.fetch;
      if (previous.self === undefined) delete globalThis.self;
      else globalThis.self = previous.self;
    }
  });
  await import(`../../web/preview/reader-worker.mjs?window-policy=${Math.random()}`);
  assert.equal((await send({ kind: "load", format: "hwp5", bytes: input })).error, undefined);
  return {
    send,
    fault: (value) => {
      failing = value;
    },
  };
}

test("window query policy failures stay readonly without changing activation active window source or redo", async (t) => {
  const h = await worker(t, candidate, true);
  const readonly = (reply) => {
    assert.equal(reply.error, undefined);
    assert.equal(reply.content.textSourcePolicyAvailable, true);
    assert.equal(reply.content.readOnly, true);
    assert(
      reply.content.paragraphs.every(
        (row) => row.editable === false && row.textSourcePolicyError === "InvalidSection",
      ),
    );
    assert(
      reply.content.paragraphs
        .filter((row) => row.windowContext)
        .every((row) => row.selectable === false),
    );
  };
  readonly(await h.send({ kind: "query-window", offset: 1, count: 1 }));
  assert.equal(
    (await h.send({ kind: "query-edit-window", offset: 1, count: 1 })).error,
    "EditorNotOpen",
  );
  readonly(await h.send({ kind: "enable" }));
  readonly(await h.send({ kind: "set-edit-window", offset: 1, count: 1 }));
  h.fault(false);
  assert.equal(
    (
      await h.send({
        kind: "splice",
        section: 0,
        paragraph: 1,
        startUnit: 0,
        endUnit: 0,
        text: "policy😀",
      })
    ).error,
    undefined,
  );
  const undone = await h.send({ kind: "undo" });
  assert.equal(undone.error, undefined);
  h.fault(true);
  const query = await h.send({ kind: "query-edit-window", offset: 0, count: 1 });
  readonly(query);
  assert.equal(undone.historyRevision, 0);
  assert.equal(query.historyRevision, undone.historyRevision);
  assert(Array.isArray(undone.historyRevisions) && undone.historyRevisions.length > 0);
  assert.deepEqual(query.historyRevisions, undone.historyRevisions);
  readonly(await h.send({ kind: "query-window", offset: 0, count: 1 }));
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  h.fault(false);
  const recovered = await h.send({ kind: "query-edit-window", offset: 1, count: 1 });
  assert.equal(recovered.error, undefined);
  const recoveredRow = recovered.content.paragraphs.find((row) => !row.windowContext);
  assert.equal(recoveredRow.editable, true);
  assert.equal(
    recoveredRow.textSourcePolicyError,
    null,
    "a failed response must not poison later policy queries",
  );
  assert.equal(recovered.historyRevision, undone.historyRevision);
  assert.deepEqual(recovered.historyRevisions, undone.historyRevisions);
  const redone = await h.send({ kind: "redo" });
  assert.equal(redone.error, undefined);
  assert.equal(redone.changed, true);
  assert.equal(
    redone.content.window.requestedOffset,
    1,
    "queries must not replace the active window",
  );
  assert.equal(redone.content.textSourcePolicyAvailable, true);
  const selected = redone.content.paragraphs.find((row) => !row.windowContext);
  assert.equal(selected.editable, true);
  assert.equal(selected.textSourcePolicyError, null);
  assert(selected.text.startsWith("policy😀"));
});

test("window query optional policy ABI absence is explicit rather than a checked permission", async (t) => {
  const old = Buffer.from(candidate),
    offset = old.indexOf(policyExport);
  assert(offset >= 0);
  old[offset] = "x".charCodeAt(0);
  assert.equal(
    WebAssembly.Module.exports(new WebAssembly.Module(old)).some(
      (row) => row.name === policyExport,
    ),
    false,
  );
  const h = await worker(t, old);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  for (const kind of ["query-window", "query-edit-window"]) {
    const reply = await h.send({ kind, offset: 1, count: 1 });
    assert.equal(reply.error, undefined);
    assert.equal(reply.content.textSourcePolicyAvailable, false);
    assert.equal(
      reply.content.paragraphs.find((row) => !row.windowContext).editable,
      true,
      "keep explicit old-ABI compatibility distinct",
    );
  }
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
});
