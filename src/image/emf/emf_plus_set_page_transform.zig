const std = @import("std");
const binary = @import("../../binary/reader.zig");
const record = @import("emf_plus_record.zig");
const unit_type = @import("emf_plus_unit_type.zig");
const values = @import("emf_plus_values.zig");

pub const SetPageTransform = struct {
    flags: u16,
    page_unit: unit_type.UnitType,
    discouraged_page_unit: bool,
    page_scale: f32,
};

pub fn parse(value: record.Record) !SetPageTransform {
    if (value.kind != .set_page_transform) return error.NotEmfPlusSetPageTransform;
    if (value.size != 16 or value.data_size != 4 or value.data.len != 4)
        return error.InvalidEmfPlusSetPageTransformSize;
    if (value.flags & 0xff00 != 0) return error.InvalidEmfPlusSetPageTransformReservedFlags;

    const page_unit = try unit_type.UnitType.parse(value.flags & 0x00ff);
    var reader: binary.Reader = .{ .bytes = value.data };
    const page_scale = try values.readFloat(&reader);
    std.debug.assert(reader.offset == value.data.len);
    return .{
        .flags = value.flags,
        .page_unit = page_unit,
        .discouraged_page_unit = page_unit == .world or page_unit == .display,
        .page_scale = page_scale,
    };
}

fn makeRecord(flags: u16, bits: u32) struct { value: record.Record, data: [4]u8 } {
    var data: [4]u8 = undefined;
    std.mem.writeInt(u32, &data, bits, .little);
    return .{
        .value = .{
            .offset = 0,
            .kind = .set_page_transform,
            .flags = flags,
            .size = 16,
            .data_size = 4,
            .data = undefined,
            .bytes = &.{},
        },
        .data = data,
    };
}

test "EMF+ SetPageTransform preserves PageUnit and PageScale bits" {
    for (0..7) |raw_unit| {
        const bits: u32 = if (raw_unit == 0) 0x80000000 else if (raw_unit == 6) 0x7fc00001 else @bitCast(@as(f32, @floatFromInt(raw_unit)));
        var fixture = makeRecord(@intCast(raw_unit), bits);
        fixture.value.data = &fixture.data;
        const parsed = try parse(fixture.value);
        try std.testing.expectEqual(@as(u16, @intCast(raw_unit)), parsed.flags);
        try std.testing.expectEqual(@as(u32, @intCast(raw_unit)), @intFromEnum(parsed.page_unit));
        try std.testing.expectEqual(raw_unit <= 1, parsed.discouraged_page_unit);
        try std.testing.expectEqual(bits, @as(u32, @bitCast(parsed.page_scale)));
    }
}

test "EMF+ SetPageTransform rejects type flags unit and every size axis" {
    var fixture = makeRecord(2, 0);
    fixture.value.data = &fixture.data;
    var wrong_type = fixture.value;
    wrong_type.kind = .reset_clip;
    try std.testing.expectError(error.NotEmfPlusSetPageTransform, parse(wrong_type));
    var wrong_size = fixture.value;
    wrong_size.size = 20;
    try std.testing.expectError(error.InvalidEmfPlusSetPageTransformSize, parse(wrong_size));
    var wrong_data_size = fixture.value;
    wrong_data_size.data_size = 8;
    try std.testing.expectError(error.InvalidEmfPlusSetPageTransformSize, parse(wrong_data_size));
    var wrong_slice = fixture.value;
    wrong_slice.data = fixture.data[0..3];
    try std.testing.expectError(error.InvalidEmfPlusSetPageTransformSize, parse(wrong_slice));
    var reserved = fixture.value;
    reserved.flags = 0x0102;
    try std.testing.expectError(error.InvalidEmfPlusSetPageTransformReservedFlags, parse(reserved));
    var bad_unit = fixture.value;
    bad_unit.flags = 7;
    try std.testing.expectError(error.InvalidEmfPlusUnitType, parse(bad_unit));
}
