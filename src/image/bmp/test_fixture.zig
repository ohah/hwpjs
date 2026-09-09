const std = @import("std");
pub fn put(bytes: []u8, offset: usize, comptime T: type, value: T) void {
    std.mem.writeInt(T, bytes[offset..][0..@sizeOf(T)], value, .little);
}
/// Small independent 2x2 bottom-up BGRX image; unused X bytes vary deliberately.
pub const plain = [_]u8{ 'B', 'M', 70, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 1, 0, 32, 0 } ++ [_]u8{0} ** 24 ++
    .{ 90, 80, 70, 0, 120, 110, 100, 7, 30, 20, 10, 255, 60, 50, 40, 91 };
pub const rgba = [_]u8{ 10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255 };
pub fn indexed() [66]u8 {
    var raw = [_]u8{0} ** 66;
    @memcpy(raw[0..54], plain[0..54]);
    put(&raw, 2, u32, 66);
    put(&raw, 10, u32, 62);
    put(&raw, 18, i32, 1);
    put(&raw, 22, i32, 1);
    put(&raw, 28, u16, 8);
    put(&raw, 46, u32, 2);
    raw[54..62].* = .{ 3, 2, 1, 0, 6, 5, 4, 0 };
    raw[62] = 1;
    return raw;
}
pub fn extended(a: std.mem.Allocator, size: u32) ![]u8 {
    const result = try a.alloc(u8, 14 + size + 16);
    @memset(result, 0);
    @memcpy(result[0..54], plain[0..54]);
    put(result, 2, u32, @intCast(result.len));
    put(result, 10, u32, 14 + size);
    put(result, 14, u32, size);
    @memcpy(result[14 + size ..], plain[54..]);
    return result;
}
