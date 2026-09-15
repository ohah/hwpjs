const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");
const pixel_format = @import("pixel_format.zig");

pub const required_size = 8 + pixel_format.byte_size;

pub const PixelFormatRecord = struct {
    descriptor: pixel_format.Descriptor,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?PixelFormatRecord {
    if (record.kind != .pixelformat) return null;
    const end = record_extent.requiredEnd(record, required_size) orelse
        return error.InvalidEmfPixelFormatRecordSize;
    return .{
        .descriptor = try pixel_format.parse(record.bytes[8..end]),
        .trailing_data = record.bytes[end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "PIXELFORMAT reuses the complete descriptor and preserves trailing extension" {
    var bytes = [_]u8{0} ** 52;
    std.mem.writeInt(u16, bytes[8..10], 40, .little);
    std.mem.writeInt(u16, bytes[10..12], 1, .little);
    bytes[16] = 1;
    bytes[17] = 24;
    bytes[18] = 8;
    bytes[19] = 16;
    std.mem.writeInt(u32, bytes[36..40], 0x11223344, .little);
    std.mem.writeInt(u32, bytes[40..44], 0x55667788, .little);
    std.mem.writeInt(u32, bytes[44..48], 0x99aabbcc, .little);
    bytes[48..52].* = .{ 1, 2, 3, 4 };

    const value = (try parse(fixture(.pixelformat, &bytes))).?;
    try std.testing.expectEqual(pixel_format.PixelType.color_index, value.descriptor.pixel_type);
    try std.testing.expectEqual(@as(u8, 24), value.descriptor.color_bits);
    try std.testing.expectEqual(@as(u8, 8), value.descriptor.red_bits);
    try std.testing.expectEqual(@as(u8, 16), value.descriptor.red_shift);
    try std.testing.expectEqual(@as(u32, 0x11223344), value.descriptor.layer_mask);
    try std.testing.expectEqual(@as(u32, 0x55667788), value.descriptor.visible_mask);
    try std.testing.expectEqual(@as(u32, 0x99aabbcc), value.descriptor.damage_mask);
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3, 4 }, value.trailing_data);
}

test "PIXELFORMAT validates every prefix cut declaration descriptor and identity" {
    var bytes = [_]u8{0} ** 48;
    std.mem.writeInt(u16, bytes[8..10], 40, .little);
    std.mem.writeInt(u16, bytes[10..12], 1, .little);
    for (0..48) |cut|
        try std.testing.expectError(error.InvalidEmfPixelFormatRecordSize, parse(fixture(.pixelformat, bytes[0..cut])));

    var declared = fixture(.pixelformat, &bytes);
    declared.size = 44;
    try std.testing.expectError(error.InvalidEmfPixelFormatRecordSize, parse(declared));
    declared.size = 52;
    try std.testing.expectError(error.InvalidEmfPixelFormatRecordSize, parse(declared));

    var bad_descriptor_size = bytes;
    std.mem.writeInt(u16, bad_descriptor_size[8..10], 39, .little);
    try std.testing.expectError(error.InvalidEmfPixelFormatDescriptorSize, parse(fixture(.pixelformat, &bad_descriptor_size)));
    var bad_version = bytes;
    std.mem.writeInt(u16, bad_version[10..12], 2, .little);
    try std.testing.expectError(error.InvalidEmfPixelFormatVersion, parse(fixture(.pixelformat, &bad_version)));
    try std.testing.expect((try parse(fixture(.forceufimapping, bytes[0..16]))) == null);
}
