const binary = @import("../../binary/reader.zig");
const geometry = @import("emf_plus_geometry.zig");
const line_values = @import("emf_plus_line_values.zig");
const path = @import("emf_plus_path.zig");
const sized_path = @import("emf_plus_sized_path.zig");
const values = @import("emf_plus_values.zig");

pub const fixed_size: usize = 48;

pub const Options = struct {
    max_path_bytes: usize = 64 * 1024 * 1024,
    path_options: path.Options = .{},
};

pub const Default = struct {
    bytes: []const u8,
    flags_raw: u32,
    base_cap: line_values.LineCapType,
    base_inset: f32,
    stroke_start_cap: line_values.LineCapType,
    stroke_end_cap: line_values.LineCapType,
    stroke_join: line_values.LineJoinType,
    stroke_miter_limit: f32,
    width_scale: f32,
    fill_hot_spot: geometry.PointF,
    stroke_hot_spot: geometry.PointF,
    fill_path: ?path.Path,
    line_path: ?path.Path,
};

pub fn parse(bytes: []const u8, options: Options) !Default {
    var reader: binary.Reader = .{ .bytes = bytes };
    const flags = try reader.readInt(u32);
    try line_values.validateCustomLineCapDataFlags(flags);
    const result: Default = .{
        .bytes = bytes,
        .flags_raw = flags,
        .base_cap = try line_values.lineCapType(try reader.readInt(u32)),
        .base_inset = try values.readFloat(&reader),
        .stroke_start_cap = try line_values.lineCapType(try reader.readInt(u32)),
        .stroke_end_cap = try line_values.lineCapType(try reader.readInt(u32)),
        .stroke_join = try line_values.lineJoinType(try reader.readInt(u32)),
        .stroke_miter_limit = try values.readFloat(&reader),
        .width_scale = try values.readFloat(&reader),
        .fill_hot_spot = try geometry.readPointF(&reader),
        .stroke_hot_spot = try geometry.readPointF(&reader),
        .fill_path = if (flags & 1 != 0) try sized_path.read(&reader, options.path_options, options.max_path_bytes) else null,
        .line_path = if (flags & 2 != 0) try sized_path.read(&reader, options.path_options, options.max_path_bytes) else null,
    };
    if (!isZero(result.fill_hot_spot) or !isZero(result.stroke_hot_spot))
        return error.InvalidEmfPlusCustomLineCapHotSpot;
    if (reader.offset != bytes.len) return error.InvalidEmfPlusCustomLineCapTrailingData;
    return result;
}

fn isZero(point: geometry.PointF) bool {
    return point.x == 0.0 and point.y == 0.0;
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    @import("std").mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

fn putI32(bytes: []u8, offset: usize, value: i32) void {
    @import("std").mem.writeInt(i32, bytes[offset..][0..4], value, .little);
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    putU32(bytes, offset, @bitCast(value));
}

test "EMF+ default custom cap parses fixed fields and both sized Paths in wire order" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 80;
    putU32(&bytes, 0, 3);
    putU32(&bytes, 4, 0x14);
    putF32(&bytes, 8, 1.5);
    putU32(&bytes, 12, 1);
    putU32(&bytes, 16, 2);
    putU32(&bytes, 20, 3);
    putF32(&bytes, 24, 10);
    putF32(&bytes, 28, 2);
    putI32(&bytes, 48, 12);
    putU32(&bytes, 52, 0xdbc01001);
    putI32(&bytes, 64, 12);
    putU32(&bytes, 68, 0xdbc01002);
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(line_values.LineCapType.arrow_anchor, value.base_cap);
    try std.testing.expectEqual(@as(f32, 1.5), value.base_inset);
    try std.testing.expectEqual(line_values.LineCapType.square, value.stroke_start_cap);
    try std.testing.expectEqual(line_values.LineCapType.round, value.stroke_end_cap);
    try std.testing.expectEqual(line_values.LineJoinType.miter_clipped, value.stroke_join);
    try std.testing.expectEqual(@as(f32, 10), value.stroke_miter_limit);
    try std.testing.expectEqual(@as(f32, 2), value.width_scale);
    try std.testing.expectEqual(@as(f32, 0), value.fill_hot_spot.x);
    try std.testing.expectEqual(@as(f32, 0), value.stroke_hot_spot.y);
    try std.testing.expectEqual(@as(u12, 1), value.fill_path.?.version.version);
    try std.testing.expectEqual(@as(u12, 2), value.line_path.?.version.version);
}

test "EMF+ default custom cap assigns each path flag to only its declared field" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 64;
    putU32(&bytes, 0, 1);
    putI32(&bytes, 48, 12);
    putU32(&bytes, 52, 0xdbc01001);
    var value = try parse(&bytes, .{});
    try std.testing.expect(value.fill_path != null);
    try std.testing.expect(value.line_path == null);

    putU32(&bytes, 0, 2);
    value = try parse(&bytes, .{});
    try std.testing.expect(value.fill_path == null);
    try std.testing.expect(value.line_path != null);
}

test "EMF+ default custom cap rejects truncation flags enum hot spots path limits and trailing data" {
    const std = @import("std");
    var bytes = [_]u8{0} ** fixed_size;
    for (0..fixed_size) |cut| try expectError(bytes[0..cut], .{});
    _ = try parse(&bytes, .{});
    var invalid = bytes;
    putU32(&invalid, 0, 4);
    try std.testing.expectError(error.InvalidEmfPlusCustomLineCapDataFlags, parse(&invalid, .{}));
    putU32(&invalid, 0, 0);
    putU32(&invalid, 4, 4);
    try std.testing.expectError(error.InvalidEmfPlusLineCapType, parse(&invalid, .{}));
    putU32(&invalid, 4, 0);
    putF32(&invalid, 32, 1);
    try std.testing.expectError(error.InvalidEmfPlusCustomLineCapHotSpot, parse(&invalid, .{}));
    var nested = [_]u8{0} ** 64;
    putU32(&nested, 0, 1);
    putI32(&nested, 48, 12);
    putU32(&nested, 52, 0xdbc01001);
    try std.testing.expectError(error.LimitExceeded, parse(&nested, .{ .max_path_bytes = 11 }));
    var trailing = [_]u8{0} ** (fixed_size + 1);
    try std.testing.expectError(error.InvalidEmfPlusCustomLineCapTrailingData, parse(&trailing, .{}));
}

fn expectError(bytes: []const u8, options: Options) !void {
    if (parse(bytes, options)) |_| return error.TestExpectedError else |_| {}
}
