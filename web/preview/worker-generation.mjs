// File replacement invalidates both successful replies and delayed errors.
export function guardGeneration(current, epoch, callback) {
  return event => {
    if (current() !== epoch) return;
    return callback(event);
  };
}
