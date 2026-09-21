const std = @import("std");
const brush_id = @import("emf_plus_brush_id.zig");
const fill_object = @import("emf_plus_fill_object.zig");
const record = @import("emf_plus_record.zig");

pub const FillPath = struct {
    flags: u16,
    path_id: u6,
    brush: brush_id.BrushIdOrColor,
};

pub fn parse(value: record.Record) !FillPath {
    if (value.kind != .fill_path) return error.NotEmfPlusFillPath;
    const fields = fill_object.parse(value) catch |err| switch (err) {
        error.InvalidEmfPlusFillObjectSize => return error.InvalidEmfPlusFillPathSize,
        else => return err,
    };
    return .{
        .flags = fields.flags,
        .path_id = fields.object_id,
        .brush = fields.brush,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .fill_path,
        .flags = flags,
        .size = @intCast(record.header_size + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ FillPath maps common ObjectId to Path and preserves both Brush forms" {
    var data = [_]u8{0} ** 4;
    std.mem.writeInt(u32, &data, 63, .little);
    const object = try parse(makeRecord(&data, 0x7f3f));
    try std.testing.expectEqual(@as(u16, 0x7f3f), object.flags);
    try std.testing.expectEqual(@as(u6, 63), object.path_id);
    try std.testing.expectEqual(@as(u6, 63), object.brush.brush_id);

    std.mem.writeInt(u32, &data, 0x44332211, .little);
    const literal = try parse(makeRecord(&data, 0xff00));
    try std.testing.expectEqual(@as(u6, 0), literal.path_id);
    try std.testing.expectEqual(@as(u32, 0x44332211), literal.brush.color.raw());
}

test "EMF+ FillPath maps common size errors and rejects another record type" {
    var data = [_]u8{0} ** 5;
    _ = try parse(makeRecord(data[0..4], 0x8000));
    for (0..data.len + 1) |cut| {
        if (cut != 4)
            try std.testing.expectError(error.InvalidEmfPlusFillPathSize, parse(makeRecord(data[0..cut], 0x8000)));
    }
    var wrong_type = makeRecord(data[0..4], 0x8000);
    wrong_type.kind = .fill_region;
    try std.testing.expectError(error.NotEmfPlusFillPath, parse(wrong_type));
    var wrong_size = makeRecord(data[0..4], 0x8000);
    wrong_size.size = 20;
    try std.testing.expectError(error.InvalidEmfPlusFillPathSize, parse(wrong_size));
    var wrong_data_size = makeRecord(data[0..4], 0x8000);
    wrong_data_size.data_size = 8;
    try std.testing.expectError(error.InvalidEmfPlusFillPathSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(data[0..5], 0x8000);
    wrong_slice.size = 16;
    wrong_slice.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusFillPathSize, parse(wrong_slice));
}
