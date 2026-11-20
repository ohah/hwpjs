//! Official revision1.3 table69 common object payload; no shape-specific data.
const std = @import("std");
pub const Common = struct {
    flags: u32,
    offset_y: i32,
    offset_x: i32,
    z_order: i32,
    margins: [4]i16,
    prevent_page_break: bool,
    description: []const u8,
};

/// Side-effect-free shared preflight. Legacy table callers use this before
/// evaluating plan.height(), preserving description/limit error precedence.
pub fn descriptionUnits(description: []const u8, limit: usize) !usize {
    if (!std.unicode.utf8ValidateSlice(description)) return error.InvalidObjectDescription;
    const count = std.unicode.calcUtf16LeLen(description) catch return error.InvalidObjectDescription;
    if (count > 65535 or 46 + count * 2 > limit) return error.LimitExceeded;
    return count;
}

pub fn write(a: std.mem.Allocator, control_id: u32, width: u32, height: u32, instance_id: u32, common: Common, limit: usize) ![]u8 {
    const count = try descriptionUnits(common.description, limit);
    const length = 46 + count * 2;
    const description = try std.unicode.utf8ToUtf16LeAlloc(a, common.description);
    defer a.free(description);
    const bytes = try a.alloc(u8, length);
    var offset: usize = 0;
    put(u32, bytes, &offset, control_id);
    put(u32, bytes, &offset, common.flags);
    put(i32, bytes, &offset, common.offset_y);
    put(i32, bytes, &offset, common.offset_x);
    put(u32, bytes, &offset, width);
    put(u32, bytes, &offset, height);
    put(i32, bytes, &offset, common.z_order);
    for (common.margins) |margin| put(i16, bytes, &offset, margin);
    put(u32, bytes, &offset, instance_id);
    put(i32, bytes, &offset, @intFromBool(common.prevent_page_break));
    put(u16, bytes, &offset, @intCast(count));
    @memcpy(bytes[offset..], std.mem.sliceAsBytes(description));
    return bytes;
}
fn put(comptime T: type, bytes: []u8, offset: *usize, value: T) void {
    std.mem.writeInt(T, bytes[offset.*..][0..@sizeOf(T)], value, .little);
    offset.* += @sizeOf(T);
}
