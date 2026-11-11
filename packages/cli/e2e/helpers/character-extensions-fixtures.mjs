import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createNewDocumentBytes } from '../../../../js/new-document.mjs';
import { createExperimentalHwp5Editor } from '../../../../js/hwp5-editor.mjs';
import { createHwpxEditor } from '../../../../js/hwpx-editor.mjs';
export async function generateCharacterExtensionFixtures({ wasmModule, directory }) {
  await mkdir(directory);
  const result = {};
  for (const format of ['hwp5', 'hwpx']) {
    const bytes = await createNewDocumentBytes(wasmModule, format),
      e =
        format === 'hwp5'
          ? await createExperimentalHwp5Editor(wasmModule, bytes)
          : await createHwpxEditor(wasmModule);
    try {
      if (format === 'hwpx') {
        e.open(bytes);
        e.splice(0, 1, 0, 0, 'LEFTSAMESAME');
        e.splitParagraph({ section: 0, paragraph: 1, atUnit: 4 });
        e.splitParagraph({ section: 0, paragraph: 2, atUnit: 4 });
        result[format] = e.save();
      } else {
        e.splice({ section: 0, paragraph: 0, startUnit: 16, endUnit: 16, text: 'LEFTSAMESAME' });
        e.splitParagraph({ section: 0, paragraph: 0, atUnit: 20 });
        e.splitParagraph({ section: 0, paragraph: 1, atUnit: 4 });
        result[format] = e.save({ allowStaleLayout: true }).bytes;
      }
      await writeFile(
        join(directory, format === 'hwp5' ? 'same.hwp' : 'same.hwpx'),
        result[format],
      );
    } finally {
      e.close();
    }
  }
  const unknown = join(directory, 'unknown.hwpx');
  const child = spawnSync(
    'python3',
    [
      '-B',
      fileURLToPath(new URL('./character-unknown-fixture.py', import.meta.url)),
      join(directory, 'same.hwpx'),
      unknown,
    ],
    { encoding: 'utf8' },
  );
  if (child.status !== 0) throw Error(child.stderr);
  result.unknownHwpx = await readFile(unknown);
  return result;
}
