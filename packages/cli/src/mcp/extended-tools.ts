import * as z from 'zod/v4';
import type {
  McpServer,
  ToolCallback,
  ToolAnnotations,
  CallToolResult,
} from '@modelcontextprotocol/server';
import type { CLIHostDependencies } from '../types/host.ts';
import { parseObjectReference } from '../object-reference.ts';

export type InvokeCLI = (argv: string[], options?: CLIHostDependencies) => Promise<CallToolResult>;

// 스키마와 콜백의 타입 관계를 각 도구가 등록될 때까지 유지합니다.
export function defineDocumentTool<S extends z.ZodObject>(tool: {
  name: string;
  config: { title: string; description: string; inputSchema: S; annotations: ToolAnnotations };
  invoke: ToolCallback<S>;
}) {
  return {
    ...tool,
    register: (server: McpServer) => server.registerTool(tool.name, tool.config, tool.invoke),
  };
}

import { DOCUMENT_OPERATION_SPECS, validateDocumentOperations } from '../document-operations.ts';

const uint = () => z.number().int().min(0).max(0xffffffff);
const sha = () => z.string().regex(/^[a-f0-9]{64}$/iu);
const path = () => z.string().min(1);
export function validateMcpOcrExecutable(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || !value.isWellFormed() || value.includes('\0'))
    throw new TypeError('InvalidMcpOcrExecutable');
}

const ocrInputSchema = z.strictObject({
  inputPath: path(),
  reference: z.string().max(128).optional(),
  provider: z.enum(['tesseract', 'vision']).default('tesseract'),
  languages: z.string().min(1).max(128).default('kor+eng'),
  format: z.enum(['text', 'markdown']).default('text'),
});
const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
const writeNew = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};
const coordinateFields = new Set([
  'section',
  'paragraph',
  'startUnit',
  'endUnit',
  'atUnit',
  'charShapeId',
  'paraShapeId',
  'pictureNode',
  'unit',
  'rows',
  'columns',
  'width',
  'height',
  'rowHeight',
]);
const textFields = new Set(['expectedRangeText', 'expectedText', 'text', 'alignment', 'type']);

function operationSchema() {
  const variants = Object.entries(DOCUMENT_OPERATION_SPECS).map(([kind, spec]) => {
    const fields: Record<string, z.ZodType> = {
      kind: z.literal(kind),
      coordinates: z.literal('current-transaction'),
    };
    const field = (name: string): z.ZodType => {
      if (name === 'edit') {
        const definition = z.strictObject({
          marker: uint(),
          alignment: z.enum(['LEFT', 'CENTER', 'RIGHT']),
          useInstanceWidth: z.boolean(),
          autoIndent: z.boolean(),
          widthAdjust: z.number().int().min(-1000000).max(1000000),
          textOffsetType: z.enum(['PERCENT', 'HWPUNIT']),
          textOffset: z.number().int().min(-1000000).max(1000000),
          charShapeId: uint(),
        });
        return z
          .discriminatedUnion('mode', [
            z.strictObject({ mode: z.literal('create'), definition, apply: z.boolean() }),
            z.strictObject({
              mode: z.literal('update'),
              id: uint(),
              definition,
              apply: z.boolean(),
            }),
          ])
          .describe(
            'HWPX 문자 글머리표 정의 생성·수정. update는 같은 ID의 모든 문단에 영향을 줍니다.',
          );
      }
      if (coordinateFields.has(name)) return uint();
      if (textFields.has(name)) return z.string();
      if (name === 'cellTexts')
        return z
          .array(z.array(z.string()).min(1).max(4096))
          .min(1)
          .max(4096)
          .describe(
            '표 생성 시 rows × columns의 행 우선 초기 본문입니다. 각 셀은 한 문단 문자열입니다.',
          );
      if (name === 'value') return z.number().finite();
      if (name === 'properties')
        return z
          .strictObject({
            size: z.number().int().min(0).max(409600).nullable().optional(),
            bold: z.boolean().nullable().optional(),
            italic: z.boolean().nullable().optional(),
          })
          .describe('글자 크기 size는 1/100pt 단위입니다.');
      if (name === 'ranges')
        return z
          .array(
            z.strictObject({
              section: uint(),
              paragraph: uint(),
              startUnit: uint(),
              endUnit: uint(),
              expectedRangeText: z.string(),
            }),
          )
          .min(1)
          .max(4096);
      if (name === 'resources')
        return z.strictObject({
          paragraph: uint(),
          character: uint(),
          style: uint(),
          border_fill: uint(),
        });
      return z.unknown().nonoptional();
    };
    for (const name of spec.required) if (!Object.hasOwn(fields, name)) fields[name] = field(name);
    for (const name of spec.optional) fields[name] = field(name).optional();
    return z.strictObject(fields);
  });
  const [first, ...rest] = variants;
  if (!first) throw new Error('MissingDocumentOperationSpecs');
  return z
    .array(z.discriminatedUnion('kind', [first, ...rest]))
    .max(256)
    .refine((value) => {
      try {
        validateDocumentOperations(value);
        return true;
      } catch {
        return false;
      }
    }, '작업 종류·좌표·원문 조건·예산을 확인하세요.');
}

