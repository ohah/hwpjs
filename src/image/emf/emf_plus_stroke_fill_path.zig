const std = @import("std");
const record = @import("emf_plus_record.zig");

pub const Observation = struct {
    flags: u16,
    data: []const u8,
};

/// MS-EMFPLUS assigns this record a type and describes its effect, but does
/// not define a record-specific wire layout. Common framing remains owned by
/// emf_plus_record.Iterator; do not infer Pen, Brush, or Path identifiers here.
pub fn observe(value: record.Record) !Observation {
    if (value.kind != .stroke_fill_path) return error.NotEmfPlusStrokeFillPath;
    return .{ .flags = value.flags, .data = value.data };
}

fn makeRecord(flags: u16, data: []const u8) record.Record {
    return .{
        .offset = 0,
        .kind = .stroke_fill_path,
        .flags = flags,
        .size = @intCast(record.header_size + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ StrokeFillPath observation preserves undocumented flags and data" {
    const data = [_]u8{ 0x00, 0x7f, 0x80, 0xff };
    const value = try observe(makeRecord(0xa55a, &data));
    try std.testing.expectEqual(@as(u16, 0xa55a), value.flags);
    try std.testing.expectEqualSlices(u8, &data, value.data);

    const empty = try observe(makeRecord(0, &.{}));
    try std.testing.expectEqual(@as(usize, 0), empty.data.len);
}

test "EMF+ StrokeFillPath observation rejects another record type" {
    var value = makeRecord(0, &.{});
    value.kind = .serializable_object;
    try std.testing.expectError(error.NotEmfPlusStrokeFillPath, observe(value));
}
