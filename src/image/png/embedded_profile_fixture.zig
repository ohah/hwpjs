const std = @import("std");
/// Structurally bounded header with zero tags, not a semantically valid profile.
pub fn emptyProfile(space: [4]u8) [132]u8 {
    var bytes = [_]u8{0} ** 132;
    std.mem.writeInt(u32, bytes[0..4], bytes.len, .big);
    bytes[8] = 4;
    bytes[16..20].* = space;
    bytes[36..40].* = "acsp".*;
    return bytes;
}
/// Independent stored-block fixture; deliberately allows arbitrary non-ICC bytes.
pub fn payload(a: std.mem.Allocator, name: []const u8, bytes: []const u8) ![]u8 {
    if (bytes.len > 65535) return error.FixtureTooLarge;
    const out = try a.alloc(u8, name.len + 13 + bytes.len);
    @memcpy(out[0..name.len], name);
    out[name.len] = 0;
    out[name.len + 1] = 0;
    const at = name.len + 2;
    out[at..][0..3].* = .{ 0x78, 1, 1 };
    const len: u16 = @intCast(bytes.len);
    std.mem.writeInt(u16, out[at + 3 ..][0..2], len, .little);
    std.mem.writeInt(u16, out[at + 5 ..][0..2], ~len, .little);
    @memcpy(out[at + 7 ..][0..bytes.len], bytes);
    std.mem.writeInt(u32, out[at + 7 + bytes.len ..][0..4], std.hash.Adler32.hash(bytes), .big);
    return out;
}
