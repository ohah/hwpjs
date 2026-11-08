import type { createExperimentalHwp5Editor } from '../../../../js/hwp5-editor.mjs';
import type { createHwpxEditor } from '../../../../js/hwpx-editor.mjs';

export type DocumentFormat = 'hwp5' | 'hwpx';
export type Hwp5Sdk = Awaited<ReturnType<typeof createExperimentalHwp5Editor>>;
export type HwpxSdk = Awaited<ReturnType<typeof createHwpxEditor>>;
