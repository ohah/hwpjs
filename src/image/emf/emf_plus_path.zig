const std = @import("std");
const binary = @import("../../binary/reader.zig");
const graphics_version = @import("emf_plus_graphics_version.zig");
const object = @import("emf_plus_object.zig");
const path_geometry = @import("emf_plus_path_geometry.zig");
const path_segments = @import("emf_plus_path_segments.zig");
const point = @import("emf_plus_point.zig");
const path_type = @import("emf_plus_path_type.zig");

pub const FlagInterpretation = enum {
    specification,
    independent_rle,
};

pub const Options = struct {
    max_points: u32 = 16 * 1024 * 1024,
    flag_interpretation: FlagInterpretation = .specification,
};

pub const Path = struct {
    bytes: []const u8,
    version: graphics_version.GraphicsVersion,
    point_count: u32,
    point_flags: u32,
    point_encoding: point.Encoding,
    point_types_rle: bool,
    point_data: []const u8,
    point_type_data: []const u8,
    alignment_padding: []const u8,

    pub fn points(self: Path) point.Iterator {
        return .{
            .reader = .{ .bytes = self.point_data },
            .encoding = self.point_encoding,
            .remaining = self.point_count,
        };
    }

    pub fn pointTypes(self: Path) path_type.Iterator {
        return .{
            .reader = .{ .bytes = self.point_type_data },
            .rle = self.point_types_rle,
            .remaining = self.point_count,
        };
    }

    pub fn commands(self: Path) path_geometry.Iterator {
        return path_geometry.commands(self.points(), self.pointTypes());
    }

    pub fn segments(self: Path) path_segments.Iterator {
        return path_segments.segments(self.commands());
    }
};

pub fn parse(bytes: []const u8, options: Options) !Path {
    if (bytes.len % 4 != 0) return error.InvalidEmfPlusPathAlignment;
    var reader: binary.Reader = .{ .bytes = bytes };
    const version = graphics_version.parse(try reader.readInt(u32)) catch |err| return err;
    const point_count = try reader.readInt(u32);
    if (point_count > options.max_points) return error.LimitExceeded;
    const point_flags = try reader.readInt(u32);
    const decoded_flags = try decodeFlags(point_flags, options.flag_interpretation);

    const points_start = reader.offset;
    var point_iterator: point.Iterator = .{
        .reader = reader,
        .encoding = decoded_flags.encoding,
        .remaining = point_count,
    };
    while (try point_iterator.next()) |_| {}
    reader = point_iterator.reader;
    const point_data = bytes[points_start..reader.offset];

    const types_start = reader.offset;
    if (decoded_flags.rle) {
        var remaining = point_count;
        while (remaining != 0) {
            const run = try path_type.readRun(&reader);
            if (run.count > remaining) return error.InvalidEmfPlusPathPointTypeRunCount;
            remaining -= run.count;
        }
    } else {
        const count: usize = @intCast(point_count);
        const type_bytes = try reader.take(count);
        for (type_bytes) |raw| _ = try path_type.parse(raw);
    }
    const point_type_data = bytes[types_start..reader.offset];
    const alignment_padding = bytes[reader.offset..];
    if (alignment_padding.len > 3) return error.InvalidEmfPlusPathPadding;

    return .{
        .bytes = bytes,
        .version = version,
        .point_count = point_count,
        .point_flags = point_flags,
        .point_encoding = decoded_flags.encoding,
        .point_types_rle = decoded_flags.rle,
        .point_data = point_data,
        .point_type_data = point_type_data,
        .alignment_padding = alignment_padding,
    };
}

pub fn parseCompleted(value: object.Completed, options: Options) !Path {
    if (value.object_type != .path) return error.NotEmfPlusPathObject;
    return parse(value.object_data, options);
}

const DecodedFlags = struct { encoding: point.Encoding, rle: bool };

fn decodeFlags(raw: u32, interpretation: FlagInterpretation) !DecodedFlags {
    const relative = raw & 0x0800 != 0;
    const compressed = raw & 0x4000 != 0;
    const rle = switch (interpretation) {
        .specification => relative,
        .independent_rle => raw & 0x1000 != 0,
    };
    const allowed: u32 = switch (interpretation) {
        .specification => 0x4800,
        .independent_rle => 0x5800,
    };
    if (raw & ~allowed != 0) return error.InvalidEmfPlusPathFlags;
    return .{
        .encoding = if (relative) .relative else if (compressed) .integer else .floating,
        .rle = rle,
    };
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    putU32(bytes, offset, @bitCast(value));
}

