// Delay is diagnostic only: never cancel or duplicate an in-flight module load.
export async function startPreview({ load, notify, setTimer = setTimeout, clearTimer = clearTimeout }) {
  notify({ kind: "loading" });
  let settled = false;
  const timer = setTimer(() => { if (!settled) notify({ kind: "slow" }); }, 15000);
  try {
    await load();
    notify({ kind: "ready" });
    return true;
  } catch (error) {
    notify({ kind: "failed", error });
    return false;
  } finally {
    settled = true;
    clearTimer(timer);
  }
}
