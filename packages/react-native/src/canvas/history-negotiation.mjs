// 오직 협상과 직렬화를 담당합니다. 기본값·예산 판정은 Native SSOT가 소유합니다.
export async function configureNativeHistory(port, token, revision, options) {
  if (port.descriptor.historyProtocol !== 'hwpjs.native-history/2')
    return { error: 'NativeHistoryV2Unavailable' };
  const json = JSON.stringify(options);
  if (typeof json !== 'string') return { error: 'InvalidHistoryOptions' };
  const bytes = Uint8Array.from(unescape(encodeURIComponent(json)), (c) => c.charCodeAt(0));
  if (bytes.length > 4096) return { error: 'InvalidHistoryOptions' };
  return port.request({ kind: 'history-configure', token, expectedRevision: revision, bytes });
}
