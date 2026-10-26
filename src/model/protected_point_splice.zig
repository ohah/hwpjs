//! Shared right-affinity mapping for retained generated-object anchors.
const std = @import("std");
pub fn unit(point: u32, start: u32, deleted: u32, inserted: u32) !u32 {
    const change = try @import("point_splice.zig").Change.init(start, deleted, inserted);
    if (change.end > std.math.maxInt(u32)) return error.LimitExceeded;
    if (change.contains(point)) return error.ProtectedCreatedTableAnchor;
    return std.math.cast(u32, try change.map(point, .right)) orelse error.LimitExceeded;
}
