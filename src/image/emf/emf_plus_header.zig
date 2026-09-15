const std = @import("std");
const record = @import("emf_plus_record.zig");

pub const Header = struct {
    flags: u16,
    dual: bool,
    version_raw: u32,
    graphics_version: u12,
    emf_plus_flags: u32,
    video_display: bool,
    logical_dpi_x: u32,
    logical_dpi_y: u32,
};

pub fn parse(value: record.Record) !Header {
    if (value.kind != .header) return error.ExpectedEmfPlusHeader;
    if (value.size != 28 or value.data_size != 16) return error.InvalidEmfPlusHeaderSize;
    const version = std.mem.readInt(u32, value.data[0..4], .little);
    if (version >> 12 != 0xdbc01) return error.InvalidEmfPlusMetafileSignature;
    const emf_plus_flags = std.mem.readInt(u32, value.data[4..8], .little);
    return .{
        .flags = value.flags,
        .dual = value.flags & 1 != 0,
        .version_raw = version,
        .graphics_version = @truncate(version),
        .emf_plus_flags = emf_plus_flags,
        .video_display = emf_plus_flags & 1 != 0,
        .logical_dpi_x = std.mem.readInt(u32, value.data[8..12], .little),
        .logical_dpi_y = std.mem.readInt(u32, value.data[12..16], .little),
    };
}

test "EMF+ header parses raw and interpreted fields" {
    var bytes = [_]u8{0} ** 28;
    std.mem.writeInt(u16, bytes[0..2], 0x4001, .little);
    std.mem.writeInt(u16, bytes[2..4], 0xfffd, .little);
    std.mem.writeInt(u32, bytes[4..8], 28, .little);
    std.mem.writeInt(u32, bytes[8..12], 16, .little);
    std.mem.writeInt(u32, bytes[12..16], 0xdbc01abc, .little);
    std.mem.writeInt(u32, bytes[16..20], 0xfffffffd, .little);
    std.mem.writeInt(u32, bytes[20..24], 96, .little);
    std.mem.writeInt(u32, bytes[24..28], 120, .little);
    var iterator: record.Iterator = .{ .bytes = &bytes };
    const value = try parse((try iterator.next()).?);
    try std.testing.expect(value.dual);
    try std.testing.expect(value.video_display);
    try std.testing.expectEqual(@as(u12, 0xabc), value.graphics_version);
    try std.testing.expectEqual(@as(u32, 96), value.logical_dpi_x);
    try std.testing.expectEqual(@as(u32, 120), value.logical_dpi_y);

    var invalid_signature = bytes;
    std.mem.writeInt(u32, invalid_signature[12..16], 0xdbc00001, .little);
    var invalid_iterator: record.Iterator = .{ .bytes = &invalid_signature };
    try std.testing.expectError(error.InvalidEmfPlusMetafileSignature, parse((try invalid_iterator.next()).?));

    var wrong_size = bytes;
    std.mem.writeInt(u32, wrong_size[4..8], 24, .little);
    std.mem.writeInt(u32, wrong_size[8..12], 12, .little);
    var wrong_size_iterator: record.Iterator = .{ .bytes = wrong_size[0..24] };
    try std.testing.expectError(error.InvalidEmfPlusHeaderSize, parse((try wrong_size_iterator.next()).?));
}
