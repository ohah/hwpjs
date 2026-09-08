const std = @import("std");
pub fn make(a: std.mem.Allocator, ascii_count: usize, unicode_units: usize, script_count: u8) ![]u8 {
    const b = try a.alloc(u8, 90 + ascii_count + 2 * unicode_units);
    @memset(b, 0);
    b[0..4].* = "desc".*;
    std.mem.writeInt(u32, b[8..12], @intCast(ascii_count), .big);
    if (ascii_count > 0) @memset(b[12 .. 12 + ascii_count - 1], 'a');
    const at = 12 + ascii_count;
    std.mem.writeInt(u32, b[at..][0..4], 0x12345678, .big);
    std.mem.writeInt(u32, b[at + 4 ..][0..4], @intCast(unicode_units), .big);
    if (unicode_units > 1) std.mem.writeInt(u16, b[at + 8 ..][0..2], 0xac00, .big);
    const script = at + 8 + unicode_units * 2;
    std.mem.writeInt(u16, b[script..][0..2], 42, .big);
    b[script + 2] = script_count;
    return b;
}
