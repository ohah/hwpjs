const std = @import("std");
const f = @import("test_fixture.zig");
pub const example4 = [_]u8{ 3, 4, 5, 6, 0, 6, 0x45, 0x56, 0x67, 0, 4, 0x78, 0, 2, 5, 1, 4, 0x78, 0, 0, 9, 0x1e, 0, 1 };
pub const example8 = [_]u8{ 3, 4, 5, 6, 0, 3, 0x45, 0x56, 0x67, 0, 2, 0x78, 0, 2, 5, 1, 2, 0x78, 0, 0, 9, 0x1e, 0, 1 };
pub fn bitmap(a: std.mem.Allocator, commands: []const u8, bits: u16, width: u32, height: u32) ![]u8 {
    const colours: usize = if (bits == 4) 16 else 256;
    const offset = 54 + 4 * colours;
    const out = try a.alloc(u8, offset + commands.len);
    @memset(out, 0);
    @memcpy(out[0..54], f.plain[0..54]);
    f.put(out, 2, u32, @intCast(out.len));
    f.put(out, 10, u32, @intCast(offset));
    f.put(out, 18, u32, width);
    f.put(out, 22, u32, height);
    f.put(out, 28, u16, bits);
    f.put(out, 30, u32, if (bits == 4) 2 else 1);
    f.put(out, 34, u32, @intCast(commands.len));
    @memcpy(out[offset..], commands);
    return out;
}
