//! H5W1 bounded payload. JS/WASM memory borrow를 저장하지 않는다.
const std = @import("std");
pub fn encode(a: std.mem.Allocator, epoch: u64, section: u32, window: @import("../hwp5/edit/live_text_window.zig").Window) ![]u8 {
    if (epoch == 0 or window.end_unit < window.start_unit or window.end_unit > window.total_units or window.end_unit - window.start_unit > 4096 or window.bytes.len != @as(usize, window.end_unit - window.start_unit) * 2) return error.InvalidCurrentWindow;
    const bytes = try a.alloc(u8, 48 + window.bytes.len);
    @memcpy(bytes[0..4], "H5W1");
    const words = [_]u32{ 1, @truncate(epoch), @intCast(epoch >> 32), section, window.source_node orelse std.math.maxInt(u32), window.parent_node orelse std.math.maxInt(u32), window.total_units, window.start_unit, window.end_unit, @intFromBool(window.text_present), @intCast(window.bytes.len) };
    for (words, 0..) |v, i| std.mem.writeInt(u32, bytes[4 + i * 4 ..][0..4], v, .little);
    @memcpy(bytes[48..], window.bytes);
    return bytes;
}
