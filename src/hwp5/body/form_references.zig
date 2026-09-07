const std = @import("std");
const schema = @import("form_schema.zig");
const Tree = @import("form_property_tree.zig").Tree;
const refs = @import("../docinfo/reference_rules.zig");
pub const Resolution = refs.Resolution;
/// Explicit stored-ID, zero-based interpretation. This does not decide whether
/// FollowContext activates this reference, and does not invent inherited sentinels.
pub fn storedCharShapeObserved(tree: Tree, report: schema.Report, char_shape_count: usize) !Resolution {
    const p = report.get(tree, .char_shape_id) orelse return .absent;
    var id: u32 = 0;
    for (0..p.value.len / 2) |i| {
        const c = std.mem.readInt(u16, p.value[i * 2 ..][0..2], .little);
        if (c < '0' or c > '9') return error.InvalidFormCharShapeId;
        id = std.math.mul(u32, id, 10) catch return error.FormCharShapeIdOverflow;
        id = std.math.add(u32, id, c - '0') catch return error.FormCharShapeIdOverflow;
    }
    return refs.resolve(.zero_based, id, char_shape_count);
}
