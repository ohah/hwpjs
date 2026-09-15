const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");
const universal_font_id = @import("universal_font_id.zig");

pub const required_size = 16;

pub const ForceUfiMapping = struct {
    ufi: universal_font_id.UniversalFontId,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?ForceUfiMapping {
    if (record.kind != .forceufimapping) return null;
    const end = record_extent.requiredEnd(record, required_size) orelse
        return error.InvalidEmfForceUfiMappingRecordSize;
    return .{
        .ufi = try universal_font_id.parse(record.bytes[8..end]),
        .trailing_data = record.bytes[end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "FORCEUFIMAPPING preserves the single UFI and trailing extension" {
    var bytes = [_]u8{0} ** 20;
    std.mem.writeInt(u32, bytes[8..12], 0x01234567, .little);
    std.mem.writeInt(u32, bytes[12..16], 0x89abcdef, .little);
    bytes[16..20].* = .{ 1, 2, 3, 4 };
    const value = (try parse(fixture(.forceufimapping, &bytes))).?;
    try std.testing.expectEqual(@as(u32, 0x01234567), value.ufi.checksum);
    try std.testing.expectEqual(@as(u32, 0x89abcdef), value.ufi.index);
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3, 4 }, value.trailing_data);
}

test "FORCEUFIMAPPING validates every prefix cut declaration and identity" {
    var bytes = [_]u8{0} ** 16;
    std.mem.writeInt(u32, bytes[8..12], std.math.maxInt(u32), .little);
    std.mem.writeInt(u32, bytes[12..16], 1, .little);
    for (0..16) |cut|
        try std.testing.expectError(error.InvalidEmfForceUfiMappingRecordSize, parse(fixture(.forceufimapping, bytes[0..cut])));

    var declared = fixture(.forceufimapping, &bytes);
    declared.size = 12;
    try std.testing.expectError(error.InvalidEmfForceUfiMappingRecordSize, parse(declared));
    var declared_long = fixture(.forceufimapping, &bytes);
    declared_long.size = 20;
    try std.testing.expectError(error.InvalidEmfForceUfiMappingRecordSize, parse(declared_long));
    try std.testing.expect((try parse(fixture(.setlinkedufis, bytes[0..8]))) == null);
}
