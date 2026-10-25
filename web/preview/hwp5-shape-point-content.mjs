/** Shared current component/local-transform ownership for native point resources. */
export function attachHwp5ShapePoints(editor, content, contract) {
  content[contract.rows] = [];
  content[contract.errors] = [];
  if (!editor) return content;
  const components = content.hwp5DrawingComponents ?? [], layout = "observed_i32_points";
  for (const section of new Set(components.filter(r => r.kind_id === contract.kind).map(r => r.section))) {
    try {
      if ([...(content.hwp5DrawingComponentErrors ?? []), ...(content.hwp5DrawingLocalErrors ?? [])].some(r => r.section === section)) throw new Error(contract.incomplete);
      const expected = components.filter(r => r.section === section && r.kind_id === contract.kind);
      const points = contract.validate(contract.read(editor, section, layout));
      if (points.length !== expected.length || new Set(expected.map(r => r.component_node)).size !== expected.length) throw new Error(contract.inventory);
      for (const row of points) {
        const matches = expected.filter(source => source.component_node === row.component_node);
        const local = (content.hwp5DrawingLocalTransforms ?? []).filter(source => source.section === section && source.component_node === row.component_node);
        if (matches.length !== 1 || local.length !== 1 || local[0].owner_node !== matches[0].owner_node) throw new Error(contract.owner);
      }
      content[contract.rows].push(...points.map(row => ({ ...row, section, layout })));
    } catch (error) { content[contract.errors].push({ section, error: error.message }); }
  }
  return content;
}
