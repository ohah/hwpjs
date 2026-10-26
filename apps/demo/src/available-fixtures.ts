// @ts-ignore Existing static catalog is shared with the server; never accept paths from HTTP.
import { demoFixtures } from "../../../web/preview/fixture-catalog.mjs";
// @ts-ignore Existing tracked inventory owns the immediate built-in selection list.
import { trackedDemoFixtures } from "../../../web/preview/fixture-inventory.mjs";

export const availableFixturesEndpoint = "/demo-fixture-catalog.json";
export interface AvailableFixture {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  /** File availability only. This does not promise Native parsing/editing support. */
  readonly available: boolean;
}
type CatalogEntry = { readonly id: string; readonly name: string; readonly label?: string };
const catalog = demoFixtures as readonly CatalogEntry[];
const builtInIds = new Set((trackedDemoFixtures as readonly CatalogEntry[]).map((item) => item.id));
const project = (item: CatalogEntry, available: boolean): AvailableFixture =>
  Object.freeze({ id: item.id, name: item.name, label: item.label ?? item.name, available });

/** Render immediately; bind option.disabled = !fixture.available.
 * Optional references stay disabled until a successful server refresh.
 * On refresh failure retain this/previous list; report the error separately.
 */
export function getInitialAvailableFixtures(): readonly AvailableFixture[] {
  return Object.freeze(catalog.map((item) => project(item, builtInIds.has(item.id))));
}

function invalid(): never {
  throw Error("InvalidAvailableFixtureCatalog");
}
/** Read only data descriptors: injected fetch results must not execute Node getters. */
function data(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !("value" in descriptor)) return invalid();
  return descriptor.value;
}
export function parseAvailableFixtures(value: unknown): readonly AvailableFixture[] {
  if (!Array.isArray(value) || value.length !== catalog.length) return invalid();
  const expected = new Map(catalog.map((item) => [item.id, item]));
  const found = new Map<string, boolean>();
  for (let index = 0; index < value.length; index++) {
    const entry: unknown = data(value, String(index));
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return invalid();
    const keys = Reflect.ownKeys(entry);
    if (
      keys.length !== 4 ||
      keys.some((key) => !["id", "name", "label", "available"].includes(String(key)))
    )
      return invalid();
    const id = data(entry, "id"),
      name = data(entry, "name"),
      label = data(entry, "label"),
      available = data(entry, "available");
    if (typeof id !== "string" || typeof available !== "boolean") return invalid();
    const item = expected.get(id);
    if (!item || found.has(id) || name !== item.name || label !== (item.label ?? item.name))
      return invalid();
    found.set(id, available);
  }
  return Object.freeze(catalog.map((item) => project(item, found.get(item.id)!)));
}

export type AvailableFixturesFetch = (
  input: string,
  init: {
    readonly signal?: AbortSignal;
    readonly cache: "no-store";
    readonly credentials: "same-origin";
  },
) => Promise<{ readonly ok: boolean; json(): Promise<unknown> }>;
/** Explicit fetch injection; no global fetch, DOM or Native effects at import time.
 * Rejects HTTP/network/schema failures and cancellation, including after JSON reads.
 * Caller owns stale-request fencing when publishing results to the shell.
 */
export async function fetchAvailableFixtures(
  fetcher: AvailableFixturesFetch,
  signal?: AbortSignal,
): Promise<readonly AvailableFixture[]> {
  signal?.throwIfAborted();
  const load = async () => {
    signal?.throwIfAborted();
    const response = await fetcher(availableFixturesEndpoint, {
      signal,
      cache: "no-store",
      credentials: "same-origin",
    });
    signal?.throwIfAborted();
    if (!response.ok) throw Error("AvailableFixtureCatalogRequestFailed");
    const value: unknown = await response.json();
    signal?.throwIfAborted();
    return parseAvailableFixtures(value);
  };
  if (!signal) return load();
  // Settle promptly even if an injected fetch/JSON reader ignores cancellation.
  return new Promise((resolve, reject) => {
    const aborted = () => {
      cleanup();
      reject(signal.reason);
    };
    const cleanup = () => signal.removeEventListener("abort", aborted);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) {
      aborted();
      return;
    }
    load().then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}
