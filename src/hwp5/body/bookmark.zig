const Tree = @import("tree.zig").Tree;
const rules = @import("control_rules.zig");
pub const field_name = @import("../parameters/field_name.zig");
pub const Report = struct {
    controls: usize = 0,
    control_data: usize = 0,
    names: usize = 0,
    name_units: usize = 0,
    missing_names: usize = 0,
    unknown_sets: usize = 0,
    unsupported: usize = 0,
    header_extra_bytes: usize = 0,
};
pub fn isControl(node: @import("tree.zig").Node) bool {
    return node.record.value == .control_header and node.record.value.control_header.id == rules.id("bokm");
}
/// No nearest-ancestor or previous-header fallback for unrelated ControlData.
pub fn owns(tree: Tree, index: usize) bool {
    if (tree.nodes[index].record.framing.tag != 87) return false;
    const parent = tree.nodes[index].parent orelse return false;
    return isControl(tree.nodes[parent]);
}
pub fn consume(report: *Report, doc: @import("../parameters/parser.zig").Document) !void {
    const name = try field_name.fromDocument(doc);
    if (!name.recognized_set) {
        report.unknown_sets += 1;
    } else if (name.field_name_utf16) |bytes| {
        report.names += 1;
        report.name_units += bytes.len / 2;
    } else report.missing_names += 1;
}
