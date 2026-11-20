// Controlled Native exports only. This fixture never compiles/executes WASM.
import {
  REQUIRED_FUNCTIONS,
  EXPERIMENTAL_EDITOR_FUNCTIONS,
  ABI_VERSION,
} from '../../js/abi-schema.mjs';
export function readonlyWasmFixture(context, { optional = true } = {}) {
  const mock = context.mock;
  class Memory {
    buffer = new ArrayBuffer(256 * 1024);
  }
  class Module {
    static exports() {
      return Object.keys(wasm)
        .filter((k) => typeof wasm[k] === 'function')
        .map((name) => ({ name, kind: 'function' }));
    }
  }
  const wasm = Object.fromEntries(
    [...REQUIRED_FUNCTIONS, ...EXPERIMENTAL_EDITOR_FUNCTIONS].map((name) => [name, () => 0]),
  );
  let cursor = 65536,
    outputLength = 0,
    epoch = 0,
    serial = 0,
    opened = false,
    text = '가나다',
    readText = '가나다',
    writer = 0,
    queries = 0,
    readCloses = 0,
    writeCalls = 0,
    genericErrorReads = 0;
  const enc = new TextEncoder();
  const copy = (ptr, bytes) => new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  const json = (value) => {
    const bytes = enc.encode(JSON.stringify(value));
    copy(32768, bytes);
    outputLength = bytes.length;
    return 1;
  };
  const binding = () => ({ session: `v-s${epoch}`, revision: null });
  const stamp = () => ({ epoch: String(epoch), serial: String(serial) });
  const ref = () => `v-d2-p${epoch}:0:0:rn:g${serial}`;
  const request = (ptr, size) =>
    JSON.parse(new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, ptr, size)));
  const wire = () => {
    const words = [0x31543548, 0x05000107, 1, 0, 1, 0, 0xffffffff, 4, 1, 1, 0, 0, text.length * 2];
    const bytes = new Uint8Array(words.length * 4 + text.length * 2),
      view = new DataView(bytes.buffer);
    words.forEach((n, i) => view.setUint32(i * 4, n, true));
    for (let i = 0; i < text.length; i++)
      view.setUint16(words.length * 4 + i * 2, text.charCodeAt(i), true);
    copy(1024, bytes);
    return bytes.length;
  };
  let wireLength = 0;
  Object.assign(wasm, {
    memory: new Memory(),
    hwpjs_abi_version: () => ABI_VERSION,
    cfb_alloc: (size) => {
      const value = cursor;
      cursor += Math.max(size, 1) + 8;
      return value;
    },
    cfb_free: () => {},
    cfb_error_ptr: () => {
      genericErrorReads++;
      return 16;
    },
    cfb_error_len: () => enc.encode('ControlledNativeRejected').length,
    hwp5_text_read(ptr, size) {
      const id = new Uint8Array(wasm.memory.buffer, ptr, size)[0];
      if (id === 0) return 0;
      text = id === 2 ? '라마바' : '가나다';
      wireLength = wire();
      return 1;
    },
    hwp5_text_ptr: () => 1024,
    hwp5_text_len: () => wireLength,
    hwp5_text_free: () => {},
    hwp5_text_distribution: () => 1,
    hwp5_edit_open() {
      writer++;
      return 1;
    },
    hwp5_edit_close() {
      writer--;
    },
    hwp5_edit_splice() {
      writeCalls++;
      return 1;
    },
  });
  copy(16, enc.encode('ControlledNativeRejected'));
  copy(64, enc.encode('ControlledNativeRejected'));
  if (optional)
    Object.assign(wasm, {
      hwp5_read_error_ptr: () => 64,
      hwp5_read_error_len: () => enc.encode('ControlledNativeRejected').length,
      hwp5_read_open(ptr, size) {
        serial++;
        const id = new Uint8Array(wasm.memory.buffer, ptr, size)[0];
        if (id === 3) return 0;
        epoch++;
        readText = id === 2 ? '라마바' : '가나다';
        opened = true;
        return 1;
      },
      hwp5_read_close() {
        opened = false;
        serial++;
        readCloses++;
      },
      hwp5_read_output_ptr: () => 32768,
      hwp5_read_output_len: () => outputLength,
      hwp5_read_output_free: () => {},
      hwp5_read_document_text_read_binding() {
        if (!opened) return 0;
        return json({
          schemaVersion: 1,
          scope: 'native-document-text-read-binding',
          executionAuthority: false,
          format: 'hwp5',
          session: binding().session,
          ...stamp(),
        });
      },
      hwp5_read_document_text_snapshot() {
        queries++;
        if (!opened) return 0;
        return json({
          schemaVersion: 1,
          scope: 'native-document-text',
          format: 'hwp5',
          complete: true,
          binding: binding(),
          readBinding: stamp(),
          coverage: {
            totalParagraphs: 1,
            createdCellParagraphs: 0,
            sections: [{ section: 0, paragraphCount: 1 }],
          },
          rows: [{ ordinal: 0, section: 0, paragraph: 0, ref: ref(), text: readText }],
        });
      },
      hwp5_read_document_text_selection(ptr, size) {
        queries++;
        if (!opened) return 0;
        const r = request(ptr, size);
        if (
          r.binding.session !== binding().session ||
          r.ref !== ref() ||
          JSON.stringify(r.readBinding) !== JSON.stringify(stamp())
        )
          return 0;
        return json({
          schemaVersion: 1,
          scope: r.scope,
          binding: r.binding,
          readBinding: r.readBinding,
          ref: r.ref,
          expectedOriginal: r.expectedOriginal,
          coordinateSpace: 'native-current-text-observation',
          executionAuthority: false,
          format: 'hwp5',
          beforeText: readText,
          target: {
            kind: 'paragraph',
            section: 0,
            paragraph: 0,
            startUnit: r.startUnit,
            endUnit: r.endUnit,
          },
        });
      },
      hwp5_read_document_text_anchor(ptr, size) {
        queries++;
        if (!opened) return 0;
        const r = request(ptr, size);
        if (
          r.binding.session !== binding().session ||
          JSON.stringify(r.readBinding) !== JSON.stringify(stamp())
        )
          return 0;
        return json({
          schemaVersion: 1,
          scope: r.scope,
          coordinateSpace: 'native-read-inventory',
          executionAuthority: false,
          format: 'hwp5',
          binding: binding(),
          readBinding: stamp(),
          ref: ref(),
          startUnit: r.target.unit,
          endUnit: r.target.unit,
        });
      },
    });
  const priorMemory = WebAssembly.Memory,
    priorModule = WebAssembly.Module;
  WebAssembly.Memory = Memory;
  WebAssembly.Module = Module;
  context.after(() => {
    WebAssembly.Memory = priorMemory;
    WebAssembly.Module = priorModule;
  });
  mock.method(WebAssembly, 'instantiate', async () => ({ exports: wasm }));
  return {
    module: new Module(),
    wasm,
    counts: () => ({ writer, queries, readCloses, writeCalls, genericErrorReads }),
    binding,
    stamp,
    ref,
  };
}
