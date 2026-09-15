const std = @import("std");
const geometry = @import("geometry.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");
const region_data = @import("region_data.zig");

pub const Region = struct {
    bounds: geometry.RectL,
    declared_size: u32,
    data: region_data.RegionData,
    trailing_data: []const u8,
};
pub const Fill = struct { region: Region, brush_handle: u32 };
pub const Frame = struct {
    region: Region,
    brush_handle: u32,
    width: i32,
    height: i32,
};
pub const Value = union(enum) {
    fill: Fill,
    frame: Frame,
    invert: Region,
    paint: Region,
};

pub fn parse(record: records.Record) !?Value {
    return switch (record.kind) {
        .fillrgn => return .{ .fill = .{
            .region = try parseRegion(record, 32),
            .brush_handle = std.mem.readInt(u32, record.bytes[28..32], .little),
        } },
        .framergn => return .{ .frame = .{
            .region = try parseRegion(record, 40),
            .brush_handle = std.mem.readInt(u32, record.bytes[28..32], .little),
            .width = std.mem.readInt(i32, record.bytes[32..36], .little),
            .height = std.mem.readInt(i32, record.bytes[36..40], .little),
        } },
        .invertrgn => return .{ .invert = try parseRegion(record, 28) },
        .paintrgn => return .{ .paint = try parseRegion(record, 28) },
        else => null,
    };
}

fn parseRegion(record: records.Record, fixed_end: u32) !Region {
    if (!record_extent.hasRequiredPrefix(record, fixed_end)) return error.InvalidEmfRegionDrawingRecordSize;
    const declared_size = std.mem.readInt(u32, record.bytes[24..28], .little);
    const semantic_end = record_extent.requiredEnd(record, @as(u64, fixed_end) + declared_size) orelse
        return error.InvalidEmfRegionDrawingRecordSize;
    return .{
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .declared_size = declared_size,
        .data = try region_data.parse(record.bytes[fixed_end..semantic_end]),
        .trailing_data = record.bytes[semantic_end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn initRegion(bytes: []u8, fixed_end: usize) void {
    std.debug.assert(bytes.len >= fixed_end + 48);
    std.mem.writeInt(u32, bytes[24..28], 48, .little);
    std.mem.writeInt(u32, bytes[fixed_end..][0..4], region_data.header_size, .little);
    std.mem.writeInt(u32, bytes[fixed_end + 4 ..][0..4], region_data.rectangle_type, .little);
    std.mem.writeInt(u32, bytes[fixed_end + 8 ..][0..4], 1, .little);
    std.mem.writeInt(u32, bytes[fixed_end + 12 ..][0..4], region_data.rectangle_size, .little);
}

test "region drawing records preserve distinct operations fields and declared RegionData" {
    var bytes = [_]u8{0} ** 92;
    for ([_]i32{ -4, -3, 2, 1 }, 0..) |field, index|
        std.mem.writeInt(i32, bytes[8 + index * 4 ..][0..4], field, .little);

    initRegion(&bytes, 40);
    std.mem.writeInt(u32, bytes[28..32], 7, .little);
    std.mem.writeInt(i32, bytes[32..36], std.math.minInt(i32), .little);
    std.mem.writeInt(i32, bytes[36..40], std.math.maxInt(i32), .little);
    std.mem.writeInt(i32, bytes[72..76], -10, .little);
    std.mem.writeInt(i32, bytes[84..88], 20, .little);
    bytes[88..92].* = .{ 9, 8, 7, 6 };
    const frame = (try parse(fixture(.framergn, &bytes))).?.frame;
    try std.testing.expectEqual(@as(u32, 7), frame.brush_handle);
    try std.testing.expectEqual(std.math.minInt(i32), frame.width);
    try std.testing.expectEqual(std.math.maxInt(i32), frame.height);
    try std.testing.expectEqual(@as(i32, -4), frame.region.bounds.left);
    try std.testing.expectEqual(@as(i32, -10), (try frame.region.data.rectangle(0)).left);
    try std.testing.expectEqual(@as(i32, 20), (try frame.region.data.rectangle(0)).bottom);
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, frame.region.trailing_data);

    inline for (.{
        .{ records.RecordType.fillrgn, @as(usize, 32), @as(std.meta.Tag(Value), .fill) },
        .{ records.RecordType.invertrgn, @as(usize, 28), @as(std.meta.Tag(Value), .invert) },
        .{ records.RecordType.paintrgn, @as(usize, 28), @as(std.meta.Tag(Value), .paint) },
    }) |case| {
        var record_bytes = [_]u8{0} ** 84;
        initRegion(&record_bytes, case[1]);
        if (case[0] == .fillrgn) std.mem.writeInt(u32, record_bytes[28..32], 11, .little);
        const value = (try parse(fixture(case[0], record_bytes[0 .. case[1] + 48 + 4]))).?;
        try std.testing.expectEqual(case[2], std.meta.activeTag(value));
        const region = switch (value) {
            .fill => |v| v.region,
            .invert => |v| v,
            .paint => |v| v,
            else => unreachable,
        };
        try std.testing.expectEqual(@as(u32, 48), region.declared_size);
        try std.testing.expectEqual(@as(usize, 4), region.trailing_data.len);
        if (value == .fill) try std.testing.expectEqual(@as(u32, 11), value.fill.brush_handle);
    }
}

test "region drawing records validate every prefix nested extent and unrelated type" {
    const bytes = [_]u8{0} ** 92;
    inline for (.{
        .{ records.RecordType.fillrgn, @as(usize, 32) },
        .{ records.RecordType.framergn, @as(usize, 40) },
        .{ records.RecordType.invertrgn, @as(usize, 28) },
        .{ records.RecordType.paintrgn, @as(usize, 28) },
    }) |case| for (0..case[1]) |length|
        try std.testing.expectError(error.InvalidEmfRegionDrawingRecordSize, parse(fixture(case[0], bytes[0..length])));

    var invalid = bytes;
    initRegion(&invalid, 32);
    var mismatched = fixture(.fillrgn, invalid[0..80]);
    mismatched.size += 4;
    try std.testing.expectError(error.InvalidEmfRegionDrawingRecordSize, parse(mismatched));
    std.mem.writeInt(u32, invalid[24..28], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.InvalidEmfRegionDrawingRecordSize, parse(fixture(.fillrgn, invalid[0..80])));
    std.mem.writeInt(u32, invalid[24..28], 48, .little);
    std.mem.writeInt(u32, invalid[32..36], 28, .little);
    try std.testing.expectError(error.InvalidEmfRegionDataHeaderSize, parse(fixture(.fillrgn, invalid[0..80])));
    try std.testing.expect((try parse(fixture(.extselectcliprgn, bytes[0..16]))) == null);
}
