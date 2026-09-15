const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");
const log = @import("log_color_space.zig");

pub const Ansi = struct { handle: u32, color_space: log.Ansi };
pub const Wide = struct {
    handle: u32,
    color_space: log.Wide,
    flags: u32,
    data: []const u8,
    padding: []const u8,
};
pub const Creation = union(enum) { ansi: Ansi, wide: Wide };

pub fn parse(record: records.Record) !?Creation {
    switch (record.kind) {
        .createcolorspace => {
            const expected = 12 + log.ansi_size;
            if (!record_extent.hasRequiredPrefix(record, expected)) return error.InvalidEmfCreateColorSpaceRecordSize;
            return .{ .ansi = .{
                .handle = std.mem.readInt(u32, record.bytes[8..12], .little),
                .color_space = try log.parseAnsi(record.bytes[12..expected]),
            } };
        },
        .createcolorspacew => {
            const flags_offset = 12 + log.wide_size;
            const prefix = flags_offset + 8;
            if (!record_extent.hasRequiredPrefix(record, prefix))
                return error.InvalidEmfCreateColorSpaceWRecordSize;
            const data_size = std.mem.readInt(u32, record.bytes[flags_offset + 4 ..][0..4], .little);
            const data_end = std.math.add(usize, prefix, data_size) catch return error.InvalidEmfCreateColorSpaceWDataSize;
            const expected = (std.math.add(usize, data_end, 3) catch return error.InvalidEmfCreateColorSpaceWDataSize) & ~@as(usize, 3);
            if (expected > record.bytes.len) return error.InvalidEmfCreateColorSpaceWDataSize;
            return .{ .wide = .{
                .handle = std.mem.readInt(u32, record.bytes[8..12], .little),
                .color_space = try log.parseWide(record.bytes[12..flags_offset]),
                .flags = std.mem.readInt(u32, record.bytes[flags_offset..][0..4], .little),
                .data = record.bytes[prefix..data_end],
                .padding = record.bytes[data_end..expected],
            } };
        },
        else => return null,
    }
}

fn initLog(bytes: []u8) void {
    @memset(bytes, 0);
    std.mem.writeInt(u32, bytes[0..4], log.signature, .little);
    std.mem.writeInt(u32, bytes[4..8], log.version, .little);
    std.mem.writeInt(u32, bytes[8..12], @intCast(bytes.len), .little);
    std.mem.writeInt(u32, bytes[12..16], @intFromEnum(@import("color_space_values.zig").LogicalColorSpace.srgb), .little);
    std.mem.writeInt(u32, bytes[16..20], @intFromEnum(@import("color_space_values.zig").GamutMappingIntent.images), .little);
}

