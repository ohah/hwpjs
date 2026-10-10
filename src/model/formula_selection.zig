//! Format-independent allocation-free cell selection; no document ownership.
const std = @import("std");
const ranges = @import("formula_range.zig");
pub const Iterator = struct {
    range: ranges.Range,
    origin: ranges.Cell,
    rectangle: ?ranges.Rectangle,
    count: usize,
    index: usize = 0,
    pub fn init(range: ranges.Range, origin: ranges.Cell, columns: u32, rows: u32) !Iterator {
        if (origin.column >= columns or origin.row >= rows) return error.InvalidFormulaOrigin;
        if (range.address_count > range.addresses.len) return error.LimitExceeded;
        if (range.address_count != 0) {
            for (range.addresses[0..range.address_count]) |address| {
                const cell = ranges.resolveAddress(address, origin);
                if (cell.column >= columns or cell.row >= rows) return error.FormulaReferenceOutOfBounds;
            }
            return .{ .range = range, .origin = origin, .rectangle = null, .count = range.address_count };
        }
        const rectangle = try range.resolve(origin, columns, rows);
        const width = @as(usize, rectangle.last.column - rectangle.first.column) + 1;
        const height = @as(usize, rectangle.last.row - rectangle.first.row) + 1;
        return .{ .range = range, .origin = origin, .rectangle = rectangle, .count = std.math.mul(usize, width, height) catch return error.LimitExceeded };
    }
    pub fn next(self: *Iterator) ?ranges.Cell {
        if (self.index == self.count) return null;
        const index = self.index;
        self.index += 1;
        if (self.rectangle) |rect| {
            const width = @as(usize, rect.last.column - rect.first.column) + 1;
            return .{ .column = rect.first.column + @as(u32, @intCast(index % width)), .row = rect.first.row + @as(u32, @intCast(index / width)) };
        }
        return ranges.resolveAddress(self.range.addresses[index], self.origin);
    }
    pub fn intersects(self: Iterator, area: ranges.Rectangle) bool {
        if (self.rectangle) |rect| return area.first.column <= rect.last.column and area.first.row <= rect.last.row and area.last.column >= rect.first.column and area.last.row >= rect.first.row;
        for (self.range.addresses[0..self.count]) |address| {
            const cell = ranges.resolveAddress(address, self.origin);
            if (cell.column >= area.first.column and cell.column <= area.last.column and cell.row >= area.first.row and cell.row <= area.last.row) return true;
        }
        return false;
    }
};

fn wire(comptime text: []const u8) [text.len * 2]u8 {
    var bytes: [text.len * 2]u8 = @splat(0);
    for (text, 0..) |c, index| bytes[index * 2] = c;
    return bytes;
}
test "formula explicit selection preserves order duplicates bounds and capacity" {
    var single = try Iterator.init(try ranges.Range.parse(&wire("SUM(A1)")), .{ .column = 0, .row = 0 }, 1, 1);
    try std.testing.expectEqual(@as(usize, 1), single.count);
    try std.testing.expectEqualDeep(ranges.Cell{ .column = 0, .row = 0 }, single.next().?);
    try std.testing.expect(single.next() == null);
    const range = try ranges.Range.parse(&wire("SUM(A2,C1,A2)"));
    var it = try Iterator.init(range, .{ .column = 3, .row = 2 }, 4, 3);
    try std.testing.expectEqual(@as(usize, 3), it.count);
    try std.testing.expectEqualDeep(ranges.Cell{ .column = 0, .row = 1 }, it.next().?);
    try std.testing.expectEqualDeep(ranges.Cell{ .column = 2, .row = 0 }, it.next().?);
    try std.testing.expectEqualDeep(ranges.Cell{ .column = 0, .row = 1 }, it.next().?);
    try std.testing.expect(it.next() == null);
    try std.testing.expectError(error.FormulaReferenceOutOfBounds, Iterator.init(range, .{ .column = 0, .row = 0 }, 2, 3));
    try std.testing.expectError(error.UnsupportedNonRectangularFormulaRange, range.resolve(.{ .column = 0, .row = 0 }, 4, 3));
    const many = "SUM(" ++ "A1," ** 32 ++ "A1)";
    try std.testing.expectError(error.LimitExceeded, ranges.Range.parse(&wire(many)));
    const maximum = try ranges.Range.parse(&wire("SUM(" ++ "A1," ** 31 ++ "A1)"));
    try std.testing.expectEqual(@as(usize, 32), (try Iterator.init(maximum, .{ .column = 0, .row = 0 }, 1, 1)).count);
    try std.testing.expect(it.intersects(.{ .first = .{ .column = 2, .row = 0 }, .last = .{ .column = 2, .row = 0 } }));
    try std.testing.expect(!it.intersects(.{ .first = .{ .column = 1, .row = 0 }, .last = .{ .column = 1, .row = 2 } }));
    inline for (.{ "SUM(A1,)", "SUM(A1,,B1)" }) |text| try std.testing.expectError(error.InvalidFormulaReference, ranges.Range.parse(&wire(text)));
}
