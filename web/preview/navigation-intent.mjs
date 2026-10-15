/** 플랫폼 키 조합을 표시 이동 의도로 변환한다. 문서 위치는 소유하지 않는다. */
export function navigationIntent(event, platform = "") {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return null;
  if (event.getModifierState?.("AltGraph") || (event.altKey && event.ctrlKey)) return null;
  const mac = /mac/i.test(platform), horizontal = ["ArrowLeft", "ArrowRight"].includes(event.key);
  if (mac && event.ctrlKey) return null;
  if (event.altKey && !(mac && horizontal && !event.metaKey)) return null;
  if (mac && event.metaKey && horizontal) return { key: event.key === "ArrowLeft" ? "Home" : "End", paragraphEdge: false, word: false };
  return { key: event.key, paragraphEdge: Boolean(event.ctrlKey || event.metaKey), word: horizontal && Boolean(event.ctrlKey || (mac && event.altKey)) };
}
