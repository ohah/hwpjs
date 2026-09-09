const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
pub const Version = enum { gif87a, gif89a };
pub const Header = struct {
    version: Version,
    width: u16,
    height: u16,
    flags: u8,
    background: u8,
    aspect: u8,
    global_palette: []const u8,
};
pub fn palette(r: *Reader, flags: u8) ![]const u8 {
    const size = if (flags & 128 != 0) @as(usize, 3) << @as(u4, @intCast((flags & 7) + 1)) else 0;
    return r.take(size);
}
pub fn read(reader: *Reader) !Header {
    var r = reader.*;
    const magic = try r.take(6);
    if (!std.mem.eql(u8, magic[0..3], "GIF")) return error.InvalidGifSignature;
    const version: Version = if (std.mem.eql(u8, magic[3..6], "87a")) .gif87a else if (std.mem.eql(u8, magic[3..6], "89a")) .gif89a else return error.UnsupportedGifVersion;
    const width = try r.readInt(u16);
    const height = try r.readInt(u16);
    const flags = try r.readInt(u8);
    const background = try r.readInt(u8);
    const aspect = try r.readInt(u8);
    if (version == .gif87a and (flags & 8 != 0 or aspect != 0)) return error.InvalidGifVersionFeature;
    const colors = try palette(&r, flags);
    reader.* = r;
    return .{ .version = version, .width = width, .height = height, .flags = flags, .background = background, .aspect = aspect, .global_palette = colors };
}
