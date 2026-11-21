import { captureCreatedCellPropertiesRequest } from '../../js/created-cell-properties.mjs';
/** Selection lease is captured by Surface/Core; Native certifies the generated owner. */
export function applyCreatedCellPropertiesCommand(
  editor,
  format,
  historyEnabled,
  historyPoisoned,
  documentWindow,
  message,
) {
  if (
    !editor ||
    !historyEnabled ||
    historyPoisoned ||
    editor.historyStats?.()?.protocolVersion !== 2
  )
    throw Error('CreatedCellPropertiesUnavailable');
  if (
    !['hwp5', 'hwpx'].includes(format) ||
    documentWindow ||
    editor.supportsCreatedCellProperties?.() !== true
  )
    throw Error('CreatedCellPropertiesUnavailable');
  const request = captureCreatedCellPropertiesRequest({
    section: message.section,
    identity: message.identity,
    row: message.row,
    column: message.column,
    expected: message.expected,
    ...(message.size === undefined ? {} : { size: message.size }),
    ...(message.appearance === undefined ? {} : { appearance: message.appearance }),
  });
  return editor.editCreatedCellProperties(request);
}