// 같은 CLI 호스트를 호출하며 별도 편집 엔진이나 저장 경로를 만들지 않습니다.
export function extendedDocumentTools({
  invoke,
  wasm,
  ocrExecutable,
}: {
  invoke: InvokeCLI;
  wasm: string[];
  ocrExecutable?: string;
}) {
  if (ocrExecutable !== undefined) validateMcpOcrExecutable(ocrExecutable);
  return [
    defineDocumentTool({
      name: 'edit_document_table_grid',
      config: {
        title: '원본 표 행·열을 새 파일에서 편집',
        description:
          '같은 원본 SHA를 포함한 표 reference와 현재 행·열 수를 확인해 행 또는 열 하나를 삽입·삭제합니다. index는 0부터 시작하며 삽입은 축 끝도 허용합니다. HWP5/HWPX 모두 allowStaleLayout 동의가 필요합니다. 새 파일만 게시하며 layoutRequiresReflow와 previewStale은 true입니다. layout observed8은 HWP5 전용입니다.',
        inputSchema: z
          .strictObject({
            inputPath: path(),
            outputPath: path(),
            reference: z
              .string()
              .min(1)
              .max(128)
              .refine((value) => {
                try {
                  return parseObjectReference(value).kind === 'table';
                } catch {
                  return false;
                }
              }, '표 참조가 필요합니다.'),
            action: z.enum(['insert-row', 'delete-row', 'insert-column', 'delete-column']),
            index: uint(),
            expectedRows: uint().min(1),
            expectedColumns: uint().min(1),
            layout: z.enum(['spec6', 'observed8']).optional(),
            allowStaleLayout: z.boolean().default(false),
          })
          .refine(({ action, index, expectedRows, expectedColumns }) => {
            const axis = action.endsWith('row') ? expectedRows : expectedColumns;
            return action.startsWith('insert')
              ? index <= axis && axis < 0xffffffff
              : index < axis && axis > 1;
          }, '행·열 인덱스 또는 예상 크기가 범위를 벗어났습니다.'),
        annotations: writeNew,
      },
      invoke: ({
        inputPath,
        outputPath,
        reference,
        action,
        index,
        expectedRows,
        expectedColumns,
        layout,
        allowStaleLayout = false,
      }) =>
        invoke([
          'edit-table-grid',
          `--ref=${reference}`,
          `--action=${action}`,
          `--index=${index}`,
          `--rows=${expectedRows}`,
          `--columns=${expectedColumns}`,
          `--output=${outputPath}`,
          ...(layout === undefined ? [] : [`--layout=${layout}`]),
          ...(allowStaleLayout ? ['--allow-stale-layout'] : []),
          ...wasm,
          '--',
          inputPath,
        ]),
    }),
    defineDocumentTool({
      name: 'delete_document_table',
      config: {
        title: '지정한 표 전체를 새 문서에서 삭제',
        description:
          '원본 SHA가 포함된 표 reference로 표 자체와 셀 내용을 제거합니다. 셀 비우기와 다릅니다. 다른 개체와 공유 자원은 보존하며 새 파일만 저장합니다. 전체 재조판은 수행하지 않으므로 allowStaleLayout 동의가 필요합니다. 열린 편집기 undo에는 추가되지 않습니다.',
        inputSchema: z.strictObject({
          inputPath: path(),
          outputPath: path(),
          reference: z
            .string()
            .min(1)
            .max(128)
            .refine((value) => {
              try {
                return parseObjectReference(value).kind === 'table';
              } catch {
                return false;
              }
            }, '표 참조가 필요합니다.'),
          allowStaleLayout: z.boolean().default(false),
        }),
        annotations: writeNew,
      },
      invoke: ({ inputPath, outputPath, reference, allowStaleLayout = false }) =>
        invoke([
          'delete-table',
          `--ref=${reference}`,
          `--output=${outputPath}`,
          ...(allowStaleLayout ? ['--allow-stale-layout'] : []),
          ...wasm,
          '--',
          inputPath,
        ]),
    }),
    defineDocumentTool({
      name: 'insert_document_image',
      config: {
        title: '본문 문단에 새 PNG 또는 JPEG 삽입',
        description:
          'get_document_paragraph의 Native target과 expectedText 원문 및 SHA를 사용해 기존 최상위 본문 문단에 인라인 그림을 삽입합니다. unit은 UTF-16 좌표, width/height는 HWPUNIT(1/7200인치)입니다. 표 셀·글상자 등 중첩 문맥은 지원하지 않습니다. 새 파일만 저장하며 전체 재조판과 열린 세션 undo는 제공하지 않습니다.',
        inputSchema: z.strictObject({
          inputPath: path(),
          outputPath: path(),
          expectedSha256: sha(),
          target: z.string().regex(/^s\d+:p\d+$/u),
          unit: uint(),
          expectedText: z.string().max(1024 * 1024),
          imagePath: path(),
          width: uint().min(1).max(0x7fffffff),
          height: uint().min(1).max(0x7fffffff),
          allowStaleLayout: z.boolean().default(false),
        }),
        annotations: writeNew,
      },
      invoke: ({
        inputPath,
        outputPath,
        expectedSha256,
        target,
        unit,
        expectedText,
        imagePath,
        width,
        height,
        allowStaleLayout = false,
      }) =>
        invoke([
          'insert-image',
          `--target=${target}`,
          `--unit=${unit}`,
          `--expect-text=${expectedText}`,
          `--expect-sha256=${expectedSha256}`,
          `--image=${imagePath}`,
          `--width=${width}`,
          `--height=${height}`,
          `--output=${outputPath}`,
          ...(allowStaleLayout ? ['--allow-stale-layout'] : []),
          ...wasm,
          '--',
          inputPath,
        ]),
    }),
    defineDocumentTool({
      name: 'export_document_html',
      config: {
        title: '문서의 의미 구조를 HTML로 내보내기',
        description:
          '문단·표·이미지·머리말/꼬리말 등 관측된 의미 구조를 새 HTML 파일로 내보냅니다. 지원하는 내장 raster 이미지는 data URI로 포함할 수 있습니다. 원본 서식이나 페이지 배치의 완전 재현은 아니며 누락·미지원 이미지는 경고와 참조로 표시합니다. 외부 이미지를 가져오거나 스크립트를 실행하지 않습니다.',
        inputSchema: z.strictObject({
          inputPath: path(),
          outputPath: path(),
          embedImages: z.enum(['supported', 'none']).default('supported'),
        }),
        annotations: writeNew,
      },
      invoke: ({ inputPath, outputPath, embedImages = 'supported' }) =>
        invoke([
          'export-html',
          `--output=${outputPath}`,
          `--embed-images=${embedImages}`,
          ...wasm,
          '--',
          inputPath,
        ]),
    }),
    defineDocumentTool({
      name: 'replace_document_image',
      config: {
        title: '문서 그림을 새 파일에서 교체',
        description:
          '원본 SHA에 결속된 이미지 reference를 사용해 PNG 또는 JPEG로 교체하고 새 문서를 저장합니다. 참조는 list_document_images 또는 read_document로 확인합니다. 기존 파일은 덮어쓰지 않으며 미리보기는 오래된 상태가 됩니다. 그림 삽입이나 열린 세션 undo가 아닙니다.',
        inputSchema: z.strictObject({
          inputPath: path(),
          outputPath: path(),
          reference: z
            .string()
            .min(1)
            .max(128)
            .refine((value) => {
              try {
                return parseObjectReference(value).kind === 'image';
              } catch {
                return false;
              }
            }, '같은 원본의 이미지 참조가 필요합니다.'),
          imagePath: path(),
        }),
        annotations: writeNew,
      },
      invoke: ({ inputPath, outputPath, reference, imagePath }) =>
        invoke([
          'replace-image',
          `--ref=${reference}`,
          `--image=${imagePath}`,
          `--output=${outputPath}`,
          ...wasm,
          '--',
          inputPath,
        ]),
    }),
    defineDocumentTool({
      name: 'get_document_paragraph',
      config: {
        title: '문단 편집 원문과 좌표 조회',
        description:
          '같은 원본의 Native 문단을 조회합니다. target은 read_document structure의 s<section>:p<NativeOrdinal>입니다. expectedText JSON ASCII 문자열은 apply_document_changes의 원문 조건에 복사할 수 있습니다. 표시 본문과 편집 원문·UTF16 좌표는 다릅니다.',
        inputSchema: z.strictObject({
          inputPath: path(),
          target: z.string().min(1),
          expectedSha256: sha().optional(),
          format: z.enum(['text', 'markdown']).default('text'),
        }),
        annotations: readOnly,
      },
      invoke: ({ inputPath, target, expectedSha256, format = 'text' }) =>
        invoke([
          'paragraph',
          `--target=${target}`,
          `--format=${format}`,
          ...(expectedSha256 === undefined ? [] : [`--expect-sha256=${expectedSha256}`]),
          ...wasm,
          '--',
          inputPath,
        ]),
    }),
    defineDocumentTool({
      name: 'apply_document_changes',
      config: {
        title: '문서 변경 묶음을 새 파일에 저장',
        description:
          '명시한 작업들을 독립 Native 세션에서 순서대로 적용하고 한 번 저장합니다. coordinates는 current-transaction 필수이며 직전 작업 이후 실제 Native 좌표입니다. 구조 변경 뒤 문단 번호를 자동 보정하지 않습니다. expectedText와 expectedRangeText는 get_document_paragraph로 확인한 Native 원문 조건입니다. 실패하면 새 파일을 게시하지 않습니다. 기존 원본·출력은 덮어쓰지 않습니다. HWP5 오래된 배치 허용은 새 조판 생성을 뜻하지 않습니다.',
        inputSchema: z.strictObject({
          inputPath: path(),
          outputPath: path(),
          expectedSha256: sha(),
          operations: operationSchema(),
          allowStaleLayout: z.boolean().default(false),
        }),
        annotations: writeNew,
      },
      invoke: ({ inputPath, outputPath, expectedSha256, operations, allowStaleLayout = false }) =>
        invoke([
          'apply',
          `--operations=${JSON.stringify(operations)}`,
          `--output=${outputPath}`,
          `--expect-sha256=${expectedSha256}`,
          ...(allowStaleLayout ? ['--allow-stale-layout'] : []),
          ...wasm,
          '--',
          inputPath,
        ]),
    }),
    defineDocumentTool({
      name: 'create_document',
      config: {
        title: 'HWP5/HWPX 새 문서 생성',
        description:
          '공통 Native 생성기로 새 문서를 만들고 선택한 초기 본문 문자열을 넣습니다. 기존 템플릿 파일을 복사하지 않습니다. 출력은 새 경로여야 하며 HWP5 본문 초기화의 배치 무효화는 allowStaleLayout을 명시해야 합니다.',
        inputSchema: z.strictObject({
          outputPath: path(),
          format: z.enum(['hwp5', 'hwpx']),
          text: z.string().default(''),
          allowStaleLayout: z.boolean().default(false),
        }),
        annotations: writeNew,
      },
      invoke: ({ outputPath, format, text = '', allowStaleLayout = false }) =>
        invoke(
          [
            'create',
            `--format=${format}`,
            `--output=${outputPath}`,
            ...(allowStaleLayout ? ['--allow-stale-layout'] : []),
            ...wasm,
          ],
          { creationText: text },
        ),
    }),
    defineDocumentTool({
      name: 'convert_document',
      config: {
        title: '문서 내용을 다른 형식의 새 문서로 이관',
        description:
          '기본 lossPolicy reject는 전체 보존 변환을 지원하지 않으면 실패합니다. text-only를 명시하면 관측 본문 문자열·빈 문단·Unicode를 새 문서에 이관하며 표 구조·서식·개체·머리말·꼬리말 등은 보존하지 않습니다. 손실 보고서를 함께 반환합니다. 원본 조판이나 무손실 변환으로 간주하지 마세요.',
        inputSchema: z.strictObject({
          inputPath: path(),
          outputPath: path(),
          to: z.enum(['hwp5', 'hwpx']),
          expectedSha256: sha().optional(),
          lossPolicy: z.enum(['reject', 'text-only']).default('reject'),
          allowStaleLayout: z.boolean().default(false),
        }),
        annotations: writeNew,
      },
      invoke: ({
        inputPath,
        outputPath,
        to,
        expectedSha256,
        lossPolicy = 'reject',
        allowStaleLayout = false,
      }) =>
        invoke([
          'convert',
          `--to=${to}`,
          `--output=${outputPath}`,
          `--loss-policy=${lossPolicy}`,
          ...(expectedSha256 === undefined ? [] : [`--expect-sha256=${expectedSha256}`]),
          ...(allowStaleLayout ? ['--allow-stale-layout'] : []),
          ...wasm,
          '--',
          inputPath,
        ]),
    }),
    defineDocumentTool({
      name: 'ocr_document',
      config: {
        title: '문서 그림의 로컬 OCR',
        description:
          '구역 그림 전체 또는 지정한 이미지 reference만 로컬 공급자로 인식합니다. 기본 tesseract는 설치된 실행 파일과 언어 자료가 필요하며 vision은 macOS 전용입니다. 공급자를 자동 대체하거나 외부 서버로 업로드하지 않습니다. 언어·도구 부재와 실제 빈 인식 결과를 구분합니다. 일부 그림 실패는 성공 텍스트와 함께 오류로 보고합니다.',
        inputSchema: ocrInputSchema,
        annotations: { ...readOnly, readOnlyHint: false },
      },
      invoke: (input) => {
        // 직접 호출도 SDK와 같은 경계를 지켜 CLI/파일 접근 전에 거부합니다.
        const parsed = ocrInputSchema.safeParse(input);
        if (!parsed.success)
          return Promise.resolve({
            isError: true,
            content: [{ type: 'text' as const, text: 'InvalidMcpOcrInput' }],
          });
        const { inputPath, reference, provider, languages, format } = parsed.data;
        return invoke([
          'ocr',
          `--provider=${provider}`,
          `--languages=${languages}`,
          `--format=${format}`,
          ...(reference === undefined ? [] : [`--ref=${reference}`]),
          ...(provider === 'tesseract' && ocrExecutable !== undefined
            ? [`--executable=${ocrExecutable}`]
            : []),
          ...wasm,
          '--',
          inputPath,
        ]);
      },
    }),
  ];
}
