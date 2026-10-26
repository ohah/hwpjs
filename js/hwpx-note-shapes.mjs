// 구조와 소유권만 검사합니다. 원값 자료형과 어휘는 native 파서가 소유합니다.
export function decodeNoteShapes(bytes) {
  const report = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const invalid = () => {
    throw new Error('InvalidNoteShapes');
  };
  if (
    !report ||
    ![
      'sections',
      'foot_notes',
      'end_notes',
      'other_attributes',
      'unknown_enums',
      'noncanonical_colors',
      'direct_children',
    ].every((name) => uint(report[name])) ||
    !Array.isArray(report.notes) ||
    !Array.isArray(report.children)
  )
    invalid();
  for (const note of report.notes) {
    if (
      !note ||
      !['foot', 'end'].includes(note.kind) ||
      ![
        'section_ordinal',
        'element_index',
        'parent_element_index',
        'other_attributes',
        'direct_children',
      ].every((name) => uint(note[name])) ||
      note.section_ordinal >= report.sections ||
      !Array.isArray(note.child_counts) ||
      note.child_counts.length !== 5 ||
      !note.child_counts.every(uint)
    )
      invalid();
  }
  for (const child of report.children) {
    if (
      !child ||
      !['auto_num_format', 'note_line', 'note_spacing', 'numbering', 'placement'].includes(
        child.kind,
      ) ||
      ![
        'note_index',
        'element_index',
        'other_attributes',
        'unknown_enums',
        'noncanonical_colors',
        'direct_children',
      ].every((name) => uint(child[name])) ||
      child.note_index >= report.notes.length ||
      !Array.isArray(child.raw) ||
      child.raw.length !== 16 ||
      !child.raw.every((value) => value === null || typeof value === 'string')
    )
      invalid();
  }
  return report;
}
