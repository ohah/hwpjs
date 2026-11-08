import { toHtml as implementation } from '../../document/src/export-html.ts';
import { toHtml as publicEntry } from '../../document/src/public-html.mjs';
import type { DocumentBytes, HTMLConversionOptions } from '../../document/src/types/conversion.js';

type Conversion = (bytes: DocumentBytes, options: HTMLConversionOptions) => Promise<string>;
const actual: Conversion = implementation;
const declared: typeof implementation = publicEntry;
const reverse: typeof publicEntry = implementation;
void [actual, declared, reverse];
// @ts-expect-error WASM은 필수다.
const missingWasm: HTMLConversionOptions = {};
// @ts-expect-error 외부 URL은 바이트 입력이 아니다.
const externalWasm: HTMLConversionOptions = { wasm: 'https://example.invalid/engine.wasm' };
void [missingWasm, externalWasm];
