import * as z from 'zod/v4';
import { runCLI } from '../main.mjs';
import { BATCH_READ_LIMITS } from '../batch-read.mjs';

/** Only adapts MCP fields to the existing CLI. Parser, model, Native and IO
 * admission remain owned by runCLI. Paths have the CLI's local-path semantics.
 */
export function documentTools({
  wasmPath,
  mainModuleURL,
  executeCLI = runCLI,
  cliDependencies = {},
} = {}) {
  if (wasmPath !== undefined && (typeof wasmPath !== 'string' || !wasmPath))
    throw new TypeError('InvalidMcpWasmPath');
  const wasm = wasmPath === undefined ? [] : [`--wasm=${wasmPath}`];
  const invoke = async (argv, hostOptions = {}) => {
    let stdout = '',
      stderr = '';
    const io = {
      stdout: {
        write: async (text) => {
          stdout += text;
        },
      },
      stderr: {
        write: async (text) => {
          stderr += text;
        },
      },
    };
    try {
      const exitCode = await executeCLI(argv, {
        ...cliDependencies,
        ...hostOptions,
        mainModuleURL,
        io,
      });
      return {
        content: [
          {
            type: 'text',
            text:
              exitCode === 0
                ? stdout + stderr
                : stdout + stderr || `CLI exited with code ${exitCode}.`,
          },
        ],
        ...(exitCode === 0 ? {} : { isError: true }),
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `CLI failed: ${String(error?.message ?? error)}` }],
        isError: true,
      };
    }
  };
  const batchPath = z
    .string()
    .min(1)
    .max(BATCH_READ_LIMITS.maxInputPathUnits)
    .refine((value) => {
      if (value === '-' || !value.isWellFormed()) return false;
      for (let index = 0; index < value.length; index++)
        if (value.charCodeAt(index) < 32 || value.charCodeAt(index) === 127) return false;
      return true;
    }, '명시한 파일 경로가 올바르지 않습니다.');
  return [
    {
      name: 'read_document',
      config: {
        title: 'Read HWP/HWPX document',
        description:
          '로컬 문서의 내용을 텍스트 또는 Markdown으로 읽습니다. 기본 view는 content이며, 편집용 Native 문단 ID와 원문 SHA는 view: structure로 조회합니다. 표시 텍스트는 편집 좌표가 아니며 알 수 없는 내용은 진단으로 남깁니다.',
        inputSchema: z.strictObject({
          inputPath: z
            .string()
            .min(1)
            .describe(
              'Local input file path, relative to the server working directory or absolute.',
            ),
          format: z.enum(['text', 'markdown']).default('text'),
          view: z.enum(['content', 'structure']).default('content'),
        }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      invoke: ({ inputPath, format = 'text', view = 'content' }) =>
        invoke(['read', `--format=${format}`, `--view=${view}`, ...wasm, '--', inputPath]),
    },
    {
      name: 'edit_document',
      config: {
        title: 'Edit HWP/HWPX literal text into a new file',
        description:
          'read_document의 view: structure에서 조회한 Native 문단 ID와 같은 원문 SHA를 사용해 정확히 한 문자열을 교체합니다. 겹치는 일치는 거부하며 빈 교체문은 삭제입니다. 문단 제어와 줄바꿈은 거부합니다. 새 출력 경로만 허용하고 원본이나 기존 파일을 덮어쓰지 않습니다. HWP5의 오래된 배치 정보는 명시 허용 없이는 거부합니다.',
        inputSchema: z.strictObject({
          inputPath: z.string().min(1),
          outputPath: z.string().min(1),
          target: z
            .string()
            .min(1)
            .describe(
              'read_document의 view: structure에서 얻은 정확한 s<section>:p<NativeOrdinal> ID.',
            ),
          expectedSha256: z
            .string()
            .min(1)
            .describe('read_document의 view: structure로 조회한 동일 스냅샷의 documentSHA256.'),
          findText: z.string().min(1),
          replacement: z
            .string()
            .describe('Literal replacement; empty string deletes the unique match.'),
          allowStaleLayout: z.boolean().default(false),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      invoke: ({
        inputPath,
        outputPath,
        target,
        expectedSha256,
        findText,
        replacement,
        allowStaleLayout = false,
      }) =>
        invoke([
          'edit',
          `--output=${outputPath}`,
          `--target=${target}`,
          `--expect-sha256=${expectedSha256}`,
          `--replace=${findText}`,
          `--with=${replacement}`,
          ...(allowStaleLayout ? ['--allow-stale-layout'] : []),
          ...wasm,
          '--',
          inputPath,
        ]),
    },
    ...[
      {
        name: 'get_document_info',
        command: 'info',
        title: 'Inspect document metadata',
        description:
          'Observe local document format, source SHA, section count and metadata. Unobserved protection/security values remain unknown; this is not a full capability or signature audit.',
      },
      {
        name: 'list_document_images',
        command: 'images',
        title: 'List document images',
        description:
          'List snapshot-bound picture IDs and bounded image metadata, including unsupported/failed and unknown raw payloads. Coverage is section picture sites, not master-page images, image brushes or unreferenced resources.',
      },
    ].map(({ name, command, title, description }) => ({
      name,
      config: {
        title,
        description,
        inputSchema: z.strictObject({
          inputPath: z.string().min(1),
          expectedSha256: z
            .string()
            .regex(/^[a-f0-9]{64}$/i)
            .optional(),
        }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      invoke: ({ inputPath, expectedSha256 }) =>
        invoke([
          command,
          ...(expectedSha256 === undefined ? [] : [`--expect-sha256=${expectedSha256}`]),
          ...wasm,
          '--',
          inputPath,
        ]),
    })),
    {
      name: 'extract_document_image',
      config: {
        title: 'Extract one image into a new file',
        description:
          'Read one exact image ID from list_document_images using its source SHA and publish raw bytes to a NEW FILE outputPath (CLI extract-images --output is instead a new directory). Section picture sites only; excludes master-page images, brushes and unreferenced resources. No conversion; unknown payloads require .bin. Existing files/symlink paths are refused. A failed response may report an already-published file.',
        inputSchema: z.strictObject({
          inputPath: z.string().min(1),
          outputPath: z.string().min(1),
          id: z.string().min(1),
          expectedSha256: z.string().regex(/^[a-f0-9]{64}$/i),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      invoke: ({ inputPath, outputPath, id, expectedSha256 }) =>
        invoke(
          [
            'extract-images',
            `--output=${outputPath}`,
            `--id=${id}`,
            `--expect-sha256=${expectedSha256}`,
            ...wasm,
            '--',
            inputPath,
          ],
          { imageOutputMode: 'file' },
        ),
    },
    {
      name: 'read_documents',
      config: {
        title: '여러 HWP/HWPX 문서 읽기',
        description:
          '명시한 파일 1~128개를 기존 공통 엔진으로 읽어 입력 순서의 텍스트/Markdown으로 보고합니다. 기본 view는 content이며 파일명과 본문, 한국어 실패 안내를 반환합니다. 편집용 ID와 SHA 및 상세 상태는 structure로 조회합니다. 기본 동시성1·최대2이며 일부 실패도 숨기지 않습니다. 폴더 탐색·편집·HTML·문서 JSON 출력은 제공하지 않습니다.',
        inputSchema: z.strictObject({
          inputPaths: z
            .array(batchPath)
            .min(1)
            .max(BATCH_READ_LIMITS.maxInputs)
            .refine((paths) => {
              const seen = new Map();
              for (const path of paths) {
                if (seen.has(path)) return false;
                seen.set(path, true);
              }
              return true;
            }, '중복된 입력 경로가 있습니다.'),
          format: z.enum(['text', 'markdown']).default('text'),
          view: z.enum(['content', 'structure']).default('content'),
          concurrency: z.number().int().min(1).max(BATCH_READ_LIMITS.maxConcurrency).default(1),
          maxOutputBytes: z
            .number()
            .int()
            .min(1)
            .max(BATCH_READ_LIMITS.maxOutputBytes)
            .default(BATCH_READ_LIMITS.defaultOutputBytes),
        }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      invoke: ({
        inputPaths,
        format = 'text',
        view = 'content',
        concurrency = 1,
        maxOutputBytes = BATCH_READ_LIMITS.defaultOutputBytes,
      }) =>
        invoke([
          'read-many',
          `--format=${format}`,
          `--view=${view}`,
          `--concurrency=${concurrency}`,
          `--max-output-bytes=${maxOutputBytes}`,
          ...wasm,
          '--',
          ...inputPaths,
        ]),
    },
  ];
}
