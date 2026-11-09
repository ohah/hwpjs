import * as z from 'zod/v4';
import { runCLI } from '../main.ts';
import { BATCH_READ_LIMITS } from '../batch-read.ts';
import { parseObjectReference } from '../object-reference.ts';
import { extendedDocumentTools, defineDocumentTool } from './extended-tools.ts';

import type { CLIHostDependencies, CLIIO, RunCLI } from '../types/host.ts';
import type { InvokeCLI } from './extended-tools.ts';
// 일반 객체로 전달된 오류도 기존 message 표시 계약을 유지합니다.
export function describeMcpError(error: unknown): string {
  const message =
    error !== null &&
    (typeof error === 'object' || typeof error === 'function') &&
    'message' in error
      ? error.message
      : undefined;
  return String(message ?? error);
}

export interface DocumentToolsOptions {
  wasmPath?: string;
  /** 신뢰한 서버 운영자가 시작 시 고정하는 Tesseract 실행 파일입니다. */
  ocrExecutable?: string;
  mainModuleURL?: string;
  executeCLI?: RunCLI;
  cliDependencies?: CLIHostDependencies;
}
// MCP 입력을 기존 CLI로 전달하며 파서·모델·입출력 검증은 CLI가 소유합니다.
export function documentTools({
  wasmPath,
  ocrExecutable,
  mainModuleURL,
  executeCLI = runCLI,
  cliDependencies = {},
}: DocumentToolsOptions = {}) {
  if (wasmPath !== undefined && (typeof wasmPath !== 'string' || !wasmPath))
    throw new TypeError('InvalidMcpWasmPath');
  const wasm = wasmPath === undefined ? [] : [`--wasm=${wasmPath}`];
  const objectReference = z
    .string()
    .max(128)
    .refine((value) => {
      try {
        parseObjectReference(value);
        return true;
      } catch {
        return false;
      }
    }, '본문에서 얻은 유효한 개체 참조가 필요합니다.');
  const invoke: InvokeCLI = async (argv, hostOptions = {}) => {
    let stdout = '',
      stderr = '';
    const io: CLIIO = {
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
        content: [
          {
            type: 'text',
            text: `CLI failed: ${describeMcpError(error)}`,
          },
        ],
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
    defineDocumentTool({
      name: 'read_document',
      config: {
        title: 'Read HWP/HWPX document',
        description:
          '로컬 문서의 내용을 텍스트 또는 Markdown으로 읽습니다. 기본 view는 content이며, 편집용 Native 문단 ID와 원문 SHA는 view: structure로 조회합니다. 본문의 개체 참조는 get_document_object로 조회하고 이미지 참조는 extract_document_image로 추출합니다. 참조는 네트워크 주소가 아닙니다. 표시 텍스트는 편집 좌표가 아니며 알 수 없는 내용은 진단으로 남깁니다.',
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
    }),
    defineDocumentTool({
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
    }),
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
    ].map(({ name, command, title, description }) =>
      defineDocumentTool({
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
      }),
    ),
    defineDocumentTool({
      name: 'extract_document_image',
      config: {
        title: 'Extract one image into a new file',
        description:
          '본문의 이미지 reference 또는 list_document_images의 id+expectedSha256 중 하나로 원본 바이트를 새 파일 outputPath에 추출합니다. 두 방식을 함께 전달하지 마세요. CLI extract-images의 output은 새 폴더입니다. 구역의 그림 위치만 대상으로 하며 바탕쪽·브러시·미참조 자원은 제외합니다. 변환하지 않으며 알 수 없는 형식은 .bin입니다. 기존 파일·심볼릭 링크는 거부하고 실패 응답에도 이미 생성된 파일이 보고될 수 있습니다.',
        inputSchema: z
          .strictObject({
            inputPath: z.string().min(1),
            outputPath: z.string().min(1),
            reference: objectReference.optional(),
            id: z.string().min(1).optional(),
            expectedSha256: z
              .string()
              .regex(/^[a-f0-9]{64}$/i)
              .optional(),
          })
          .refine(
            (value) =>
              value.reference !== undefined
                ? value.id === undefined && value.expectedSha256 === undefined
                : value.id !== undefined && value.expectedSha256 !== undefined,
            'reference 또는 id와 expectedSha256 중 한 방식만 전달하세요.',
          ),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      invoke: ({ inputPath, outputPath, reference, id, expectedSha256 }) =>
        invoke(
          [
            'extract-images',
            `--output=${outputPath}`,
            ...(reference === undefined ? [] : [`--ref=${reference}`]),
            ...(id === undefined ? [] : [`--id=${id}`]),
            ...(expectedSha256 === undefined ? [] : [`--expect-sha256=${expectedSha256}`]),
            ...wasm,
            '--',
            inputPath,
          ],
          { imageOutputMode: 'file' },
        ),
    }),
    defineDocumentTool({
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
    }),
    defineDocumentTool({
      name: 'get_document_object',
      config: {
        title: '문서 개체 상세 조회',
        description:
          'read_document 본문에 표시된 reference로 같은 스냅샷의 표·그림·차트·수식·도형·OLE를 조회합니다. 관측된 종류만 허용하며 없는 개체나 오래된 참조는 거부합니다. 이미지는 바이트를 읽지 않고 추출에 필요한 ID와 상태를 안내합니다. 이미지 파일은 extract_document_image로 추출하세요. 지원하지 않는 상세 내용은 unavailable로 명시합니다. 참조는 웹 주소나 MCP 리소스 URI가 아닙니다.',
        inputSchema: z.strictObject({
          inputPath: z.string().min(1),
          reference: objectReference,
          format: z.enum(['text', 'markdown']).default('text'),
        }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      invoke: ({ inputPath, reference, format = 'text' }) =>
        invoke(['object', `--ref=${reference}`, `--format=${format}`, ...wasm, '--', inputPath]),
    }),
    ...extendedDocumentTools({ invoke, wasm, ocrExecutable }),
  ];
}
