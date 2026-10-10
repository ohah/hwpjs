//! Numeric SUM/AVG/PRODUCT/MIN/MAX ranges and explicit cell references.
//! Not a general formula evaluator.
const std = @import("std");
pub const Function = @import("../../model/range_aggregate.zig").Function;
pub const Axis = union(enum) { current, absolute: u32 };
pub const Address = struct { column: Axis, row: Axis };
pub const Cell = struct { column: u32, row: u32 };
pub const Rectangle = struct { first: Cell, last: Cell };
pub const Range = struct {
    function: Function,
    first: Address,
    last: Address,
    above: bool = false,
    addresses: [32]Address = undefined,
    address_count: usize = 0,

    pub fn parse(expression: []const u8) !Range {
        if (expression.len % 2 != 0) return error.UnexpectedEnd;
        var parser: Parser = .{ .bytes = expression };
        const function: Function = if (parser.consume("SUM(")) .sum else if (parser.consume("AVG(")) .average else if (parser.consume("PRODUCT(")) .product else if (parser.consume("MIN(")) .minimum else if (parser.consume("MAX(")) .maximum else return error.UnsupportedFormulaExpression;
        if (parser.consume("ABOVE)")) {
            if (parser.offset != expression.len) return error.UnsupportedFormulaExpression;
            return .{ .function = function, .first = .{ .column = .current, .row = .{ .absolute = 0 } }, .last = .{ .column = .current, .row = .current }, .above = true };
        }
        const first = try parser.address();
        if (parser.consume(")")) {
            if (parser.offset != expression.len) return error.UnsupportedFormulaExpression;
            return .{ .function = function, .first = first, .last = first };
        }
        if (parser.consume(",")) {
            var addresses: [32]Address = undefined;
            addresses[0] = first;
            var count: usize = 1;
            while (true) {
                if (count == addresses.len) return error.LimitExceeded;
                addresses[count] = try parser.address();
                count += 1;
                if (!parser.consume(",")) break;
            }
            if (!parser.consume(")") or parser.offset != expression.len) return error.UnsupportedFormulaExpression;
            return .{ .function = function, .first = first, .last = first, .addresses = addresses, .address_count = count };
        }
        if (!parser.consume(":")) return error.UnsupportedFormulaExpression;
        const last = try parser.address();
        if (!parser.consume(")") or parser.offset != expression.len) return error.UnsupportedFormulaExpression;
        return .{ .function = function, .first = first, .last = last };
    }

    pub fn resolve(self: Range, origin: Cell, columns: u32, rows: u32) !Rectangle {
        if (origin.column >= columns or origin.row >= rows) return error.InvalidFormulaOrigin;
        if (self.address_count != 0) return error.UnsupportedNonRectangularFormulaRange;
        if (self.above) {
            if (origin.row == 0) return error.EmptyFormulaRange;
            return .{ .first = .{ .column = origin.column, .row = 0 }, .last = .{ .column = origin.column, .row = origin.row - 1 } };
        }
        const first = resolveAddress(self.first, origin);
        const last = resolveAddress(self.last, origin);
        if (first.column >= columns or last.column >= columns or first.row >= rows or last.row >= rows) return error.FormulaReferenceOutOfBounds;
        if (first.column > last.column or first.row > last.row) return error.UnsupportedReversedFormulaRange;
        return .{ .first = first, .last = last };
    }
};

pub fn resolveAddress(address: Address, origin: Cell) Cell {
    return .{
        .column = switch (address.column) {
            .current => origin.column,
            .absolute => |n| n,
        },
        .row = switch (address.row) {
            .current => origin.row,
            .absolute => |n| n,
        },
    };
}

const Parser = struct {
    bytes: []const u8,
    offset: usize = 0,
    fn peek(self: Parser) ?u16 {
        if (self.offset == self.bytes.len) return null;
        return std.mem.readInt(u16, self.bytes[self.offset..][0..2], .little);
    }
    fn consume(self: *Parser, ascii: []const u8) bool {
        if (ascii.len > (self.bytes.len - self.offset) / 2) return false;
        for (ascii, 0..) |c, i| if (std.mem.readInt(u16, self.bytes[self.offset + i * 2 ..][0..2], .little) != c) return false;
        self.offset += ascii.len * 2;
        return true;
    }
    fn address(self: *Parser) !Address {
        const column: Axis = if (self.consume("?")) .current else blk: {
            var value: u32 = 0;
            while (self.peek()) |c| {
                if (c < 'A' or c > 'Z') break;
                const shifted = std.math.mul(u32, value, 26) catch return error.InvalidFormulaReference;
                value = std.math.add(u32, shifted, c - 'A' + 1) catch return error.InvalidFormulaReference;
                self.offset += 2;
            }
            if (value == 0) return error.InvalidFormulaReference;
            break :blk .{ .absolute = value - 1 };
        };
        const row: Axis = if (self.consume("?")) .current else blk: {
            var value: u32 = 0;
            while (self.peek()) |c| {
                if (c < '0' or c > '9') break;
                const shifted = std.math.mul(u32, value, 10) catch return error.InvalidFormulaReference;
                value = std.math.add(u32, shifted, c - '0') catch return error.InvalidFormulaReference;
                self.offset += 2;
            }
            if (value == 0) return error.InvalidFormulaReference;
            break :blk .{ .absolute = value - 1 };
        };
        return .{ .column = column, .row = row };
    }
};

