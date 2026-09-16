const std = @import("std");
const binary = @import("../../binary/reader.zig");
const values = @import("emf_plus_image_values.zig");

pub const Options = struct { max_data_bytes: usize = 64 * 1024 * 1024 };

pub const Metafile = struct {
    bytes: []const u8,
    data_type: values.MetafileDataType,
    data: []const u8,
    alignment_padding: []const u8,
};

pub fn parse(bytes: []const u8, options: Options) !Metafile {
    if (bytes.len > options.max_data_bytes) return error.LimitExceeded;
    var reader: binary.Reader = .{ .bytes = bytes };
    const data_type = try values.metafileDataType(try reader.readInt(u32));
    const size = try reader.readInt(u32);
    if (size > options.max_data_bytes) return error.LimitExceeded;
    const data = try reader.take(@intCast(size));
    const padding = bytes[reader.offset..];
    if (padding.len > 3) return error.InvalidEmfPlusMetafilePadding;
    return .{ .bytes = bytes, .data_type = data_type, .data = data, .alignment_padding = padding };
}

test "EMF+ metafile preserves all five types exact data and zero through three padding bytes" {
    for (1..6) |kind| for (0..4) |padding| {
        var bytes = [_]u8{0} ** 15;
        std.mem.writeInt(u32, bytes[0..4], @intCast(kind), .little);
        std.mem.writeInt(u32, bytes[4..8], 4, .little);
        bytes[8..12].* = .{ 1, 2, 3, 4 };
        const value = try parse(bytes[0 .. 12 + padding], .{});
        try std.testing.expectEqual(@as(u32, @intCast(kind)), @intFromEnum(value.data_type));
        try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3, 4 }, value.data);
        try std.testing.expectEqual(padding, value.alignment_padding.len);
    };
}

test "EMF+ metafile rejects every truncation bad type declared overflow padding and limit" {
    var bytes = [_]u8{0} ** 12;
    std.mem.writeInt(u32, bytes[0..4], 3, .little);
    std.mem.writeInt(u32, bytes[4..8], 4, .little);
    for (0..bytes.len) |cut| try std.testing.expectError(error.UnexpectedEnd, parse(bytes[0..cut], .{}));
    var invalid = bytes;
    std.mem.writeInt(u32, invalid[0..4], 0, .little);
    try std.testing.expectError(error.InvalidEmfPlusMetafileDataType, parse(&invalid, .{}));
    invalid = bytes;
    std.mem.writeInt(u32, invalid[4..8], 5, .little);
    try std.testing.expectError(error.UnexpectedEnd, parse(&invalid, .{}));
    var padding = [_]u8{0} ** 16;
    @memcpy(padding[0..12], &bytes);
    try std.testing.expectError(error.InvalidEmfPlusMetafilePadding, parse(&padding, .{}));
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, .{ .max_data_bytes = 11 }));
}
