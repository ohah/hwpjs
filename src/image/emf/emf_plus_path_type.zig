const binary = @import("../../binary/reader.zig");

pub const Kind = enum(u4) { start = 0, line = 1, bezier = 3 };

pub const PointType = struct {
    raw: u8,
    kind: Kind,
    dash_mode: bool,
    path_marker: bool,
    close_subpath: bool,
};

pub fn parse(raw: u8) !PointType {
    const raw_kind: u4 = @truncate(raw);
    const kind: Kind = switch (raw_kind) {
        0, 1, 3 => @enumFromInt(raw_kind),
        else => return error.InvalidEmfPlusPathPointType,
    };
    const raw_flags = raw >> 4;
    if (raw_flags & ~@as(u4, 0x0b) != 0) return error.InvalidEmfPlusPathPointFlags;
    return .{
        .raw = raw,
        .kind = kind,
        .dash_mode = raw_flags & 0x01 != 0,
        .path_marker = raw_flags & 0x02 != 0,
        .close_subpath = raw_flags & 0x08 != 0,
    };
}

pub const Run = struct {
    count: u6,
    bezier: bool,
    point_type: PointType,
};

pub fn readRun(reader: *binary.Reader) !Run {
    var next = reader.*;
    const header = try next.readInt(u8);
    if (header & 0x40 == 0) return error.InvalidEmfPlusPathPointTypeRleHeader;
    const result: Run = .{
        .count = @truncate(header),
        .bezier = header & 0x80 != 0,
        .point_type = try parse(try next.readInt(u8)),
    };
    reader.* = next;
    return result;
}

pub const Value = struct {
    point_type: PointType,
    rle_bezier: ?bool,
};

pub const Iterator = struct {
    reader: binary.Reader,
    rle: bool,
    remaining: u32,
    run_remaining: u6 = 0,
    run_type: PointType = undefined,
    run_bezier: bool = false,

    pub fn next(self: *Iterator) !?Value {
        if (self.remaining == 0) return null;
        if (!self.rle) {
            const point_type = try parse(try self.reader.readInt(u8));
            self.remaining -= 1;
            return .{ .point_type = point_type, .rle_bezier = null };
        }
        while (self.run_remaining == 0) {
            const run = try readRun(&self.reader);
            if (run.count > self.remaining) return error.InvalidEmfPlusPathPointTypeRunCount;
            self.run_remaining = run.count;
            self.run_type = run.point_type;
            self.run_bezier = run.bezier;
        }
        self.run_remaining -= 1;
        self.remaining -= 1;
        return .{ .point_type = self.run_type, .rle_bezier = self.run_bezier };
    }
};

test "EMF+ path point type accepts only official kinds and flag bits" {
    const std = @import("std");
    for ([_]u8{ 0x00, 0x01, 0x03, 0x10, 0x21, 0x83, 0xb3 }) |raw|
        try std.testing.expectEqual(raw, (try parse(raw)).raw);
    for ([_]u8{ 0x02, 0x04, 0x0f, 0x40, 0x71, 0xff }) |raw|
        try std.testing.expectError(if (raw & 0x0f == 0 or raw & 0x0f == 1 or raw & 0x0f == 3) error.InvalidEmfPlusPathPointFlags else error.InvalidEmfPlusPathPointType, parse(raw));
}

test "EMF+ RLE point type preserves B run count and nested type" {
    const std = @import("std");
    var reader: binary.Reader = .{ .bytes = &.{ 0xc3, 0x83 } };
    const run = try readRun(&reader);
    try std.testing.expect(run.bezier);
    try std.testing.expectEqual(@as(u6, 3), run.count);
    try std.testing.expectEqual(Kind.bezier, run.point_type.kind);
    try std.testing.expect(run.point_type.close_subpath);
    var invalid: binary.Reader = .{ .bytes = &.{ 0x03, 0x01 } };
    try std.testing.expectError(error.InvalidEmfPlusPathPointTypeRleHeader, readRun(&invalid));
    try std.testing.expectEqual(@as(usize, 0), invalid.offset);
}
