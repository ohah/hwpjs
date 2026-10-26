// At most one source is read ahead. A failed lookahead is not permission to
// fit, and the original iterator error is raised only when that source is read.
export function createPageRowSourceCursor(rows) {
  const input = rows[Symbol.iterator]();
  let buffered = false,
    next,
    failure;
  const fill = () => {
    if (buffered) return;
    buffered = true;
    try {
      next = input.next();
    } catch (error) {
      failure = { error };
    }
  };
  return {
    peek() {
      fill();
      return failure ? undefined : next.value;
    },
    next() {
      fill();
      const result = next,
        error = failure;
      buffered = false;
      next = undefined;
      failure = undefined;
      if (error) throw error.error;
      return result;
    },
  };
}
