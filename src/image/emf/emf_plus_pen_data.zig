const binary = @import("../../binary/reader.zig");
const custom_line_cap = @import("emf_plus_custom_line_cap.zig");
const line_values = @import("emf_plus_line_values.zig");
const pen_array = @import("emf_plus_pen_array.zig");
const pen_values = @import("emf_plus_pen_values.zig");
const sized_cap = @import("emf_plus_sized_custom_line_cap.zig");
const transform = @import("emf_plus_transform_matrix.zig");
const values = @import("emf_plus_values.zig");

pub const Options = struct {
    max_array_elements: usize = 1_000_000,
    max_custom_line_cap_bytes: usize = 64 * 1024 * 1024,
    custom_line_cap_options: custom_line_cap.Options = .{},
};

pub const PenData = struct {
    flags: pen_values.PenDataFlags,
    unit: pen_values.UnitType,
    width: f32,
    transform_matrix: ?transform.TransformMatrix,
    start_cap: ?line_values.LineCapType,
    end_cap: ?line_values.LineCapType,
    join: ?line_values.LineJoinType,
    miter_limit: ?f32,
    line_style: ?pen_values.LineStyle,
    dashed_line_cap: ?pen_values.DashedLineCapType,
    dash_offset: ?f32,
    dashed_line: ?pen_array.FloatArray,
    alignment: ?pen_values.PenAlignment,
    compound_line: ?pen_array.FloatArray,
    custom_start_cap: ?custom_line_cap.CustomLineCap,
    custom_end_cap: ?custom_line_cap.CustomLineCap,
};

pub fn read(reader: *binary.Reader, options: Options) !PenData {
    var next = reader.*;
    const flags = try pen_values.PenDataFlags.parse(try next.readInt(u32));
    const result: PenData = .{
        .flags = flags,
        .unit = try pen_values.unitType(try next.readInt(u32)),
        .width = try values.readFloat(&next),
        .transform_matrix = if (flags.transform) try transform.read(&next) else null,
        .start_cap = if (flags.start_cap) try line_values.lineCapType(try next.readInt(u32)) else null,
        .end_cap = if (flags.end_cap) try line_values.lineCapType(try next.readInt(u32)) else null,
        .join = if (flags.join) try line_values.lineJoinType(try next.readInt(u32)) else null,
        .miter_limit = if (flags.miter_limit) try values.readFloat(&next) else null,
        .line_style = if (flags.line_style) try pen_values.lineStyle(try next.readInt(i32)) else null,
        .dashed_line_cap = if (flags.dashed_line_cap) try pen_values.dashedLineCapType(try next.readInt(i32)) else null,
        .dash_offset = if (flags.dashed_line_offset) try values.readFloat(&next) else null,
        .dashed_line = if (flags.dashed_line) try pen_array.read(&next, options.max_array_elements) else null,
        .alignment = if (flags.non_center) try pen_values.penAlignment(try next.readInt(i32)) else null,
        .compound_line = if (flags.compound_line) try pen_array.readCompound(&next, options.max_array_elements) else null,
        .custom_start_cap = if (flags.custom_start_cap) try sized_cap.read(&next, options.custom_line_cap_options, options.max_custom_line_cap_bytes) else null,
        .custom_end_cap = if (flags.custom_end_cap) try sized_cap.read(&next, options.custom_line_cap_options, options.max_custom_line_cap_bytes) else null,
    };
    reader.* = next;
    return result;
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    @import("std").mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

test "EMF+ PenData consumes every optional field in flag order" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 220;
    putU32(&bytes, 0, 0x1fff);
    putU32(&bytes, 4, 6);
    putU32(&bytes, 8, @bitCast(@as(f32, 1.5)));
    for ([_]f32{ 1, 2, 3, 4, 5, 6 }, 0..) |value, index| putU32(&bytes, 12 + index * 4, @bitCast(value));
    putU32(&bytes, 36, 0x11);
    putU32(&bytes, 40, 0x12);
    putU32(&bytes, 44, 2);
    putU32(&bytes, 48, @bitCast(@as(f32, 7)));
    putU32(&bytes, 52, 5);
    putU32(&bytes, 56, 3);
    putU32(&bytes, 60, @bitCast(@as(f32, 8)));
    putU32(&bytes, 64, 2);
    putU32(&bytes, 68, @bitCast(@as(f32, 9)));
    putU32(&bytes, 72, @bitCast(@as(f32, 10)));
    putU32(&bytes, 76, 4);
    putU32(&bytes, 80, 3);
    putU32(&bytes, 84, @bitCast(@as(f32, 0)));
    putU32(&bytes, 88, @bitCast(@as(f32, 0.5)));
    putU32(&bytes, 92, @bitCast(@as(f32, 1)));
    putU32(&bytes, 96, 56);
    putU32(&bytes, 100, 0xdbc01001);
    putU32(&bytes, 156, 60);
    putU32(&bytes, 160, 0xdbc01002);
    putU32(&bytes, 164, 1);
    var reader: binary.Reader = .{ .bytes = &bytes };
    const result = try read(&reader, .{});
    try std.testing.expectEqual(@as(usize, 220), reader.offset);
    try std.testing.expectEqual(line_values.LineCapType.square_anchor, result.start_cap.?);
    try std.testing.expectEqual(line_values.LineCapType.round_anchor, result.end_cap.?);
    try std.testing.expectEqual(@as(f32, 10), result.dashed_line.?.get(1).?);
    try std.testing.expectEqual(@as(f32, 0.5), result.compound_line.?.get(1).?);
    try std.testing.expect(result.custom_start_cap != null);
    try std.testing.expect(result.custom_end_cap != null);
    for (0..bytes.len) |cut| {
        var truncated: binary.Reader = .{ .bytes = bytes[0..cut] };
        if (read(&truncated, .{})) |_| return error.TestExpectedError else |_| {}
        try std.testing.expectEqual(@as(usize, 0), truncated.offset);
    }
}

