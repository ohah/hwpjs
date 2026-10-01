import { createHwp5Reader } from "../../js/hwp5.mjs";
import { displayContent } from "./content.mjs";
self.onmessage = async event => {
  let reader;
  try {
    const response = await fetch("../../zig-out/bin/hwpjs.wasm");
    if (!response.ok) throw new Error(`WASM HTTP ${response.status}: 먼저 Zig 빌드를 실행하세요.`);
    reader = await createHwp5Reader(await response.arrayBuffer());
    const result = reader.readText(new Uint8Array(event.data));
    self.postMessage({ content: displayContent(result) });
  } catch (error) { self.postMessage({ error: error.message || String(error) }); }
  finally { reader?.close(); }
};
