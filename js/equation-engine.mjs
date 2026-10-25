import { createMemory } from "./wasm-memory.mjs";

/** Stateless optional engine. Caller binds source/revision to its editor lease. */
export function createEquationEngine(wasm) {
  for (const name of ["equation_process", "equation_output_ptr", "equation_output_len", "equation_output_free", "equation_error_ptr", "equation_error_len"])
    if (typeof wasm?.[name] !== "function") throw new Error("EquationEngineAbiUnavailable");
  const memory = createMemory(wasm);
  const encoder = new TextEncoder(), decoder = new TextDecoder("utf-8", { fatal: true });
  function run(operation, source, settings, extra = {}) {
    if (typeof source !== "string" || !source.isWellFormed()) throw new Error("InvalidEquationSource");
    if (source.length > 1024 * 1024) throw new Error("EquationProtocolLimitExceeded");
    for (const key of ["size", "script_scale", "fraction_scale"])
      if (!Number.isFinite(settings?.[key]) || settings[key] <= 0) throw new Error("InvalidEquationMeasurementSize");
    if (settings.allow_unclosed_groups !== undefined && typeof settings.allow_unclosed_groups !== "boolean") throw new Error("InvalidEquationRecoveryPolicy");
    const json = JSON.stringify({ operation, source, size: settings.size, script_scale: settings.script_scale, fraction_scale: settings.fraction_scale,
      ...(settings.allow_unclosed_groups === true ? { allow_unclosed_groups: true } : {}), ...extra });
    if (json.length > 16 * 1024 * 1024) throw new Error("EquationProtocolLimitExceeded");
    const input = encoder.encode(json);
    if (input.length > 16 * 1024 * 1024) throw new Error("EquationProtocolLimitExceeded");
    try {
      return memory.withBytes(input, (ptr, size) => {
        if (!wasm.equation_process(ptr, size)) throw new Error(decoder.decode(memory.copy(wasm.equation_error_ptr(), wasm.equation_error_len())));
        const length = wasm.equation_output_len();
        if (!Number.isInteger(length) || length < 0 || length > 32 * 1024 * 1024) throw new Error("InvalidEquationOutputLength");
        return JSON.parse(decoder.decode(memory.copy(wasm.equation_output_ptr(), length)));
      });
    } finally { wasm.equation_output_free(); }
  }
  return {
    measure: (source, settings) => run("measure", source, settings),
    layout: (source, settings, measurements, layout) => run("layout", source, settings, { measurements, layout }),
  };
}
