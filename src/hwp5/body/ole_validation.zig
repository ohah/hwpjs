const Tree = @import("tree.zig").Tree;
const component = @import("shape_component.zig");
const ole = @import("ole.zig");
const owned = @import("owned_record.zig");
const id = @import("control_rules.zig").id;
pub const references = @import("ole_references.zig");
pub const Detailed = struct { ole: Report, references: references.Report };
pub const Report = struct { objects: usize = 0, pending_references: usize = 0, monikers: usize = 0, reserved_aspects: usize = 0, reserved_baselines: usize = 0, reserved_kinds: usize = 0, extra_bytes: usize = 0 };
/// Only the first SHAPE_COMPONENT identity, not its unimplemented geometry schema.
fn isOwner(node: @import("tree.zig").Node) !bool {
    if (node.record.framing.tag != component.tag) return false;
    return try component.identity(node.record.framing.payload) == id("$ole");
}
pub fn inspect(tree: Tree, layout: ole.Layout) !Report {
    return (try inspectDetailed(tree, layout, null, .uninspected)).ole;
}
pub fn inspectDetailed(tree: Tree, layout: ole.Layout, count: ?usize, policy: references.Policy) !Detailed {
    var report: Report = .{};
    var refs: references.Report = .{};
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag == ole.tag) {
            const parent = node.parent orelse return error.OrphanOle;
            if (!try isOwner(tree.nodes[parent])) return error.OrphanOle;
        }
        if (!try isOwner(node)) continue;
        const child = (owned.find(tree, index, ole.tag) catch return error.DuplicateOle) orelse return error.MissingOle;
        const p = try ole.Properties.parse(tree.nodes[child].record.framing.payload, layout);
        report.objects += 1;
        report.pending_references += @intFromBool(!try refs.observe(p.bin_data_id, count, policy));
        report.monikers += @intFromBool(p.hasMoniker());
        const aspect = p.drawingAspect();
        report.reserved_aspects += @intFromBool(aspect != 1 and aspect != 2 and aspect != 4 and aspect != 8);
        report.reserved_baselines += @intFromBool(p.baselineRaw() > 101);
        if (p.objectKind()) |kind| report.reserved_kinds += @intFromBool(kind > 4);
        report.extra_bytes += p.extra.len;
    }
    return .{ .ole = report, .references = refs };
}
