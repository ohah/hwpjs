//! Actual native resource IDs usable by the new-table wire field widths.
const std = @import("std");
fn sequence(a: std.mem.Allocator, first: u32, count: usize) ![]u32 {
    const ids = try a.alloc(u32, count);
    for (ids, 0..) |*id, index| id.* = first + (std.math.cast(u32, index) orelse return error.LimitExceeded);
    return ids;
}
pub fn write(a: std.mem.Allocator, resources: @import("../hwp5/edit/created_table_records.zig").Resources) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const paragraph = try sequence(scratch, 0, @min(resources.paragraphs.para_shapes, 65536));
    const character = try sequence(scratch, 0, resources.paragraphs.char_shapes);
    const style = try sequence(scratch, 0, @min(resources.paragraphs.styles, 256));
    // Zero explicitly selects no border; nonzero references are one-based.
    const border_fill = try sequence(scratch, 0, @as(usize, @min(resources.border_count, 65535)) + 1);
    return std.json.Stringify.valueAlloc(a, .{ .paragraph = paragraph, .character = character, .style = style, .border_fill = border_fill }, .{});
}
