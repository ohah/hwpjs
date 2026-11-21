import { decodeCreatedCellDocumentProjection } from './created-cell-properties-projection.mjs';
import { captureCreatedCellPropertiesRequest } from './created-cell-properties.mjs';
const encoder = new TextEncoder();
function witness(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('InvalidCreatedCellWitness');
  const keys = ['document', 'generation', 'owner', 'epoch'];
  if (Reflect.ownKeys(input).length !== 4) throw Error('InvalidCreatedCellWitness');
  const out = {};
  for (const key of keys) {
    const value = Object.getOwnPropertyDescriptor(input, key)?.value;
    if (
      typeof value !== 'string' ||
      !/^(0|[1-9][0-9]{0,19})$/.test(value) ||
      BigInt(value) > 0xffffffffffffffffn
    )
      throw Error('InvalidCreatedCellWitness');
    out[key] = value;
  }
  return Object.freeze(out);
}
function appearance(value) {
  const out = {};
  if (value?.borders)
    out.border = {
      edges: ['left', 'right', 'top', 'bottom'].map((edge) => {
        const s = value.borders[edge];
        return s
          ? {
              ...(s.style === undefined ? {} : { style: s.style }),
              ...(s.width === undefined ? {} : { width_hundredth_mm: s.width }),
              ...(s.color === undefined ? {} : { color: s.color }),
            }
          : null;
      }),
    };
  const f = value?.fill;
  if (f) {
    if (f.kind === 'none') out.background = { none: {} };
    else if (f.kind === 'solid') out.background = { solid: { color: f.color } };
    else if (f.kind === 'hatch')
      out.background = { hatch: { face: f.face, hatch: f.hatch, style: f.style } };
    else
      out.background = {
        linear: {
          colors: f.colors,
          angle: f.angle,
          center_x: f.centerX,
          center_y: f.centerY,
          step: f.step,
          step_center: f.stepCenter,
        },
      };
  }
  return out;
}
export function createCreatedCellPropertiesApi({ wasm, memory, check, prefix }) {
  const version = `${prefix}_created_cell_properties_version`,
    ticket = `${prefix}_created_cell_properties_ticket`,
    write = `${prefix}_set_created_cell_properties`;
  const supported = () =>
    [version, ticket, write].every((name) => typeof wasm[name] === 'function') &&
    wasm[version]() === 1;
  const projection = `${prefix}_created_cell_properties_projection`;
  let cached;
  function readWitness() {
    if (!wasm[ticket]()) throw memory.error();
    try {
      return witness(
        JSON.parse(
          new TextDecoder().decode(
            memory.copy(wasm[`${prefix}_output_ptr`](), wasm[`${prefix}_output_len`]()),
          ),
        ),
      );
    } finally {
      wasm[`${prefix}_output_free`]();
    }
  }
  return {
    supportsCreatedCellPropertiesProjection() {
      check();
      return supported() && typeof wasm[projection] === 'function';
    },
    createdCellPropertiesProjection(section) {
      check();
      if (
        !Number.isInteger(section) ||
        section < 0 ||
        section > 0xffffffff ||
        Object.is(section, -0)
      )
        throw RangeError('InvalidSection');
      if (!supported() || typeof wasm[projection] !== 'function')
        throw Error('CreatedCellPropertiesProjectionUnavailable');
      const key = JSON.stringify(readWitness());
      if (cached?.key !== key) {
        cached = undefined;
        let sections;
        try {
          if (!wasm[projection]()) throw memory.error();
          sections = decodeCreatedCellDocumentProjection(
            memory.copy(wasm[`${prefix}_output_ptr`](), wasm[`${prefix}_output_len`]()),
            prefix === 'hwp5_edit' ? 'hwp5' : 'hwpx',
          );
        } finally {
          wasm[`${prefix}_output_free`]();
        }
        if (JSON.stringify(readWitness()) !== key) throw Error('StaleCreatedCellProjection');
        cached = { key, sections };
      }
      if (section >= cached.sections.length) throw RangeError('InvalidSection');
      return structuredClone(cached.sections[section]);
    },
    supportsCreatedCellProperties() {
      check();
      return supported();
    },
    editCreatedCellProperties(input) {
      check();
      const request = captureCreatedCellPropertiesRequest(input);
      if (!supported()) throw Error('CreatedCellPropertiesUnavailable');
      if (!wasm[ticket]()) throw memory.error();
      let binding;
      try {
        binding = witness(
          JSON.parse(
            new TextDecoder().decode(
              memory.copy(wasm[`${prefix}_output_ptr`](), wasm[`${prefix}_output_len`]()),
            ),
          ),
        );
      } finally {
        wasm[`${prefix}_output_free`]();
      }
      const bytes = encoder.encode(
        JSON.stringify({
          ...request,
          appearance: appearance(request.appearance),
          witness: binding,
        }),
      );
      if (bytes.length > 16 * 1024) throw RangeError('LimitExceeded');
      let attempted = false,
        result;
      try {
        result = memory.withBytes(bytes, (ptr, size) => {
          attempted = true;
          return wasm[write](ptr, size);
        });
      } catch (error) {
        if (attempted) return { application: 'unknown', changed: null };
        throw error;
      }
      if (result === 1) return { application: 'applied', changed: true };
      if (result === 2) return { application: 'not-applied', changed: false };
      if (result === 3) return { application: 'unknown', changed: null };
      if (result !== 0) return { application: 'unknown', changed: null };
      throw memory.error();
    },
  };
}