fn wire(comptime ascii: []const u8) [ascii.len * 2]u8 {
    var result: [ascii.len * 2]u8 = @splat(0);
    for (ascii, 0..) |c, i| result[i * 2] = c;
    return result;
}

test "formula ABOVE excludes result cell and product keeps exact rectangular references" {
    const product = try Range.parse(&wire("PRODUCT(ABOVE)"));
    try std.testing.expectEqual(Function.product, product.function);
    try std.testing.expectEqualDeep(Rectangle{ .first = .{ .column = 1, .row = 0 }, .last = .{ .column = 1, .row = 1 } }, try product.resolve(.{ .column = 1, .row = 2 }, 4, 3));
    try std.testing.expectError(error.EmptyFormulaRange, product.resolve(.{ .column = 0, .row = 0 }, 4, 3));
    const rectangle = try Range.parse(&wire("PRODUCT(A1:B2)"));
    try std.testing.expect(!rectangle.above);
    try std.testing.expectError(error.UnsupportedFormulaExpression, Range.parse(&wire("PRODUCT(ABOVE)tail")));
    inline for (.{ "PRODUCT(ABOVE:)", "PRODUCT(above)", "PRODUCT()" }) |text| {
        try std.testing.expectError(error.InvalidFormulaReference, Range.parse(&wire(text)));
    }
}

test "formula extrema preserve range explicit repetition and ABOVE bounds" {
    const minimum = try Range.parse(&wire("MIN(A1:B2)"));
    try std.testing.expectEqual(Function.minimum, minimum.function);
    try std.testing.expectEqualDeep(Rectangle{ .first = .{ .column = 0, .row = 0 }, .last = .{ .column = 1, .row = 1 } }, try minimum.resolve(.{ .column = 2, .row = 2 }, 3, 3));
    const maximum = try Range.parse(&wire("MAX(A1,A1,B2)"));
    try std.testing.expectEqual(Function.maximum, maximum.function);
    try std.testing.expectEqual(@as(usize, 3), maximum.address_count);
    const above = try Range.parse(&wire("MAX(ABOVE)"));
    try std.testing.expectError(error.EmptyFormulaRange, above.resolve(.{ .column = 0, .row = 0 }, 1, 1));
    try std.testing.expectError(error.InvalidFormulaReference, Range.parse(&wire("MIN()")));
}

test "formula range resolves current axes and multi-letter columns without evaluation" {
    const horizontal = try Range.parse(&wire("SUM(B?:E?)"));
    const rect = try horizontal.resolve(.{ .column = 5, .row = 1 }, 6, 5);
    try std.testing.expectEqualDeep(Rectangle{ .first = .{ .column = 1, .row = 1 }, .last = .{ .column = 4, .row = 1 } }, rect);
    const vertical = try Range.parse(&wire("SUM(?2:?4)"));
    const v = try vertical.resolve(.{ .column = 2, .row = 4 }, 6, 5);
    try std.testing.expectEqualDeep(Rectangle{ .first = .{ .column = 2, .row = 1 }, .last = .{ .column = 2, .row = 3 } }, v);
    const avg = try Range.parse(&wire("AVG(Z1:AA2)"));
    try std.testing.expectEqual(Function.average, avg.function);
    try std.testing.expectEqual(@as(u32, 26), avg.last.column.absolute);
    try std.testing.expectError(error.FormulaReferenceOutOfBounds, avg.resolve(.{ .column = 0, .row = 0 }, 26, 2));
    try std.testing.expectError(error.InvalidFormulaOrigin, avg.resolve(.{ .column = 0, .row = 2 }, 27, 2));
    const reversed = try Range.parse(&wire("SUM(B2:A1)"));
    try std.testing.expectError(error.UnsupportedReversedFormulaRange, reversed.resolve(.{ .column = 0, .row = 0 }, 2, 2));
}

test "formula range refuses unknown syntax zero addresses overflow and trailing input" {
    inline for (.{ "SUM(A0:B1)", "SUM(1:B1)", "SUM(A:B1)", "SUM(A42949672960:B1)", "SUM(ZZZZZZZZZZ1:A1)" }) |s| {
        try std.testing.expectError(error.InvalidFormulaReference, Range.parse(&wire(s)));
    }
    inline for (.{ "UNKNOWN(A1:B2)", "SUM(A1)+1", "SUM(A1:B2)+1", "SUM(A1,B2:C3)" }) |s| {
        try std.testing.expectError(error.UnsupportedFormulaExpression, Range.parse(&wire(s)));
    }
    try std.testing.expectError(error.UnexpectedEnd, Range.parse(&.{'S'}));
}
