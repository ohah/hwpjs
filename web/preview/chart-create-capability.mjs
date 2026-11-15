/** Pure projection/admission helper; no Native lookup by export-count heuristic. */
export function observedChartCreateProfileVersion(
  editor,
  format,
  historyEnabled,
  historyStats,
  poisoned,
) {
  if (
    format !== 'hwpx' ||
    historyEnabled !== true ||
    historyStats?.protocolVersion !== 2 ||
    poisoned !== false ||
    historyStats?.poisoned === true
  )
    return 0;
  try {
    return editor?.supportsChartCreationAbi?.() === true &&
      editor?.chartCreateProfileVersion?.() === 1
      ? 1
      : 0;
  } catch {
    return 0;
  }
}
export function requireChartCreateProfile(
  editor,
  request,
  format,
  historyEnabled,
  historyStats,
  poisoned,
) {
  if (
    request &&
    Object.hasOwn(request, 'chart') &&
    observedChartCreateProfileVersion(editor, format, historyEnabled, historyStats, poisoned) !== 1
  )
    throw Error('ChartCreateProfileUnavailable');
}
