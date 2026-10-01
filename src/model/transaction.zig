//! Synchronous section transaction. The callback may mutate only its draft.
const std = @import("std");
const model = @import("document.zig");

/// Target and all its buffers must belong to `a`. No concurrent mutation is
/// allowed; context must not mutate target or retain pointers into the draft.
/// The callback prepares every dependent value before returning success.
pub fn apply(a: std.mem.Allocator, target: *model.Section, context: anytype, comptime prepare: anytype) !void {
    var draft = try @import("clone.zig").section(a, target.*);
    errdefer draft.deinit(a);
    try prepare(a, &draft, context);
    // No allocations or other fallible operations beyond the commit boundary.
    var previous = target.*;
    target.* = draft;
    previous.deinit(a);
}
