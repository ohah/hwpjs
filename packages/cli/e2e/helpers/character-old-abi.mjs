// Test-only WASM export-section mask. Functions/code/data and product inputs stay unchanged.
export function withoutAtomicFormattingExports(input) {
  const bytes = new Uint8Array(input),
    read = (state) => {
      let n = 0,
        m = 1,
        b;
      do {
        b = bytes[state.at++];
        n += (b & 127) * m;
        m *= 128;
      } while (b & 128);
      return n;
    },
    write = (n) => {
      const out = [];
      do {
        const low = n & 127;
        n = Math.floor(n / 128);
        out.push(low | (n ? 128 : 0));
      } while (n);
      return out;
    };
  const output = Array.from(bytes.subarray(0, 8)),
    state = { at: 8 };
  while (state.at < bytes.length) {
    const id = bytes[state.at++],
      length = read(state),
      end = state.at + length;
    if (id !== 7) {
      output.push(id, ...write(length));
      for (let i = state.at; i < end; i++) output.push(bytes[i]);
      state.at = end;
      continue;
    }
    const count = read(state),
      rows = [];
    for (let i = 0; i < count; i++) {
      const start = state.at,
        size = read(state),
        name = new TextDecoder().decode(bytes.slice(state.at, state.at + size));
      state.at += size;
      state.at++;
      read(state);
      if (
        !/^(hwp5|hwpx)_edit_(formatting_capabilities|query_formatting|apply_formatting_patch)$/.test(
          name,
        )
      )
        rows.push(bytes.slice(start, state.at));
    }
    const payload = [...write(rows.length)];
    for (const row of rows) for (const b of row) payload.push(b);
    output.push(id, ...write(payload.length));
    for (const b of payload) output.push(b);
    state.at = end;
  }
  return Uint8Array.from(output);
}
