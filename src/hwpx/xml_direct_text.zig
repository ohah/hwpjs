const std = @import("std");
const View = @import("../xml/text_content.zig").View;

/// Appends one direct CharData/CDATA event with a per-value and cumulative
/// owned-byte limit. XML normalization belongs to View.toUtf8 only.
pub fn append(temp_a: std.mem.Allocator, owned_a: std.mem.Allocator, builder: *std.ArrayList(u8), input: View, max_value_bytes: usize, budget: anytype, total_bytes: *usize) !void {
    const remaining = @min(max_value_bytes -| builder.items.len, budget.max -| budget.used);
    const decoded = try input.toUtf8(temp_a, remaining);
    defer temp_a.free(decoded);
    if (decoded.len > remaining) return error.LimitExceeded;
    try budget.note(decoded.len);
    try builder.appendSlice(owned_a, decoded);
    total_bytes.* += decoded.len;
}
