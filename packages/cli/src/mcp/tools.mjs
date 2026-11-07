import * as z from 'zod/v4';
import { runCLI } from '../main.mjs';

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
        content: [{ type: 'text', text: stdout + stderr || `CLI exited with code ${exitCode}.` }],
        ...(exitCode === 0 ? {} : { isError: true }),
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `CLI failed: ${String(error?.message ?? error)}` }],
        isError: true,
      };
    }
  };
  return [
    {
      name: 'read_document',
      config: {
        title: 'Read HWP/HWPX document',
        description:
          'Read a local document as a bounded logical text/Markdown view. Returns documentSHA256 and exact Native paragraph IDs. Display text is not an editing-offset map; unknown ownership and unsupported content remain diagnostic.',
        inputSchema: z.strictObject({
          inputPath: z
            .string()
            .min(1)
            .describe(
              'Local input file path, relative to the server working directory or absolute.',
            ),
          format: z.enum(['text', 'markdown']).default('text'),
        }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      invoke: ({ inputPath, format = 'text' }) =>
        invoke(['read', `--format=${format}`, ...wasm, '--', inputPath]),
    },
    {
      name: 'edit_document',
      config: {
        title: 'Edit HWP/HWPX literal text into a new file',
        description:
          'Replace exactly one literal occurrence in a Native paragraph ID from read_document, gated by that read snapshot SHA. Overlapping matches are ambiguous. Empty replacement deletes text; paragraph controls/newlines are rejected. Output must be a new path; the original and existing outputs are never overwritten. Stale HWP5 layout is rejected unless explicitly allowed.',
        inputSchema: z.strictObject({
          inputPath: z.string().min(1),
          outputPath: z.string().min(1),
          target: z
            .string()
            .min(1)
            .describe('Exact s<section>:p<NativeOrdinal> ID from read_document.'),
          expectedSha256: z
            .string()
            .min(1)
            .describe('documentSHA256 from the same read_document snapshot.'),
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
  ];
}
