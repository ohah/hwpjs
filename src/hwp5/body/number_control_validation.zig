const Tree = @import("tree.zig").Tree;
const payload = @import("number_control.zig");
pub const Report = struct { automatic: usize = 0, restarted: usize = 0, reserved_kinds: usize = 0, extra_bytes: usize = 0 };
/// Stored fields only. Does not calculate numbering order or validate display shape semantics.
pub fn inspect(tree: Tree) !Report {
    var report: Report = .{};
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        const v = try payload.parse(h.id, h.properties) orelse continue;
        switch (v) {
            .auto => |p| {
                report.automatic += 1;
                report.extra_bytes += p.extra.len;
                if (p.header.kind() > 5) report.reserved_kinds += 1;
            },
            .restart => |p| {
                report.restarted += 1;
                report.extra_bytes += p.extra.len;
                if (p.header.kind() > 5) report.reserved_kinds += 1;
            },
        }
    }
    return report;
}
