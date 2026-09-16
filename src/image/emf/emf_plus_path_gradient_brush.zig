const std = @import("std");
const binary = @import("../../binary/reader.zig");
const argb = @import("emf_plus_argb.zig");
const brush_values = @import("emf_plus_brush_values.zig");
const geometry = @import("emf_plus_geometry.zig");
const optional = @import("emf_plus_brush_optional.zig");
const path = @import("emf_plus_path.zig");
const values = @import("emf_plus_values.zig");

pub const Options = struct {
    max_surrounding_colors: u32 = 1 << 20,
    max_boundary_points: u32 = 16 * 1024 * 1024,
    path_options: path.Options = .{},
};

pub const PointBoundary = struct {
    count: u32,
    point_bytes: []const u8,

    pub fn get(self: PointBoundary, index: u32) ?geometry.PointF {
        if (index >= self.count) return null;
        const offset = @as(usize, index) * 8;
        return .{
            .x = values.floatAt(self.point_bytes[offset..], 0),
            .y = values.floatAt(self.point_bytes[offset + 4 ..], 0),
        };
    }
};

pub const Boundary = union(enum) {
    path: path.Path,
    points: PointBoundary,
};

pub const PathGradient = struct {
    bytes: []const u8,
    flags_raw: u32,
    wrap_mode: brush_values.WrapMode,
    center_color: argb.Argb,
    center_point: geometry.PointF,
    surrounding_color_count: u32,
    surrounding_color_bytes: []const u8,
    boundary: Boundary,
    optional_data: optional.Path,

    pub fn surroundingColor(self: PathGradient, index: u32) ?argb.Argb {
        if (index >= self.surrounding_color_count) return null;
        const offset = @as(usize, index) * 4;
        return argb.Argb.fromRaw(std.mem.readInt(u32, self.surrounding_color_bytes[offset..][0..4], .little));
    }
};

pub fn parse(bytes: []const u8, options: Options) !PathGradient {
    var reader: binary.Reader = .{ .bytes = bytes };
    const flags = try reader.readInt(u32);
    try optional.validatePathFlags(flags);
    const wrap_mode = try brush_values.wrapMode(try reader.readInt(u32));
    const center_color = try argb.read(&reader);
    const center_point = try geometry.readPointF(&reader);
    const color_count = try reader.readInt(u32);
    if (color_count > options.max_surrounding_colors) return error.LimitExceeded;
    const color_bytes = try reader.take(try byteCount(color_count, 4));
    const boundary: Boundary = if (flags & 1 != 0)
        .{ .path = try readBoundaryPath(&reader, options.path_options) }
    else
        .{ .points = try readBoundaryPoints(&reader, options.max_boundary_points) };
    const optional_data = try optional.readPath(&reader, flags);
    if (reader.offset != bytes.len) return error.InvalidEmfPlusPathGradientTrailingData;
    return .{
        .bytes = bytes,
        .flags_raw = flags,
        .wrap_mode = wrap_mode,
        .center_color = center_color,
        .center_point = center_point,
        .surrounding_color_count = color_count,
        .surrounding_color_bytes = color_bytes,
        .boundary = boundary,
        .optional_data = optional_data,
    };
}

fn readBoundaryPath(reader: *binary.Reader, options: path.Options) !path.Path {
    const signed_size = try reader.readInt(i32);
    if (signed_size < 0) return error.InvalidEmfPlusBoundaryPathSize;
    return path.parse(try reader.take(@intCast(signed_size)), options);
}

fn readBoundaryPoints(reader: *binary.Reader, max_points: u32) !PointBoundary {
    const signed_count = try reader.readInt(i32);
    if (signed_count < 0) return error.InvalidEmfPlusBoundaryPointCount;
    const count: u32 = @intCast(signed_count);
    if (count > max_points) return error.LimitExceeded;
    return .{ .count = count, .point_bytes = try reader.take(try byteCount(count, 8)) };
}

