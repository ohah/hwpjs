import { setTimeout as pause } from 'node:timers/promises';

// Call only for a session acquired while inactive by this audit's caller.
export async function closeOwnedBrowser(
  command,
  { attempts = 10, wait = () => pause(100), onClosedSocket = () => {} } = {},
) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 100)
    throw Error('InvalidBrowserCloseAttempts');
  const initial = await command('session', 'info');
  if (initial?.active === false) return;
  if (initial?.active !== true) throw Error('InvalidBrowserSessionState');
  const requestClose = async () => {
    try {
      await command('close');
      return false;
    } catch (error) {
      let disconnected = false;
      try {
        const result = JSON.parse(error.stdout);
        disconnected =
          (error.status ?? error.code) === 1 &&
          error.signal == null &&
          result.success === false &&
          result.error === 'Failed to connect: No such file or directory (os error 2)';
      } catch {
        /* Other command errors are never success. */
      }
      if (!disconnected) throw error;
      if ((await command('session', 'info'))?.active !== false) throw error;
      onClosedSocket();
      return true;
    }
  };
  if (await requestClose()) return;
  for (let index = 0; index < attempts; index++) {
    const state = await command('session', 'info');
    if (state?.active === false) return;
    if (state?.active !== true) throw Error('InvalidBrowserSessionState');
    // A close acknowledgment can precede daemon teardown. Never promote that
    // acknowledgment or a zero-page browser into proof of complete cleanup.
    if (await requestClose()) return;
    await wait();
  }
  throw Error('OwnedBrowserSessionStillActive');
}
