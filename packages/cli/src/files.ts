import * as nodeFS from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname, basename, join, extname, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import type { DocumentFormat } from './types/commands.ts';

export interface FileIdentity {
  readonly dev: string;
  readonly ino: string;
}
export interface InputSnapshot {
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly sha256: string;
  readonly identity: FileIdentity;
}
export interface OutputTarget {
  readonly path: string;
}
export interface ImageDirectory {
  readonly path: string;
}
export interface CleanupWarning {
  readonly phase: string;
  readonly code: string;
  readonly temporaryPath?: string;
}
export interface OutputReceipt {
  readonly published: true;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly warnings: readonly CleanupWarning[];
}
interface OutputState {
  path: string;
  parent: string;
  input?: InputSnapshot;
  used: boolean;
  kind: 'document' | 'image' | 'html';
  parentIdentity?: FileIdentity;
  format?: DocumentFormat | 'image' | 'html';
}
interface OutputOptions {
  input?: InputSnapshot;
  outputPath: string;
  kind?: 'document' | 'image' | 'html';
  directory?: ImageDirectory;
}
interface FileDependencies {
  fs?: typeof nodeFS;
  cwd?: () => string;
  random?: () => string;
}
interface FileError extends Error {
  code: string;
  cleanupWarnings?: readonly CleanupWarning[];
  createdDirectory?: string;
}
const errorCode = (cause: unknown): string => {
  if (cause !== null && typeof cause === 'object') {
    const fields = cause as { code?: unknown; message?: unknown };
    return String(fields.code ?? fields.message ?? cause);
  }
  return String(cause);
};

export const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
export const MAX_WASM_BYTES = 32 * 1024 * 1024;
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const error = (code: string, cause?: unknown): FileError =>
  Object.assign(new Error(code, cause ? { cause } : {}), { code });
const validPath = (value: unknown): void => {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw error('InvalidFilePath');
};
const sameIdentity = (
  stat: { dev: bigint | number; ino: bigint | number },
  identity: FileIdentity | undefined,
): boolean =>
  identity !== undefined && String(stat.dev) === identity.dev && String(stat.ino) === identity.ino;

