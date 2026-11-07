import * as nodeFS from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname, basename, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

export const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
export const MAX_WASM_BYTES = 32 * 1024 * 1024;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const error = (code, cause) => Object.assign(new Error(code, cause ? { cause } : {}), { code });
const validPath = (value) => {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw error('InvalidFilePath');
};
const sameIdentity = (stat, identity) =>
  identity && String(stat.dev) === identity.dev && String(stat.ino) === identity.ino;

/** Inject filesystem operations only for focused I/O failure tests. No engine code lives here. */
export function createFiles({
  fs = nodeFS,
  cwd = () => process.cwd(),
  random = () => randomBytes(12).toString('hex'),
} = {}) {
  const targets = new WeakMap();
  async function readInputSnapshot(path, { maxBytes = MAX_DOCUMENT_BYTES } = {}) {
    validPath(path);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > MAX_DOCUMENT_BYTES)
      throw error('InvalidFileByteLimit');
    const absolute = resolve(cwd(), path);
    // NONBLOCK prevents a FIFO replacement from hanging before fstat rejects it.
    const handle = await fs.open(absolute, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const before = await handle.stat({ bigint: true });
      if (!before.isFile()) throw error('InputNotRegularFile');
      if (before.size > BigInt(maxBytes)) throw error('FileTooLarge');
      const size = Number(before.size),
        bytes = new Uint8Array(size);
      let at = 0;
      while (at < size) {
        const { bytesRead } = await handle.read(bytes, at, size - at, at);
        if (!bytesRead) throw error('InputChangedDuringRead');
        at += bytesRead;
      }
      const extra = await handle.read(new Uint8Array(1), 0, 1, size);
      const after = await handle.stat({ bigint: true });
      if (
        extra.bytesRead !== 0 ||
        ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some((key) => before[key] !== after[key])
      )
        throw error('InputChangedDuringRead');
      return Object.freeze({
        path: absolute,
        bytes,
        sha256: sha(bytes),
        identity: Object.freeze({ dev: String(before.dev), ino: String(before.ino) }),
      });
    } finally {
      await handle.close();
    }
  }
  function resolveWasmPath(explicit, mainModuleURL) {
    if (explicit !== undefined) {
      validPath(explicit);
      return resolve(cwd(), explicit);
    }
    if (!mainModuleURL) throw error('ExplicitWasmRequired');
    let url;
    try {
      url = new URL('./hwpjs.wasm', mainModuleURL);
    } catch (cause) {
      throw error('InvalidEntryModuleURL', cause);
    }
    if (url.protocol !== 'file:') throw error('InvalidEntryModuleURL');
    return fileURLToPath(url);
  }
  async function vacant(path, input) {
    if (path === input.path) throw error('SourceOutputCollision');
    let stat;
    try {
      stat = await fs.lstat(path);
    } catch (cause) {
      if (cause.code === 'ENOENT') return;
      throw cause;
    }
    throw error(sameIdentity(stat, input.identity) ? 'SourceOutputCollision' : 'OutputExists');
  }
  async function assertNewOutput({ input, outputPath }) {
    validPath(outputPath);
    if (!input || typeof input.path !== 'string') throw error('InvalidInputSnapshot');
    const absolute = resolve(cwd(), outputPath),
      parent = await fs.realpath(dirname(absolute));
    if (!(await fs.stat(parent)).isDirectory()) throw error('OutputParentNotDirectory');
    const path = join(parent, basename(absolute));
    if (!['.hwp', '.hwpx'].includes(extname(path).toLowerCase()))
      throw error('InvalidOutputExtension');
    await vacant(path, input);
    const target = Object.freeze({ path });
    targets.set(target, { path, parent, input, used: false });
    return target;
  }
  function assertOutputFormat(target, format) {
    const record = targets.get(target);
    if (!record || record.used) throw error('InvalidOutputTarget');
    if (!['hwp5', 'hwpx'].includes(format)) throw error('InvalidEngineFormat');
    if (extname(record.path).toLowerCase() !== (format === 'hwp5' ? '.hwp' : '.hwpx'))
      throw error('OutputFormatMismatch');
    record.format = format;
  }
  async function publishNewOutput({ target, bytes }) {
    const record = targets.get(target);
    if (!record || record.used || !record.format) throw error('InvalidOutputTarget');
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length === 0 ||
      bytes.length > MAX_DOCUMENT_BYTES ||
      (typeof SharedArrayBuffer !== 'undefined' && bytes.buffer instanceof SharedArrayBuffer)
    )
      throw error('InvalidOutputBytes');
    // Capture synchronously before any await; callers cannot tear a pending write.
    const owned = Uint8Array.from(bytes),
      digest = sha(owned);
    record.used = true;
    let temporary,
      handle,
      published = false,
      primary;
    const warnings = [];
    const warn = (phase, cause) =>
      warnings.push(
        Object.freeze({
          phase,
          code: String(cause.code ?? cause.message),
          ...(temporary ? { temporaryPath: temporary } : {}),
        }),
      );
    try {
      await vacant(record.path, record.input);
      for (let attempt = 0; attempt < 8; attempt++) {
        const nonce = random();
        if (typeof nonce !== 'string' || !/^[a-f0-9]{24}$/.test(nonce))
          throw error('InvalidTemporaryName');
        const candidate = join(record.parent, '.hwpjs-' + nonce + '.tmp');
        try {
          handle = await fs.open(candidate, 'wx', 0o600);
          temporary = candidate;
          break;
        } catch (cause) {
          if (cause.code !== 'EEXIST') throw cause;
        }
      }
      if (!handle) throw error('TemporaryFileCollision');
      await handle.writeFile(owned);
      await handle.sync();
      await handle.close();
      handle = undefined;
      // link is the commit point: atomic no-replace, never a rename/copy fallback.
      await fs.link(temporary, record.path);
      published = true;
    } catch (cause) {
      primary = cause;
    } finally {
      if (handle) {
        try {
          await handle.close();
        } catch (cause) {
          warn('close-temporary', cause);
        }
      }
      if (temporary) {
        try {
          await fs.unlink(temporary);
        } catch (cause) {
          warn('unlink-temporary', cause);
        }
      }
    }
    if (!published) {
      if (warnings.length) primary.cleanupWarnings = Object.freeze(warnings);
      throw primary;
    }
    // Once published, cleanup/durability errors cannot honestly mean output0.
    let directory;
    try {
      directory = await fs.open(record.parent, 'r');
      await directory.sync();
    } catch (cause) {
      warn('sync-directory', cause);
    } finally {
      if (directory) {
        try {
          await directory.close();
        } catch (cause) {
          warn('close-directory', cause);
        }
      }
    }
    return Object.freeze({
      published: true,
      path: record.path,
      sha256: digest,
      bytes: owned.length,
      warnings: Object.freeze(warnings),
    });
  }
  return Object.freeze({
    readInputSnapshot,
    resolveWasmPath,
    assertNewOutput,
    assertOutputFormat,
    publishNewOutput,
  });
}
export const {
  readInputSnapshot,
  resolveWasmPath,
  assertNewOutput,
  assertOutputFormat,
  publishNewOutput,
} = createFiles();
