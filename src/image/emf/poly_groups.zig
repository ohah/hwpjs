const std = @import("std");
const geometry = @import("geometry.zig");
const records = @import("records.zig");

pub const Range = struct { start: usize, end: usize };

pub fn Groups(comptime Points: type) type {
    return struct {
        kind: records.RecordType,
        bounds: geometry.RectL,
        shape_count: u32,
        point_count: u32,
        count_bytes: []const u8,
        points: Points,

        const Self = @This();

        pub fn countAt(self: Self, index: usize) !u32 {
            if (index >= self.shape_count) return error.EmfPolyShapeIndexOutOfBounds;
            return std.mem.readInt(u32, self.count_bytes[index * 4 ..][0..4], .little);
        }

        pub fn pointRange(self: Self, index: usize) !Range {
            if (index >= self.shape_count) return error.EmfPolyShapeIndexOutOfBounds;
            var start: u64 = 0;
            for (0..index) |item| start += try self.countAt(item);
            const end = start + try self.countAt(index);
            return .{ .start = @intCast(start), .end = @intCast(end) };
        }
    };
}
