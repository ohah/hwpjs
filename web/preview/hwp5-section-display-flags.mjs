const hideEmptyLines = 0x80000;

// The original section value remains intact. Empty-line support requires the
// current native flow proof; a legacy WASM without that field stays strict.
export function hwp5SectionDisplayFlags(source, content, hasMasterPage = false) {
  const flags = source?.flags;
  if (
    !Number.isInteger(flags) ||
    flags < 0 ||
    flags > 0xffffffff ||
    (!hasMasterPage && (flags & ~hideEmptyLines) !== 0)
  )
    return { supported: false };
  if (!(flags & hideEmptyLines)) return { supported: true, hideFirstEmptyLine: false };
  const flows = content.currentParagraphFlows?.filter(
    (row) => row.section === source.section && row.top_level === true,
  );
  if (
    !flows?.length ||
    content.flowSourceErrors?.some((row) => row.section === source.section) ||
    flows.some((row) => typeof row.empty_line_eligible !== 'boolean')
  )
    return { supported: false };
  return { supported: true, hideFirstEmptyLine: true };
}
