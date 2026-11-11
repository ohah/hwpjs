const u32 = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
const i32 = (n) => Number.isInteger(n) && n >= -1000000 && n <= 1000000;
/** Validates only command/Native DTO values; never reads document bytes. */
export function checkedBulletDefinition(d) {
  if (
    !d ||
    Object.keys(d).some(
      (k) =>
        ![
          'marker',
          'alignment',
          'useInstanceWidth',
          'autoIndent',
          'widthAdjust',
          'textOffsetType',
          'textOffset',
          'charShapeId',
        ].includes(k),
    ) ||
    !u32(d.marker) ||
    d.marker <= 0x20 ||
    d.marker > 0x10ffff ||
    (d.marker >= 0x7f && d.marker <= 0x9f) ||
    (d.marker >= 0xd800 && d.marker <= 0xdfff) ||
    d.marker === 0xfffe ||
    d.marker === 0xffff ||
    !['LEFT', 'CENTER', 'RIGHT'].includes(d.alignment) ||
    typeof d.useInstanceWidth !== 'boolean' ||
    typeof d.autoIndent !== 'boolean' ||
    !i32(d.widthAdjust) ||
    !i32(d.textOffset) ||
    !['PERCENT', 'HWPUNIT'].includes(d.textOffsetType) ||
    !u32(d.charShapeId)
  )
    throw Error('InvalidBulletDefinition');
  return d;
}
export function checkedBulletDefinitionEdit(edit) {
  if (
    !edit ||
    !['create', 'update'].includes(edit.mode) ||
    Object.keys(edit).some((k) => !['mode', 'id', 'definition', 'apply'].includes(k)) ||
    (edit.mode === 'create' ? edit.id != null : !u32(edit.id)) ||
    typeof edit.apply !== 'boolean'
  )
    throw Error('InvalidBulletDefinitionRequest');
  checkedBulletDefinition(edit.definition);
  return edit;
}
