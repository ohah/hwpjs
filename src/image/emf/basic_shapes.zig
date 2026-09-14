const std = @import("std");
const geometry = @import("geometry.zig");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");

pub const AngleArc = struct {
    center: geometry.PointL,
    radius: u32,
    start_angle_raw: u32,
    sweep_angle_raw: u32,

    pub fn startAngle(self: AngleArc) f32 {
        return @bitCast(self.start_angle_raw);
    }

    pub fn sweepAngle(self: AngleArc) f32 {
        return @bitCast(self.sweep_angle_raw);
    }
};

pub const RoundRect = struct { box: geometry.RectL, corner: geometry.SizeL };
pub const Arc = struct { box: geometry.RectL, start: geometry.PointL, end: geometry.PointL };
pub const Value = union(enum) {
    angle_arc: AngleArc,
    ellipse: geometry.RectL,
    rectangle: geometry.RectL,
    round_rect: RoundRect,
    arc: Arc,
    arc_to: Arc,
    chord: Arc,
    pie: Arc,
};

pub fn parse(record: records.Record) !?Value {
    return switch (record.kind) {
        .anglearc => {
            if (!record_extent.hasRequiredPrefix(record, 28)) return error.InvalidEmfAngleArcRecordSize;
            return .{ .angle_arc = .{
                .center = try geometry.parsePointL(record.bytes[8..16]),
                .radius = std.mem.readInt(u32, record.bytes[16..20], .little),
                .start_angle_raw = std.mem.readInt(u32, record.bytes[20..24], .little),
                .sweep_angle_raw = std.mem.readInt(u32, record.bytes[24..28], .little),
            } };
        },
        .ellipse => return .{ .ellipse = try parseRect(record, 24) },
        .rectangle => return .{ .rectangle = try parseRect(record, 24) },
        .roundrect => {
            if (!record_extent.hasRequiredPrefix(record, 32)) return error.InvalidEmfRoundRectRecordSize;
            return .{ .round_rect = .{
                .box = try geometry.parseRectL(record.bytes[8..24]),
                .corner = try geometry.parseSizeL(record.bytes[24..32]),
            } };
        },
        .arc => return .{ .arc = try parseArc(record) },
        .arcto => return .{ .arc_to = try parseArc(record) },
        .chord => return .{ .chord = try parseArc(record) },
        .pie => return .{ .pie = try parseArc(record) },
        else => null,
    };
}

fn parseRect(record: records.Record, expected_size: u32) !geometry.RectL {
    if (!record_extent.hasRequiredPrefix(record, expected_size)) return error.InvalidEmfRectShapeRecordSize;
    return geometry.parseRectL(record.bytes[8..24]);
}

