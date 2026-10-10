export function validateHwp5DrawingComponentSources(rows) {
  const fail = () => { throw new Error("InvalidHwp5DrawingComponentSources"); };
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (!Array.isArray(rows)) fail();
  const components = new Map(), controls = new Set();
  let previous = -1;
  for (const row of rows) {
    if (!row || !["component_node", "owner_node", "kind_id", "original_width", "original_height", "current_width", "current_height", "attributes", "extra_bytes"].every(key => integer(row[key], 0, 0xffffffff))
      || !["offset_x", "offset_y", "rotation_x", "rotation_y"].every(key => integer(row[key], -2147483648, 2147483647))
      || !["group_count", "local_version", "matrix_pairs"].every(key => integer(row[key], 0, 65535))
      || !integer(row.rotation_angle, -32768, 32767)
      || row.second_id !== null && !integer(row.second_id, 0, 0xffffffff)
      || row.owner_node >= row.component_node || row.component_node <= previous) fail();
    if (row.second_id === null) {
      // $con의 직접 자식만 single_id 배치를 사용할 수 있습니다.
      if (components.get(row.owner_node)?.kind_id !== 0x24636f6e) fail();
    } else {
      if (components.has(row.owner_node) || controls.has(row.owner_node)) fail();
      controls.add(row.owner_node);
    }
    components.set(row.component_node, row);
    previous = row.component_node;
  }
  return rows;
}
export function decodeHwp5DrawingComponentSources(bytes) {
  return validateHwp5DrawingComponentSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
