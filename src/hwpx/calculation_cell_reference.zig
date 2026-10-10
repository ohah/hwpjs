//! Table calculation references; independent of field XML and evaluation.
const std = @import("std");
pub const Reference = struct { column: ?u32, row: ?u32 };
pub const Cell = struct { column: u32, row: u32 };
pub const Range = struct { first: Reference, last: Reference };

pub fn parse(input: []const u8) !Reference {
    if (input.len > 128) return error.LimitExceeded;
    const text = std.mem.trim(u8, input, " \t\r\n");
    if (text.len < 2) return error.InvalidCalculationCellReference;
    var index: usize = 0;
    var column: ?u32 = null;
    if (text[0] == '?') {
        index = 1;
    } else {
        var value: u32 = 0;
        while (index < text.len and std.ascii.isAlphabetic(text[index])) : (index += 1) {
            const digit: u32 = std.ascii.toUpper(text[index]) - 'A' + 1;
            value = std.math.mul(u32, value, 26) catch return error.LimitExceeded;
            value = std.math.add(u32, value, digit) catch return error.LimitExceeded;
        }
        if (index == 0) return error.InvalidCalculationCellReference;
        column = value - 1;
    }
    if (index == text.len) return error.InvalidCalculationCellReference;
    if (text[index] == '?') {
        if (index + 1 != text.len) return error.InvalidCalculationCellReference;
        return .{ .column = column, .row = null };
    }
    var row: u32 = 0;
    while (index < text.len) : (index += 1) {
        if (!std.ascii.isDigit(text[index])) return error.InvalidCalculationCellReference;
        row = std.math.mul(u32, row, 10) catch return error.LimitExceeded;
        row = std.math.add(u32, row, text[index] - '0') catch return error.LimitExceeded;
    }
    if (row == 0) return error.InvalidCalculationCellReference;
    return .{ .column = column, .row = row - 1 };
}

pub fn parseRange(text: []const u8) !Range {
    if (std.mem.indexOfScalar(u8, text, ':')) |colon| {
        if (std.mem.indexOfScalar(u8, text[colon + 1 ..], ':') != null) return error.InvalidCalculationCellReference;
        return .{ .first = try parse(text[0..colon]), .last = try parse(text[colon + 1 ..]) };
    }
    const ref = try parse(text);
    return .{ .first = ref, .last = ref };
}

pub fn resolve(ref: Reference, current: Cell, rows: u32, columns: u32) !Cell {
    if (current.row >= rows or current.column >= columns) return error.InvalidCalculationCellContext;
    const cell = Cell{ .column = ref.column orelse current.column, .row = ref.row orelse current.row };
    if (cell.row >= rows or cell.column >= columns) return error.CalculationCellOutOfBounds;
    return cell;
}

test "HWPX calculation cell references preserve current row and column semantics" {
    const current = Cell{ .column = 5, .row = 7 };
    const horizontal = try parseRange("B?:E?");
    try std.testing.expectEqualDeep(Cell{ .column = 1, .row = 7 }, try resolve(horizontal.first, current, 10, 10));
    try std.testing.expectEqualDeep(Cell{ .column = 4, .row = 7 }, try resolve(horizontal.last, current, 10, 10));
    const vertical = try parseRange("?2:?4");
    try std.testing.expectEqualDeep(Cell{ .column = 5, .row = 1 }, try resolve(vertical.first, current, 10, 10));
    try std.testing.expectEqualDeep(Cell{ .column = 5, .row = 3 }, try resolve(vertical.last, current, 10, 10));
    try std.testing.expectEqualDeep(Reference{ .column = 26, .row = 9 }, try parse(" aa10 "));
    try std.testing.expectEqualDeep(current, try resolve(try parse("??"), current, 10, 10));
    try std.testing.expectEqualDeep(Reference{ .column = 0, .row = 4294967294 }, try parse("A4294967295"));
    for ([_][]const u8{ "", "A", "1A", "A0", "?0", "A-1", "$A1", "A1tail", "A 1", "A?:", "A1:B2:C3" }) |value| try std.testing.expectError(error.InvalidCalculationCellReference, parseRange(value));
    try std.testing.expectError(error.LimitExceeded, parse("A4294967296"));
    try std.testing.expectError(error.LimitExceeded, parse("ZZZZZZZZZZ1"));
    try std.testing.expectError(error.CalculationCellOutOfBounds, resolve(try parse("K1"), current, 10, 10));
    try std.testing.expectError(error.InvalidCalculationCellContext, resolve(try parse("A1"), current, 0, 10));
}
