import { ABI_VERSION } from './abi-schema.mjs';
import { createMemory } from './wasm-memory.mjs';
import { copyPictureInput, PICTURE_REPLACEMENT_LIMITS } from './picture-replacement-input.mjs';

// 바이트 소유 복사와 기본 파일 예산은 기존 독립 파일 변환 경계를 공유합니다.
export const TABLE_FILE_DELETION_LIMITS = Object.freeze({
  documentBytes: PICTURE_REPLACEMENT_LIMITS.documentBytes,
  wasmBytes: PICTURE_REPLACEMENT_LIMITS.wasmBytes,
  outputBytes: PICTURE_REPLACEMENT_LIMITS.outputBytes,
  maxTables: 4096,
});
const uint = (value) =>
  Number.isInteger(value) && !Object.is(value, -0) && value >= 0 && value <= 0xffffffff;

function captureTarget(request) {
  const names = ['format', 'section', 'tableNodes'];
  if (
    !request ||
    typeof request !== 'object' ||
    Array.isArray(request) ||
    Reflect.ownKeys(request).some((key) => !names.includes(key))
  )
    throw new TypeError('InvalidTableDeletionTarget');
  const values = Object.create(null);
  for (const name of names) {
    const field = Object.getOwnPropertyDescriptor(request, name);
    if (!field || !Object.hasOwn(field, 'value')) throw new TypeError('InvalidTableDeletionTarget');
    values[name] = field.value;
  }
  const { format, section, tableNodes } = values;
  if (!['hwp5', 'hwpx'].includes(format) || !uint(section) || !Array.isArray(tableNodes))
    throw new TypeError('InvalidTableDeletionTarget');
  const length = Object.getOwnPropertyDescriptor(tableNodes, 'length')?.value;
  if (!Number.isInteger(length) || length < 1 || length > TABLE_FILE_DELETION_LIMITS.maxTables)
    throw new RangeError('TableDeletionTargetLimitExceeded');
  const bytes = new Uint8Array(length * 4),
    wire = new DataView(bytes.buffer),
    seen = new Set();
  for (let index = 0; index < length; index++) {
    const field = Object.getOwnPropertyDescriptor(tableNodes, String(index));
    if (!field || !Object.hasOwn(field, 'value') || !uint(field.value) || seen.has(field.value))
      throw new TypeError('InvalidTableDeletionTarget');
    seen.add(field.value);
    wire.setUint32(index * 4, field.value, true);
  }
  return { format, section, bytes, count: length };
}

// 호출자의 편집 세션과 분리해 인스턴스마다 새 파일 변환을 소유합니다.
export async function createTableDeleter(source, { instantiate = WebAssembly.instantiate } = {}) {
  const binary =
    source instanceof WebAssembly.Module
      ? source
      : copyPictureInput(source, TABLE_FILE_DELETION_LIMITS.wasmBytes, 'Wasm');
  const module = binary instanceof WebAssembly.Module ? binary : await WebAssembly.compile(binary);
  const { exports: wasm } = await instantiate(module, {});
  for (const name of [
    'hwpjs_abi_version',
    'cfb_alloc',
    'cfb_free',
    'cfb_error_ptr',
    'cfb_error_len',
    'table_file_delete',
    'table_file_delete_ptr',
    'table_file_delete_len',
    'table_file_delete_free',
  ])
    if (typeof wasm?.[name] !== 'function') throw new Error('TableDeletionAbiUnavailable');
  if (wasm.hwpjs_abi_version() !== ABI_VERSION) throw new Error('TableDeletionAbiVersionMismatch');
  if (!(wasm.memory instanceof WebAssembly.Memory)) throw new Error('MissingTableDeletionMemory');
  const memory = createMemory(wasm);
  let closed = false;
  return {
    delete(input, request) {
      if (closed) throw new Error('TableDeleterClosed');
      const target = captureTarget(request);
      const document = copyPictureInput(
        input,
        TABLE_FILE_DELETION_LIMITS.documentBytes,
        'Document',
      );
      // cfb_alloc은 u8 할당이므로 u32 대상 주소를 위한 최대 3바이트 여유를 둡니다.
      const targets = new Uint8Array(target.bytes.length + 3);
      const errors = [];
      let output;
      // 각 단계에서 원래 실패를 보존하고 안팎의 free 실패에 덮어쓰이지 않게 합니다.
      const attempt = (action) => {
        try {
          return action();
        } catch (error) {
          errors.push(error);
        }
      };
      attempt(() =>
        memory.withBytes(document, (ptr, size) =>
          attempt(() =>
            memory.withBytes(targets, (allocationPtr) =>
              attempt(() => {
                const targetsPtr = allocationPtr + ((4 - (allocationPtr % 4)) % 4);
                new Uint8Array(wasm.memory.buffer, targetsPtr, target.bytes.length).set(
                  target.bytes,
                );
                if (
                  wasm.table_file_delete(
                    target.format === 'hwp5' ? 1 : 2,
                    ptr,
                    size,
                    target.section,
                    targetsPtr,
                    target.count,
                  ) !== 1
                )
                  throw memory.error();
                const pointer = wasm.table_file_delete_ptr(),
                  length = wasm.table_file_delete_len();
                if (
                  !uint(pointer) ||
                  pointer === 0 ||
                  !uint(length) ||
                  length === 0 ||
                  length > TABLE_FILE_DELETION_LIMITS.outputBytes ||
                  pointer > wasm.memory.buffer.byteLength - length
                )
                  throw new RangeError('InvalidTableDeletionOutput');
                output = memory.copy(pointer, length);
              }),
            ),
          ),
        ),
      );
      attempt(() => wasm.table_file_delete_free());
      if (errors.length > 1) throw new AggregateError(errors, 'TableDeletionAndCleanupFailed');
      if (errors.length === 1) throw errors[0];
      return output;
    },
    close() {
      if (!closed) {
        closed = true;
        wasm.table_file_delete_free();
      }
    },
  };
}
