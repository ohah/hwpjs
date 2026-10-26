import { nativeGuardError } from "./native-guard-error.mjs";

/** Parse one complete ps snapshot and return only the root and descendants. */
export function processTreeRssRows(text, root) {
  if (!Number.isSafeInteger(root) || root < 1) throw new Error("InvalidProcessRoot");
  const rows = new Map(),
    children = new Map();
  for (const line of text.trim().split("\n")) {
    if (!line.trim()) continue;
    if (!/^\s*\d+\s+\d+\s+\d+\s*$/.test(line)) throw new Error("InvalidProcessSnapshot");
    const row = line.trim().split(/\s+/).map(Number),
      [pid, parent] = row;
    if (!row.every(Number.isSafeInteger) || pid < 1 || rows.has(pid))
      throw new Error("InvalidProcessSnapshot");
    rows.set(pid, row);
    const list = children.get(parent) ?? [];
    list.push(pid);
    children.set(parent, list);
  }
  if (!rows.has(root)) return [];
  const queue = [root],
    seen = new Set(),
    output = [];
  for (let i = 0; i < queue.length; i++) {
    const pid = queue[i];
    if (seen.has(pid)) throw new Error("CyclicProcessSnapshot");
    seen.add(pid);
    output.push(rows.get(pid));
    queue.push(...(children.get(pid) ?? []));
  }
  return output;
}

/** Sampling gaps are diagnostics, never measured memory-limit violations. */
export function createRssObservations(limitKiB) {
  if (!Number.isSafeInteger(limitKiB) || limitKiB < 1) throw new Error("InvalidRssLimit");
  let observations = 0,
    maximumKiB = 0,
    failures = 0,
    consecutiveFailures = 0,
    firstError = null,
    lastError = null,
    stopped = false;
  return {
    observe(total) {
      if (!Number.isSafeInteger(total) || total < 0) throw new Error("InvalidRssTotal");
      observations++;
      maximumKiB = Math.max(maximumKiB, total);
      consecutiveFailures = 0;
      stopped ||= total > limitKiB;
      return { stop: stopped, totalKiB: total };
    },
    failure(error) {
      failures++;
      consecutiveFailures++;
      lastError = nativeGuardError(error);
      firstError ??= lastError;
      return { stop: false, error: structuredClone(lastError) };
    },
    snapshot() {
      return {
        observations,
        maximumKiB,
        limitKiB,
        failures,
        consecutiveFailures,
        firstError: structuredClone(firstError),
        lastError: structuredClone(lastError),
        stopped,
      };
    },
  };
}
