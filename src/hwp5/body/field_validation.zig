const Tree = @import("tree.zig").Tree;
const field = @import("field_start.zig");
pub const Report = struct { controls: usize = 0, command_units: usize = 0, editable_readonly: usize = 0, modified: usize = 0, unknown_bits: usize = 0, extra_bytes: usize = 0 };
/// Common envelope only. Command grammar and global instance ID identity are separate.
pub fn inspect(tree: Tree) !Report {
    return inspectCollected(tree, null);
}
pub fn inspectCollected(tree: Tree, collector: ?@import("../memo_references.zig").Collector) !Report {
    var report: Report = .{};
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        if (!field.supports(h.id)) continue;
        const p = try field.Properties.parse(h.properties);
        if (try @import("memo_field.zig").fromField(h.id, p)) |reference| {
            if (collector) |c| try c.index.addField(c.allocator, reference.index, c.section);
        }
        report.controls += 1;
        report.command_units += p.command.len / 2;
        report.editable_readonly += @intFromBool(p.editableReadOnly());
        report.modified += @intFromBool(p.modified());
        report.unknown_bits += @intFromBool(p.unknownBits() != 0);
        report.extra_bytes += p.extra.len;
    }
    return report;
}
