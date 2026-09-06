const Tree = @import("tree.zig").Tree;
const rect = @import("shape_rectangle.zig");
const owned = @import("owned_record.zig");
const id = @import("control_rules.zig").id;
pub const Report = struct { rectangles: usize = 0, out_of_range_rounding: usize = 0, extra_bytes: usize = 0 };
pub fn inspect(tree: Tree, layout: rect.Layout) !Report {
    var report: Report = .{};
    for (0..tree.nodes.len) |index| {
        const child = (owned.componentChild(tree, index, id("$rec"), rect.tag) catch |err| return switch (err) {
            error.OrphanChildRecord => error.OrphanRectangle,
            error.MissingChildRecord => error.MissingRectangle,
            error.DuplicateChildRecord => error.DuplicateRectangle,
            else => err,
        }) orelse continue;
        const p = try rect.Rectangle.parse(tree.nodes[child].record.framing.payload, layout);
        report.rectangles += 1;
        report.out_of_range_rounding += @intFromBool(p.round_rate > 100);
        report.extra_bytes += p.extra.len;
    }
    return report;
}
