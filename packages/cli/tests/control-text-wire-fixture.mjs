// Controlled Native protocol fixture only. No production text/parser fallback.
export function controlTextWire({
  section = 0,
  paragraph = 4,
  sourceNode = 31,
  plain,
  text,
  controls = [],
}) {
  return {
    schemaVersion: 1,
    axis: 'native-control-utf16',
    section,
    readStamp: { session: 'controlled-native', serial: '0' },
    coverage: 'complete',
    rows: [
      {
        paragraph,
        sourceNode,
        plain,
        text,
        units: typeof text === 'string' ? text.length : 0,
        controls,
        coverage: 'complete',
        issue: null,
      },
    ],
  };
}
export const marker = (kind, node, startUnit) => ({
  kind,
  node,
  startUnit,
  endUnit: startUnit + 1,
});