test "EMF+ Path parses floating points types and indeterminate padding" {
    var bytes = [_]u8{0} ** 32;
    putU32(&bytes, 0, 0xdbc01002);
    putU32(&bytes, 4, 2);
    putF32(&bytes, 12, 1.5);
    putF32(&bytes, 16, -2.5);
    putF32(&bytes, 20, 3.5);
    putF32(&bytes, 24, 4.5);
    bytes[28..32].* = .{ 0x00, 0x91, 0xaa, 0xbb };
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(point.Encoding.floating, value.point_encoding);
    try std.testing.expect(!value.point_types_rle);
    try std.testing.expectEqualSlices(u8, bytes[30..32], value.alignment_padding);
    var points = value.points();
    try std.testing.expectEqual(@as(f32, 1.5), (try points.next()).?.floating.x);
    try std.testing.expectEqual(@as(f32, 3.5), (try points.next()).?.floating.x);
    try std.testing.expect((try points.next()) == null);
    var types = value.pointTypes();
    try std.testing.expectEqual(path_type.Kind.start, (try types.next()).?.point_type.kind);
    const line = (try types.next()).?;
    try std.testing.expectEqual(path_type.Kind.line, line.point_type.kind);
    try std.testing.expect(line.point_type.dash_mode);
    try std.testing.expect(line.point_type.close_subpath);
    try std.testing.expect((try types.next()) == null);
    var commands_iterator = value.commands();
    const maybe_move = try commands_iterator.next();
    try std.testing.expect(maybe_move != null);
    try std.testing.expect(maybe_move.? == .move_to);
    const maybe_command = try commands_iterator.next();
    try std.testing.expect(maybe_command != null);
    const command = maybe_command.?.line_to;
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, 1.5))), @as(u32, @bitCast(command.start.floating.x)));
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, 3.5))), @as(u32, @bitCast(command.end.value.floating.x)));
    try std.testing.expect(command.end.point_type.point_type.close_subpath);
    try std.testing.expect((try commands_iterator.next()) == null);
    var segments_iterator = value.segments();
    const maybe_line_segment = try segments_iterator.next();
    try std.testing.expect(maybe_line_segment != null);
    try std.testing.expect(maybe_line_segment.? == .line_to);
    const maybe_closing_segment = try segments_iterator.next();
    try std.testing.expect(maybe_closing_segment != null);
    try std.testing.expect(maybe_closing_segment.? == .close_figure);
    const closing_segment = maybe_closing_segment.?.close_figure;
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, 3.5))), @as(u32, @bitCast(closing_segment.start.floating.x)));
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, 1.5))), @as(u32, @bitCast(closing_segment.end.floating.x)));
    try std.testing.expect((try segments_iterator.next()) == null);
}

test "EMF+ Path parses the official 19-point object example byte for byte" {
    const bytes =
        "\x02\x10\xc0\xdb\x13\x00\x00\x00\x00\x00\x00\x00" ++
        "\xfc\x7f\xf5\x43\xcf\xff\xff\xbf\x9d\x8e\x08\x44\x1e\x01\x00\xc0" ++
        "\xfe\xbf\x13\x44\xeb\x15\x2b\x42\xff\xbf\x13\x44\xfc\xff\xc3\x42" ++
        "\xff\xbf\x13\x44\xfe\xff\xc3\x42\xff\xbf\x13\x44\x01\x00\xc4\x42" ++
        "\xff\xbf\x13\x44\x03\x00\xc4\x42\xff\xbf\x13\x44\xff\xff\xf5\x43" ++
        "\xff\xbf\x13\x44\x9f\xce\x08\x44\x9f\x8e\x08\x44\xff\xff\x13\x44" ++
        "\x00\x80\xf5\x43\xff\xff\x13\x44\x05\x00\xc2\x42\xff\xff\x13\x44" ++
        "\x16\x16\x27\x42\x00\x00\x14\x44\x72\xff\x3f\xc0\x9f\xce\x08\x44" ++
        "\xe8\xff\x3f\xc0\x01\x00\xf6\x43\x10\x00\x40\xc0\x04\x00\xc4\x42" ++
        "\x64\x00\x40\xc0\x17\x16\x2b\x42\xfa\x15\x27\x42\xe8\xfe\xff\xbf" ++
        "\xf6\xff\xc1\x42\x26\x00\x00\xc0" ++
        "\x00\x03\x03\x03\x03\x03\x03\x01\x03\x03\x03\x01\x03\x03\x03\x01\x03\x03\x83\xbf";
    const value = try parse(bytes, .{});
    try std.testing.expectEqual(@as(usize, 184), bytes.len);
    try std.testing.expectEqual(@as(u12, 2), value.version.version);
    try std.testing.expectEqual(@as(u32, 19), value.point_count);
    try std.testing.expectEqual(@as(usize, 152), value.point_data.len);
    try std.testing.expectEqual(@as(usize, 19), value.point_type_data.len);
    try std.testing.expectEqualSlices(u8, "\xbf", value.alignment_padding);
    var types = value.pointTypes();
    try std.testing.expectEqual(path_type.Kind.start, (try types.next()).?.point_type.kind);
    var consumed: u32 = 1;
    while (try types.next()) |_| consumed += 1;
    try std.testing.expectEqual(value.point_count, consumed);
}

