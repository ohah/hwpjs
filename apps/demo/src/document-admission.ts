interface AdmissionOptions {
  cancelLoad(): Promise<void>;
  load(bytes: Uint8Array, name: string, signal: AbortSignal): Promise<unknown>;
  confirmReplace?(signal: AbortSignal): Promise<boolean>;
  loading(name: string): void;
  loaded(name: string): void;
  settled(): void;
}

/** File reads, constructor work and candidate loads share one replacement generation. */
export function createDocumentAdmission(options: AdmissionOptions) {
  let generation = 0,
    closed = false,
    abort: AbortController | undefined;
  const pending = new Set<Promise<void>>();
  let disposal: Promise<void> | undefined;
  function replace(
    name: string,
    operation: (signal: AbortSignal, bytes?: Uint8Array) => Promise<string | void>,
    read?: (signal: AbortSignal) => Promise<Uint8Array>,
  ): Promise<void> {
    if (closed) return Promise.reject(Error('DocumentAdmissionDisposed'));
    const current = ++generation;
    abort?.abort();
    const controller = (abort = new AbortController());
    // Invoke cancellation at admission, before any delayed file read/constructor.
    // Consent must precede cancellation so refusal preserves a locked candidate too.
    const cancellation = options.confirmReplace
      ? options.confirmReplace(controller.signal).then(async (accepted) => {
          if (!accepted || !active()) return false;
          await options.cancelLoad();
          return true;
        })
      : options.cancelLoad().then(() => true);
    void cancellation.catch(() => {});
    options.loading(name);
    const reading = read ? Promise.resolve().then(() => read(controller.signal)) : undefined;
    void reading?.catch(() => {});
    function active() {
      return !closed && current === generation && !controller.signal.aborted;
    }
    const task = (async () => {
      try {
        if (!(await cancellation) || !active()) return;
        const bytes = await reading;
        if (!active()) return;
        const resultName = await operation(controller.signal, bytes);
        if (active()) options.loaded(resultName ?? name);
      } catch (error) {
        if (active()) throw error;
      } finally {
        if (active()) options.settled();
      }
    })();
    pending.add(task);
    void task.then(
      () => pending.delete(task),
      () => pending.delete(task),
    );
    return task;
  }
  return {
    open(name: string, read: (signal: AbortSignal) => Promise<Uint8Array>): Promise<void> {
      return replace(
        name,
        async (signal, bytes) => {
          if (signal.aborted) return;
          await options.load(bytes!, name, signal);
        },
        read,
      );
    },
    replace,
    dispose(): Promise<void> {
      if (disposal) return disposal;
      closed = true;
      generation++;
      abort?.abort();
      const cancellation = options.cancelLoad();
      disposal = (async () => {
        await cancellation;
        await Promise.allSettled(pending);
      })();
      return disposal;
    },
  };
}