fn parseArc(record: records.Record) !Arc {
    if (!record_extent.hasRequiredPrefix(record, 40)) return error.InvalidEmfArcShapeRecordSize;
    return .{
        .box = try geometry.parseRectL(record.bytes[8..24]),
        .start = try geometry.parsePointL(record.bytes[24..32]),
        .end = try geometry.parsePointL(record.bytes[32..40]),
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "basic shapes preserve signed geometry and ANGLEARC float bits" {
    var angle = [_]u8{0} ** 28;
    std.mem.writeInt(i32, angle[8..12], std.math.minInt(i32), .little);
    std.mem.writeInt(i32, angle[12..16], std.math.maxInt(i32), .little);
    std.mem.writeInt(u32, angle[16..20], std.math.maxInt(u32), .little);
    std.mem.writeInt(u32, angle[20..24], 0x7fc01234, .little);
    std.mem.writeInt(u32, angle[24..28], 0xc2b40000, .little);
    const angle_value = (try parse(fixture(.anglearc, &angle))).?.angle_arc;
    try std.testing.expectEqual(std.math.minInt(i32), angle_value.center.x);
    try std.testing.expectEqual(std.math.maxInt(i32), angle_value.center.y);
    try std.testing.expectEqual(std.math.maxInt(u32), angle_value.radius);
    try std.testing.expectEqual(@as(u32, 0x7fc01234), @as(u32, @bitCast(angle_value.startAngle())));
    try std.testing.expectEqual(@as(u32, 0xc2b40000), @as(u32, @bitCast(angle_value.sweepAngle())));

    var round = [_]u8{0} ** 32;
    for ([_]i32{ -4, -3, 2, 1, -8, 9 }, 0..) |value, index|
        std.mem.writeInt(i32, round[8 + index * 4 ..][0..4], value, .little);
    const round_value = (try parse(fixture(.roundrect, &round))).?.round_rect;
    try std.testing.expectEqual(@as(i32, -4), round_value.box.left);
    try std.testing.expectEqual(@as(i32, 1), round_value.box.bottom);
    try std.testing.expectEqual(@as(i32, -8), round_value.corner.width);
    try std.testing.expectEqual(@as(i32, 9), round_value.corner.height);
}

test "rectangle and arc families retain distinct union tags and wire order" {
    var bytes = [_]u8{0} ** 40;
    for ([_]i32{ -4, -3, 2, 1, -20, 30, 40, -50 }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[8 + index * 4 ..][0..4], value, .little);
    inline for (.{
        .{ records.RecordType.ellipse, @as(std.meta.Tag(Value), .ellipse) },
        .{ records.RecordType.rectangle, @as(std.meta.Tag(Value), .rectangle) },
    }) |case| try std.testing.expectEqual(case[1], std.meta.activeTag((try parse(fixture(case[0], bytes[0..24]))).?));
    inline for (.{
        .{ records.RecordType.arc, @as(std.meta.Tag(Value), .arc) },
        .{ records.RecordType.arcto, @as(std.meta.Tag(Value), .arc_to) },
        .{ records.RecordType.chord, @as(std.meta.Tag(Value), .chord) },
        .{ records.RecordType.pie, @as(std.meta.Tag(Value), .pie) },
    }) |case| {
        const value = (try parse(fixture(case[0], &bytes))).?;
        try std.testing.expectEqual(case[1], std.meta.activeTag(value));
        const arc_value = switch (value) {
            .arc => |v| v,
            .arc_to => |v| v,
            .chord => |v| v,
            .pie => |v| v,
            else => unreachable,
        };
        try std.testing.expectEqual(@as(i32, -20), arc_value.start.x);
        try std.testing.expectEqual(@as(i32, 30), arc_value.start.y);
        try std.testing.expectEqual(@as(i32, 40), arc_value.end.x);
        try std.testing.expectEqual(@as(i32, -50), arc_value.end.y);
    }
}

test "basic shapes require complete prefixes and accept trailing record data" {
    const bytes = [_]u8{0} ** 44;
    inline for (.{
        .{ records.RecordType.anglearc, @as(usize, 28), error.InvalidEmfAngleArcRecordSize },
        .{ records.RecordType.ellipse, @as(usize, 24), error.InvalidEmfRectShapeRecordSize },
        .{ records.RecordType.rectangle, @as(usize, 24), error.InvalidEmfRectShapeRecordSize },
        .{ records.RecordType.roundrect, @as(usize, 32), error.InvalidEmfRoundRectRecordSize },
        .{ records.RecordType.arc, @as(usize, 40), error.InvalidEmfArcShapeRecordSize },
        .{ records.RecordType.arcto, @as(usize, 40), error.InvalidEmfArcShapeRecordSize },
        .{ records.RecordType.chord, @as(usize, 40), error.InvalidEmfArcShapeRecordSize },
        .{ records.RecordType.pie, @as(usize, 40), error.InvalidEmfArcShapeRecordSize },
    }) |case| {
        for (0..case[1]) |length|
            try std.testing.expectError(case[2], parse(fixture(case[0], bytes[0..length])));
        try std.testing.expect((try parse(fixture(case[0], bytes[0 .. case[1] + 4]))) != null);
        var wrong_declared = fixture(case[0], bytes[0..case[1]]);
        wrong_declared.size += 4;
        try std.testing.expectError(case[2], parse(wrong_declared));
    }
    try std.testing.expect((try parse(fixture(.lineto, bytes[0..16]))) == null);
}
