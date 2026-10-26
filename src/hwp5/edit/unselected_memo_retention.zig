//! Unchanged memo sections during isolated text or character-format transactions.
//! Reuse the understood memo envelope, ownership and bound-span checks.
const std = @import("std");
pub fn validate(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version) !bool {
    if (!try @import("memo_source_retention.zig").hasLists(source)) return false;
    const nodes = try @import("memo_body_retention.zig").nodes(a, source, version);
    defer a.free(nodes);
    return true;
}
