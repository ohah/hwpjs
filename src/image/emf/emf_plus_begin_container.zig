const std = @import("std");
const binary = @import("../../binary/reader.zig");
const geometry = @import("emf_plus_geometry.zig");
const record = @import("emf_plus_record.zig");
const unit_type = @import("emf_plus_unit_type.zig");

pub const BeginContainer = struct {
    flags: u16,
    page_unit: unit_type.UnitType,
    discouraged_page_unit: bool,
    dest_rect: geometry.RectF,
    src_rect: geometry.RectF,
    stack_index: u32,
};

pub fn parse(value: record.Record) !BeginContainer {
    if (value.kind != .begin_container) return error.NotEmfPlusBeginContainer;
    if (value.size != 48 or value.data_size != 36 or value.data.len != 36)
        return error.InvalidEmfPlusBeginContainerSize;
    if (value.flags & 0xff00 != 0) return error.InvalidEmfPlusBeginContainerReservedFlags;

    const page_unit = try unit_type.UnitType.parse(value.flags & 0x00ff);
    var reader: binary.Reader = .{ .bytes = value.data };
    const dest_rect = try geometry.readRectF(&reader);
    const src_rect = try geometry.readRectF(&reader);
    const stack_index = try reader.readInt(u32);
    std.debug.assert(reader.offset == value.data.len);
    return .{
        .flags = value.flags,
        .page_unit = page_unit,
        .discouraged_page_unit = page_unit == .world or page_unit == .display,
        .dest_rect = dest_rect,
        .src_rect = src_rect,
        .stack_index = stack_index,
    };
}

fn makeRecord(flags: u16, values: [8]f32, stack_index: u32) struct { value: record.Record, data: [36]u8 } {
    var data: [36]u8 = undefined;
    for (values, 0..) |item, index|
        std.mem.writeInt(u32, data[index * 4 ..][0..4], @bitCast(item), .little);
    std.mem.writeInt(u32, data[32..36], stack_index, .little);
    return .{
        .value = .{
            .offset = 0,
            .kind = .begin_container,
            .flags = flags,
            .size = 48,
            .data_size = 36,
            .data = undefined,
            .bytes = &.{},
        },
        .data = data,
    };
}

test "EMF+ BeginContainer preserves rectangles units and StackIndex" {
    const values = [_]f32{ -0.0, 1.5, -2.25, std.math.inf(f32), std.math.nan(f32), -6.5, 7.25, 8.0 };
    for (0..7) |raw_unit| {
        var fixture = makeRecord(@intCast(raw_unit), values, 0x01020304);
        fixture.value.data = &fixture.data;
        const parsed = try parse(fixture.value);
        try std.testing.expectEqual(@as(u16, @intCast(raw_unit)), parsed.flags);
        try std.testing.expectEqual(@as(u32, @intCast(raw_unit)), @intFromEnum(parsed.page_unit));
        try std.testing.expectEqual(raw_unit <= 1, parsed.discouraged_page_unit);
        try std.testing.expectEqual(@as(u32, @bitCast(values[0])), @as(u32, @bitCast(parsed.dest_rect.x)));
        try std.testing.expect(std.math.isPositiveInf(parsed.dest_rect.height));
        try std.testing.expect(std.math.isNan(parsed.src_rect.x));
        try std.testing.expectEqual(values[7], parsed.src_rect.height);
        try std.testing.expectEqual(@as(u32, 0x01020304), parsed.stack_index);
    }
    var maximum = makeRecord(2, values, std.math.maxInt(u32));
    maximum.value.data = &maximum.data;
    try std.testing.expectEqual(std.math.maxInt(u32), (try parse(maximum.value)).stack_index);
}

test "EMF+ BeginContainer rejects type reserved flags unit and every size axis" {
    const values = [_]f32{0} ** 8;
    var fixture = makeRecord(2, values, 0);
    fixture.value.data = &fixture.data;
    var wrong_type = fixture.value;
    wrong_type.kind = .begin_container_no_params;
    try std.testing.expectError(error.NotEmfPlusBeginContainer, parse(wrong_type));
    var wrong_size = fixture.value;
    wrong_size.size = 52;
    try std.testing.expectError(error.InvalidEmfPlusBeginContainerSize, parse(wrong_size));
    var wrong_data_size = fixture.value;
    wrong_data_size.data_size = 40;
    try std.testing.expectError(error.InvalidEmfPlusBeginContainerSize, parse(wrong_data_size));
    var wrong_slice = fixture.value;
    wrong_slice.data = fixture.data[0..35];
    try std.testing.expectError(error.InvalidEmfPlusBeginContainerSize, parse(wrong_slice));
    var reserved = fixture.value;
    reserved.flags = 0x0102;
    try std.testing.expectError(error.InvalidEmfPlusBeginContainerReservedFlags, parse(reserved));
    var bad_unit = fixture.value;
    bad_unit.flags = 7;
    try std.testing.expectError(error.InvalidEmfPlusUnitType, parse(bad_unit));
}