test "EMF+ Path parses signed 16-bit absolute points" {
    var bytes = [_]u8{0} ** 28;
    putU32(&bytes, 0, 0xdbc01001);
    putU32(&bytes, 4, 3);
    putU32(&bytes, 8, 0x4000);
    bytes[12..24].* = .{ 0, 0x80, 0xff, 0x7f, 1, 0, 2, 0, 0xfe, 0xff, 0xfd, 0xff };
    bytes[24..28].* = .{ 0, 1, 0x83, 0xcc };
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(point.Encoding.integer, value.point_encoding);
    try std.testing.expectEqual(@as(usize, 1), value.alignment_padding.len);
    var points = value.points();
    const first = (try points.next()).?.integer;
    try std.testing.expectEqual(@as(i16, -32_768), first.x);
    try std.testing.expectEqual(@as(i16, 32_767), first.y);
}

test "EMF+ Path specification mode parses mixed PointR and RLE types" {
    var bytes = [_]u8{0} ** 24;
    putU32(&bytes, 0, 0xdbc01002);
    putU32(&bytes, 4, 2);
    putU32(&bytes, 8, 0x4800);
    bytes[12..19].* = .{ 0x3f, 0xff, 0xc0, 0xc1, 0x00, 0x80, 0x40 };
    bytes[19..24].* = .{ 0xc2, 0x03, 0xde, 0xad, 0xbe };
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(point.Encoding.relative, value.point_encoding);
    try std.testing.expect(value.point_types_rle);
    var points = value.points();
    const first = (try points.next()).?.relative;
    try std.testing.expectEqual(@as(i16, 63), first.x);
    try std.testing.expectEqual(@as(i16, -64), first.y);
    var types = value.pointTypes();
    for (0..2) |_| {
        const point_type = (try types.next()).?;
        try std.testing.expectEqual(path_type.Kind.bezier, point_type.point_type.kind);
        try std.testing.expectEqual(true, point_type.rle_bezier.?);
    }
    try std.testing.expect((try types.next()) == null);
}

test "EMF+ Path independent RLE mode keeps relative and type compression orthogonal" {
    var relative = [_]u8{0} ** 20;
    putU32(&relative, 0, 0xdbc01001);
    putU32(&relative, 4, 2);
    putU32(&relative, 8, 0x0800);
    relative[12..20].* = .{ 1, 2, 3, 4, 0, 1, 0, 0 };
    const relative_value = try parse(&relative, .{ .flag_interpretation = .independent_rle });
    try std.testing.expectEqual(point.Encoding.relative, relative_value.point_encoding);
    try std.testing.expect(!relative_value.point_types_rle);
    try std.testing.expectError(error.InvalidEmfPlusPathPointTypeRleHeader, parse(&relative, .{}));

    var rle = [_]u8{0} ** 32;
    putU32(&rle, 0, 0xdbc01001);
    putU32(&rle, 4, 2);
    putU32(&rle, 8, 0x1000);
    putF32(&rle, 12, 1);
    putF32(&rle, 16, 2);
    putF32(&rle, 20, 3);
    putF32(&rle, 24, 4);
    rle[28..32].* = .{ 0x42, 1, 0, 0 };
    const rle_value = try parse(&rle, .{ .flag_interpretation = .independent_rle });
    try std.testing.expectEqual(point.Encoding.floating, rle_value.point_encoding);
    try std.testing.expect(rle_value.point_types_rle);
    try std.testing.expectError(error.InvalidEmfPlusPathFlags, parse(&rle, .{}));
}

test "EMF+ Path rejects every truncation and malformed semantic boundary" {
    var bytes = [_]u8{0} ** 32;
    putU32(&bytes, 0, 0xdbc01001);
    putU32(&bytes, 4, 2);
    putF32(&bytes, 12, 1);
    putF32(&bytes, 16, 2);
    putF32(&bytes, 20, 3);
    putF32(&bytes, 24, 4);
    bytes[28..32].* = .{ 0, 1, 0xaa, 0xbb };
    for (0..bytes.len) |cut| try expectParseError(bytes[0..cut], .{});

    var invalid = bytes;
    putU32(&invalid, 8, 1);
    try std.testing.expectError(error.InvalidEmfPlusPathFlags, parse(&invalid, .{}));
    invalid = bytes;
    invalid[29] = 2;
    try std.testing.expectError(error.InvalidEmfPlusPathPointType, parse(&invalid, .{}));
    invalid = bytes;
    putU32(&invalid, 4, 3);
    try std.testing.expectError(error.UnexpectedEnd, parse(&invalid, .{}));
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, .{ .max_points = 1 }));
}

