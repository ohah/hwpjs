const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const thumbnail = @import("thumbnail.zig");

/// All views borrow immutable input. Unknown codes must be skippable under
/// T.871 6.4; known compressed data requires separate JPEG validation.
pub const Extension = union(enum) {
    jpeg_unchecked: []const u8,
    indexed: thumbnail.Indexed,
    rgb: thumbnail.Rgb,
    unknown: struct { code: u8, bytes: []const u8 },

    pub fn parse(bytes: []const u8) !Extension {
        if (bytes.len > 65533) return error.LimitExceeded;
        var reader: Reader = .{ .bytes = bytes };
        if (!std.mem.eql(u8, try reader.take(5), "JFXX\x00")) return error.InvalidJfxxIdentifier;
        const code = try reader.readInt(u8);
        const result: Extension = switch (code) {
            0x10 => return .{ .jpeg_unchecked = bytes[reader.offset..] },
            0x11 => .{ .indexed = try thumbnail.Indexed.read(&reader) },
            0x13 => .{ .rgb = try thumbnail.Rgb.read(&reader, true) },
            else => return .{ .unknown = .{ .code = code, .bytes = bytes[reader.offset..] } },
        };
        if (reader.offset != bytes.len) return error.TrailingJfxxBytes;
        return result;
    }
};
