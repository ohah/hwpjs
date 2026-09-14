pub const Operation = enum(u8) { line_to = 0x02, bezier_to = 0x04, move_to = 0x06 };
pub const PointType = struct { raw: u8, operation: Operation, closes_figure: bool };

pub const Types = struct {
    raw: []const u8,

    pub fn parse(bytes: []const u8) !Types {
        var offset: usize = 0;
        while (offset < bytes.len) {
            const value = try decode(bytes[offset]);
            if (value.operation != .bezier_to) {
                offset += 1;
                continue;
            }
            if (bytes.len - offset < 3) return error.InvalidEmfPolyDrawBezierSequence;
            if (bytes[offset] != 4 or bytes[offset + 1] != 4) return error.InvalidEmfPolyDrawBezierSequence;
            if ((try decode(bytes[offset + 2])).operation != .bezier_to) return error.InvalidEmfPolyDrawBezierSequence;
            offset += 3;
        }
        return .{ .raw = bytes };
    }

    pub fn count(self: Types) usize {
        return self.raw.len;
    }

    pub fn get(self: Types, index: usize) !PointType {
        if (index >= self.raw.len) return error.EmfPointTypeIndexOutOfBounds;
        return decode(self.raw[index]);
    }
};

fn decode(raw: u8) !PointType {
    const operation: Operation = switch (raw & 0xfe) {
        0x02 => .line_to,
        0x04 => .bezier_to,
        0x06 => if (raw & 1 == 0) .move_to else return error.InvalidEmfPointType,
        else => return error.InvalidEmfPointType,
    };
    return .{ .raw = raw, .operation = operation, .closes_figure = raw & 1 != 0 };
}

test "Point types preserve all five valid values and reject every other byte" {
    const std = @import("std");
    const valid = [_]u8{ 2, 3, 4, 5, 6 };
    for (0..256) |raw| {
        var accepted = false;
        for (valid) |item| accepted = accepted or raw == item;
        if (accepted) {
            const value = try decode(@intCast(raw));
            try std.testing.expectEqual(@as(u8, @intCast(raw)), value.raw);
            try std.testing.expectEqual(raw & 1 != 0, value.closes_figure);
        } else try std.testing.expectError(error.InvalidEmfPointType, decode(@intCast(raw)));
    }
}

test "Point type array requires Bezier operations in consecutive triples" {
    const std = @import("std");
    const valid = try Types.parse(&.{ 6, 4, 4, 5, 2, 3, 4, 4, 4 });
    try std.testing.expectEqual(@as(usize, 9), valid.count());
    try std.testing.expectEqual(Operation.move_to, (try valid.get(0)).operation);
    try std.testing.expect((try valid.get(3)).closes_figure);
    try std.testing.expectError(error.EmfPointTypeIndexOutOfBounds, valid.get(9));
    for ([_][]const u8{ &.{4}, &.{ 4, 4 }, &.{ 4, 2, 4 }, &.{ 2, 4, 4, 6 }, &.{ 5, 4, 4 }, &.{ 4, 5, 4 } }) |bytes|
        try std.testing.expectError(error.InvalidEmfPolyDrawBezierSequence, Types.parse(bytes));
    _ = try Types.parse(&.{});
}