fn initAnsiRecord(bytes: []u8, handle: u32) void {
    @memset(bytes, 0);
    std.mem.writeInt(u32, bytes[0..4], @intFromEnum(records.RecordType.createcolorspace), .little);
    std.mem.writeInt(u32, bytes[4..8], @intCast(bytes.len), .little);
    std.mem.writeInt(u32, bytes[8..12], handle, .little);
    initLog(bytes[12..]);
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "ANSI creation requires one LogColorSpace prefix and ignores trailing data" {
    var bytes: [12 + log.ansi_size + 4]u8 = undefined;
    initAnsiRecord(bytes[0 .. 12 + log.ansi_size], 7);
    bytes[12 + log.ansi_size ..].* = .{ 1, 2, 3, 4 };
    const value = (try parse(fixture(.createcolorspace, &bytes))).?.ansi;
    try std.testing.expectEqual(@as(u32, 7), value.handle);
    try std.testing.expectEqual(log.ansi_size, value.color_space.filename_storage.len + log.core_size);
    try std.testing.expectError(error.InvalidEmfCreateColorSpaceRecordSize, parse(fixture(.createcolorspace, bytes[0 .. 12 + log.ansi_size - 4])));
    var mismatched = fixture(.createcolorspace, &bytes);
    mismatched.size -= 4;
    try std.testing.expectError(error.InvalidEmfCreateColorSpaceRecordSize, parse(mismatched));
}

test "wide creation validates data extent and separates padding from trailing data" {
    var bytes: [12 + log.wide_size + 8 + 8]u8 = undefined;
    @memset(&bytes, 0);
    std.mem.writeInt(u32, bytes[8..12], 9, .little);
    initLog(bytes[12 .. 12 + log.wide_size]);
    std.mem.writeInt(u32, bytes[12 + log.wide_size ..][0..4], 0xffffffff, .little);
    std.mem.writeInt(u32, bytes[12 + log.wide_size + 4 ..][0..4], 1, .little);
    bytes[12 + log.wide_size + 8] = 0xaa;
    bytes[12 + log.wide_size + 11] = 0xcc;
    bytes[12 + log.wide_size + 12 ..].* = .{ 1, 2, 3, 4 };
    const value = (try parse(fixture(.createcolorspacew, &bytes))).?.wide;
    try std.testing.expectEqual(@as(u32, 9), value.handle);
    try std.testing.expectEqual(@as(u32, 0xffffffff), value.flags);
    try std.testing.expectEqualSlices(u8, &.{0xaa}, value.data);
    try std.testing.expectEqualSlices(u8, &.{ 0, 0, 0xcc }, value.padding);

    std.mem.writeInt(u32, bytes[12 + log.wide_size + 4 ..][0..4], 5, .little);
    const wider_data = (try parse(fixture(.createcolorspacew, &bytes))).?.wide;
    try std.testing.expectEqual(@as(usize, 5), wider_data.data.len);
    try std.testing.expectEqual(@as(usize, 3), wider_data.padding.len);

    std.mem.writeInt(u32, bytes[12 + log.wide_size + 4 ..][0..4], 9, .little);
    try std.testing.expectError(error.InvalidEmfCreateColorSpaceWDataSize, parse(fixture(.createcolorspacew, &bytes)));

    var mismatched = fixture(.createcolorspacew, &bytes);
    mismatched.size -= 4;
    try std.testing.expectError(error.InvalidEmfCreateColorSpaceWRecordSize, parse(mismatched));
}

test "color-space creation parser does not claim manipulation records" {
    const bytes = [_]u8{0} ** 12;
    try std.testing.expect((try parse(fixture(.setcolorspace, &bytes))) == null);
}

test "both color-space creation forms reject every truncated prefix" {
    var ansi: [12 + log.ansi_size]u8 = undefined;
    initAnsiRecord(&ansi, 1);
    for (0..ansi.len) |length|
        try std.testing.expectError(error.InvalidEmfCreateColorSpaceRecordSize, parse(fixture(.createcolorspace, ansi[0..length])));

    var wide: [12 + log.wide_size + 8]u8 = undefined;
    @memset(&wide, 0);
    std.mem.writeInt(u32, wide[8..12], 1, .little);
    initLog(wide[12 .. 12 + log.wide_size]);
    for (0..wide.len) |length|
        try std.testing.expectError(error.InvalidEmfCreateColorSpaceWRecordSize, parse(fixture(.createcolorspacew, wide[0..length])));
}

test "creation rejects intermediate object sizes and impossible data extent" {
    var ansi: [12 + log.ansi_size]u8 = undefined;
    initAnsiRecord(&ansi, 1);
    std.mem.writeInt(u32, ansi[20..24], log.core_size + 4, .little);
    try std.testing.expectError(error.InvalidEmfLogColorSpaceDeclaredSize, parse(fixture(.createcolorspace, &ansi)));

    var wide: [12 + log.wide_size + 8]u8 = undefined;
    @memset(&wide, 0);
    initLog(wide[12 .. 12 + log.wide_size]);
    std.mem.writeInt(u32, wide[20..24], log.core_size + 4, .little);
    try std.testing.expectError(error.InvalidEmfLogColorSpaceDeclaredSize, parse(fixture(.createcolorspacew, &wide)));
    std.mem.writeInt(u32, wide[20..24], log.wide_size, .little);
    std.mem.writeInt(u32, wide[12 + log.wide_size + 4 ..][0..4], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.InvalidEmfCreateColorSpaceWDataSize, parse(fixture(.createcolorspacew, &wide)));
}