test "EMF+ PenData optional failure is atomic and flag-specific" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 16;
    putU32(&bytes, 0, 0x40);
    putU32(&bytes, 4, 0);
    putU32(&bytes, 12, 1);
    var reader: binary.Reader = .{ .bytes = &bytes };
    try std.testing.expectError(error.InvalidEmfPlusDashedLineCapType, read(&reader, .{}));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
    putU32(&bytes, 0, 0x2000);
    try std.testing.expectError(error.InvalidEmfPlusPenDataFlags, read(&reader, .{}));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
}

test "EMF+ PenData assigns every individual flag to only its declared field" {
    const std = @import("std");
    const cases = [_]struct { bit: u5, payload_bytes: usize }{
        .{ .bit = 0, .payload_bytes = 24 },
        .{ .bit = 1, .payload_bytes = 4 },
        .{ .bit = 2, .payload_bytes = 4 },
        .{ .bit = 3, .payload_bytes = 4 },
        .{ .bit = 4, .payload_bytes = 4 },
        .{ .bit = 5, .payload_bytes = 4 },
        .{ .bit = 6, .payload_bytes = 4 },
        .{ .bit = 7, .payload_bytes = 4 },
        .{ .bit = 8, .payload_bytes = 4 },
        .{ .bit = 9, .payload_bytes = 4 },
        .{ .bit = 10, .payload_bytes = 4 },
        .{ .bit = 11, .payload_bytes = 60 },
        .{ .bit = 12, .payload_bytes = 60 },
    };
    for (cases) |case| {
        var bytes = [_]u8{0} ** 72;
        putU32(&bytes, 0, @as(u32, 1) << case.bit);
        if (case.bit >= 11) {
            putU32(&bytes, 12, 56);
            putU32(&bytes, 16, 0xdbc01001);
        }
        var reader: binary.Reader = .{ .bytes = bytes[0 .. 12 + case.payload_bytes] };
        const value = try read(&reader, .{});
        try std.testing.expectEqual(@as(usize, 12 + case.payload_bytes), reader.offset);
        try std.testing.expectEqual(@as(usize, 1), optionalCount(value));
        try std.testing.expect(switch (case.bit) {
            0 => value.transform_matrix != null,
            1 => value.start_cap != null,
            2 => value.end_cap != null,
            3 => value.join != null,
            4 => value.miter_limit != null,
            5 => value.line_style != null,
            6 => value.dashed_line_cap != null,
            7 => value.dash_offset != null,
            8 => value.dashed_line != null,
            9 => value.alignment != null,
            10 => value.compound_line != null,
            11 => value.custom_start_cap != null,
            12 => value.custom_end_cap != null,
            else => unreachable,
        });
    }
}

fn optionalCount(value: PenData) usize {
    var count: usize = 0;
    inline for (.{
        value.transform_matrix,
        value.start_cap,
        value.end_cap,
        value.join,
        value.miter_limit,
        value.line_style,
        value.dashed_line_cap,
        value.dash_offset,
        value.dashed_line,
        value.alignment,
        value.compound_line,
        value.custom_start_cap,
        value.custom_end_cap,
    }) |field| if (field != null) {
        count += 1;
    };
    return count;
}
