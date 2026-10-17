import { setTimeout as pause } from "node:timers/promises";

// Call only for a session acquired while inactive by this audit's caller.
export async function closeOwnedBrowser(command, { attempts = 10, wait = () => pause(100) } = {}) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 100) throw Error("InvalidBrowserCloseAttempts");
  command("close");
  for (let index = 0; index < attempts; index++) {
    const state = command("session", "info");
    if (state?.active === false) return;
    if (state?.active !== true) throw Error("InvalidBrowserSessionState");
    // A close acknowledgment can precede daemon teardown. Never promote that
    // acknowledgment or a zero-page browser into proof of complete cleanup.
    command("close");
    await wait();
  }
  throw Error("OwnedBrowserSessionStillActive");
}
