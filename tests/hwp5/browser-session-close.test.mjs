import test from "node:test";
import assert from "node:assert/strict";
import { closeOwnedBrowser } from "../../tools/browser/session-close.mjs";

test("browser teardown waits through an acknowledged but still active daemon", async () => {
  const states = [{ active: true, runtime: { pageCount: 0, browserLaunched: false } }, { active: false }], calls = [];
  await closeOwnedBrowser((...args) => { calls.push(args); if (args[0] === "session") return states.shift(); }, { wait: async () => calls.push(["wait"]) });
  assert.deepEqual(calls, [["close"], ["session", "info"], ["close"], ["wait"], ["session", "info"]]);
});

test("browser teardown refuses unknown state and a persistently active daemon", async () => {
  for (const state of [null, {}, { active: "false" }]) await assert.rejects(closeOwnedBrowser(() => state), /InvalidBrowserSessionState/);
  let attempts = 0;
  await assert.rejects(closeOwnedBrowser(kind => { if (kind === "session") attempts++; return { active: true }; }, { attempts: 3, wait: async () => {} }), /OwnedBrowserSessionStillActive/);
  assert.equal(attempts, 3);
  for (const count of [0, -1, 1.5, 101, NaN]) await assert.rejects(closeOwnedBrowser(() => assert.fail("Must not issue a command"), { attempts: count }), /InvalidBrowserCloseAttempts/);
});

test("an already inactive owned session needs no retries", async () => {
  let closes = 0;
  await closeOwnedBrowser(kind => { if (kind === "close") closes++; return { active: false }; }, { wait: async () => assert.fail("Unexpected retry") });
  assert.equal(closes, 1);
});