test "EMF+ Path RLE rejects bad headers and runs beyond point count" {
    var bytes = [_]u8{0} ** 16;
    putU32(&bytes, 0, 0xdbc01001);
    putU32(&bytes, 4, 1);
    putU32(&bytes, 8, 0x0800);
    bytes[12..16].* = .{ 0, 0, 0x41, 0 };
    _ = try parse(&bytes, .{});
    bytes[14] = 1;
    try std.testing.expectError(error.InvalidEmfPlusPathPointTypeRleHeader, parse(&bytes, .{}));
    bytes[14] = 0x42;
    try std.testing.expectError(error.InvalidEmfPlusPathPointTypeRunCount, parse(&bytes, .{}));
}

test "EMF+ Path accepts zero RLE runs without losing exact termination" {
    var bytes = [_]u8{0} ** 20;
    putU32(&bytes, 0, 0xdbc01001);
    putU32(&bytes, 4, 1);
    putU32(&bytes, 8, 0x0800);
    bytes[12..20].* = .{ 1, 2, 0x40, 0, 0x41, 1, 0xaa, 0xbb };
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(@as(usize, 4), value.point_type_data.len);
    try std.testing.expectEqual(@as(usize, 2), value.alignment_padding.len);
    var types = value.pointTypes();
    try std.testing.expectEqual(path_type.Kind.line, (try types.next()).?.point_type.kind);
    try std.testing.expect((try types.next()) == null);
}

test "EMF+ Path validates empty padding and completed object type" {
    var empty = [_]u8{0} ** 12;
    putU32(&empty, 0, 0xdbc01001);
    const value = try parseCompleted(.{
        .object_id = 3,
        .object_type = .path,
        .object_data = &empty,
        .multipart = false,
    }, .{ .max_points = 0 });
    try std.testing.expectEqual(@as(u32, 0), value.point_count);

    var excess = [_]u8{0} ** 16;
    putU32(&excess, 0, 0xdbc01001);
    try std.testing.expectError(error.InvalidEmfPlusPathPadding, parse(&excess, .{}));
    try std.testing.expectError(error.NotEmfPlusPathObject, parseCompleted(.{
        .object_id = 3,
        .object_type = .brush,
        .object_data = &empty,
        .multipart = false,
    }, .{}));
}

test "EMF+ Path accepts every alignment padding width from zero through three" {
    var no_padding = [_]u8{0} ** 12;
    putU32(&no_padding, 0, 0xdbc01001);
    try std.testing.expectEqual(@as(usize, 0), (try parse(&no_padding, .{})).alignment_padding.len);

    var one_padding = [_]u8{0} ** 16;
    putU32(&one_padding, 0, 0xdbc01001);
    putU32(&one_padding, 4, 1);
    putU32(&one_padding, 8, 0x0800);
    one_padding[12..16].* = .{ 1, 2, 0, 0xa1 };
    const one = try parse(&one_padding, .{ .flag_interpretation = .independent_rle });
    try std.testing.expectEqualSlices(u8, "\xa1", one.alignment_padding);

    var two_padding = [_]u8{0} ** 20;
    putU32(&two_padding, 0, 0xdbc01001);
    putU32(&two_padding, 4, 2);
    putU32(&two_padding, 8, 0x0800);
    two_padding[12..20].* = .{ 1, 2, 3, 4, 0, 1, 0xa2, 0xb2 };
    const two = try parse(&two_padding, .{ .flag_interpretation = .independent_rle });
    try std.testing.expectEqualSlices(u8, "\xa2\xb2", two.alignment_padding);

    var three_padding = [_]u8{0} ** 20;
    putU32(&three_padding, 0, 0xdbc01001);
    putU32(&three_padding, 4, 1);
    putU32(&three_padding, 8, 0x4000);
    three_padding[12..20].* = .{ 1, 0, 2, 0, 0, 0xa3, 0xb3, 0xc3 };
    const three = try parse(&three_padding, .{});
    try std.testing.expectEqualSlices(u8, "\xa3\xb3\xc3", three.alignment_padding);
}

fn expectParseError(bytes: []const u8, options: Options) !void {
    if (parse(bytes, options)) |_| return error.TestExpectedError else |_| {}
}
