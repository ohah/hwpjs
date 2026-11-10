// One completion classifier for synchronous Native edit ABIs. Never retry an
// edit whose primitive completion was observed, even if cleanup later fails.
export function applyNativeEdit(memory, bytes, invoke, invalidResult) {
  let started = false,
    readingDiagnostic = false,
    completed;
  try {
    return memory.withBytes(bytes, (ptr, size) => {
      started = true;
      const code = invoke(ptr, size);
      if (![0, 1, 2, 3].includes(code))
        return (completed = { application: 'unknown', changed: null, error: invalidResult });
      completed = {
        nativeCode: code,
        application: code === 1 ? 'applied' : code === 3 ? 'unknown' : 'unapplied',
        changed: code === 3 ? null : code === 1,
      };
      if (code === 0 || code === 3) {
        readingDiagnostic = true;
        completed.error = memory.error().message;
        readingDiagnostic = false;
      }
      return completed;
    });
  } catch (error) {
    if (!started) throw error;
    const message = error?.message || String(error);
    if (completed)
      return {
        ...completed,
        ...(readingDiagnostic ? { error: message } : { cleanupError: message }),
        refreshRequired: true,
      };
    return { application: 'unknown', changed: null, error: message };
  }
}
