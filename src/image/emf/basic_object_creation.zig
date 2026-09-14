const std = @import("std");
const log_brush_ex = @import("log_brush_ex.zig");
const log_pen = @import("log_pen.zig");
const records = @import("records.zig");

pub const Creation = union(enum) {
    pen: struct { handle: u32, value: log_pen.LogPen },
    brush: struct { handle: u32, value: log_brush_ex.LogBrushEx },
};

pub fn parse(record: records.Record) !?Creation {
    return switch (record.kind) {
        .createpen => blk: {
            if (record.size != 28 or record.bytes.len != 28) return error.InvalidEmfCreatePenRecordSize;
            break :blk .{ .pen = .{
                .handle = std.mem.readInt(u32, record.bytes[8..12], .little),
                .value = try log_pen.parse(record.bytes[12..28]),
            } };
        },
        .createbrushindirect => blk: {
            if (record.size != 24 or record.bytes.len != 24) return error.InvalidEmfCreateBrushIndirectRecordSize;
            break :blk .{ .brush = .{
                .handle = std.mem.readInt(u32, record.bytes[8..12], .little),
                .value = try log_brush_ex.parse(record.bytes[12..24]),
            } };
        },
        else => null,
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "basic object creation enforces complete record boundaries" {
    var pen = [_]u8{0} ** 29;
    std.mem.writeInt(i32, pen[16..20], 1, .little);
    for (0..28) |cut| try std.testing.expectError(error.InvalidEmfCreatePenRecordSize, parse(fixture(.createpen, pen[0..cut])));
    try std.testing.expectError(error.InvalidEmfCreatePenRecordSize, parse(fixture(.createpen, &pen)));
    var wrong_declared_pen = fixture(.createpen, pen[0..28]);
    wrong_declared_pen.size = 24;
    try std.testing.expectError(error.InvalidEmfCreatePenRecordSize, parse(wrong_declared_pen));
    const parsed_pen = (try parse(fixture(.createpen, pen[0..28]))).?.pen;
    try std.testing.expectEqual(@as(i32, 1), parsed_pen.value.width.x);

    const brush = [_]u8{0} ** 25;
    for (0..24) |cut| try std.testing.expectError(error.InvalidEmfCreateBrushIndirectRecordSize, parse(fixture(.createbrushindirect, brush[0..cut])));
    try std.testing.expectError(error.InvalidEmfCreateBrushIndirectRecordSize, parse(fixture(.createbrushindirect, &brush)));
    var wrong_declared_brush = fixture(.createbrushindirect, brush[0..24]);
    wrong_declared_brush.size = 28;
    try std.testing.expectError(error.InvalidEmfCreateBrushIndirectRecordSize, parse(wrong_declared_brush));
    _ = (try parse(fixture(.createbrushindirect, brush[0..24]))).?.brush;
    try std.testing.expect((try parse(fixture(.savedc, brush[0..8]))) == null);
}
