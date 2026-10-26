import { demoFixtures, fixtureUrl } from "./fixture-catalog.mjs";

export function createFixtureControls({
  select,
  button,
  input,
  open,
  fetchBytes = fetch,
  timeoutMs = 30000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("InvalidFixtureTimeout");
  let pending = null,
    closed = false;
  const cancel = () => {
    pending?.abort();
    pending = null;
  };
  for (const fixture of demoFixtures) {
    const option = select.ownerDocument.createElement("option");
    option.value = fixture.id;
    option.textContent = fixture.label ?? fixture.name;
    select.append(option);
  }
  const click = () => {
    if (closed) return;
    const fixture = demoFixtures.find((item) => item.id === select.value);
    if (!fixture) return;
    cancel();
    // A server fixture supersedes the previous native FileList.
    if (input) input.value = "";
    const request = new AbortController();
    pending = request;
    // Lazy read goes through the upload loader's size/error/generation checks.
    open({
      name: fixture.name,
      size: 0,
      async arrayBuffer() {
        request.signal.throwIfAborted();
        let rejectAbort;
        const aborted = new Promise((_, reject) => {
          rejectAbort = reject;
        });
        const onAbort = () => rejectAbort(request.signal.reason);
        request.signal.addEventListener("abort", onAbort, { once: true });
        const timer = setTimer(
          () =>
            request.abort(
              new Error(
                "픽스쳐 다운로드 시간이 초과되었습니다. 네트워크 연결을 확인하고 픽스쳐 열기를 다시 눌러주세요.",
              ),
            ),
          timeoutMs,
        );
        try {
          // Race cancellation as well as aborting fetch: a stalled or injected
          // transport must not leave the shared loader waiting indefinitely.
          return await Promise.race([
            aborted,
            (async () => {
              const response = await fetchBytes(fixtureUrl(fixture.id), {
                cache: "no-store",
                signal: request.signal,
              });
              request.signal.throwIfAborted();
              if (!response.ok)
                throw new Error(
                  response.status === 404
                    ? "픽스쳐를 제공할 수 없습니다. 데모 서버를 최신 코드로 재시작했는지, 해당 예제 파일이 서버에 있는지 확인하세요."
                    : `FixtureFetchFailed:${response.status}`,
                );
              const buffer = await response.arrayBuffer();
              request.signal.throwIfAborted();
              if (buffer.byteLength > 64 * 1024 * 1024) throw new Error("FixtureTooLarge");
              return buffer;
            })(),
          ]);
        } finally {
          clearTimer(timer);
          request.signal.removeEventListener("abort", onAbort);
        }
      },
    });
  };
  button.addEventListener("click", click);
  input?.addEventListener("change", cancel);
  return {
    close() {
      if (closed) return;
      closed = true;
      cancel();
      button.removeEventListener("click", click);
      input?.removeEventListener("change", cancel);
    },
  };
}
