const std = @import("std");
pub fn payload(a: std.mem.Allocator, compressed: bool, language: []const u8, translated: []const u8, body: []const u8) ![]u8 {
    const offset = 6 + language.len + translated.len;
    const out = try a.alloc(u8, offset + body.len + @as(usize, if (compressed) 11 else 0));
    out[0..4].* = .{ 'K', 0, @intFromBool(compressed), 0 };
    @memcpy(out[4..][0..language.len], language);
    out[4 + language.len] = 0;
    @memcpy(out[5 + language.len ..][0..translated.len], translated);
    out[offset - 1] = 0;
    const dst = out[offset..];
    if (compressed) {
        dst[0..3].* = .{ 0x78, 1, 1 };
        const len: u16 = @intCast(body.len);
        std.mem.writeInt(u16, dst[3..5], len, .little);
        std.mem.writeInt(u16, dst[5..7], ~len, .little);
        @memcpy(dst[7..][0..body.len], body);
        std.mem.writeInt(u32, dst[7 + body.len ..][0..4], std.hash.Adler32.hash(body), .big);
    } else @memcpy(dst, body);
    return out;
}
