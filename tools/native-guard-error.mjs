// Bounded process/measurement diagnostics; never serialize command input buffers.
export function nativeGuardError(error) {
  return {
    name: typeof error?.name === 'string' ? error.name.slice(0, 64) : null,
    message:
      typeof error?.message === 'string' ? error.message.slice(0, 512) : 'UnknownObservationError',
    code: typeof error?.code === 'string' ? error.code.slice(0, 64) : null,
    status: Number.isSafeInteger(error?.status) ? error.status : null,
    signal: typeof error?.signal === 'string' ? error.signal.slice(0, 64) : null,
    stderr:
      typeof error?.stderr === 'string' || Buffer.isBuffer(error?.stderr)
        ? String(error.stderr).slice(0, 1024)
        : null,
  };
}
