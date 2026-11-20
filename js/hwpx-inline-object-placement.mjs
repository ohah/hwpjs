import { inlineInsertRecord as record } from './hwpx-inline-object-record.mjs';

const uint = (value) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff || Object.is(value, -0))
    throw Error('InvalidInlineObjectOwner');
  return value;
};
const decimal = (value, positive = false) => {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]{0,19})$/.test(value) ||
    BigInt(value) > 0xffffffffffffffffn ||
    (positive && value === '0')
  )
    throw Error('InvalidInlineObjectOwner');
  return value;
};
export function checkedInlineObjectOwner(input) {
  // Read a data descriptor before using the discriminant to select its schema.
  const kind = input && Object.getOwnPropertyDescriptor(input, 'kind');
  if (!kind || !Object.hasOwn(kind, 'value')) throw Error('InvalidInlineObjectOwner');
  const keys =
    kind.value === 'body'
      ? []
      : kind.value === 'sourceCell'
        ? ['table_node', 'list_node']
        : kind.value === 'createdCell'
          ? ['identity', 'row', 'column']
          : null;
  if (!keys) throw Error('InvalidInlineObjectOwner');
  const owner = record(input, ['kind', 'binding', ...keys]);
  const binding = record(owner.binding, ['session', 'revision', 'serial']);
  if (typeof binding.session !== 'string' || !/^s[1-9][0-9]{0,19}$/.test(binding.session))
    throw Error('InvalidInlineObjectOwner');
  decimal(binding.session.slice(1), true);
  const out = {
    kind: kind.value,
    binding: {
      session: binding.session,
      revision: uint(binding.revision),
      serial: decimal(binding.serial),
    },
  };
  if (kind.value === 'sourceCell')
    return { ...out, table_node: uint(owner.table_node), list_node: uint(owner.list_node) };
  if (kind.value === 'createdCell')
    return {
      ...out,
      identity: decimal(owner.identity, true),
      row: uint(owner.row),
      column: uint(owner.column),
    };
  return out;
}

export function checkedInlineObjectTarget(input, equation = false) {
  const descriptor = input && Object.getOwnPropertyDescriptor(input, 'owner');
  const owner = descriptor
    ? checkedInlineObjectOwner(Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined)
    : undefined;
  const created = owner?.kind === 'createdCell';
  const affinity = !!input && Object.hasOwn(input, 'affinity');
  const unit = equation ? 'start' : 'unit';
  const witness = equation ? 'expectedText' : 'expected_text';
  const value = record(input, [
    'section',
    ...(created ? [] : ['paragraph']),
    unit,
    witness,
    ...(owner ? ['owner'] : []),
    ...(affinity ? ['affinity'] : []),
  ]);
  const section = uint(value.section);
  if (section !== 0 && !owner) throw Error('InlineObjectOwnerRequired');
  if (affinity && (!owner || !['forward', 'backward'].includes(value.affinity)))
    throw Error('InvalidInlineObjectOwner');
  if (typeof value[witness] !== 'string') throw Error('InvalidInlineObjectText');
  const paragraph = created ? undefined : uint(value.paragraph);
  if (paragraph === 0) throw Error('InvalidInlineObjectOwner');
  // Text/scalar boundary validation belongs to the common request validator.
  return {
    section,
    ...(created ? {} : { paragraph }),
    [unit]: uint(value[unit]),
    [witness]: value[witness],
    ...(owner ? { owner } : {}),
    ...(affinity ? { affinity: value.affinity } : {}),
  };
}

export function checkedInlineObjectSelector(input) {
  const created = !!input && Object.hasOwn(input, 'created_cell');
  const value = record(input, ['section', created ? 'created_cell' : 'paragraph']);
  const section = uint(value.section);
  if (!created) {
    const paragraph = uint(value.paragraph);
    if (!paragraph) throw Error('InvalidInlineObjectOwner');
    return { section, paragraph };
  }
  const cell = record(value.created_cell, ['identity', 'row', 'column']);
  return {
    section,
    created_cell: {
      identity: decimal(cell.identity, true),
      row: uint(cell.row),
      column: uint(cell.column),
    },
  };
}

export function checkedInlineObjectObservation(input) {
  const descriptors = Object.getOwnPropertyDescriptors(input ?? {});
  const value = record(input, [
    'schemaVersion',
    'section',
    ...(Object.hasOwn(descriptors, 'paragraph') ? ['paragraph'] : []),
    'expected_text',
    'owner',
  ]);
  if (value.schemaVersion !== 1 || typeof value.expected_text !== 'string')
    throw Error('InvalidInlineObjectOwner');
  const { schemaVersion, ...target } = value;
  const { unit: _unit, ...checked } = checkedInlineObjectTarget({ ...target, unit: 0 });
  return { schemaVersion, ...checked };
}

export function matchInlineObjectObservation(selector, observation) {
  const selected = checkedInlineObjectSelector(selector),
    observed = checkedInlineObjectObservation(observation);
  const cell = selected.created_cell;
  if (
    observed.section !== selected.section ||
    (cell
      ? observed.owner.kind !== 'createdCell' ||
        observed.owner.identity !== cell.identity ||
        observed.owner.row !== cell.row ||
        observed.owner.column !== cell.column
      : observed.paragraph !== selected.paragraph)
  )
    throw Error('InlineObjectOwnerMismatch');
  return observed;
}

/** Optional query absence is a compatibility boundary, never inferred support. */
export function inlineObjectPlacementAvailable(wasm) {
  try {
    return (
      typeof wasm.hwpx_edit_inline_object_placement_version === 'function' &&
      wasm.hwpx_edit_inline_object_placement_version() === 1 &&
      typeof wasm.hwpx_edit_inline_object_owner === 'function'
    );
  } catch {
    return false;
  }
}

export function requireInlineObjectPlacement(wasm, request) {
  const target = request.target ?? request;
  if (
    (target.section !== 0 || Object.hasOwn(target, 'owner')) &&
    !inlineObjectPlacementAvailable(wasm)
  )
    throw Error('InlineObjectPlacementUnavailable');
}
