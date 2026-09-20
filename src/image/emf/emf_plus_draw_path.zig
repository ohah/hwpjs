const std = @import("std");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");

pub const DrawPath = struct {
    flags: u16,
    path_id: u6,
    pen_id: u6,
};

pub fn parse(value: record.Record) !DrawPath {
    if (value.kind != .draw_path) return error.NotEmfPlusDrawPath;
    if (value.size != 16 or value.data_size != 4 or value.data.len != 4)
        return error.InvalidEmfPlusDrawPathSize;

    const raw_pen_id = std.mem.readInt(u32, value.data[0..4], .little);
    if (raw_pen_id > 63) return error.InvalidEmfPlusDrawPathPenId;
    return .{
        .flags = value.flags,
        .path_id = try record_flags.objectId(value.flags),
        .pen_id = @intCast(raw_pen_id),
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .draw_path,
        .flags = flags,
        .size = @intCast(12 + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ DrawPath parses Path and Pen IDs while preserving ignored flags" {
    var data = [_]u8{0} ** 4;
    std.mem.writeInt(u32, &data, 63, .little);
    const value = try parse(makeRecord(&data, 0xff00));
    try std.testing.expectEqual(@as(u16, 0xff00), value.flags);
    try std.testing.expectEqual(@as(u6, 0), value.path_id);
    try std.testing.expectEqual(@as(u6, 63), value.pen_id);

    std.mem.writeInt(u32, &data, 0, .little);
    const opposite = try parse(makeRecord(&data, 0x003f));
    try std.testing.expectEqual(@as(u6, 63), opposite.path_id);
    try std.testing.expectEqual(@as(u6, 0), opposite.pen_id);
}

test "EMF+ DrawPath rejects type IDs and every independent size mismatch" {
    var data = [_]u8{0} ** 5;
    _ = try parse(makeRecord(data[0..4], 0));
    for (0..data.len + 1) |cut| {
        if (cut != 4)
            try std.testing.expectError(error.InvalidEmfPlusDrawPathSize, parse(makeRecord(data[0..cut], 0)));
    }

    var invalid_pen = data;
    std.mem.writeInt(u32, invalid_pen[0..4], 64, .little);
    try std.testing.expectError(error.InvalidEmfPlusDrawPathPenId, parse(makeRecord(invalid_pen[0..4], 0)));
    std.mem.writeInt(u32, invalid_pen[0..4], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.InvalidEmfPlusDrawPathPenId, parse(makeRecord(invalid_pen[0..4], 0)));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(data[0..4], 0x0040)));

    var wrong_type = makeRecord(data[0..4], 0);
    wrong_type.kind = .fill_path;
    try std.testing.expectError(error.NotEmfPlusDrawPath, parse(wrong_type));
    var wrong_size = makeRecord(data[0..4], 0);
    wrong_size.size = 20;
    try std.testing.expectError(error.InvalidEmfPlusDrawPathSize, parse(wrong_size));
    var wrong_data_size = makeRecord(data[0..4], 0);
    wrong_data_size.data_size = 8;
    try std.testing.expectError(error.InvalidEmfPlusDrawPathSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(data[0..5], 0);
    wrong_slice.size = 16;
    wrong_slice.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawPathSize, parse(wrong_slice));
}