fn byteCount(count: u32, width: u8) !usize {
    return std.math.mul(usize, @as(usize, count), width) catch return error.LimitExceeded;
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

fn putI32(bytes: []u8, offset: usize, value: i32) void {
    std.mem.writeInt(i32, bytes[offset..][0..4], value, .little);
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    putU32(bytes, offset, @bitCast(value));
}

test "EMF+ path gradient parses surrounding colors and point boundary" {
    var bytes = [_]u8{0} ** 52;
    putU32(&bytes, 4, 4);
    putU32(&bytes, 8, 0x44332211);
    putF32(&bytes, 12, 1.5);
    putF32(&bytes, 16, -2.5);
    putU32(&bytes, 20, 2);
    putU32(&bytes, 24, 0x04030201);
    putU32(&bytes, 28, 0x08070605);
    putI32(&bytes, 32, 2);
    putF32(&bytes, 36, 10);
    putF32(&bytes, 40, 20);
    putF32(&bytes, 44, 30);
    putF32(&bytes, 48, 40);
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(brush_values.WrapMode.clamp, value.wrap_mode);
    try std.testing.expectEqual(@as(u32, 0x08070605), value.surroundingColor(1).?.raw());
    try std.testing.expect(value.surroundingColor(2) == null);
    try std.testing.expectEqual(@as(u32, 2), value.boundary.points.count);
    try std.testing.expectEqual(@as(f32, 10), value.boundary.points.get(0).?.x);
    try std.testing.expectEqual(@as(f32, 30), value.boundary.points.get(1).?.x);
    for (36..bytes.len) |cut| try expectError(bytes[0..cut], .{});
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, .{ .max_surrounding_colors = 1 }));
}

test "EMF+ path gradient delegates sized path boundary to the Path SSOT" {
    var bytes = [_]u8{0} ** 44;
    putU32(&bytes, 0, 1);
    putU32(&bytes, 20, 1);
    putU32(&bytes, 24, 0xff010203);
    putI32(&bytes, 28, 12);
    putU32(&bytes, 32, 0xdbc01001);
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(@as(u32, 0), value.boundary.path.point_count);
    try std.testing.expectEqual(@as(u32, 0xff010203), value.surroundingColor(0).?.raw());
    var invalid = bytes;
    putI32(&invalid, 28, -1);
    try std.testing.expectError(error.InvalidEmfPlusBoundaryPathSize, parse(&invalid, .{}));
    putI32(&invalid, 28, 16);
    try std.testing.expectError(error.UnexpectedEnd, parse(&invalid, .{}));
}

test "EMF+ path gradient rejects truncation limits negative boundaries flag conflicts and trailing data" {
    var points = [_]u8{0} ** 28;
    putI32(&points, 24, 0);
    for (0..28) |cut| try expectError(points[0..cut], .{});
    putI32(&points, 24, 1);
    try std.testing.expectError(error.LimitExceeded, parse(&points, .{ .max_boundary_points = 0 }));
    putI32(&points, 24, -1);
    try std.testing.expectError(error.InvalidEmfPlusBoundaryPointCount, parse(&points, .{}));
    var bad_flags = points;
    putI32(&bad_flags, 24, 0);
    putU32(&bad_flags, 0, 0x20);
    try std.testing.expectError(error.InvalidEmfPlusBrushDataFlags, parse(&bad_flags, .{}));
    putU32(&bad_flags, 0, 0x0c);
    try std.testing.expectError(error.InvalidEmfPlusPathGradientBlendFlags, parse(&bad_flags, .{}));
    var trailing = [_]u8{0} ** 29;
    try std.testing.expectError(error.InvalidEmfPlusPathGradientTrailingData, parse(&trailing, .{}));
}

fn expectError(bytes: []const u8, options: Options) !void {
    if (parse(bytes, options)) |_| return error.TestExpectedError else |_| {}
}
