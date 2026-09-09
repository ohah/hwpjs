const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
pub const Kind = enum(u32) { core = 12, info = 40, v4 = 108, v5 = 124 };
pub const Compression = enum(u32) { rgb = 0, rle8 = 1, rle4 = 2, bitfields = 3, jpeg = 4, png = 5 };
pub const Options = struct { max_pixels: u64 = 100000000 };
pub const Colour = struct {
    masks: [4]u32,
    space: u32,
    /// Signed 2.30 raw CIE XYZ triples, not converted to floating point.
    endpoints: [9]i32,
    /// Unsigned 16.16 raw gamma values.
    gamma: [3]u32,
};
pub const Profile = struct { intent: u32, offset: u32, size: u32 };
pub const Info = struct { image_bytes: u32, x_resolution: i32, y_resolution: i32, colours_used: u32, important_colours: u32 };
pub const Header = struct {
    kind: Kind,
    width: u32,
    height: u32,
    top_down: bool,
    bit_count: u16,
    compression: Compression,
    info: ?Info,
    colour: ?Colour,
    profile: ?Profile,
    /// Exact DIB header bytes borrowed from input. File header is separate.
    raw: []const u8,

    pub fn uncompressed(self: Header) bool {
        return self.compression == .rgb or self.compression == .bitfields;
    }
    pub fn paletteCount(self: Header) u32 {
        const declared = if (self.info) |v| v.colours_used else 0;
        return if (declared == 0 and self.bit_count > 0 and self.bit_count <= 8) @as(u32, 1) << @intCast(self.bit_count) else declared;
    }
};

pub fn parse(bytes: []const u8, options: Options) !Header {
    var r: Reader = .{ .bytes = bytes };
    const size = try r.readInt(u32);
    const kind = std.enums.fromInt(Kind, size) orelse return error.UnsupportedBmpHeader;
    r = .{ .bytes = bytes };
    const raw = try r.take(size);
    r = .{ .bytes = raw, .offset = 4 };
    var result: Header = .{ .kind = kind, .width = 0, .height = 0, .top_down = false, .bit_count = 0, .compression = .rgb, .info = null, .colour = null, .profile = null, .raw = raw };
    if (kind == .core) {
        result.width = try r.readInt(u16);
        result.height = try r.readInt(u16);
    } else {
        const width = try r.readInt(i32);
        const height = try r.readInt(i32);
        if (width <= 0 or height == 0) return error.InvalidBmpDimensions;
        result.width = @intCast(width);
        result.height = @intCast(if (height < 0) -@as(i64, height) else @as(i64, height));
        result.top_down = height < 0;
    }
    if (result.width == 0 or result.height == 0) return error.InvalidBmpDimensions;
    if (@as(u64, result.width) * result.height > options.max_pixels) return error.LimitExceeded;
    if (try r.readInt(u16) != 1) return error.InvalidBmpPlanes;
    result.bit_count = try r.readInt(u16);
    if (kind == .core) {
        switch (result.bit_count) {
            1, 4, 8, 24 => {},
            else => return error.InvalidBmpBitCount,
        }
        return result;
    }
    result.compression = std.enums.fromInt(Compression, try r.readInt(u32)) orelse return error.UnsupportedBmpCompression;
    const valid = switch (result.compression) {
        .rgb => switch (result.bit_count) {
            1, 4, 8, 16, 24, 32 => true,
            else => false,
        },
        .rle8 => result.bit_count == 8,
        .rle4 => result.bit_count == 4,
        .bitfields => result.bit_count == 16 or result.bit_count == 32,
        .jpeg, .png => result.bit_count == 0,
    };
    if (!valid) return error.InvalidBmpBitCount;
    if (result.top_down and !result.uncompressed()) return error.InvalidBmpOrientation;
    result.info = .{ .image_bytes = try r.readInt(u32), .x_resolution = try r.readInt(i32), .y_resolution = try r.readInt(i32), .colours_used = try r.readInt(u32), .important_colours = try r.readInt(u32) };
    if (result.bit_count > 0 and result.bit_count <= 8 and result.paletteCount() > @as(u32, 1) << @intCast(result.bit_count)) return error.InvalidBmpPaletteCount;
    if (kind == .v4 or kind == .v5) {
        var colour: Colour = undefined;
        for (&colour.masks) |*value| value.* = try r.readInt(u32);
        colour.space = try r.readInt(u32);
        for (&colour.endpoints) |*value| value.* = try r.readInt(i32);
        for (&colour.gamma) |*value| value.* = try r.readInt(u32);
        result.colour = colour;
    }
    if (kind == .v5) {
        result.profile = .{ .intent = try r.readInt(u32), .offset = try r.readInt(u32), .size = try r.readInt(u32) };
        if (try r.readInt(u32) != 0) return error.InvalidBmpReserved;
    }
    return result;
}
