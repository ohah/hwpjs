// Independent test-side mode 25 tail layout. Do not pass a report with appended
// optional probe output: this tail belongs to the ordinary container report.
const offsets = Object.freeze({decoded_bytes:8,uninspected_streams:4});
export function containerTotals(report) {
  return Object.fromEntries(Object.entries(offsets).map(([name,back])=>[name,report.readUInt32LE(report.length-back)]));
}
export function consumeContainerStreams(report,bytes,streams) {
  const totals=containerTotals(report),out=Buffer.from(report);
  out.writeUInt32LE(totals.decoded_bytes+bytes,out.length-offsets.decoded_bytes);
  out.writeUInt32LE(totals.uninspected_streams-streams,out.length-offsets.uninspected_streams);
  return out;
}
