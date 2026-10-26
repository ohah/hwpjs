import type { CanvasSurface, CanvasSurfaceProps, SurfaceFactory } from "./types.ts";

/** Serial surface replacement, never a second document/command queue. */
export function createSurfaceLifecycle(root: HTMLElement, create: SurfaceFactory) {
  let latest: CanvasSurfaceProps | undefined, mounted: CanvasSurfaceProps | undefined;
  let surface: CanvasSurface | undefined,
    closed = false,
    epoch = 0;
  let failedDisposal = false;
  let statusOwner: object | undefined;
  let pending: Promise<void> = Promise.resolve();
  const report = (error: unknown) => {
    try {
      latest?.onError?.(error);
    } catch {
      /* terminal UI error sink */
    }
  };
  const disposeCurrent = async () => {
    statusOwner = undefined;
    const previous = surface;
    surface = undefined;
    mounted = undefined;
    if (previous) {
      try {
        await previous.dispose();
      } catch (error) {
        failedDisposal = true;
        throw error;
      }
    }
  };
  const sameHost = (a: CanvasSurfaceProps | undefined, b: CanvasSurfaceProps) =>
    a?.editor === b.editor && a?.environment === b.environment;
  const schedule = (version: number) => {
    pending = pending
      .then(async () => {
        if (closed) {
          await disposeCurrent();
          return;
        }
        const next = latest!;
        if (version !== epoch || failedDisposal) return;
        if (sameHost(mounted, next) && surface) {
          if (next.scale !== undefined) surface.setScale(next.scale);
          return;
        }
        await disposeCurrent();
        if (closed || version !== epoch) return;
        const owner = {};
        statusOwner = owner;
        const created = await create({
          root,
          editor: next.editor,
          environment: next.environment,
          onStatus: (message) => {
            if (!closed && statusOwner === owner) latest?.onStatus?.(message);
          },
        });
        surface = created;
        mounted = next;
        if (closed || !latest || !sameHost(next, latest)) {
          await disposeCurrent();
          return;
        }
        if (latest.scale !== undefined) created.setScale(latest.scale);
        latest?.onReady?.(created);
      })
      .catch(report);
  };
  return {
    update(props: CanvasSurfaceProps) {
      if (closed) return;
      latest = props;
      schedule(++epoch);
    },
    getSurface: () => surface,
    settled: () => pending,
    destroy(): Promise<void> {
      if (!closed) {
        closed = true;
        ++epoch;
        schedule(epoch);
      }
      return pending;
    },
  };
}
