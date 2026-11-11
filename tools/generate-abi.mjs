import { readFileSync } from 'node:fs';
import {
  ABI_VERSION,
  FIELD,
  VALUE,
  DOCUMENT,
  CREATED_TABLE_GRID_ACTION,
  HWP5_TEXT_TRANSACTION_FUNCTIONS,
  HWPX_TEXT_TRANSACTION_FUNCTIONS,
  HWPX_NAMED_FIELDS_FUNCTIONS,
  HWPX_NAMED_FIELD_RENAME_FUNCTIONS,
  HWPX_NAMED_FIELD_CREATE_FUNCTIONS,
  HWPX_NAMED_FIELD_PARAMETERS_FUNCTIONS,
  HWP5_NAMED_FIELDS_FUNCTIONS,
  HWP5_SOURCE_TABLE_CELL_SPLIT_FUNCTIONS,
} from '../js/abi-schema.mjs';

const enumeration = (name, entries) =>
  `pub const ${name} = enum(u32) {\n` +
  Object.entries(entries)
    .map(([key, value]) => `    ${key} = ${value},\n`)
    .join('') +
  '    _,\n};\n';
const generated =
  '// Generated from js/abi-schema.mjs by tools/generate-abi.mjs. Do not edit.\n' +
  `pub const version: u32 = ${ABI_VERSION};\n` +
  enumeration('Field', FIELD) +
  enumeration('Value', VALUE) +
  enumeration('CreatedTableGridAction', CREATED_TABLE_GRID_ACTION) +
  'pub const hwp5_text_transaction_exports = [_][]const u8{\n' +
  HWP5_TEXT_TRANSACTION_FUNCTIONS.map((name) => `    ${JSON.stringify(name)},\n`).join('') +
  '};\n' +
  'pub const hwpx_text_transaction_exports = [_][]const u8{\n' +
  HWPX_TEXT_TRANSACTION_FUNCTIONS.map((name) => `    ${JSON.stringify(name)},\n`).join('') +
  '};\n' +
  'pub const hwp5_named_fields_exports = [_][]const u8{\n' +
  HWP5_NAMED_FIELDS_FUNCTIONS.map((name) => `    ${JSON.stringify(name)},\n`).join('') +
  '};\n' +
  'pub const hwpx_named_fields_exports = [_][]const u8{\n' +
  HWPX_NAMED_FIELDS_FUNCTIONS.map((name) => `    ${JSON.stringify(name)},\n`).join('') +
  '};\n' +
  'pub const hwpx_named_field_rename_exports = [_][]const u8{\n' +
  HWPX_NAMED_FIELD_RENAME_FUNCTIONS.map((name) => `    ${JSON.stringify(name)},\n`).join('') +
  '};\n' +
  'pub const hwpx_named_field_create_exports = [_][]const u8{\n' +
  HWPX_NAMED_FIELD_CREATE_FUNCTIONS.map((name) => `    ${JSON.stringify(name)},\n`).join('') +
  '};\n' +
  'pub const hwpx_named_field_parameters_exports = [_][]const u8{\n' +
  HWPX_NAMED_FIELD_PARAMETERS_FUNCTIONS.map((name) => `    ${JSON.stringify(name)},\n`).join('') +
  '};\n' +
  'pub const hwp5_source_table_cell_split_exports = [_][]const u8{\n' +
  HWP5_SOURCE_TABLE_CELL_SPLIT_FUNCTIONS.map((name) => `    ${JSON.stringify(name)},\n`).join('') +
  '};\n' +
  'pub const document = struct {\n' +
  Object.entries(DOCUMENT)
    .map(([key, value]) => `    pub const ${key}: usize = ${value};\n`)
    .join('') +
  '};\n';
if (process.argv.includes('--check')) {
  if (readFileSync(new URL('../src/wasm/abi_schema.zig', import.meta.url), 'utf8') !== generated)
    throw new Error(
      'ABI schema drift: regenerate src/wasm/abi_schema.zig with tools/generate-abi.mjs',
    );
} else process.stdout.write(generated);
