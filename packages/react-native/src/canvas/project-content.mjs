import { projectNativeHwpx } from './project-hwpx-content.mjs';
import { decodeRenderSources } from './render-source-port.mjs';
import { attachHwp5Styles } from '../../../../web/preview/hwp5-style-content.mjs';
import { attachHwp5Tables } from '../../../../web/preview/hwp5-table-content.mjs';
import { attachHwp5ParagraphFormats } from '../../../../web/preview/hwp5-paragraph-formats.mjs';
import { attachHwp5PageSources } from '../../../../web/preview/hwp5-page-content.mjs';
import { attachHwp5Pictures } from '../../../../web/preview/hwp5-picture-content.mjs';
import { attachHwp5PictureTails } from '../../../../web/preview/hwp5-picture-tail-content.mjs';
import { projectHwp5PictureGeometry } from '../../../../web/preview/hwp5-picture-geometry.mjs';
import { projectHwp5GroupGeometry } from '../../../../web/preview/hwp5-group-geometry-projection.mjs';
import { attachHwp5Forms } from '../../../../web/preview/hwp5-form-content.mjs';
import { attachHwp5FormProperties } from '../../../../web/preview/hwp5-form-property-content.mjs';
import { attachHwp5Lines } from '../../../../web/preview/hwp5-line-content.mjs';
import { attachHwp5Formulas } from '../../../../web/preview/hwp5-formulas-content.mjs';
import { projectHwp5RootContent } from '../../../../web/preview/hwp5-root-content-projection.mjs';

/** Derived display only, same pure attach pipeline as reader-runtime. */
export function projectNativeContent(projection, bytes) {
  const { snapshot, port } = decodeRenderSources(bytes, projection.nativeRevision, projection);
  if (snapshot.format === 'hwpx') return projectNativeHwpx(projection, snapshot, port);
  const paragraphs = projection.paragraphs.map((row) => {
    const proof = snapshot.sections[row.section].paragraphs[row.paragraph].textPresence;
    if (!row.displayComplete) {
      if (
        !(
          proof?.observed_empty === true &&
          proof.source_node === row.sourceNode &&
          proof.token_count === 0 &&
          proof.raw_units === 0 &&
          Number.isSafeInteger(proof.declared_units) &&
          proof.declared_units >= 0 &&
          proof.declared_units <= 1 &&
          row.text === '' &&
          Array.isArray(row.tokens) &&
          row.tokens.length === 0
        )
      )
        throw Error('NativeDisplayProjectionIncomplete');
      // Native proves display emptiness only. Preserve row.editable and original
      // displayComplete field; UI edit gate still rejects this row.
    }
    return { ...row, clipped: false };
  });
  // Native full-enumeration was checked above; do not label a window as a full page.
  const { window, ...base } = projection;
  const content = {
    ...base,
    paragraphs,
    limited: false,
    nativeEnumeration: window,
    editorSessionAvailable: true,
    characterUnderlineAvailable: true,
    characterStrikeAvailable: true,
  };
  const preview = {
    sections: Array.from({ length: snapshot.sectionCount }, (_, index) => ({
      index,
      paragraphs: paragraphs.filter((p) => p.section === index),
    })),
  };
  attachHwp5Styles(port, preview, content);
  if (
    !content.characterShapes ||
    content.characterShapesError ||
    content.paragraphs.some((p) => p.characterRangesError)
  )
    throw Error('IncompleteNativeCharacterSources');
  attachHwp5Tables(port, preview, content);
  attachHwp5ParagraphFormats(port, content, true);
  attachHwp5PageSources(port, content);
  attachHwp5Pictures(port, content);
  attachHwp5PictureTails(port, content);
  content.hwp5GroupGeometry = projectHwp5GroupGeometry(content);
  attachHwp5Forms(port, content);
  attachHwp5FormProperties(port, content);
  attachHwp5Lines(port, content);
  if (content.hwp5Pictures.length) {
    const r = projectHwp5PictureGeometry(content);
    if (r.state !== 'projected') throw Error(r.error);
    content.pictures = r.pictures;
  }
  attachHwp5Formulas(port, content, false);
  const roots = projectHwp5RootContent(content);
  if (roots.state === 'projected') return roots.content;
  if (roots.state === 'unavailable') throw Error(roots.error);
  return content;
}
