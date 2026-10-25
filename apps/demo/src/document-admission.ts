interface AdmissionOptions {
  cancelLoad(): Promise<void>;
  load(bytes: Uint8Array, name: string, signal: AbortSignal): Promise<unknown>;
  loading(name: string): void;
  loaded(name: string): void;
  settled(): void;
}

/** File reads/fetches and candidate loads share one replacement generation. */
export function createDocumentAdmission(options: AdmissionOptions) {
  let generation = 0, closed = false, abort: AbortController | undefined;
  const pending = new Set<Promise<void>>();
  let disposal: Promise<void> | undefined;
  return {
    open(name: string, read: (signal: AbortSignal) => Promise<Uint8Array>): Promise<void> {
      if (closed) return Promise.reject(Error('DocumentAdmissionDisposed'));
      const current = ++generation;
      abort?.abort(); const controller = abort = new AbortController();
      // Invoke now: a delayed cancellation must never cancel a newer load.
      const cancellation = options.cancelLoad();
      // Observe rejection immediately while the potentially slow file read runs.
      void cancellation.catch(() => {});
      options.loading(name);
      const active = () => !closed && current === generation && !controller.signal.aborted;
      const task = (async () => {
        try {
          const bytes = await read(controller.signal);
          await cancellation;
          if (!active()) return;
          await options.load(bytes, name, controller.signal);
          if (active()) options.loaded(name);
        } catch (error) { if (active()) throw error; }
        finally { if (active()) options.settled(); }
      })();
      pending.add(task);
      void task.then(() => pending.delete(task), () => pending.delete(task));
      return task;
    },
    dispose(): Promise<void> {
      if (disposal) return disposal;
      closed = true; generation++; abort?.abort();
      const cancellation = options.cancelLoad();
      disposal = (async () => {
        await cancellation;
        await Promise.allSettled([...pending]);
      })();
      return disposal;
    },
  };
}
