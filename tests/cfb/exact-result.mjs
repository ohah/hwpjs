// Compare API shape without turning absent values into empty values.
// Functions are independently implemented; their behavior is exercised separately.
export function assertExactResult(actual, expected, label = "container") {
  const fail = (path, detail) => {
    throw new Error(`${path}: ${detail}`);
  };
  function compare(a, e, path) {
    if (typeof a !== typeof e) fail(path, `type ${typeof a} != ${typeof e}`);
    if (typeof e === "function") return;
    if (e === null || typeof e !== "object") {
      if (!Object.is(a, e)) fail(path, `${String(a)} != ${String(e)}`);
      return;
    }
    if (a === null) fail(path, "unexpected null");
    const tag = (v) => Object.prototype.toString.call(v);
    if (tag(a) !== tag(e)) fail(path, `${tag(a)} != ${tag(e)}`);
    const isBuffer = (v) => typeof Buffer !== "undefined" && Buffer.isBuffer(v);
    if (isBuffer(a) !== isBuffer(e)) fail(path, "Buffer brand differs");
    if (tag(e) === "[object Date]") {
      if (!Object.is(a.getTime(), e.getTime()))
        fail(path, "Date milliseconds differ");
      return;
    }
    const ak = Object.keys(a).sort(),
      ek = Object.keys(e).sort();
    if (JSON.stringify(ak) !== JSON.stringify(ek))
      fail(path, `own keys ${ak} != ${ek}`);
    for (const key of ek) compare(a[key], e[key], `${path}.${key}`);
  }
  compare(actual, expected, label);
}
