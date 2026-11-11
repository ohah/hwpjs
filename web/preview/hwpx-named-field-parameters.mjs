import { resolveNamedFieldSource, resolveHwpxNamedFieldTarget } from './hwpx-named-field-value.mjs';

export function readHwpxNamedFieldParameters(editor, request) {
  const row = resolveNamedFieldSource(editor, request, 'InvalidNamedFieldParametersRequest');
  if (row.kind !== 'CLICK_HERE') throw Error('NamedFieldParametersUnavailable');
  const match = /^hwpx:(\d+):(\d+)$/.exec(row.id);
  if (!match) throw Error('StaleNamedFieldTarget');
  return editor.namedFieldParameters(
    Number(match[1]),
    row.location ? row.location.paragraph + 1 : 0,
    Number(match[2]),
    row.name,
  );
}

export function setHwpxNamedFieldParameters(editor, request) {
  const row = resolveHwpxNamedFieldTarget(
    editor,
    request,
    'InvalidNamedFieldParametersCommand',
    'NamedFieldParametersUnavailable',
  );
  return editor.setNamedFieldParameters(
    request.section,
    request.paragraph + 1,
    row.location.beginElement,
    row.name,
    request.expected,
    request.direction,
    request.memo,
  );
}
