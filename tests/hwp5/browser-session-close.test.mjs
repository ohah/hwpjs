import test from "node:test";
import assert from "node:assert/strict";
import { closeOwnedBrowser } from "../../tools/browser/session-close.mjs";

test("browser teardown waits through an acknowledged but still active daemon", async () => {
  const states = [{ active: true }, { active: true, runtime: { pageCount: 0, browserLaunched: false } }, { active: false }], calls = [];
  await closeOwnedBrowser((...args) => { calls.push(args); if (args[0] === "session") return states.shift(); }, { wait: async () => calls.push(["wait"]) });
  assert.deepEqual(calls, [["session", "info"], ["close"], ["session", "info"], ["close"], ["wait"], ["session", "info"]]);
});

test("browser teardown refuses unknown state and a persistently active daemon", async () => {
  for (const state of [null, {}, { active: "false" }]) await assert.rejects(closeOwnedBrowser(() => state), /InvalidBrowserSessionState/);
  let attempts = 0;
  await assert.rejects(closeOwnedBrowser(kind => { if (kind === "session") attempts++; return { active: true }; }, { attempts: 3, wait: async () => {} }), /OwnedBrowserSessionStillActive/);
  assert.equal(attempts, 4);
  for (const count of [0, -1, 1.5, 101, NaN]) await assert.rejects(closeOwnedBrowser(() => assert.fail("Must not issue a command"), { attempts: count }), /InvalidBrowserCloseAttempts/);
});

test("an already inactive owned session needs no retries", async () => {
  let closes = 0;
  await closeOwnedBrowser(kind => { if (kind === "close") closes++; return { active: false }; }, { wait: async () => assert.fail("Unexpected retry") });
  assert.equal(closes, 0);
});

test("an active browser close error is never converted to success", async () => {
  await assert.rejects(closeOwnedBrowser(kind => { if (kind === "close") throw Error("CloseFailed"); return { active: true }; }), /CloseFailed/);
});

test("a vanished close socket needs exact diagnostics and a confirmed inactive session", async () => {
  const failure = () => Object.assign(Error("CloseSocketGone"), { status: 1, signal: null, stdout: JSON.stringify({ success: false, error: "Failed to connect: No such file or directory (os error 2)" }) });
  let checks = 0, observations = 0;
  await closeOwnedBrowser(kind => { if (kind === "close") throw failure(); return { active: checks++ === 0 }; }, { onClosedSocket: () => observations++ });
  assert.equal(checks, 2); assert.equal(observations, 1);
  for (const state of [{ active: true }, null, {}, { active: "false" }]) {
    let first = true;
    await assert.rejects(closeOwnedBrowser(kind => { if (kind === "close") throw failure(); if (first) { first = false; return { active: true }; } return state; }), /CloseSocketGone/);
  }
  for (const patch of [{ signal: "SIGTERM" }, { status: 2 }, { stdout: "not JSON" }]) {
    await assert.rejects(closeOwnedBrowser(kind => { if (kind === "close") throw Object.assign(failure(), patch); return { active: true }; }), /CloseSocketGone/);
  }
});

test('asynchronous CLI adapters are awaited before ownership and close decisions',async()=>{
 let active=true,closed=0,checks=0;
 await closeOwnedBrowser(async kind=>{await Promise.resolve();if(kind==='close'){closed++;if(closed===2)active=false;return {};}checks++;return {active};},{wait:async()=>{}});
 assert.equal(closed,2);assert.equal(checks,3);assert.equal(active,false);
 const failure=Object.assign(Error('Gone'),{code:1,signal:null,stdout:JSON.stringify({success:false,error:'Failed to connect: No such file or directory (os error 2)'})});
 let first=true;await closeOwnedBrowser(async kind=>{if(kind==='close')throw failure;const state={active:first};first=false;return state;});
});
