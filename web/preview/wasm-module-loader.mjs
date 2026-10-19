// One compilation per page, shared by fresh document Workers; failures may retry.
export function createPreviewWasmModuleLoader({ fetchImpl = globalThis.fetch, compile = WebAssembly.compile,
  timeoutMs = 30000, setTimer = setTimeout, clearTimer = clearTimeout,
  url = new URL("../../zig-out/bin/hwpjs.wasm", import.meta.url) } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("InvalidWasmDownloadTimeout");
  let pending = null;
  return () => {
    if (!pending) pending = (async () => {
      const request = new AbortController();
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = setTimer(() => {
          const error = new Error("실행 엔진 다운로드 시간이 초과되었습니다. 연결을 확인하고 문서를 다시 열어주세요.");
          request.abort(error);
          reject(error);
        }, timeoutMs);
      });
      let bytes;
      try {
        bytes = await Promise.race([deadline, (async () => {
          const response = await fetchImpl(url, { cache: "no-cache", signal: request.signal });
          request.signal.throwIfAborted();
          if (!response.ok) throw new Error(`WASM HTTP ${response.status}: 먼저 Zig 빌드를 실행하세요.`);
          const buffer = await response.arrayBuffer();
          request.signal.throwIfAborted();
          return buffer;
        })()]);
      } finally { clearTimer(timer); }
      // Compilation is not a network wait and must not be cancelled by its deadline.
      return compile(bytes);
    })().catch(error => { pending = null; throw error; });
    return pending;
  };
}
