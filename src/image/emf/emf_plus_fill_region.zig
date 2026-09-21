const std = @import("std");
const brush_id = @import("emf_plus_brush_id.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");

pub const FillRegion = struct {
    flags: u16,
    region_id: u6,
    brush: brush_id.BrushIdOrColor,
};

pub fn parse(value: record.Record) !FillRegion {
    if (value.kind != .fill_region) return error.NotEmfPlusFillRegion;
    if (value.size != 16 or value.data_size != 4 or value.data.len != 4)
        return error.InvalidEmfPlusFillRegionSize;

    const raw_brush = std.mem.readInt(u32, value.data[0..4], .little);
    return .{
        .flags = value.flags,
        .region_id = try record_flags.objectId(value.flags),
        .brush = try brush_id.parse(raw_brush, value.flags),
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .fill_region,
        .flags = flags,
        .size = @intCast(record.header_size + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ FillRegion parses Region and both Brush forms while preserving ignored flags" {
    var data = [_]u8{0} ** 4;
    std.mem.writeInt(u32, &data, 63, .little);
    const object = try parse(makeRecord(&data, 0x7f3f));
    try std.testing.expectEqual(@as(u16, 0x7f3f), object.flags);
    try std.testing.expectEqual(@as(u6, 63), object.region_id);
    try std.testing.expectEqual(@as(u6, 63), object.brush.brush_id);

    std.mem.writeInt(u32, &data, 0x44332211, .little);
    const literal = try parse(makeRecord(&data, 0xff00));
    try std.testing.expectEqual(@as(u16, 0xff00), literal.flags);
    try std.testing.expectEqual(@as(u6, 0), literal.region_id);
    try std.testing.expectEqual(@as(u32, 0x44332211), literal.brush.color.raw());
}

test "EMF+ FillRegion rejects type IDs and every independent size mismatch" {
    var data = [_]u8{0} ** 5;
    _ = try parse(makeRecord(data[0..4], 0x8000));
    for (0..data.len + 1) |cut| {
        if (cut != 4)
            try std.testing.expectError(error.InvalidEmfPlusFillRegionSize, parse(makeRecord(data[0..cut], 0x8000)));
    }

    std.mem.writeInt(u32, data[0..4], 64, .little);
    try std.testing.expectError(error.InvalidEmfPlusBrushId, parse(makeRecord(data[0..4], 0)));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(data[0..4], 0x8040)));
    var wrong_type = makeRecord(data[0..4], 0x8000);
    wrong_type.kind = .fill_path;
    try std.testing.expectError(error.NotEmfPlusFillRegion, parse(wrong_type));
    var wrong_size = makeRecord(data[0..4], 0x8000);
    wrong_size.size = 20;
    try std.testing.expectError(error.InvalidEmfPlusFillRegionSize, parse(wrong_size));
    var wrong_data_size = makeRecord(data[0..4], 0x8000);
    wrong_data_size.data_size = 8;
    try std.testing.expectError(error.InvalidEmfPlusFillRegionSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(data[0..5], 0x8000);
    wrong_slice.size = 16;
    wrong_slice.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusFillRegionSize, parse(wrong_slice));
}
