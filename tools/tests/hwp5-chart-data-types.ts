import {
  createHwp5ChartDataEditor,
  type HeadlessEditor,
  type Hwp5ChartDataCapture,
  type Hwp5ChartLiteralEdit,
} from '../../packages/core/src/index.ts';
import { createHwp5ChartDataEditor as publicFactory } from '../../packages/hwpjs/src/index.ts';
type IsAny<T> = 0 extends 1 & T ? true : false;
const typedFactory: false = null as unknown as IsAny<ReturnType<typeof createHwp5ChartDataEditor>>;
const typedPublic: false = null as unknown as IsAny<ReturnType<typeof publicFactory>>;
declare const editor: HeadlessEditor;
declare const capture: Hwp5ChartDataCapture;
const api = publicFactory(editor);
api.apply(capture, [{ category: { category: 0, expected: 'A', value: 'B' } }]);
const png: Hwp5ChartLiteralEdit = {
  value: { series: 0, category: 0, expected: '20', value: '73' },
  // @ts-expect-error PNG is never part of a public edit.
  png: new Uint8Array(),
};
// @ts-expect-error No caller renderer or rendered metadata option.
api.apply(capture, [], { rendered: {} });
void typedFactory;
void typedPublic;
void png;

import type { createHwp5ChartLiteralEditApi } from '../../js/hwp5-chart-literal-edit.mjs';
type RawEditor = ReturnType<typeof createHwp5ChartLiteralEditApi>;
const typedRaw: false = null as unknown as IsAny<ReturnType<RawEditor['captureHwp5ChartData']>>;
const rawArgs: 2 = null as unknown as Parameters<RawEditor['editHwp5ChartData']>['length'];
void typedRaw;
void rawArgs;
