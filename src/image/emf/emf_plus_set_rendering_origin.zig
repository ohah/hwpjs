const std = @import("std");
const binary = @import("../../binary/reader.zig");
const record = @import("emf_plus_record.zig");

pub const SetRenderingOrigin = struct {
    flags: u16,
    x: i32,
    y: i32,
};

pub fn parse(value: record.Record) !SetRenderingOrigin {
    if (value.kind != .set_rendering_origin) return error.NotEmfPlusSetRenderingOrigin;
    if (value.size != 20 or value.data_size != 8 or value.data.len != 8)
        return error.InvalidEmfPlusSetRenderingOriginSize;
    var reader: binary.Reader = .{ .bytes = value.data };
    return .{
        .flags = value.flags,
        .x = try reader.readInt(i32),
        .y = try reader.readInt(i32),
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .set_rendering_origin,
        .flags = flags,
        .size = @intCast(12 + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ SetRenderingOrigin parses signed coordinate extremes and preserves ignored flags" {
    var data = [_]u8{0} ** 8;
    std.mem.writeInt(i32, data[0..4], std.math.minInt(i32), .little);
    std.mem.writeInt(i32, data[4..8], std.math.maxInt(i32), .little);
    const parsed = try parse(makeRecord(&data, 0xffff));
    try std.testing.expectEqual(@as(u16, 0xffff), parsed.flags);
    try std.testing.expectEqual(std.math.minInt(i32), parsed.x);
    try std.testing.expectEqual(std.math.maxInt(i32), parsed.y);
}

test "EMF+ SetRenderingOrigin rejects every size axis and wrong record type" {
    var data = [_]u8{0} ** 9;
    for (0..data.len + 1) |cut| {
        if (cut != 8)
            try std.testing.expectError(error.InvalidEmfPlusSetRenderingOriginSize, parse(makeRecord(data[0..cut], 0)));
    }
    var wrong_size = makeRecord(data[0..8], 0);
    wrong_size.size = 24;
    try std.testing.expectError(error.InvalidEmfPlusSetRenderingOriginSize, parse(wrong_size));
    var wrong_data_size = makeRecord(data[0..8], 0);
    wrong_data_size.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusSetRenderingOriginSize, parse(wrong_data_size));
    var short_slice = makeRecord(data[0..7], 0);
    short_slice.size = 20;
    short_slice.data_size = 8;
    try std.testing.expectError(error.InvalidEmfPlusSetRenderingOriginSize, parse(short_slice));
    var long_slice = makeRecord(&data, 0);
    long_slice.size = 20;
    long_slice.data_size = 8;
    try std.testing.expectError(error.InvalidEmfPlusSetRenderingOriginSize, parse(long_slice));
    var wrong_type = makeRecord(data[0..8], 0);
    wrong_type.kind = .set_anti_alias_mode;
    try std.testing.expectError(error.NotEmfPlusSetRenderingOrigin, parse(wrong_type));
}
