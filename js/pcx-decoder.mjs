import { createMemory } from "./wasm-memory.mjs";
import { validateAbi } from "./abi.mjs";
import { inputBytes } from "./input.mjs";
export async function createPcxDecoder(source) {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  for (const name of [
    "pcx_decode_rgba",
    "pcx_rgba_ptr",
    "pcx_rgba_len",
    "pcx_rgba_width",
    "pcx_rgba_height",
    "pcx_rgba_free",
  ])
    if (typeof wasm[name] !== "function") throw new Error("PcxDecoderAbiUnavailable");
  const memory = createMemory(wasm);
  return {
    decode(input, maxPixels = 16_000_000) {
      const bytes = inputBytes(input);
      if (
        bytes.length > 64 * 1024 * 1024 ||
        !Number.isSafeInteger(maxPixels) ||
        maxPixels < 1 ||
        maxPixels > 16_000_000
      )
        throw new RangeError("LimitExceeded");
      try {
        return memory.withBytes(bytes, (ptr, size) => {
          if (!wasm.pcx_decode_rgba(ptr, size, maxPixels)) throw memory.error();
          const width = wasm.pcx_rgba_width(),
            height = wasm.pcx_rgba_height(),
            length = wasm.pcx_rgba_len();
          if (
            ![width, height, length].every(Number.isSafeInteger) ||
            width < 1 ||
            height < 1 ||
            width > maxPixels / height ||
            length !== width * height * 4
          )
            throw new Error("InvalidPcxPixelOutput");
          const rgba = memory.copy(wasm.pcx_rgba_ptr(), length);
          return {
            width,
            height,
            rgba: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength),
          };
        });
      } finally {
        wasm.pcx_rgba_free();
      }
    },
  };
}
