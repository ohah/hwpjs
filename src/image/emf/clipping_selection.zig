const std = @import("std");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");
const region_data = @import("region_data.zig");
const region_mode = @import("region_mode.zig");

pub const Extended = struct {
    mode: region_mode.RegionMode,
    region: ?region_data.RegionData,
    trailing_data: []const u8,
};
pub const Value = union(enum) {
    path: region_mode.RegionMode,
    extended: Extended,
};

pub fn parse(record: records.Record) !?Value {
    return switch (record.kind) {
        .selectclippath => {
            if (!record_extent.hasRequiredPrefix(record, 12)) return error.InvalidEmfSelectClipPathSize;
            return .{ .path = try region_mode.parse(std.mem.readInt(u32, record.bytes[8..12], .little)) };
        },
        .extselectcliprgn => return .{ .extended = try parseExtended(record) },
        else => null,
    };
}

fn parseExtended(record: records.Record) !Extended {
    if (!record_extent.hasRequiredPrefix(record, 16)) return error.InvalidEmfExtSelectClipRegionSize;
    const declared_size = std.mem.readInt(u32, record.bytes[8..12], .little);
    const mode = try region_mode.parse(std.mem.readInt(u32, record.bytes[12..16], .little));
    const expected_end = @as(u64, 16) + declared_size;
    const end = record_extent.requiredEnd(record, expected_end) orelse return error.InvalidEmfExtSelectClipRegionSize;
    if (declared_size == 0) {
        if (mode != .copy) return error.MissingEmfExtSelectClipRegionData;
        return .{ .mode = mode, .region = null, .trailing_data = record.bytes[end..] };
    }
    return .{
        .mode = mode,
        .region = try region_data.parse(record.bytes[16..end]),
        .trailing_data = record.bytes[end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "clip path accepts every RegionMode and extended selection preserves RegionData" {
    var path = [_]u8{0} ** 12;
    for (1..6) |raw| {
        std.mem.writeInt(u32, path[8..12], @intCast(raw), .little);
        try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum((try parse(fixture(.selectclippath, &path))).?.path));
    }

    var extended = [_]u8{0} ** 64;
    std.mem.writeInt(u32, extended[8..12], 48, .little);
    std.mem.writeInt(u32, extended[12..16], @intFromEnum(region_mode.RegionMode.xor_region), .little);
    std.mem.writeInt(u32, extended[16..20], region_data.header_size, .little);
    std.mem.writeInt(u32, extended[20..24], region_data.rectangle_type, .little);
    std.mem.writeInt(u32, extended[24..28], 1, .little);
    std.mem.writeInt(u32, extended[28..32], region_data.rectangle_size, .little);
    std.mem.writeInt(i32, extended[48..52], -1, .little);
    std.mem.writeInt(i32, extended[60..64], 2, .little);
    const value = (try parse(fixture(.extselectcliprgn, &extended))).?.extended;
    try std.testing.expectEqual(region_mode.RegionMode.xor_region, value.mode);
    try std.testing.expectEqual(@as(i32, -1), (try value.region.?.rectangle(0)).left);
    try std.testing.expectEqual(@as(i32, 2), (try value.region.?.rectangle(0)).bottom);
    try std.testing.expectEqual(@as(usize, 0), value.trailing_data.len);
    const extended_with_trailing = extended ++ [_]u8{ 9, 8, 7, 6 };
    const trailing_value = (try parse(fixture(.extselectcliprgn, &extended_with_trailing))).?.extended;
    try std.testing.expectEqual(@as(usize, 48), trailing_value.region.?.raw.len);
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, trailing_value.trailing_data);

    var empty = [_]u8{0} ** 20;
    std.mem.writeInt(u32, empty[12..16], @intFromEnum(region_mode.RegionMode.copy), .little);
    empty[16..20].* = .{ 1, 2, 3, 4 };
    const empty_value = (try parse(fixture(.extselectcliprgn, &empty))).?.extended;
    try std.testing.expect(empty_value.region == null);
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3, 4 }, empty_value.trailing_data);
}

test "clipping selection rejects mode and nested extent drift without claiming fixed records" {
    var path = [_]u8{0} ** 16;
    std.mem.writeInt(u32, path[8..12], 0, .little);
    try std.testing.expectError(error.InvalidEmfRegionMode, parse(fixture(.selectclippath, path[0..12])));
    std.mem.writeInt(u32, path[8..12], @intFromEnum(region_mode.RegionMode.copy), .little);
    try std.testing.expect((try parse(fixture(.selectclippath, &path))) != null);
    var mismatched = fixture(.selectclippath, path[0..12]);
    mismatched.size += 4;
    try std.testing.expectError(error.InvalidEmfSelectClipPathSize, parse(mismatched));

    var empty = [_]u8{0} ** 20;
    std.mem.writeInt(u32, empty[12..16], @intFromEnum(region_mode.RegionMode.and_region), .little);
    try std.testing.expectError(error.MissingEmfExtSelectClipRegionData, parse(fixture(.extselectcliprgn, empty[0..16])));
    std.mem.writeInt(u32, empty[12..16], @intFromEnum(region_mode.RegionMode.copy), .little);
    try std.testing.expect((try parse(fixture(.extselectcliprgn, &empty))) != null);
    std.mem.writeInt(u32, empty[8..12], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.InvalidEmfExtSelectClipRegionSize, parse(fixture(.extselectcliprgn, empty[0..16])));
    try std.testing.expect((try parse(fixture(.offsetcliprgn, &path))) == null);
}
