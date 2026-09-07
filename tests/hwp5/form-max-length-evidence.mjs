// Independent test-side meaning over the original known-path property.
export function maxLengthEvidence(e,kind,count=0n) {
  const index=e.wire.readUInt32LE(16+27*4);
  if(kind!==5)return {state:0,order:0,raw:null};
  if(index===0xffffffff)return {state:1,order:0,raw:null};
  const raw=e.rows[index].value,text=raw.toString('utf16le'),n=BigInt(text);
  const state=text.startsWith('-')?(n===-1n?2:4):3;
  const order=state===3?(count<n?1:count===n?2:3):0;
  return {state,order,raw};
}
export function maxLengthCounters(e,kind) {
  const c=[0,0,0,0],{state}=maxLengthEvidence(e,kind);
  if(state)c[state-1]++;
  return c;
}