/** Inject filesystem operations only for focused I/O failure tests. No engine code lives here. */
export function createFiles({
  fs = nodeFS,
  cwd = () => process.cwd(),
  random = () => randomBytes(12).toString('hex'),
}: FileDependencies = {}) {
  const targets = new WeakMap<OutputTarget, OutputState>();
  const directories = new WeakMap<ImageDirectory, FileIdentity>();
  async function readInputSnapshot(
    path: string,
    { maxBytes = MAX_DOCUMENT_BYTES }: { maxBytes?: number } = {},
  ): Promise<InputSnapshot> {
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
        (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'] as const).some(
          (key) => before[key] !== after[key],
        )
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
  function resolveWasmPath(explicit?: string, mainModuleURL?: string): string {
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
  async function vacant(path: string, input?: InputSnapshot): Promise<void> {
    if (input && path === input.path) throw error('SourceOutputCollision');
    let stat;
    try {
      stat = await fs.lstat(path);
    } catch (cause) {
      if (errorCode(cause) === 'ENOENT') return;
      throw cause;
    }
    throw error(sameIdentity(stat, input?.identity) ? 'SourceOutputCollision' : 'OutputExists');
  }
  const imageExtensions = new Set([
    '.bin',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.bmp',
    '.webp',
    '.tif',
    '.tiff',
  ]);
  // Extraction refuses symlink ancestors, including dangling final links. Keep
  // document save admission unchanged; images opt into this stricter policy.
  async function imageParent(path: string): Promise<{ parent: string; identity: FileIdentity }> {
    const parent = dirname(path),
      root = parse(parent).root;
    let cursor = root;
    for (const part of parent.slice(root.length).split('/').filter(Boolean)) {
      cursor = join(cursor, part);
      const stat = await fs.lstat(cursor, { bigint: true });
      if (stat.isSymbolicLink()) throw error('OutputSymlink');
      if (!stat.isDirectory()) throw error('OutputParentNotDirectory');
    }
    const stat = await fs.lstat(parent, { bigint: true });
    return { parent, identity: { dev: String(stat.dev), ino: String(stat.ino) } };
  }
  async function verifyImageParent(record: OutputState): Promise<void> {
    const current = await imageParent(record.path);
    if (!sameIdentity(await fs.lstat(current.parent, { bigint: true }), record.parentIdentity))
      throw error('OutputParentChanged');
  }
  async function createImageDirectory({
    input,
    outputPath,
  }: {
    input: InputSnapshot;
    outputPath: string;
  }): Promise<ImageDirectory> {
    validPath(outputPath);
    const path = resolve(cwd(), outputPath);
    await imageParent(path);
    await vacant(path, input);
    await fs.mkdir(path, { mode: 0o700 }); // Exclusive: no recursive mkdir, no retry.
    try {
      const stat = await fs.lstat(path, { bigint: true });
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw error('OutputParentChanged');
      const directory = Object.freeze({ path });
      directories.set(directory, { dev: String(stat.dev), ino: String(stat.ino) });
      return directory;
    } catch (cause) {
      const failure = error(errorCode(cause), cause);
      failure.createdDirectory = path;
      throw failure;
    }
  }
  async function prepareOutput({
    input,
    outputPath,
    kind = 'document',
    directory,
  }: OutputOptions): Promise<OutputTarget> {
    validPath(outputPath);
    if (!['document', 'image', 'html'].includes(kind)) throw error('InvalidOutputKind');
    const absolute = resolve(cwd(), outputPath);
    const image = kind !== 'document' ? await imageParent(absolute) : null;
    if (directory !== undefined) {
      const identity = directories.get(directory);
      if (
        kind !== 'image' ||
        !identity ||
        dirname(absolute) !== directory.path ||
        !sameIdentity(await fs.lstat(directory.path, { bigint: true }), identity)
      )
        throw error('OutputParentChanged');
    }
    const parent = image?.parent ?? (await fs.realpath(dirname(absolute)));
    if (!(await fs.stat(parent)).isDirectory()) throw error('OutputParentNotDirectory');
    const path = join(parent, basename(absolute));
    if (
      !(
        kind === 'image'
          ? imageExtensions
          : kind === 'html'
            ? new Set(['.html', '.htm'])
            : new Set(['.hwp', '.hwpx'])
      ).has(extname(path).toLowerCase())
    )
      throw error('InvalidOutputExtension');
    await vacant(path, input);
    const target = Object.freeze({ path });
    targets.set(target, {
      path,
      parent,
      input,
      used: false,
      kind,
      parentIdentity: image?.identity,
    });
    return target;
  }
  async function assertNewOutput(
    options: OutputOptions & { input: InputSnapshot },
  ): Promise<OutputTarget> {
    if (!options?.input || typeof options.input.path !== 'string')
      throw error('InvalidInputSnapshot');
    return prepareOutput(options);
  }
  async function assertNewDocumentOutput({
    outputPath,
  }: {
    outputPath: string;
  }): Promise<OutputTarget> {
    return prepareOutput({ outputPath, kind: 'document' });
  }
  function assertImageFormat(target: OutputTarget, extension: string): void {
    const record = targets.get(target);
    if (!record || record.used || record.kind !== 'image') throw error('InvalidOutputTarget');
    if (!imageExtensions.has(extension)) throw error('InvalidImageExtension');
    if (extname(record.path).toLowerCase() !== extension)
      throw error('OutputImageExtensionMismatch');
    record.format = 'image';
  }
  function assertHTMLFormat(target: OutputTarget): void {
    const record = targets.get(target);
    if (!record || record.used || record.kind !== 'html') throw error('InvalidOutputTarget');
    record.format = 'html';
  }
  function assertOutputFormat(target: OutputTarget, format: DocumentFormat): void {
    const record = targets.get(target);
    if (!record || record.used || record.kind !== 'document') throw error('InvalidOutputTarget');
    if (!['hwp5', 'hwpx'].includes(format)) throw error('InvalidEngineFormat');
    if (extname(record.path).toLowerCase() !== (format === 'hwp5' ? '.hwp' : '.hwpx'))
      throw error('OutputFormatMismatch');
    record.format = format;
  }
  async function publishNewOutput({
    target,
    bytes,
  }: {
    target: OutputTarget;
    bytes: Uint8Array;
  }): Promise<OutputReceipt> {
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
    let temporary: string | undefined,
      handle: nodeFS.FileHandle | undefined,
      published = false,
      primary: unknown;
    const warnings: CleanupWarning[] = [];
    const warn = (phase: string, cause: unknown): void => {
      warnings.push(
        Object.freeze({
          phase,
          code: errorCode(cause),
          ...(temporary ? { temporaryPath: temporary } : {}),
        }),
      );
    };
    try {
      if (record.kind !== 'document') await verifyImageParent(record);
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
          if (errorCode(cause) !== 'EEXIST') throw cause;
        }
      }
      if (!handle || temporary === undefined) throw error('TemporaryFileCollision');
      await handle.writeFile(owned);
      await handle.sync();
      await handle.close();
      handle = undefined;
      // link is the commit point: atomic no-replace, never a rename/copy fallback.
      if (record.kind !== 'document') await verifyImageParent(record);
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
      if (warnings.length) {
        const failure = error(errorCode(primary), primary);
        failure.cleanupWarnings = Object.freeze(warnings);
        throw failure;
      }
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
    assertNewDocumentOutput,
    assertOutputFormat,
    assertImageFormat,
    assertHTMLFormat,
    createImageDirectory,
    publishNewOutput,
  });
}
export type Files = ReturnType<typeof createFiles>;
export const {
  readInputSnapshot,
  resolveWasmPath,
  assertNewOutput,
  assertNewDocumentOutput,
  assertOutputFormat,
  assertImageFormat,
  assertHTMLFormat,
  createImageDirectory,
  publishNewOutput,
} = createFiles();
