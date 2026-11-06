/** The host returns true only after its current document/selection has painted. */
export function focusNewDocumentAfterPaint(options: {
  signal: AbortSignal;
  current(): boolean;
  focus(): boolean;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(handle: number): void;
}) {
  let handle: number | undefined,
    remaining = 180;
  const stop = () => {
    if (handle !== undefined) options.cancelFrame(handle);
    handle = undefined;
    options.signal.removeEventListener('abort', stop);
  };
  const attempt = () => {
    handle = undefined;
    if (options.signal.aborted || !options.current() || --remaining < 0 || options.focus()) {
      stop();
      return;
    }
    handle = options.requestFrame(attempt);
  };
  if (options.signal.aborted) return;
  options.signal.addEventListener('abort', stop, { once: true });
  handle = options.requestFrame(attempt);
}
