const Tree = @import("tree.zig").Tree;
const payload = @import("page_visibility.zig");
pub const Report = struct { hide: usize = 0, parity: usize = 0, reserved_parity: usize = 0, unknown_hide_bits: usize = 0, extra_bytes: usize = 0 };
pub fn inspect(tree: Tree, layout: payload.HideLayout) !Report {
    var report: Report = .{};
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        const p = try payload.parse(h.id, h.properties, layout) orelse continue;
        switch (p) {
            .hide => |v| {
                report.hide += 1;
                report.extra_bytes += v.extra.len;
                if (v.unknownBits() != 0) report.unknown_hide_bits += 1;
            },
            .parity => |v| {
                report.parity += 1;
                report.extra_bytes += v.extra.len;
                if (v.kind() == 3) report.reserved_parity += 1;
            },
        }
    }
    return report;
}
